import { CandidateProfile, InterviewMessage, AIEvaluation, AIRecommendationGrade } from '../../src/types.js';
import { db } from '../db/index.js';

/**
 * Simple concurrency limiter for LLM calls.
 * Prevents API rate-limit errors when many candidates interview simultaneously.
 * Default: max 10 concurrent LLM requests; configurable via LLM_MAX_CONCURRENT env var.
 */
class ConcurrencyLimiter {
  private maxConcurrent: number;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
      // active count stays the same (one leaves, one enters)
    } else {
      this.active = Math.max(0, this.active - 1);
    }
  }

  getActiveCount(): number {
    return this.active;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const DEFAULT_MAX_CONCURRENT_LLM = 10;
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

const llmLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_LLM);

console.log(`[AI Service] Concurrency limiter initialized: max ${MAX_CONCURRENT_LLM} concurrent LLM calls`);

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
    const queued = llmLimiter.getQueueLength();
    if (queued > 0) {
      console.log(`[AI Service] LLM request queued, position: ${queued}, active: ${llmLimiter.getActiveCount()}`);
    }

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
${isLastRound ? '注意：这是面试的最后一轮提问，可以偏向于综合学习规划、未来投入意愿或总结性思考。' : '注意：请针对候选人刚刚回答中的真实细节、排查思路、具体做法进行纵深追问，识别是否存在套话或空泛描述。'}

【过往问答对话记录】:
${conversationHistory}

