import { CandidateProfile, InterviewMessage, AIEvaluation, AIRecommendationGrade, CapabilityScores } from '../../src/types.js';
import { db } from '../db/index.js';

/**
 * Simple concurrency limiter for LLM calls.
 * Prevents API rate-limit errors when many candidates interview simultaneously.
 * Default: max 10 concurrent LLM requests; configurable via LLM_MAX_CONCURRENT env var.
 */
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

/**
 * Multi-API-key round-robin pool with failover.
 *
 * Keys are sourced from (in priority order):
 *   1. OPENAI_API_KEYS env var — comma-separated list of keys (all share baseUrl + model)
 *   2. OPENAI_API_KEY + FALLBACK_OPENAI_API_KEY env vars
 *   3. DB ai_settings.primary + fallback
 *
 * Strategy:
 *   - Round-robin assignment across healthy keys for load distribution
 *   - On failure (429, 5xx, timeout, network error), automatically retry with next key
 *   - All keys share the same baseUrl and model
 */
interface APIKeyEntry {
  key: string;
  baseUrl: string;
  model: string;
}

class APIKeyPool {
  private keys: APIKeyEntry[] = [];
  private nextIndex = 0;

  setKeys(entries: APIKeyEntry[]): void {
    this.keys = entries.filter(e => e.key && e.baseUrl && e.model);
    this.nextIndex = 0;
  }

  size(): number {
    return this.keys.length;
  }

  /**
   * Get the next key in round-robin order.
   * Returns null if no keys are configured.
   */
  nextKey(): APIKeyEntry | null {
    if (this.keys.length === 0) return null;
    const entry = this.keys[this.nextIndex % this.keys.length];
    this.nextIndex = (this.nextIndex + 1) % this.keys.length;
    return entry;
  }

  /**
   * Try calling fn with keys in round-robin order, failing over to the next key on error.
   * Tries each key at most once per call. Returns null if all keys fail.
   */
  async tryEach<T>(fn: (entry: APIKeyEntry, attempt: number, total: number) => Promise<T | null>): Promise<T | null> {
    const total = this.keys.length;
    if (total === 0) return null;

    // Start from the current round-robin position
    const startIdx = this.nextIndex % total;
    this.nextIndex = (this.nextIndex + 1) % total;

    for (let i = 0; i < total; i++) {
      const idx = (startIdx + i) % total;
      const entry = this.keys[idx];
      const attempt = i + 1;

      const result = await fn(entry, attempt, total);
      if (result !== null && result !== undefined) {
        return result;
      }

      if (attempt < total) {
        console.warn(`[AI Service] Key ${attempt}/${total} failed, trying next key (failover)...`);
      }
    }

    return null;
  }
}

const apiKeyPool = new APIKeyPool();

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

function readRequiredScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Evaluation response contains a missing or invalid capability score.');
  }
  return Math.round(Math.min(100, Math.max(0, value)));
}

function readOptionalScore(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(100, Math.max(0, value)));
}

function calculateOverallScore(scores: CapabilityScores): number {
  return Math.round(
    scores.learning * 0.25 +
    scores.initiative * 0.20 +
    scores.logic * 0.20 +
    scores.technology_interest * 0.15 +
    scores.communication * 0.10 +
    scores.technical_foundation * 0.10
  );
}

