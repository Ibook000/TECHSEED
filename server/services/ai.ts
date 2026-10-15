import { CandidateProfile, InterviewMessage, AIEvaluation, CapabilityScores, TECHNICAL_FOUNDATION_OPTIONS, TECH_DIRECTION_OPTIONS } from '../../src/types.js';
import { db } from '../db/index.js';
import {
  calculateOverallScore,
  createHeuristicEvaluation,
  gradeForScore,
  hasCandidateAnswers,
  readOptionalScore,
  readRequiredScore,
  redactKnownProfileIdentifiers,
} from './evaluation.js';

/**
 * Simple concurrency limiter for LLM calls.
 * Prevents API rate-limit errors when many candidates interview simultaneously.
 * Default: max 10 concurrent LLM requests; configurable via LLM_MAX_CONCURRENT env var.
 */
function getPromptSafeProfileChoice(value: unknown, validOptions: readonly string[]): string {
  return typeof value === 'string' && validOptions.includes(value)
    ? value
    : '未提供或格式无效';
}

class ConcurrencyLimiter {
  private maxConcurrent: number;
  private active = 0;
  private maxQueued: number;
  private queueTimeoutMs: number;
  private queue: Array<{
    resolve: (acquired: boolean) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private lastSaturationWarningAt = 0;

  constructor(maxConcurrent: number, maxQueued: number, queueTimeoutMs: number) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
    this.queueTimeoutMs = queueTimeoutMs;
  }

  async acquire(): Promise<boolean> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return true;
    }

    if (this.queue.length >= this.maxQueued) {
      this.warnSaturated();
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let waiter: (typeof this.queue)[number];
      const timeout = setTimeout(() => {
        const index = this.queue.indexOf(waiter);
        if (index === -1) return;
        this.queue.splice(index, 1);
        this.warnSaturated();
        resolve(false);
      }, this.queueTimeoutMs);

      waiter = { resolve, timeout };
      this.queue.push(waiter);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      clearTimeout(next.timeout);
      next.resolve(true);
      // active count stays the same (one leaves, one enters)
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  private warnSaturated(): void {
    const now = Date.now();
    if (now - this.lastSaturationWarningAt < 60_000) return;
    this.lastSaturationWarningAt = now;
    console.warn('[AI Service] LLM queue is saturated; some requests will use heuristic fallback');
  }

  async run<T>(fn: () => Promise<T>): Promise<T | null> {
    const waiting = this.active >= this.maxConcurrent;
    const queuePosition = this.queue.length + 1;
    if (waiting) {
      console.log(`[AI Service] LLM request queued, position: ${queuePosition}, active: ${this.active}`);
    }

    if (!(await this.acquire())) return null;
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const DEFAULT_MAX_CONCURRENT_LLM = 10;
const MAX_QUEUED_LLM = 100;
const LLM_QUEUE_TIMEOUT_MS = 30_000;
const configuredMaxConcurrent = process.env.LLM_MAX_CONCURRENT?.trim();
const parsedMaxConcurrent = configuredMaxConcurrent && /^\d+$/.test(configuredMaxConcurrent)
  ? Number(configuredMaxConcurrent)
  : Number.NaN;
const hasValidMaxConcurrent = Number.isSafeInteger(parsedMaxConcurrent) && parsedMaxConcurrent > 0;
const MAX_CONCURRENT_LLM = hasValidMaxConcurrent
  ? parsedMaxConcurrent
  : DEFAULT_MAX_CONCURRENT_LLM;

if (configuredMaxConcurrent && !hasValidMaxConcurrent) {
  console.warn(`[AI Service] Invalid LLM_MAX_CONCURRENT; using default ${DEFAULT_MAX_CONCURRENT_LLM}`);
}

const llmLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_LLM, MAX_QUEUED_LLM, LLM_QUEUE_TIMEOUT_MS);

console.log(`[AI Service] Concurrency limiter initialized: max ${MAX_CONCURRENT_LLM} concurrent calls, ${MAX_QUEUED_LLM} queued, ${LLM_QUEUE_TIMEOUT_MS}ms queue timeout`);

/** Resolved API key and endpoint used for one OpenAI-compatible provider attempt. */
interface APIKeyEntry {
  key: string;
  baseUrl: string;
  model: string;
}

/**
 * Initialize the API key pool from environment variables.
 * Supports OPENAI_API_KEYS (comma-separated) for multi-key round-robin,
 * falling back to OPENAI_API_KEY + FALLBACK_OPENAI_API_KEY.
 */
function initApiKeyPoolFromEnv(): APIKeyEntry[] {
  const baseUrl = (process.env.OPENAI_BASE_URL || '').trim();
  const model = (process.env.OPENAI_MODEL || '').trim();

  // Multi-key mode: OPENAI_API_KEYS="key1,key2,key3"
  const keysEnv = (process.env.OPENAI_API_KEYS || '').trim();
  if (keysEnv) {
    const keys = keysEnv
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    if (keys.length > 0 && baseUrl && model) {
      return keys.map(key => ({ key, baseUrl, model }));
    }
  }

  // Legacy single-key + fallback mode
  const entries: APIKeyEntry[] = [];
  const primaryKey = (process.env.OPENAI_API_KEY || '').trim();
  if (primaryKey && baseUrl && model) {
    entries.push({ key: primaryKey, baseUrl, model });
  }
  const fbKey = (process.env.FALLBACK_OPENAI_API_KEY || '').trim();
  const fbBase = (process.env.FALLBACK_OPENAI_BASE_URL || baseUrl || '').trim();
  const fbModel = (process.env.FALLBACK_OPENAI_MODEL || model || '').trim();
  if (fbKey && fbBase && fbModel && fbKey !== primaryKey) {
    entries.push({ key: fbKey, baseUrl: fbBase, model: fbModel });
  }
  return entries;
}

// Initialize pool on module load (informational logging only;
// actual key resolution happens per-call from DB + env for live updates)
const envKeys = initApiKeyPoolFromEnv();
if (envKeys.length > 0) {
  console.log(`[AI Service] Found ${envKeys.length} API key(s) in env (DB settings take priority, changes apply instantly)`);
} else {
  console.log('[AI Service] No API keys configured in env; will use DB settings or fall back to heuristic engine');
}

// Clean markdown code fence if present and extract valid JSON
function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  } else {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  return cleaned.trim();
}

function readStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return items.length > 0 ? items : fallback;
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Call user-configured OpenAI-compatible API endpoint.
 * Supports OpenAI, SenseNova, DeepSeek, Volcengine Ark, Moonshot, Qwen, Ollama, etc.
 * Uses 75s timeout to allow reasoning models (e.g. glm-5.2, deepseek-v4) sufficient thinking time.
 */
async function callCustomOpenAI(
  messages: OpenAIChatMessage[],
  temperature = 0.7,
  responseFormatJson = false,
  maxTokens = 2048,
  baseUrlOverride?: string,
  apiKeyOverride?: string,
  modelOverride?: string
): Promise<string | null> {
  const apiKey = (apiKeyOverride || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return null;
  }

  const rawBaseUrl = (baseUrlOverride || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const model = (modelOverride || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

  const url = `${baseUrl}/chat/completions`;
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    const body: Record<string, any> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (responseFormatJson) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 75000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[AI Service] Custom API ${res.status} error (${model}@${baseUrl}): ${errText.slice(0, 160)}`);
      return null;
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      console.warn('[AI Service] Custom API request timed out (75s limit reached for reasoning)');
    } else {
      console.warn('[AI Service] Custom API call failed:', err?.message || err);
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

/**
 * Parse comma/newline/semicolon-separated API keys from a string.
 */
function parseApiKeys(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n;]/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

/**
 * Build the primary key pool and fallback key pool from DB settings + env vars.
 * DB settings take priority over env vars so admin changes take effect immediately.
 *
 * Returns { primaryKeys, fallbackKeys } where each array has at least 1 key if available.
 */
function buildKeyPoolsFromSettings(): {
  primary: APIKeyEntry[];
  fallback: APIKeyEntry[];
} {
  const settings = db.getAISettings();

  // --- Primary endpoint keys ---
  const primaryBase = settings.primary?.baseUrl || process.env.OPENAI_BASE_URL || '';
  const primaryModel = settings.primary?.model || process.env.OPENAI_MODEL || '';
  const primaryRawKeys = settings.primary?.apiKey || process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '';
  const primaryKeys = parseApiKeys(primaryRawKeys);

  const primary: APIKeyEntry[] = [];
  if (primaryBase && primaryModel && primaryKeys.length > 0) {
    for (const key of primaryKeys) {
      primary.push({ key, baseUrl: primaryBase, model: primaryModel });
    }
  }

  // --- Fallback endpoint keys ---
  const fbBase = settings.fallback?.baseUrl || process.env.FALLBACK_OPENAI_BASE_URL || '';
  const fbModel = settings.fallback?.model || process.env.FALLBACK_OPENAI_MODEL || '';
  const fbRawKeys = settings.fallback?.apiKey || process.env.FALLBACK_OPENAI_API_KEYS || process.env.FALLBACK_OPENAI_API_KEY || '';
  const fbKeys = parseApiKeys(fbRawKeys);

  const fallback: APIKeyEntry[] = [];
  if (fbBase && fbModel && fbKeys.length > 0) {
    // Only include fallback keys that are different from any primary key
    const primaryKeySet = new Set(primary.map(e => e.key));
    for (const key of fbKeys) {
      if (!primaryKeySet.has(key)) {
        fallback.push({ key, baseUrl: fbBase, model: fbModel });
      }
    }
  }

  return { primary, fallback };
}

// Global round-robin cursor for primary pool (persists across calls)
let primaryRRCursor = 0;
let fallbackRRCursor = 0;

/**
 * Call OpenAI-compatible endpoint with multi-key round-robin + automatic failover.
 *
 * Strategy (highest priority first):
 *   1. Primary endpoint — supports multiple API keys (comma/newline separated),
 *      round-robin load balanced. If one key fails (429, 5xx, timeout, network error),
 *      try the next key in the same endpoint.
 *   2. Fallback endpoint — if ALL primary keys fail, try the fallback endpoint
 *      (which can also have multiple keys, round-robined).
 *
 * Settings are read from DB on every call, so admin edits take effect immediately
 * without restart. Env vars are used as defaults when DB fields are empty.
 */
async function callCustomOpenAIWithFallback(
  messages: OpenAIChatMessage[],
  temperature = 0.7,
  responseFormatJson = false,
  maxTokens = 2048
): Promise<string | null> {
  const { primary, fallback } = buildKeyPoolsFromSettings();

  if (primary.length === 0 && fallback.length === 0) {
    return null;
  }

  // --- Try primary pool first (round-robin start) ---
  if (primary.length > 0) {
    const total = primary.length;
    const startIdx = (primaryRRCursor++) % total;
    if (primaryRRCursor > 1000000) primaryRRCursor = 0; // prevent overflow

    for (let i = 0; i < total; i++) {
      const idx = (startIdx + i) % total;
      const entry = primary[idx];
      const attempt = i + 1;

      if (total > 1 && attempt > 1) {
        console.warn(`[AI Service] Primary key ${attempt - 1}/${total} failed, trying next key (${attempt}/${total})...`);
      }

      const result = await callCustomOpenAI(
        messages, temperature, responseFormatJson, maxTokens,
        entry.baseUrl, entry.key, entry.model
      );
      if (result !== null) {
        return result;
      }
    }

    console.warn(`[AI Service] All ${total} primary key(s) failed, switching to fallback endpoint...`);
  }

  // --- Try fallback pool ---
  if (fallback.length > 0) {
    const total = fallback.length;
    const startIdx = (fallbackRRCursor++) % total;
    if (fallbackRRCursor > 1000000) fallbackRRCursor = 0;

    for (let i = 0; i < total; i++) {
      const idx = (startIdx + i) % total;
      const entry = fallback[idx];
      const attempt = i + 1;

      if (total > 1 && attempt > 1) {
        console.warn(`[AI Service] Fallback key ${attempt - 1}/${total} failed, trying next key (${attempt}/${total})...`);
      } else {
        console.warn(`[AI Service] Trying fallback endpoint key ${attempt}/${total}...`);
      }

      const result = await callCustomOpenAI(
        messages, temperature, responseFormatJson, maxTokens,
        entry.baseUrl, entry.key, entry.model
      );
      if (result !== null) {
        return result;
      }
    }
  }

  return null;
}

/**
 * Unified LLM executor: calls the configured OpenAI-compatible endpoint
 * (with a secondary fallback endpoint if configured).
 * Returns null if no API key is configured or the call fails, allowing
 * callers to fall back to heuristic logic.
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  responseFormatJson = false
): Promise<string | null> {
  return llmLimiter.run(async () => {
    // Resolve keys from database settings and environment variables on every call.
    const result = await callCustomOpenAIWithFallback(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      responseFormatJson
    );

    if (result) {
      return result;
    }

    return null;
  });
}

export class AIService {
  /**
   * Generates the initial interview opening question based on candidate profile.
   */
  public static async generateOpeningQuestion(profile: CandidateProfile): Promise<string> {
    const technicalFoundation = getPromptSafeProfileChoice(
      profile.technicalFoundation,
      TECHNICAL_FOUNDATION_OPTIONS,
    );
    const techDirection = getPromptSafeProfileChoice(
      profile.techDirection,
      TECH_DIRECTION_OPTIONS,
    );


    const promptConfig = db.getPrompts().find(p => p.key === 'interviewer_system_prompt');
    const systemPrompt = promptConfig?.prompt || '你是高校技术部招新面试官，请向新生提出首个初筛问题。';

    const userPrompt = `候选人基本信息：
- 技术基础: ${technicalFoundation}
- 期望方向: ${techDirection}
- 个人自我介绍: "${redactKnownProfileIdentifiers(profile.selfIntro, profile)}"

系统已对自由文本中可匹配的已知身份信息做脱敏处理。请根据技术基础、方向和自我介绍提出第一个破冰/初筛提问；不要询问或输出个人身份信息。
要求：
1. 语言亲切、专业、像师兄师姐交流，避免僵硬的高考式提问；
2. 针对他自我介绍中提到的细节或他对${techDirection}方向的兴趣出发；
3. 如果是零基础，不要考背诵概念，而是问他是什么契机让他想要探索技术/折腾；
4. 直接返回问题正文，不需要寒暄过多废话，字数在60-120字之间。`;

    const reply = await callLLM(systemPrompt, userPrompt, 0.7, false);

    if (reply) {
      return reply;
    }

    // High quality heuristic fallback opening based on foundation & direction
    if (profile.selfIntro && profile.selfIntro.length > 8) {
      return `${profile.name}同学你好！欢迎来到技术部招新初筛。你在自我介绍里提到：“${profile.selfIntro.slice(0, 30)}...”，能具体聊聊当时是什么原因促使你接触这个领域的吗？平时有动手折腾过什么小东西吗？`;
    }

    if (profile.technicalFoundation === '完全没有') {
      return `${profile.name}同学你好！不用担心技术基础，技术部最看重的是探索欲与自驱力。你选择了【${profile.techDirection}】方向，平时有没有哪款软件、网站或智能设备的功能让你觉得“这个好酷，好想知道它是怎么做出来的”？`;
    }

    return `${profile.name}同学你好！看到你选择对【${profile.techDirection}】方向很感兴趣，且具备【${profile.technicalFoundation}】的背景。能分享一件你最近自己动手尝试解决过的计算机相关问题吗？当时是怎么一步步排查的？`;
  }

  /**
   * Dynamically generates the next question and analyzes the previous answer.
   */
  public static async generateFollowUp(
    profile: CandidateProfile,
    history: InterviewMessage[],
    currentRound: number
  ): Promise<{ question: string; analysis: string; isLastRound: boolean }> {
    const technicalFoundation = getPromptSafeProfileChoice(
      profile.technicalFoundation,
      TECHNICAL_FOUNDATION_OPTIONS,
    );
    const techDirection = getPromptSafeProfileChoice(
      profile.techDirection,
      TECH_DIRECTION_OPTIONS,
    );


    const isLastRound = currentRound >= 4; // 4-5 rounds is ideal (8-12 min)
    const lastUserMsg = [...history].reverse().find(m => m.sender === 'candidate');
    const answerText = lastUserMsg?.content || '';

    const promptConfig = db.getPrompts().find(p => p.key === 'followup_prompt');
    const followupPrompt = promptConfig?.prompt || '请基于候选人最新回答，深入追问细节或行为证据。';

    const conversationHistory = history
      .map(m => `${m.sender === 'ai' ? '面试官' : '候选人'}: ${redactKnownProfileIdentifiers(m.content, profile)}`)
      .join('\n');

    const userPrompt = `${followupPrompt}

【候选人信息】
技术基础: ${technicalFoundation}, 方向: ${techDirection}
自我介绍: ${redactKnownProfileIdentifiers(profile.selfIntro, profile)}

系统已对自由文本中可匹配的已知身份信息做脱敏处理。不要询问或输出个人身份信息。

【当前面试轮次】: 第 ${currentRound} 轮 (共 4-5 轮)
${isLastRound ? '注意：这是面试的最后一轮提问，可以询问学习规划、希望参与的方向或请候选人补充想分享的信息。' : '注意：请针对候选人明确提到的经历或想法进行友好追问；如果信息不足，邀请补充或说明还没有相关经历。不要推断套话或真实性。'}

【过往问答对话记录】:
${conversationHistory}

请返回严格 JSON 格式：
{
  "analysis": "只记录候选人明确提及的信息，以及尚待澄清的问题，不推断性格或真实性",
  "question": "面试官给出的下一个动态追问内容"
}`;

    const reply = await callLLM(
      '你是技术部招新AI面试官，始终返回严格的JSON对象。',
      userPrompt,
      0.6,
      true
    );

    if (reply) {
      try {
        const parsed = JSON.parse(cleanJsonString(reply));
        if (parsed.question) {
          return {
            question: parsed.question,
            analysis: parsed.analysis || '分析信息有限，请在人工审核时结合完整问答核对。',
            isLastRound,
          };
        }
      } catch (e) {}
    }

    // Heuristic Dynamic Followup Engine
    let analysis = '目前可核对的具体信息有限，继续友好邀请候选人补充。';
    let question = '';

    const needsClarification = answerText.length < 25 || (/喜欢|热爱|感兴趣|想学|很有意义/.test(answerText) && !/后来|当时|因为|发现|搜索|报错|配置|排查/.test(answerText));
    const mentionsTech = /代码|网站|服务器|Linux|Python|C\+\+|React|Docker|单片机|模型|爬虫|数据库|Git/.test(answerText);

    if (needsClarification && currentRound <= 2) {
      analysis = '回答中尚未提到具体经历，可邀请候选人补充；这不代表能力或兴趣不足。';
      question = `谢谢你分享这些想法。你愿意再讲一个最近接触技术或学习新东西的小例子吗？如果还没有相关经历，也可以说说你遇到感兴趣的问题时会怎样开始了解。`;
    } else if (mentionsTech && currentRound <= 3) {
      analysis = '提到了具体技术点与操作，追问踩坑细节以验证真实经历。';
      question = `听起来很有探索精神！在折腾这个过程中，你遇到的最棘手或者最让你头疼的一个报错/阻碍是什么？你当时是怎么一步步定位并最终搞定它的？`;
    } else if (currentRound === 3) {
      analysis = '进入学习方法与适应力考察。';
      question = `进入大学后，很多技术可能没有专门的课程教，需要直接看官方英文文档或开源社区代码。假如技术部安排你在一周内搞懂一个完全没接触过的新工具，你会怎么规划你的自学步骤？`;
    } else {
      analysis = '收尾轮次，考察投入意愿与团队合作理念。';
      question = `非常棒的分享！最后一个问题：技术部的很多项目往往需要几个人分工合作，甚至会经历反复返工修改。如果之后你负责的部分和同伴的想法产生冲突，或者进度遇到瓶颈，你会如何协调和推进？`;
    }

    return { question, analysis, isLastRound };
  }

  /**
   * Generates comprehensive structured evaluation after interview completion.
   */
  public static async evaluateCandidate(
    candidateId: string,
    profile: CandidateProfile,
    messages: InterviewMessage[]
  ): Promise<AIEvaluation> {
    const technicalFoundation = getPromptSafeProfileChoice(
      profile.technicalFoundation,
      TECHNICAL_FOUNDATION_OPTIONS,
    );
    const techDirection = getPromptSafeProfileChoice(
      profile.techDirection,
      TECH_DIRECTION_OPTIONS,
    );


    if (!hasCandidateAnswers(messages)) {
      throw new Error('Cannot evaluate an interview without a candidate answer.');
    }

    const candidateConversation = messages
      .map(m => `${m.sender === 'ai' ? '面试官' : '候选人'}: ${redactKnownProfileIdentifiers(m.content, profile)}`)
      .join('\n\n');

    const promptConfig = db.getPrompts().find(p => p.key === 'evaluation_prompt');
    const evalPrompt = promptConfig?.prompt || '对候选人进行多维综合潜力与真实度评估。';

    const userPrompt = `${evalPrompt}

【候选人信息】
技术基础: ${technicalFoundation}
技术方向兴趣: ${techDirection}
个人介绍: ${redactKnownProfileIdentifiers(profile.selfIntro, profile)}

系统已对自由文本中可匹配的已知身份信息做脱敏处理。不得猜测或要求个人身份信息。

【完整面试记录】
${candidateConversation}

【评分标准与要求】
1. 评分只能依据报名信息和问答中明确出现的证据；没有证据时给出中性分并说明待核实点，不要猜测。
2. 不因回答长度、表达流畅度、错别字、紧张、教育背景或缺少项目经历推断能力、性格、诚信或兴趣。
3. 技术基础只占 10%，作为培养起点；不得把零基础本身当作淘汰理由。
4. 真实性/一致性只记录可观察的前后矛盾或待核实事实。语言风格不能证明套话或不诚实。
5. anti_template_flag 是历史兼容字段，必须为 false；不要仅凭措辞或回答风格判断套话。
6. recommendation_reason 写成人工复核的证据与追问建议；AI 等级和分数均为辅助信息，不能单独决定录用或淘汰。
7. candidate_type 只使用中性标签描述已有材料或待核实信息，不给候选人贴能力、性格或潜力标签。
8. overall_score 必须等于六项 scores 按权重计算的加权分；recommendation 按该分数映射：S>=90，A>=80，B>=70，C<70。
9. 严格按照下列 JSON 结构返回：
{
  "overall_score": 88,
  "recommendation": "S" | "A" | "B" | "C",
  "candidate_type": "待核实项目经历",
  "scores": {
    "learning": 92,
    "initiative": 90,
    "logic": 85,
    "technology_interest": 94,
    "communication": 82,
    "technical_foundation": 60
  },
  "quality": {
    "specificity_score": 88,
    "consistency_score": 92
  },
  "anti_template_flag": false,
  "template_analysis": "列出可观察到的回答细节或待核实信息；证据不足时明确写信息不足",
  "strengths": ["优势点1", "优势点2", "优势点3"],
  "risks": ["潜在风险点1", "风险点2"],
  "summary": "候选人综合画像与表现总结（150字左右）",
  "recommendation_reason": "供管理员人工复核的证据与追问建议，不作自动录用或淘汰判断（80字左右）"
}`;

    const reply = await callLLM(
      '你是技术部招新评估专家，始终输出结构严格合法的JSON。',
      userPrompt,
      0.4,
      true
    );

    if (reply) {
      try {
        const data = JSON.parse(cleanJsonString(reply));
        const scores: CapabilityScores = {
          learning: readRequiredScore(data.scores?.learning),
          initiative: readRequiredScore(data.scores?.initiative),
          logic: readRequiredScore(data.scores?.logic),
          technology_interest: readRequiredScore(data.scores?.technology_interest),
          communication: readRequiredScore(data.scores?.communication),
          technical_foundation: readRequiredScore(data.scores?.technical_foundation),
        };
        const overallScore = calculateOverallScore(scores);
        const rec = gradeForScore(overallScore);

        return {
          id: `eval-${Date.now()}`,
          candidateId,
          overallScore,
          recommendation: rec,
          candidateType: typeof data.candidate_type === 'string' && data.candidate_type.trim()
            ? data.candidate_type.trim().slice(0, 80)
            : '待人工复核',
          scores,
          quality: {
            authenticity_score: 50,
            specificity_score: readOptionalScore(data.quality?.specificity_score),
            consistency_score: readOptionalScore(data.quality?.consistency_score),
          },
          strengths: readStringList(data.strengths, ['报告未提供可核实的优势证据，请查看完整问答记录。']),
          risks: readStringList(data.risks, ['报告未提供待复核事项，请管理员结合面试记录判断。']),
          summary: typeof data.summary === 'string' && data.summary.trim()
            ? data.summary.trim().slice(0, 1200)
            : '报告未提供有效总结，请管理员查看完整问答记录。',
          recommendationReason: typeof data.recommendation_reason === 'string' && data.recommendation_reason.trim()
            ? data.recommendation_reason.trim().slice(0, 800)
            : '请管理员结合完整面试记录进行人工复核。',
          antiTemplateFlag: false,
          templateAnalysis: typeof data.template_analysis === 'string' && data.template_analysis.trim()
            ? data.template_analysis.trim().slice(0, 800)
            : '信息不足；不根据回答长度或语言风格判断套话或真实性。',
          evaluationSource: 'llm',
          evaluatedAt: new Date().toISOString(),
        };
      } catch (err: any) {}
    }

    // Conservative heuristic fallback when a usable LLM evaluation is unavailable.
    return createHeuristicEvaluation(candidateId, profile, messages);
  }
}