请返回严格 JSON 格式：
{
  "analysis": "对候选人上一轮回答的内部分析（评估具体度、真实度、是否套话）",
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
            analysis: parsed.analysis || '回答包含一定细节。',
            isLastRound,
          };
        }
      } catch (e) {}
    }

    // Heuristic Dynamic Followup Engine
    let analysis = '回答较为简明，正在挖掘行为证据与实践细节。';
    let question = '';

    const isVague = answerText.length < 25 || (/喜欢|热爱|感兴趣|想学|很有意义/.test(answerText) && !/后来|当时|因为|发现|搜索|报错|配置|排查/.test(answerText));
    const mentionsTech = /代码|网站|服务器|Linux|Python|C\+\+|React|Docker|单片机|模型|爬虫|数据库|Git/.test(answerText);

    if (isVague && currentRound <= 2) {
      analysis = '表述较为宏观笼统，缺乏具体动手的行为证据，需进一步引导具体实例。';
      question = `你说对技术非常感兴趣，那能具体讲一件你在最近一两个月里，遇到不懂的计算机问题时，自己动手在网上搜索、排错并解决的小例子吗？过程是怎么样的？`;
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
1. 重点考量自驱潜力、动手解决问题习惯、逻辑条理性，而非已有技术熟练度（对大一零基础同学不要给低分，若其自驱学习能力强、善于搜索排障，应给予高分！）。
2. 识别套模板与空泛词汇：分析是否有具体行为证据、是否前后一致。
3. 严格按照下列 JSON 结构返回：
{
  "overall_score": 88,
  "recommendation": "S" | "A" | "B" | "C",
  "candidate_type": "高潜力 · 零基础探索者",
  "scores": {
    "learning": 92,
    "initiative": 90,
    "logic": 85,
    "technology_interest": 94,
    "communication": 82,
    "technical_foundation": 60
  },
  "quality": {
    "authenticity_score": 90,
    "specificity_score": 88,
    "consistency_score": 92
  },
  "anti_template_flag": false,
  "template_analysis": "分析是否有套模板痕迹",
  "strengths": ["优势点1", "优势点2", "优势点3"],
  "risks": ["潜在风险点1", "风险点2"],
  "summary": "候选人综合画像与表现总结（150字左右）",
  "recommendation_reason": "AI对技术部的初筛推荐理由与录用建议（80字左右）"
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
        const overallScore = Math.max(0, Math.min(100, Math.round(data.overall_score || 85)));
        let rec: AIRecommendationGrade = 'B';
        if (['S', 'A', 'B', 'C'].includes(data.recommendation)) {
          rec = data.recommendation as AIRecommendationGrade;
        } else if (overallScore >= 90) rec = 'S';
        else if (overallScore >= 80) rec = 'A';
        else if (overallScore >= 70) rec = 'B';
        else rec = 'C';

        return {
          id: `eval-${Date.now()}`,
          candidateId,
          overallScore,
          recommendation: rec,
          candidateType: data.candidate_type || '技术部潜力候选人',
          scores: {
            learning: Math.min(100, Math.max(30, data.scores?.learning || 85)),
            initiative: Math.min(100, Math.max(30, data.scores?.initiative || 85)),
            logic: Math.min(100, Math.max(30, data.scores?.logic || 80)),
            technology_interest: Math.min(100, Math.max(30, data.scores?.technology_interest || 88)),
            communication: Math.min(100, Math.max(30, data.scores?.communication || 80)),
            technical_foundation: Math.min(100, Math.max(20, data.scores?.technical_foundation || 60)),
          },
          quality: {
            authenticity_score: Math.min(100, Math.max(40, data.quality?.authenticity_score || 88)),
            specificity_score: Math.min(100, Math.max(40, data.quality?.specificity_score || 85)),
            consistency_score: Math.min(100, Math.max(40, data.quality?.consistency_score || 90)),
          },
          strengths: Array.isArray(data.strengths) && data.strengths.length > 0 ? data.strengths : ['具备持续探索意识', '沟通顺畅表达清晰'],
          risks: Array.isArray(data.risks) && data.risks.length > 0 ? data.risks : ['工程化开发规范尚待深入指导'],
          summary: data.summary || '该同学在面试中展现了良好的技术兴趣与思考能力，回答条理较为清晰。',
          recommendationReason: data.recommendation_reason || '符合技术部招新预期，建议予以录取。',
          antiTemplateFlag: Boolean(data.anti_template_flag),
          templateAnalysis: data.template_analysis || '语言表达客观真实，细节详实。',
          evaluatedAt: new Date().toISOString(),
        };
      } catch (err: any) {}
    }

    // High quality heuristic evaluation fallback
    const candAnswers = messages.filter(m => m.sender === 'candidate').map(m => m.content);
    const totalWords = candAnswers.join(' ').length;
    const hasDetailedEvidence = candAnswers.some(a => /因为|后来|排查|报错|配置|文档|日志|查了|试过/.test(a) && a.length > 35);
    const hasFoundation = profile.technicalFoundation !== '完全没有';

    // --- Invalid / junk answer detection ---
    // If all answers are meaningless repetitions / garbled / placeholder content,
    // return a low "invalid" score instead of an inflated heuristic score.
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
      // No Chinese characters and no English words of length >= 3
      const hasChinese = /[一-龥]/.test(clean);
      const hasEnglishWord = /[a-zA-Z]{3,}/.test(clean);
      if (!hasChinese && !hasEnglishWord) return true; // only numbers, symbols, single letters
      return false;
    }

    const allInvalid = candAnswers.length > 0 && candAnswers.every(a => isInvalidAnswer(a));

    if (allInvalid) {
      return {
        id: `eval-${Date.now()}`,
        candidateId,
        overallScore: 5 + Math.min(20, totalWords),
        recommendation: 'C' as AIRecommendationGrade,
        candidateType: '无效样本 · 测试/异常提交',
        scores: {
          learning: 30,
          initiative: 30,
          logic: 30,
          technology_interest: 30,
          communication: 30,
          technical_foundation: 20,
        },
        quality: {
          authenticity_score: 40,
          specificity_score: 30,
          consistency_score: 40,
        },
        strengths: [
          '面试全程未出现夸大自述或虚构经历（无实质内容可评估）',
          '专业与方向兴趣栏填写内容可作为后续补面的参考线索',
        ],
        risks: [
          '全部回答为无意义重复字符或占位内容，可能为测试账号、误触提交或输入通道故障',
          '在面试官多次降低门槛提示后仍无有效回应，若为真实候选人则沟通主动性存疑',
          '现有分数不代表真实能力水平，直接据此淘汰存在误判风险',
        ],
        summary: `${profile.name}同学本次面试记录整体无效：自我介绍及各轮回答均为无意义字符或占位内容，未出现任何自然语言表述、技术名词或经历描述。面试官已逐轮收敛问题范围并降低作答门槛，候选人依旧未提供任何可读信息，因此六项能力维度均无证据支撑，评分仅为形式化占位，不构成对其真实水平的负面结论。判断为测试数据、提交链路异常或输入设备故障所致。`,
        recommendationReason: '记录无有效内容，无法评估。建议标记为无效面试而非能力不合格；若为真实报名者，联系其更换设备或渠道重新安排补面。',
        antiTemplateFlag: true,
        templateAnalysis: `报名表与全部${candAnswers.length}轮回答均为无意义字符（如重复字母/数字），不含任何自然语言内容。既非套模板也非真实作答，属于典型占位/压力测试/异常提交数据。`,
        evaluatedAt: new Date().toISOString(),
      };
    }

    const learning = hasDetailedEvidence ? 88 : 78;
    const initiative = totalWords > 180 ? 90 : 75;
    const logic = hasDetailedEvidence ? 86 : 76;
    const interest = profile.techDirection !== '暂时不确定' ? 90 : 74;
    const comm = Math.min(95, Math.max(65, Math.floor(totalWords / 6) + 50));
    const foundation = hasFoundation ? 75 : 55;

    // Weight: 25% learning + 20% initiative + 20% logic + 15% interest + 10% comm + 10% foundation
    const overallScore = Math.round(
      learning * 0.25 + initiative * 0.20 + logic * 0.20 + interest * 0.15 + comm * 0.10 + foundation * 0.10
    );

    let rec: AIRecommendationGrade = 'B';
    if (overallScore >= 90) rec = 'S';
    else if (overallScore >= 80) rec = 'A';
    else if (overallScore >= 70) rec = 'B';
    else rec = 'C';

    const candidateType = !hasFoundation && learning >= 85
      ? '高潜力 · 零基础探索者'
      : hasFoundation && initiative >= 88
      ? '实践型 · 极客骨干'
      : '稳健型 · 潜力新人';

    return {
      id: `eval-${Date.now()}`,
      candidateId,
      overallScore,
      recommendation: rec,
      candidateType,
      scores: {
        learning,
        initiative,
        logic,
        technology_interest: interest,
        communication: comm,
        technical_foundation: foundation,
      },
      quality: {
        authenticity_score: hasDetailedEvidence ? 92 : 78,
        specificity_score: totalWords > 150 ? 88 : 72,
        consistency_score: 90,
      },
      strengths: [
        '遇到新问题愿意自主思考和搜寻线索',
        '对技术探索抱有积极健康的初始心态',
        hasDetailedEvidence ? '回答中能够给出具体的排错或思考过程' : '表达诚恳，心态开放',
      ],
      risks: [
        !hasFoundation ? '当前技术基础相对零碎，需体系化从头带练' : '大型协同开发习惯有待在技术部项目中建立',
      ],
      summary: `${profile.name}同学在初筛面试中表现出优良的学习态度与探索自驱力，整体回答逻辑条理分明，符合技术部对新生成员的培养定位。`,
      recommendationReason: overallScore >= 80
        ? '具备良好的自驱动手潜质，建议技术部予以录取并开放进群。'
        : '各方面表现均衡，可作为技术部录用候选人。',
      antiTemplateFlag: totalWords < 80,
      templateAnalysis: totalWords > 120 ? '回答具有较多具体细节，无套用模板迹象' : '回答字数偏精炼，可直接查看完整问答实录',
      evaluatedAt: new Date().toISOString(),
    };
  }
}