function gradeForScore(score: number): AIRecommendationGrade {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  return 'C';
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
    const promptConfig = db.getPrompts().find(p => p.key === 'interviewer_system_prompt');
    const systemPrompt = promptConfig?.prompt || '你是高校技术部招新面试官，请向新生提出首个初筛问题。';

    const userPrompt = `候选人基本信息：
- 姓名: ${profile.name}
- 专业: ${profile.major} (${profile.className})
- 技术基础: ${profile.technicalFoundation}
- 期望方向: ${profile.techDirection}
- 个人自我介绍: "${profile.selfIntro}"

请根据这位新生的基础和方向，提出第一个破冰/初筛提问。
要求：
1. 语言亲切、专业、像师兄师姐交流，避免僵硬的高考式提问；
2. 针对他自我介绍中提到的细节或他对${profile.techDirection}方向的兴趣出发；
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
    const isLastRound = currentRound >= 4; // 4-5 rounds is ideal (8-12 min)
    const lastUserMsg = [...history].reverse().find(m => m.sender === 'candidate');
    const answerText = lastUserMsg?.content || '';

    const promptConfig = db.getPrompts().find(p => p.key === 'followup_prompt');
    const followupPrompt = promptConfig?.prompt || '请基于候选人最新回答，深入追问细节或行为证据。';

    const conversationHistory = history
      .map(m => `${m.sender === 'ai' ? '面试官' : profile.name}: ${m.content}`)
      .join('\n');

    const userPrompt = `${followupPrompt}

【候选人信息】
姓名: ${profile.name}, 专业: ${profile.major}, 基础: ${profile.technicalFoundation}, 方向: ${profile.techDirection}
自我介绍: ${profile.selfIntro}

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
    const candidateConversation = messages
      .map(m => `${m.sender === 'ai' ? '面试官' : profile.name}: ${m.content}`)
      .join('\n\n');

    const promptConfig = db.getPrompts().find(p => p.key === 'evaluation_prompt');
    const evalPrompt = promptConfig?.prompt || '对候选人进行多维综合潜力与真实度评估。';

    const userPrompt = `${evalPrompt}

【候选人信息】
姓名: ${profile.name}
专业: ${profile.major} (${profile.className})
技术基础: ${profile.technicalFoundation}
技术方向兴趣: ${profile.techDirection}
个人介绍: ${profile.selfIntro}

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
    const candAnswers = messages.filter(m => m.sender === 'candidate').map(m => m.content);
    const hasDetailedEvidence = candAnswers.some(a => /因为|后来|排查|报错|配置|文档|日志|查了|试过|定位|对比/.test(a));
    const hasLearningEvidence = candAnswers.some(a => /搜索|查阅|文档|教程|请教|尝试|学习|研究|排查/.test(a));
    const hasActionEvidence = candAnswers.some(a => /动手|写了|做了|搭建|配置|调试|安装|部署|使用|实现|项目|修改/.test(a));
    const hasReasoningEvidence = candAnswers.some(a => /因为|所以|发现|判断|定位|对比|尝试|后来|结果|原因|解决/.test(a));
    const hasFoundation = profile.technicalFoundation !== '完全没有';

    // Mark only clearly unreadable records as insufficient information. This
    // flag is a prompt for manual follow-up, never a rejection decision.
    function isInvalidAnswer(text: string): boolean {
      if (!text || text.trim().length < 2) return true;
      const clean = text.replace(/[\s\n\r]/g, '');
      if (clean.length < 3) return true;
      // Count most frequent single character
      const charCounts: Record<string, number> = {};
      for (const ch of clean) charCounts[ch] = (charCounts[ch] || 0) + 1;
      const topCount = Math.max(...Object.values(charCounts));
      const topRatio = topCount / clean.length;
      if (topRatio > 0.6 && clean.length > 5) return true; // dominated by a single character (e.g. "qqqqqq...")
      // Accept letters from any writing system; do not assume Chinese or English.
      if (!/\p{L}{2,}/u.test(clean)) return true; // only numbers, symbols, or isolated letters
      return false;
    }

    const allInvalid = candAnswers.length > 0 && candAnswers.every(a => isInvalidAnswer(a));

    if (allInvalid) {
      const invalidScores: CapabilityScores = {
        learning: 30,
        initiative: 30,
        logic: 30,
        technology_interest: 30,
        communication: 30,
        technical_foundation: 20,
      };
      return {
        id: `eval-${Date.now()}`,
        candidateId,
        overallScore: calculateOverallScore(invalidScores),
        recommendation: gradeForScore(calculateOverallScore(invalidScores)),
        candidateType: '信息不足 · 建议核对记录',
        scores: invalidScores,
        quality: {
          authenticity_score: 50,
          specificity_score: 50,
          consistency_score: 50,
        },
        strengths: [
          '当前记录无法提供可核实的面试回答证据',
          '报名时填写的方向可供管理员后续沟通时参考',
        ],
        risks: [
          '面试记录中没有可读的回答内容，可能与误触、输入设备或提交链路有关',
          '现有记录不足以评估候选人的能力、兴趣或沟通表现',
        ],
        summary: `${profile.name}同学的当前面试记录缺少可读回答，无法据此评估真实能力。原因可能包括误触、输入设备或提交链路问题；建议管理员先核对记录，并联系候选人确认是否需要更换设备或安排补面。此分数仅用于标记“信息不足”，不代表能力判断。`,
        recommendationReason: '请先核验提交记录并联系候选人，确认是否需要更换设备、补充回答或安排补面；不据此作淘汰判断。',
        antiTemplateFlag: false,
        templateAnalysis: `记录中有${candAnswers.length}条候选人回答，但当前内容不可读；无法判断原因或真实性，建议先核对提交链路并联系候选人。`,
        evaluationSource: 'heuristic',
        evaluatedAt: new Date().toISOString(),
      };
    }

    // The fallback has no semantic model. Keep scores near neutral and only
    // adjust dimensions when answers contain simple, observable clues.
    const learning = hasLearningEvidence ? 80 : 70;
    const initiative = hasActionEvidence ? 80 : 70;
    const logic = hasReasoningEvidence ? 80 : 70;
    const interest = 70; // A selected direction alone does not prove sustained interest.
    const comm = 70; // Never infer communication ability from answer length.
    const foundation = hasFoundation ? 70 : 65;
    const scores: CapabilityScores = {
      learning,
      initiative,
      logic,
      technology_interest: interest,
      communication: comm,
      technical_foundation: foundation,
    };
    const overallScore = calculateOverallScore(scores);
    const rec = gradeForScore(overallScore);

    return {
      id: `eval-${Date.now()}`,
      candidateId,
      overallScore,
      recommendation: rec,
      candidateType: '规则评分 · 需人工复核',
      scores,
      quality: {
        authenticity_score: 50,
        specificity_score: hasDetailedEvidence ? 70 : 50,
        consistency_score: 50,
      },
      strengths: [
        hasLearningEvidence ? '回答提到查找资料、学习或排查的线索' : '当前规则未识别到明确的学习过程线索',
        hasActionEvidence ? '回答提到动手尝试或实际操作的线索' : '当前规则未识别到明确的实践过程线索',
        hasReasoningEvidence ? '回答提到原因、步骤或结果的线索' : '请人工结合完整问答补充判断',
      ],
      risks: [
        '当前为规则评分，不能理解语义，也不能可靠判断学习潜力或沟通能力',
        '请管理员核对完整问答；必要时安排人工追问',
      ],
      summary: `${profile.name}同学的报告由简单规则生成，只能展示部分关键词线索，不能代表候选人真实能力或适合度。请管理员查看完整问答并进行人工复核。`,
      recommendationReason: '规则评分无法替代语义评估。建议人工核对回答中提到的具体经历、学习过程和未明确的信息，再独立作出决定。',
      antiTemplateFlag: false,
      templateAnalysis: hasDetailedEvidence
        ? '回答中出现具体步骤或经历线索；本规则无法判断真实性。'
        : '具体经历信息有限；不据此判断套话、诚信或兴趣，请人工追问。',
      evaluationSource: 'heuristic',
      evaluatedAt: new Date().toISOString(),
    };
  }
}
