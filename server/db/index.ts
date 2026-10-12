import fs from 'fs';
import path from 'path';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import {
  AdminUser,
  RecruitmentBatch,
  Candidate,
  AIEvaluation,
  InterviewSession,
  ManualReview,
  CandidateNote,
  WeChatGroupQR,
  CandidateStatusHistory,
  AIPromptConfig,
  AISettings,
  CandidateStatus,
} from '../../src/types.js';

interface DatabaseSchema {
  admin_users: AdminUser[];
  admin_passwords?: Record<string, string>;
  auth_secret?: string;
  recruitment_batches: RecruitmentBatch[];
  candidates: Candidate[];
  interviews: InterviewSession[];
  ai_evaluations: AIEvaluation[];
  manual_reviews: ManualReview[];
  candidate_notes: CandidateNote[];
  wechat_group_qrs: WeChatGroupQR[];
  candidate_status_history: CandidateStatusHistory[];
  ai_prompts: AIPromptConfig[];
  ai_settings: AISettings;
}

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Initial admin password for a fresh DB. Set ADMIN_DEFAULT_PASSWORD in the environment to
// override the shipped default; anything typed later via changePassword() is persisted.
const DEFAULT_ADMIN_PASSWORD = (process.env.ADMIN_DEFAULT_PASSWORD || '').trim();

// Passwords are stored as "scrypt:<base64url salt>:<hex digest>". The DB predates hashing
// and may still hold plaintext entries, so verifyPassword() migrates them on first success.
function hashPassword(pass: string): string {
  const salt = randomBytes(16).toString('base64url');
  const digest = scryptSync(pass, salt, 32).toString('hex');
  return `scrypt:${salt}:${digest}`;
}

// Default initial prompts
const DEFAULT_PROMPTS: AIPromptConfig[] = [
  {
    id: 'prompt-1',
    key: 'interviewer_system_prompt',
    name: '初筛面试官系统设定',
    version: 1,
    prompt: `你是一名经验丰富的高校学生技术部技术骨干兼招新面试官。你的核心任务是对报名的大一新生进行第一轮技术初筛。
你的目标是发掘具有技术自驱力、动手探索精神、清晰逻辑与潜力的同学，而不仅仅看当前掌握多少现成框架。
核心要求：
1. 语言亲和、专业、循序渐进，像学长/学姐在技术交流，杜绝八股文问卷感。
2. 重点关注大一新生的“行为证据”：问真实折腾经历、遇到的坑、排查思路、学习方法。
3. 识别并打压套话模板（如“我非常热爱技术”、“从小对电脑感兴趣”这类空泛词汇必须追问具体实例）。
4. 每一轮面试严格基于上一轮候选人的回答进行纵深追问。`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
  },
  {
    id: 'prompt-2',
    key: 'followup_prompt',
    name: '动态追问逻辑设定',
    version: 1,
    prompt: `候选人刚给出了回答。请分析该回答中的具体细节，选择一个具体的切入点进行追问：
- 如果回答提到某个技术名词或工具，追问其实际使用场景与踩坑经验；
- 如果回答很抽象套话，礼貌引导：“能具体举一个你在过去一个月内自己动手实践/折腾的小例子吗？”
- 如果提到了做过的项目或配置过的环境，追问当时遇到的最大阻碍以及最终是如何解决的。
严格输出 JSON: { "question": "...", "internal_analysis": "...", "depth_round": 1 }`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
  },
  {
    id: 'prompt-3',
    key: 'evaluation_prompt',
    name: '多维综合能力量化评估 Prompt',
    version: 1,
    prompt: `根据候选人全部面试问答记录及基础信息，给出全方位量化评估及结构化报告。
评分标准：
- learning (学习能力 25%): 遇未知知识主动搜索、官方文档查阅、领悟迭代速度
- initiative (主动性 20%): 是否有自发自驱的动手实践与折腾意愿
- logic (逻辑思维 20%): 排查问题的因果推导条理性、归纳总结能力
- technology_interest (技术兴趣 15%): 是否有真实的纯粹热爱与持续探索动能
- communication (表达能力 10%): 是否能讲清技术细节与复现步骤
- technical_foundation (技术基础 10%): 当前技术积淀与计算机常识
计算综合加权分 (0-100)，推荐等级 (S: >=90, A: >=80, B: >=70, C: <70)。`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
  },
];

// SVG QR Code data URI for default WeChat Group
const DEFAULT_WECHAT_QR_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <rect width="300" height="300" fill="#ffffff" rx="16"/>
  <rect x="25" y="25" width="70" height="70" fill="#09090b" rx="8"/>
  <rect x="35" y="35" width="50" height="50" fill="#ffffff" rx="4"/>
  <rect x="45" y="45" width="30" height="30" fill="#09090b" rx="2"/>

  <rect x="205" y="25" width="70" height="70" fill="#09090b" rx="8"/>
  <rect x="215" y="35" width="50" height="50" fill="#ffffff" rx="4"/>
  <rect x="225" y="45" width="30" height="30" fill="#09090b" rx="2"/>

  <rect x="25" y="205" width="70" height="70" fill="#09090b" rx="8"/>
  <rect x="35" y="215" width="50" height="50" fill="#ffffff" rx="4"/>
  <rect x="45" y="225" width="30" height="30" fill="#09090b" rx="2"/>

  <!-- Matrix Pattern -->
  <g fill="#09090b">
    <rect x="110" y="30" width="15" height="15"/>
    <rect x="140" y="30" width="15" height="15"/>
    <rect x="170" y="30" width="15" height="15"/>
    <rect x="110" y="60" width="15" height="15"/>
    <rect x="155" y="60" width="15" height="15"/>
    <rect x="125" y="75" width="15" height="15"/>
    <rect x="170" y="75" width="15" height="15"/>
    <rect x="30" y="110" width="15" height="15"/>
    <rect x="60" y="110" width="15" height="15"/>
    <rect x="90" y="110" width="15" height="15"/>
    <rect x="120" y="110" width="15" height="15"/>
    <rect x="165" y="110" width="15" height="15"/>
    <rect x="210" y="110" width="15" height="15"/>
    <rect x="240" y="110" width="15" height="15"/>
    <rect x="45" y="140" width="15" height="15"/>
    <rect x="90" y="140" width="15" height="15"/>
    <rect x="195" y="140" width="15" height="15"/>
    <rect x="255" y="140" width="15" height="15"/>
    <rect x="30" y="170" width="15" height="15"/>
    <rect x="75" y="170" width="15" height="15"/>
    <rect x="120" y="170" width="15" height="15"/>
    <rect x="165" y="170" width="15" height="15"/>
    <rect x="225" y="170" width="15" height="15"/>
    <rect x="110" y="210" width="15" height="15"/>
    <rect x="140" y="210" width="15" height="15"/>
    <rect x="180" y="210" width="15" height="15"/>
    <rect x="240" y="210" width="15" height="15"/>
    <rect x="125" y="240" width="15" height="15"/>
    <rect x="155" y="240" width="15" height="15"/>
    <rect x="210" y="240" width="15" height="15"/>
    <rect x="255" y="240" width="15" height="15"/>
  </g>

  <!-- Tech Dept Center Logo Badge -->
  <rect x="115" y="115" width="70" height="70" fill="#09090b" rx="12"/>
  <rect x="120" y="120" width="60" height="60" fill="#10b981" rx="8"/>
  <text x="150" y="157" fill="#ffffff" font-family="monospace" font-size="20" font-weight="bold" text-anchor="middle">TECH</text>
  <text x="150" y="290" fill="#71717a" font-family="monospace" font-size="11" text-anchor="middle">2026 技术部招新官方群</text>
</svg>
`)}`;

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = {
      admin_users: [],
      recruitment_batches: [],
      candidates: [],
      interviews: [],
      ai_evaluations: [],
      manual_reviews: [],
      candidate_notes: [],
      wechat_group_qrs: [],
      candidate_status_history: [],
      ai_prompts: [],
      ai_settings: {
        id: 'ai-settings-main',
        primary: { apiKey: '', baseUrl: '', model: '' },
        fallback: { apiKey: '', baseUrl: '', model: '' },
        updatedAt: new Date().toISOString(),
        updatedBy: 'system_init',
      },
    };
    this.init();
  }

  private init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        // Ensure reviewer role is purged and only ADMIN exists
        if (this.data.admin_users) {
          this.data.admin_users = this.data.admin_users.filter(u => u.username === 'admin');
        }
        if (this.data.admin_passwords) {
          delete this.data.admin_passwords['reviewer'];
        }
        console.log(`[DB] Successfully loaded database with ${this.data.candidates.length} candidates.`);
      } catch (e) {
        console.error('[DB] Error parsing existing db.json, generating seed...', e);
        this.seedInitialData();
      }
    } else {
      this.seedInitialData();
    }

    this.ensureAuthSecret();
    if (!this.data.admin_passwords?.admin && !DEFAULT_ADMIN_PASSWORD) {
      throw new Error('ADMIN_DEFAULT_PASSWORD must be set before starting with a new or passwordless database.');
    }
  }

  private save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to save to disk:', err);
    }
  }

  // Signing key for admin session tokens. Persisted rather than held in memory so
  // tokens survive PM2's max_memory_restart restarts; AUTH_TOKEN_SECRET in the
  // environment always wins over the stored value.
  private ensureAuthSecret() {
    if ((process.env.AUTH_TOKEN_SECRET || '').trim()) return;
    if (this.data.auth_secret) return;
    this.data.auth_secret = randomBytes(32).toString('base64url');
    this.save();
    console.log('[DB] Generated a new admin session signing secret.');
  }

  public getAuthSecret(): string {
    return (process.env.AUTH_TOKEN_SECRET || '').trim() || this.data.auth_secret || '';
  }

  private seedInitialData() {
    console.log('[DB] Seeding comprehensive initial recruitment dataset...');

    const batch2026: RecruitmentBatch = {
      id: 'batch-2026',
      name: '2026 技术部秋季新生招新',
      year: 2026,
      isActive: true,
      startDate: '2026-09-01T08:00:00.000Z',
      description: '面向全校 2026 级本科新生，涵盖前端、后端、AI、硬件与产品设计方向。',
    };

    const batch2025: RecruitmentBatch = {
      id: 'batch-2025',
      name: '2025 技术部招新 (往期归档)',
      year: 2025,
      isActive: false,
      startDate: '2025-09-01T08:00:00.000Z',
      endDate: '2025-10-15T18:00:00.000Z',
      description: '2025 年度招新档案数据。',
    };

    const adminUsers: AdminUser[] = [
      {
        id: 'usr-admin-1',
        username: 'admin',
        name: '技术部管理员',
        role: 'ADMIN',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      },
    ];

    const wechatQRs: WeChatGroupQR[] = [
      {
        id: 'qr-2026-1',
        batchId: 'batch-2026',
        imageUrl: DEFAULT_WECHAT_QR_SVG,
        title: '2026 技术部招新官方微信群 (一期)',
        status: 'ACTIVE',
        expiresAt: '2026-10-31T23:59:59.000Z',
        createdAt: '2026-09-01T08:00:00.000Z',
        updatedAt: '2026-09-01T08:00:00.000Z',
      },
    ];

    // Clean initial state for user self-testing
    const defaultAISettings: AISettings = {
      id: 'ai-settings-main',
      primary: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || '',
        model: process.env.OPENAI_MODEL || '',
      },
      fallback: {
        apiKey: process.env.FALLBACK_OPENAI_API_KEY || '',
        baseUrl: process.env.FALLBACK_OPENAI_BASE_URL || '',
        model: process.env.FALLBACK_OPENAI_MODEL || '',
      },
      updatedAt: new Date().toISOString(),
      updatedBy: 'system_seed',
    };

    this.data = {
      admin_users: adminUsers,
      recruitment_batches: [batch2026, batch2025],
      candidates: [],
      interviews: [],
      ai_evaluations: [],
      manual_reviews: [],
      candidate_notes: [],
      wechat_group_qrs: wechatQRs,
      candidate_status_history: [],
      ai_prompts: DEFAULT_PROMPTS,
      ai_settings: defaultAISettings,
    };

    this.save();
    console.log('[DB] Initialized clean database with 0 candidate records for user testing.');
  }

  /**
   * Reset and clear all candidate testing data
   */
  public clearCandidateData(): void {
    this.data.candidates = [];
    this.data.interviews = [];
    this.data.ai_evaluations = [];
    this.data.manual_reviews = [];
    this.data.candidate_notes = [];
    this.data.candidate_status_history = [];
    this.save();
    console.log('[DB] All candidate testing records cleared.');
  }

  // --- CRUD API Methods ---

  // Batches
  public getBatches(): RecruitmentBatch[] {
    return this.data.recruitment_batches;
  }

  public getActiveBatch(): RecruitmentBatch | undefined {
    return this.data.recruitment_batches.find(b => b.isActive) || this.data.recruitment_batches[0];
  }

  public createBatch(batch: RecruitmentBatch): RecruitmentBatch {
    this.data.recruitment_batches.push(batch);
    this.save();
    return batch;
  }

  public setActiveBatch(batchId: string): void {
    this.data.recruitment_batches.forEach(b => {
      b.isActive = b.id === batchId;
    });
    this.save();
  }

  // Candidates
  public getCandidates(batchId?: string): Candidate[] {
    if (batchId) {
      return this.data.candidates.filter(c => c.batchId === batchId);
    }
    return this.data.candidates;
  }

  public getCandidateById(id: string): Candidate | undefined {
    return this.data.candidates.find(c => c.id === id);
  }

  public findCandidateByStudentId(studentId: string, batchId?: string): Candidate | undefined {
    const cleanId = String(studentId || '').trim();
    if (!cleanId) return undefined;
    return this.data.candidates.find(c => c.profile.studentId === cleanId && (!batchId || c.batchId === batchId)) ||
           this.data.candidates.find(c => c.profile.studentId === cleanId);
  }

  public createCandidate(candidate: Candidate): Candidate {
    this.data.candidates.unshift(candidate);
    this.recordStatusHistory(candidate.id, 'REGISTERED', 'REGISTERED', 'student', '新生成员初次报名');
    this.save();
    return candidate;
  }

  public updateCandidateStatus(candidateId: string, toStatus: CandidateStatus, operator = 'system', reason?: string): Candidate | null {
    const cand = this.data.candidates.find(c => c.id === candidateId);
    if (!cand) return null;

    const fromStatus = cand.status;
    cand.status = toStatus;
    cand.updatedAt = new Date().toISOString();

    if (toStatus === 'AI_COMPLETED') cand.aiCompletedAt = cand.updatedAt;
    if (toStatus === 'MANUAL_PASSED' || toStatus === 'MANUAL_REJECTED') cand.manualReviewedAt = cand.updatedAt;
    if (toStatus === 'GROUP_JOIN_CONFIRMED') cand.groupJoinedAt = cand.updatedAt;
    if (toStatus === 'ADMITTED') cand.admittedAt = cand.updatedAt;

    this.recordStatusHistory(candidateId, fromStatus, toStatus, operator, reason);
    this.save();
    return cand;
  }

  public updateCandidateScores(candidateId: string, score: number, grade: Candidate['aiRecommendation'], candidateType: string): void {
    const cand = this.data.candidates.find(c => c.id === candidateId);
    if (cand) {
      cand.aiScore = score;
      cand.aiRecommendation = grade;
      cand.candidateType = candidateType;
      cand.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  // Status History
  public recordStatusHistory(candidateId: string, fromStatus: CandidateStatus, toStatus: CandidateStatus, operator: string, reason?: string) {
    this.data.candidate_status_history.unshift({
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      candidateId,
      fromStatus,
      toStatus,
      operator,
      reason,
      timestamp: new Date().toISOString(),
    });
    this.save();
  }

  public getStatusHistory(candidateId: string): CandidateStatusHistory[] {
    return this.data.candidate_status_history
      .filter(h => h.candidateId === candidateId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // Interviews
  public getInterviewByCandidateId(candidateId: string): InterviewSession | undefined {
    return this.data.interviews.find(i => i.candidateId === candidateId);
  }

  public createInterview(interview: InterviewSession): InterviewSession {
    this.data.interviews.push(interview);
    this.save();
    return interview;
  }

  public updateInterview(interview: InterviewSession): void {
    const idx = this.data.interviews.findIndex(i => i.id === interview.id);
    if (idx !== -1) {
      this.data.interviews[idx] = interview;
      this.save();
    }
  }

  // Evaluations
  public getEvaluationByCandidateId(candidateId: string): AIEvaluation | undefined {
    return this.data.ai_evaluations.find(e => e.candidateId === candidateId);
  }

  public saveEvaluation(evaluation: AIEvaluation): AIEvaluation {
    const existingIdx = this.data.ai_evaluations.findIndex(e => e.candidateId === evaluation.candidateId);
    if (existingIdx !== -1) {
      this.data.ai_evaluations[existingIdx] = evaluation;
    } else {
      this.data.ai_evaluations.push(evaluation);
    }
    this.save();
    return evaluation;
  }

  // Manual Reviews
  public getManualReviewByCandidateId(candidateId: string): ManualReview | undefined {
    return this.data.manual_reviews.find(m => m.candidateId === candidateId);
  }

  public saveManualReview(review: ManualReview): ManualReview {
    const existingIdx = this.data.manual_reviews.findIndex(m => m.candidateId === review.candidateId);
    if (existingIdx !== -1) {
      this.data.manual_reviews[existingIdx] = review;
    } else {
      this.data.manual_reviews.push(review);
    }
    this.save();
    return review;
  }

  // Candidate Notes
  public getNotesByCandidateId(candidateId: string): CandidateNote[] {
    return this.data.candidate_notes.filter(n => n.candidateId === candidateId);
  }

  public addCandidateNote(note: CandidateNote): CandidateNote {
    this.data.candidate_notes.push(note);
    this.save();
    return note;
  }

  public deleteCandidate(candidateId: string): boolean {
    const prevLen = this.data.candidates.length;
    this.data.candidates = this.data.candidates.filter(c => c.id !== candidateId);
    this.data.interviews = this.data.interviews.filter(i => i.candidateId !== candidateId);
    this.data.ai_evaluations = this.data.ai_evaluations.filter(e => e.candidateId !== candidateId);
    this.data.manual_reviews = this.data.manual_reviews.filter(m => m.candidateId !== candidateId);
    this.data.candidate_notes = this.data.candidate_notes.filter(n => n.candidateId !== candidateId);
    this.data.candidate_status_history = this.data.candidate_status_history.filter(h => h.candidateId !== candidateId);
    this.save();
    return this.data.candidates.length < prevLen;
  }

  // WeChat QR Management
  public getWeChatQR(batchId?: string): WeChatGroupQR | undefined {
    if (batchId) {
      const batchList = this.data.wechat_group_qrs.filter(q => q.batchId === batchId && q.status === 'ACTIVE');
      return batchList.length > 0 ? batchList[batchList.length - 1] : undefined;
    }
    const allActive = this.data.wechat_group_qrs.filter(q => q.status === 'ACTIVE');
    if (allActive.length > 0) return allActive[allActive.length - 1];
    return undefined;
  }

  public getAllWeChatQRs(): WeChatGroupQR[] {
    return this.data.wechat_group_qrs;
  }

  public saveWeChatQR(qr: WeChatGroupQR): WeChatGroupQR {
    const existingIdx = this.data.wechat_group_qrs.findIndex(
      q => q.id === qr.id || (qr.batchId && q.batchId === qr.batchId)
    );
    if (existingIdx !== -1) {
      this.data.wechat_group_qrs[existingIdx] = {
        ...this.data.wechat_group_qrs[existingIdx],
        ...qr,
        updatedAt: new Date().toISOString(),
      };
      this.save();
      return this.data.wechat_group_qrs[existingIdx];
    } else {
      this.data.wechat_group_qrs.push(qr);
      this.save();
      return qr;
    }
  }

  public deleteWeChatQR(id?: string, batchId?: string): boolean {
    const prevLen = this.data.wechat_group_qrs.length;
    this.data.wechat_group_qrs = this.data.wechat_group_qrs.filter(q => {
      if (id && q.id === id) return false;
      if (batchId && q.batchId === batchId) return false;
      return true;
    });
    this.save();
    return this.data.wechat_group_qrs.length < prevLen;
  }

  // AI Prompts
  public getPrompts(): AIPromptConfig[] {
    return this.data.ai_prompts;
  }

  public updatePrompt(id: string, newPrompt: string, updatedBy: string): AIPromptConfig | null {
    const prompt = this.data.ai_prompts.find(p => p.id === id);
    if (!prompt) return null;
    prompt.prompt = newPrompt;
    prompt.version += 1;
    prompt.updatedAt = new Date().toISOString();
    prompt.updatedBy = updatedBy;
    this.save();
    return prompt;
  }

  // AI Settings (provider configuration)
  public getAISettings(): AISettings {
    // Backfill for existing DBs that were seeded before ai_settings was added
    if (!this.data.ai_settings) {
      this.data.ai_settings = {
        id: 'ai-settings-main',
        primary: {
          apiKey: process.env.OPENAI_API_KEY || '',
          baseUrl: process.env.OPENAI_BASE_URL || '',
          model: process.env.OPENAI_MODEL || '',
        },
        fallback: {
          apiKey: process.env.FALLBACK_OPENAI_API_KEY || '',
          baseUrl: process.env.FALLBACK_OPENAI_BASE_URL || '',
          model: process.env.FALLBACK_OPENAI_MODEL || '',
        },
        updatedAt: new Date().toISOString(),
        updatedBy: 'system_migration',
      };
      this.save();
    }
    return this.data.ai_settings;
  }

  public updateAISettings(
    updates: {
      primary?: Partial<Pick<AISettings['primary'], 'apiKey' | 'baseUrl' | 'model'>>;
      fallback?: Partial<Pick<AISettings['fallback'], 'apiKey' | 'baseUrl' | 'model'>>;
    },
    updatedBy: string
  ): AISettings {
    const settings = this.getAISettings();

    if (updates.primary) {
      if (updates.primary.apiKey !== undefined && updates.primary.apiKey.trim() !== '') {
        settings.primary.apiKey = updates.primary.apiKey.trim();
      }
      if (updates.primary.baseUrl !== undefined) {
        settings.primary.baseUrl = updates.primary.baseUrl.trim();
      }
      if (updates.primary.model !== undefined) {
        settings.primary.model = updates.primary.model.trim();
      }
    }

    if (updates.fallback) {
      if (updates.fallback.apiKey !== undefined && updates.fallback.apiKey.trim() !== '') {
        settings.fallback.apiKey = updates.fallback.apiKey.trim();
      }
      if (updates.fallback.baseUrl !== undefined) {
        settings.fallback.baseUrl = updates.fallback.baseUrl.trim();
      }
      if (updates.fallback.model !== undefined) {
        settings.fallback.model = updates.fallback.model.trim();
      }
    }

    settings.updatedAt = new Date().toISOString();
    settings.updatedBy = updatedBy;
    this.save();
    return settings;
  }

  // Admin Users & Passwords
  public getAdminUsers(): AdminUser[] {
    return this.data.admin_users;
  }

  public findAdminUser(username: string): AdminUser | undefined {
    return this.data.admin_users.find(u => u.username === username);
  }

  public verifyPassword(username: string, pass: string): boolean {
    if (!this.data.admin_passwords?.admin) {
      if (!DEFAULT_ADMIN_PASSWORD) return false;
      this.data.admin_passwords = {
        ...(this.data.admin_passwords || {}),
        admin: DEFAULT_ADMIN_PASSWORD,
      };
      this.save();
    }

    const stored = this.data.admin_passwords[username];
    if (!stored) return false;

    // Legacy plaintext entries (pre-hashing DBs) are verified then upgraded in place.
    if (!stored.startsWith('scrypt:')) {
      const salt = randomBytes(16).toString('base64url');
      const expected = scryptSync(stored, salt, 32);
      const actual = scryptSync(pass, salt, 32);
      const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
      if (ok) {
        this.data.admin_passwords[username] = hashPassword(pass);
        this.save();
        console.log(`[DB] Upgraded admin password for "${username}" to a scrypt hash.`);
      }
      return ok;
    }

    const [salt, expectedHash] = stored.slice('scrypt:'.length).split(':');
    if (!salt || !expectedHash) return false;
    const actual = scryptSync(pass, salt, 32).toString('hex');
    const exp = Buffer.from(expectedHash, 'hex');
    const act = Buffer.from(actual, 'hex');
    return exp.length === act.length && timingSafeEqual(exp, act);
  }

  public changePassword(username: string, newPass: string): boolean {
    if (!this.data.admin_passwords) {
      this.data.admin_passwords = {
        admin: DEFAULT_ADMIN_PASSWORD,
      };
    }
    this.data.admin_passwords[username] = hashPassword(newPass);
    this.save();
    return true;
  }
}

export const db = new Database();
