import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db/index.js';
import { RecruitmentService } from './server/services/recruitment.js';
import { CandidateStatus, UserRole } from './src/types.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Admin session tokens ---
// Tokens are HMAC-SHA256 signed over "<username>.<expiryEpochMs>" using a secret that
// is persisted in db.json (see db.getAuthSecret), so they survive PM2's
// max_memory_restart restarts. The previous "token_<user>_<timestamp>" shape contained
// no secret, so any visitor could mint a valid-looking one by guessing the format.
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_TOKEN_PREFIX = 'adm.';

function createAdminToken(username: string): string {
  const secret = db.getAuthSecret();
  if (!secret) return '';
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;
  const payload = `${username}.${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${ADMIN_TOKEN_PREFIX}${payload}.${sig}`;
}

function verifyAdminToken(token: string): boolean {
  const secret = db.getAuthSecret();
  if (!secret || !token.startsWith(ADMIN_TOKEN_PREFIX)) return false;

  const parts = token.slice(ADMIN_TOKEN_PREFIX.length).split('.');
  const [usernamePart, expPart, sig] = [parts[0], parts[1], parts.slice(2).join('.')];
  if (!usernamePart || !expPart || !sig) return false;

  const exp = Number(expPart);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const payload = `${usernamePart}.${expPart}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actual = Buffer.from(sig);
  const want = Buffer.from(expected);
  return actual.length === want.length && timingSafeEqual(actual, want);
}

function extractToken(req: Request): string {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return '';
}

// For routes that are public overall but contain an admin-only branch.
function isAdminAuthed(req: Request): boolean {
  return verifyAdminToken(extractToken(req));
}

// Interview messages carry a per-round AI "internal observation" that only the admin
// transcript viewer reads. Strip it for student-facing reads.
function redactInterview(interview: ReturnType<typeof db.getInterviewByCandidateId>) {
  if (!interview) return null;
  return {
    ...interview,
    messages: (interview.messages || []).map(({ analysis: _analysis, ...rest }) => rest),
  };
}

// Unauthenticated reads return the candidate's own record for self-lookup, but direct
// contact details are admin-only (IDOR: the id is guessable from other endpoints).
function redactCandidate(candidate: NonNullable<ReturnType<typeof db.getCandidateById>>) {
  return {
    ...candidate,
    profile: {
      ...candidate.profile,
      phone: candidate.profile.phone ? '已隐藏' : '',
      wechat: candidate.profile.wechat ? '已隐藏' : '',
    },
  };
}

// Routes reachable without an admin session. Fail-closed: anything not listed here
// requires a valid admin token, including routes added later. Student-side routes stay
// public because students carry no credential — they identify themselves by 学号 only.
const PUBLIC_ROUTES = new Set<string>([
  'GET /api/health',
  'POST /api/auth/login',
  'GET /api/logo-status',
  'POST /api/candidates',
  'GET /api/candidates/:id',
  'GET /api/candidates/by-student-id/:studentId',
  'POST /api/candidates/:id/join-confirm',
  'POST /api/interviews',
  'GET /api/interviews/:id',
  'POST /api/interviews/:id/answer',
  'POST /api/interviews/:id/complete',
  'GET /api/recruitment-batches',
  'GET /api/wechat-qr',
]);

// req.route is only populated after a route has matched, which is too late for this
// middleware — so match patterns segment-by-segment instead, where ":x" spans any segment.
const PUBLIC_ROUTE_PATTERNS = [...PUBLIC_ROUTES].map((entry) => {
  const [method, ...rest] = entry.split(' ');
  return { method, segments: rest.join('/').split('/').filter(Boolean) };
});

function isPublicRoute(method: string, urlPath: string): boolean {
  const segments = urlPath.split('/').filter(Boolean);
  return PUBLIC_ROUTE_PATTERNS.some(({ method: routeMethod, segments: routeSegments }) => {
    if (routeMethod !== method || routeSegments.length !== segments.length) return false;
    return routeSegments.every((seg, i) => seg.startsWith(':') || seg === segments[i]);
  });
}

app.use((req: Request, res: Response, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (isPublicRoute(req.method, req.path)) return next();
  if (verifyAdminToken(extractToken(req))) return next();

  return res.status(401).json({ error: '未授权：请登录后再访问后台管理接口' });
});

// --- API Routes ---

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth - Strict Independent Admin Authentication
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: '请输入账号与访问密码' });
  }

  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  if (db.verifyPassword(cleanUser, cleanPass)) {
    const user = db.findAdminUser(cleanUser);
    const token = createAdminToken(cleanUser);
    if (user && token) {
      return res.json({
        success: true,
        user,
        token,
        expiresInMs: ADMIN_TOKEN_TTL_MS,
      });
    }
  }

  return res.status(401).json({
    success: false,
    error: '身份校验失败：账号或管理密码错误，学生无权访问后台',
  });
});

app.post('/api/auth/change-password', (req: Request, res: Response) => {
  const { username, oldPassword, newPassword } = req.body;

  if (!username || !oldPassword || !newPassword) {
    return res.status(400).json({ success: false, error: '参数不完整：请提供旧密码与新密码' });
  }

  const cleanUser = String(username).trim();
  const cleanOld = String(oldPassword).trim();
  const cleanNew = String(newPassword).trim();

  if (cleanNew.length < 6) {
    return res.status(400).json({ success: false, error: '新管理密码长度不能少于 6 位' });
  }

  if (!db.verifyPassword(cleanUser, cleanOld)) {
    return res.status(401).json({ success: false, error: '原管理密码错误，无法完成修改' });
  }

  db.changePassword(cleanUser, cleanNew);
  return res.json({ success: true, message: '后台管理密码已成功修改' });
});

app.get('/api/auth/users', (req: Request, res: Response) => {
  res.json(db.getAdminUsers());
});

// Logo status and upload
app.get('/api/logo-status', (req: Request, res: Response) => {
  const publicLogoPath = path.join(process.cwd(), 'public', 'PGY_logo.png');
  const exists = fs.existsSync(publicLogoPath);
  res.json({ exists, url: exists ? '/PGY_logo.png' : null });
});

app.post('/api/upload-logo', (req: Request, res: Response) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: '请提供有效的图片数据' });
    }

    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: '图片格式不正确，需为 base64 数据' });
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const targetFile = path.join(publicDir, 'PGY_logo.png');
    fs.writeFileSync(targetFile, buffer);

    const distDir = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      fs.writeFileSync(path.join(distDir, 'PGY_logo.png'), buffer);
    }

    return res.json({ success: true, url: '/PGY_logo.png?v=' + Date.now() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || '上传 Logo 失败' });
  }
});

// Clear/Reset all candidate test data
app.post('/api/admin/clear-data', (req: Request, res: Response) => {
  try {
    db.clearCandidateData();
    res.json({ success: true, message: '测试数据已全部清空，您可以从新生端开始全新测试！' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '清空失败' });
  }
});

// Candidate Registration & Lookup
app.post('/api/candidates', (req: Request, res: Response) => {
  try {
    const { profile, batchId } = req.body;
    if (!profile || !profile.name || !profile.studentId || !profile.phone) {
      return res.status(400).json({ error: '请完整填写姓名、学号、手机号等必填字段' });
    }

    const { candidate, isNew } = RecruitmentService.registerCandidate(profile, batchId);
    // Public route, and dedupe echoes an existing record back to whoever submitted the
    // studentId — so contact details must never leave here unredacted.
    return res.json({ candidate: redactCandidate(candidate), isNew });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || '注册失败' });
  }
});

// Candidate List with search, sort, filters
app.get('/api/candidates', (req: Request, res: Response) => {
  const { batchId, search, status, grade, techDirection, sortField, sortOrder, minScore } = req.query;

  let candidates = db.getCandidates(batchId as string);

  // Search by name, studentId, major, class
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    candidates = candidates.filter(c =>
      c.profile.name.toLowerCase().includes(q) ||
      c.profile.studentId.toLowerCase().includes(q) ||
      c.profile.major.toLowerCase().includes(q) ||
      c.profile.className.toLowerCase().includes(q)
    );
  }

  // Filter by status
  if (status && typeof status === 'string' && status !== 'ALL') {
    candidates = candidates.filter(c => c.status === status);
  }

  // Filter by AI recommendation grade (S, A, B, C)
  if (grade && typeof grade === 'string' && grade !== 'ALL') {
    candidates = candidates.filter(c => c.aiRecommendation === grade);
  }

  // Filter by tech direction
  if (techDirection && typeof techDirection === 'string' && techDirection !== 'ALL') {
    candidates = candidates.filter(c => c.profile.techDirection === techDirection);
  }

  // Filter by minimum score
  if (minScore) {
    const num = Number(minScore);
    if (!isNaN(num)) {
      candidates = candidates.filter(c => (c.aiScore || 0) >= num);
    }
  }

  // Sorting
  if (sortField && typeof sortField === 'string') {
    const isAsc = sortOrder === 'asc';
    candidates.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'score') {
        valA = a.aiScore || 0;
        valB = b.aiScore || 0;
      } else if (sortField === 'registeredAt') {
        valA = new Date(a.registeredAt).getTime();
        valB = new Date(b.registeredAt).getTime();
      } else if (sortField === 'aiCompletedAt') {
        valA = a.aiCompletedAt ? new Date(a.aiCompletedAt).getTime() : 0;
        valB = b.aiCompletedAt ? new Date(b.aiCompletedAt).getTime() : 0;
      }

      return isAsc ? valA - valB : valB - valA;
    });
  }

  res.json(candidates);
});

// Single candidate detail. Public so students can read their own record after an
// interview (App.tsx refreshCandidateSession), but students must not receive admin
// internals — notes, manualReview.internalComments and the status ledger are returned
// only to authenticated admins.
app.get('/api/candidates/:id', (req: Request, res: Response) => {
  const candidate = db.getCandidateById(req.params.id);
  if (!candidate) {
    return res.status(404).json({ error: '候选人不存在' });
  }

  const interview = db.getInterviewByCandidateId(candidate.id);

  if (!isAdminAuthed(req)) {
    return res.json({ candidate: redactCandidate(candidate), interview: redactInterview(interview) });
  }

  const evaluation = db.getEvaluationByCandidateId(candidate.id);
  const manualReview = db.getManualReviewByCandidateId(candidate.id);
  const statusHistory = db.getStatusHistory(candidate.id);
  const notes = db.getNotesByCandidateId(candidate.id);

  res.json({
    candidate,
    evaluation,
    manualReview,
    statusHistory,
    notes,
    interview,
  });
});

// Lookup by Student ID (For student re-login / session recovery)
app.get('/api/candidates/by-student-id/:studentId', (req: Request, res: Response) => {
  const { batchId } = req.query;
  const sId = (req.params.studentId || '').trim();
  const candidate = (batchId ? db.findCandidateByStudentId(sId, batchId as string) : null) ||
    db.getCandidates().find(c => c.profile.studentId === sId);

  if (!candidate) {
    return res.status(404).json({ error: '未找到该学号的报名记录' });
  }

  const interview = db.getInterviewByCandidateId(candidate.id);
  // Always student-facing: strip AI observations and direct contact details.
  res.json({ candidate: redactCandidate(candidate), interview: redactInterview(interview) });
});

// Candidate status update (Admin/Reviewer)
app.patch('/api/candidates/:id/status', (req: Request, res: Response) => {
  const { status, operator, reason } = req.body;
  if (!status) return res.status(400).json({ error: '缺少目标状态' });

  const updated = db.updateCandidateStatus(req.params.id, status as CandidateStatus, operator || 'admin', reason);
  if (!updated) return res.status(404).json({ error: '候选人不存在' });

  res.json(updated);
});

// Direct Admit candidate (Tech Dept Admin)
app.post('/api/candidates/:id/admit', (req: Request, res: Response) => {
  try {
    const { operator, comment } = req.body;
    const result = RecruitmentService.admitCandidate(req.params.id, operator || 'admin', comment);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Direct Reject candidate (Tech Dept Admin)
app.post('/api/candidates/:id/reject', (req: Request, res: Response) => {
  try {
    const { operator, reason } = req.body;
    const result = RecruitmentService.rejectCandidate(req.params.id, operator || 'admin', reason);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Legacy manual-review route (alias to admit / reject for compatibility)
app.post('/api/candidates/:id/manual-review', (req: Request, res: Response) => {
  try {
    const { result, reviewerName, reviewerId, overallEvaluation } = req.body;
    if (result === 'PASSED') {
      const cand = RecruitmentService.admitCandidate(req.params.id, reviewerName || 'admin', overallEvaluation);
      return res.json({ candidate: cand });
    } else {
      const cand = RecruitmentService.rejectCandidate(req.params.id, reviewerName || 'admin', overallEvaluation);
      return res.json({ candidate: cand });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Delete candidate record
app.delete('/api/candidates/:id', (req: Request, res: Response) => {
  const success = db.deleteCandidate(req.params.id);
  if (!success) {
    return res.status(404).json({ error: '候选人记录未找到或已被删除' });
  }
  res.json({ success: true, message: '候选人及关联档案数据已彻底删除' });
});

// Add internal note
app.post('/api/candidates/:id/notes', (req: Request, res: Response) => {
  const { authorId, authorName, content } = req.body;
  if (!content) return res.status(400).json({ error: '备注内容不能为空' });

  const note = db.addCandidateNote({
    id: `note-${Date.now()}`,
    candidateId: req.params.id,
    authorId: authorId || 'admin',
    authorName: authorName || '技术部考官',
    content: content.trim(),
    createdAt: new Date().toISOString(),
  });

  res.json(note);
});

// Student confirms group join
app.post('/api/candidates/:id/join-confirm', (req: Request, res: Response) => {
  try {
    const candidate = RecruitmentService.confirmGroupJoin(req.params.id);
    res.json({ success: true, candidate: redactCandidate(candidate) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// AI Interview Sessions
app.post('/api/interviews', async (req: Request, res: Response) => {
  try {
    const { candidateId } = req.body;
    if (!candidateId) return res.status(400).json({ error: '缺少 candidateId' });

    const result = await RecruitmentService.startOrResumeInterview(candidateId);
    res.json({ ...result, interview: redactInterview(result.interview) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/interviews/:id', (req: Request, res: Response) => {
  const interview = db.getInterviewByCandidateId(req.params.id);
  if (!interview) return res.status(404).json({ error: '面试记录未找到' });
  // Public: students never read the per-round AI observations.
  res.json(redactInterview(interview));
});

app.post('/api/interviews/:id/answer', async (req: Request, res: Response) => {
  try {
    const { answer } = req.body;
    if (!answer || !answer.trim()) return res.status(400).json({ error: '回答内容不能为空' });

    const result = await RecruitmentService.submitAnswer(req.params.id, answer);
    res.json({ ...result, interview: redactInterview(result.interview) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/interviews/:id/complete', async (req: Request, res: Response) => {
  try {
    const result = await RecruitmentService.completeInterview(req.params.id);
    res.json({ ...result, interview: redactInterview(result.interview) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Evaluation
app.get('/api/evaluations/:candidateId', (req: Request, res: Response) => {
  const evalData = db.getEvaluationByCandidateId(req.params.candidateId);
  if (!evalData) return res.status(404).json({ error: 'AI 评估报告不存在' });
  res.json(evalData);
});

// Dashboard Stats
app.get('/api/dashboard/stats', (req: Request, res: Response) => {
  const { batchId } = req.query;
  const stats = RecruitmentService.getDashboardStats(batchId as string);
  res.json(stats);
});

// Batches
app.get('/api/recruitment-batches', (req: Request, res: Response) => {
  res.json(db.getBatches());
});

app.post('/api/recruitment-batches', (req: Request, res: Response) => {
  const { name, year, description } = req.body;
  if (!name || !year) return res.status(400).json({ error: '批次名称和年份不能为空' });

  const newBatch = db.createBatch({
    id: `batch-${year}-${Date.now().toString(36).substring(4)}`,
    name,
    year: Number(year),
    isActive: false,
    startDate: new Date().toISOString(),
    description: description || '',
  });

  res.json(newBatch);
});

app.patch('/api/recruitment-batches/:id/active', (req: Request, res: Response) => {
  db.setActiveBatch(req.params.id);
  res.json({ success: true, activeBatchId: req.params.id });
});

// WeChat Group QR
// If requested with candidateId, enforces the critical security rule:
// "人工复试通过才可以显示微信群二维码"
app.get('/api/wechat-qr', (req: Request, res: Response) => {
  const { candidateId, batchId, adminMode } = req.query;

  // Admin query — returns every batch's QRs, so it needs auth even though this
  // route is public for the student flows below. Frontend never calls it.
  if (adminMode === 'true') {
    if (!isAdminAuthed(req)) {
      return res.status(401).json({ error: '未授权：请登录后再访问后台管理接口' });
    }
    return res.json(db.getAllWeChatQRs());
  }

  // Student query
  if (candidateId && typeof candidateId === 'string') {
    const result = RecruitmentService.getWeChatQRForStudent(candidateId);
    return res.json(result);
  }

  // Bare batch query returns the QR with NO admission check, so it must be admin-only:
  // otherwise anyone with the batch id bypasses the "admitted to see the QR" gate.
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: '未授权：请登录后再访问后台管理接口' });
  }
  const targetBatch = batchId ? String(batchId) : (db.getActiveBatch()?.id || 'batch-2026');
  const qr = db.getWeChatQR(targetBatch);
  res.json(qr || null);
});

app.post('/api/wechat-qr', (req: Request, res: Response) => {
  const { batchId, imageUrl, title, expiresAt, id } = req.body;
  if (!imageUrl) return res.status(400).json({ error: '二维码图片不可为空' });
  const targetBatch = batchId ? String(batchId) : (db.getActiveBatch()?.id || 'batch-2026');

  const qr = db.saveWeChatQR({
    id: id || `qr-${targetBatch}`,
    batchId: targetBatch,
    imageUrl,
    title: title || '技术部招新官方微信群',
    status: 'ACTIVE',
    expiresAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  res.json(qr);
});

app.delete('/api/wechat-qr/:id', (req: Request, res: Response) => {
  const targetBatch = req.query.batchId ? String(req.query.batchId) : undefined;
  const success = db.deleteWeChatQR(req.params.id, targetBatch);
  res.json({ success });
});

// AI Prompts
app.get('/api/prompts', (req: Request, res: Response) => {
  res.json(db.getPrompts());
});

app.patch('/api/prompts/:id', (req: Request, res: Response) => {
  const { prompt, updatedBy } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt 内容不能为空' });

  const updated = db.updatePrompt(req.params.id, prompt, updatedBy || 'admin');
  if (!updated) return res.status(404).json({ error: 'Prompt 未找到' });
  res.json(updated);
});

// AI Settings (provider config: key, baseUrl, model for primary + fallback)
// GET returns masked keys (never echo full API keys to client)
function maskApiKey(key: string): string {
  if (!key) return '';
  // Support multi-key (comma/newline/semicolon separated): mask each key individually
  const keys = key.split(/[,\n;]/).map(k => k.trim()).filter(k => k.length > 0);
  if (keys.length === 0) return '';
  if (keys.length === 1) {
    const k = keys[0];
    if (k.length <= 8) return '••••••••';
    return k.slice(0, 4) + '••••••' + k.slice(-4);
  }
  // Multi-key: show count + first key mask
  const first = keys[0];
  const firstMasked = first.length <= 8
    ? '••••••••'
    : first.slice(0, 4) + '••••••' + first.slice(-4);
  return `${firstMasked} (+${keys.length - 1} 个轮询 key)`;
}

app.get('/api/ai-settings', (req: Request, res: Response) => {
  const s = db.getAISettings();
  res.json({
    id: s.id,
    primary: {
      baseUrl: s.primary.baseUrl,
      model: s.primary.model,
      hasKey: !!s.primary.apiKey,
      apiKeyMasked: maskApiKey(s.primary.apiKey),
    },
    fallback: {
      baseUrl: s.fallback.baseUrl,
      model: s.fallback.model,
      hasKey: !!s.fallback.apiKey,
      apiKeyMasked: maskApiKey(s.fallback.apiKey),
    },
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
  });
});

app.patch('/api/ai-settings', (req: Request, res: Response) => {
  const { primary, fallback, updatedBy } = req.body;

  const updates: {
    primary?: Partial<{ apiKey: string; baseUrl: string; model: string }>;
    fallback?: Partial<{ apiKey: string; baseUrl: string; model: string }>;
  } = {};

  if (primary && typeof primary === 'object') {
    const p: typeof updates.primary = {};
    if ('baseUrl' in primary && primary.baseUrl !== undefined) p.baseUrl = String(primary.baseUrl);
    if ('model' in primary && primary.model !== undefined) p.model = String(primary.model);
    if ('apiKey' in primary && primary.apiKey !== undefined) p.apiKey = String(primary.apiKey);
    if (Object.keys(p).length > 0) updates.primary = p;
  }

  if (fallback && typeof fallback === 'object') {
    const f: typeof updates.fallback = {};
    if ('baseUrl' in fallback && fallback.baseUrl !== undefined) f.baseUrl = String(fallback.baseUrl);
    if ('model' in fallback && fallback.model !== undefined) f.model = String(fallback.model);
    if ('apiKey' in fallback && fallback.apiKey !== undefined) f.apiKey = String(fallback.apiKey);
    if (Object.keys(f).length > 0) updates.fallback = f;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: '没有提供任何可更新的字段' });
  }

  const updated = db.updateAISettings(updates, updatedBy || 'admin');

  res.json({
    id: updated.id,
    primary: {
      baseUrl: updated.primary.baseUrl,
      model: updated.primary.model,
      hasKey: !!updated.primary.apiKey,
      apiKeyMasked: maskApiKey(updated.primary.apiKey),
    },
    fallback: {
      baseUrl: updated.fallback.baseUrl,
      model: updated.fallback.model,
      hasKey: !!updated.fallback.apiKey,
      apiKeyMasked: maskApiKey(updated.fallback.apiKey),
    },
    updatedAt: updated.updatedAt,
    updatedBy: updated.updatedBy,
  });
});

// CSV Export
app.get('/api/export/candidates.csv', (req: Request, res: Response) => {
  const { batchId } = req.query;
  const candidates = db.getCandidates(batchId as string);

  const headers = [
    '姓名',
    '学号',
    '专业',
    '班级',
    '手机号',
    '微信',
    '技术基础',
    '期望方向',
    'AI总分',
    'AI推荐等级',
    '候选人类型',
    '当前状态',
    '录取结果',
    '报名时间',
  ];

  const rows = candidates.map(c => {
    const isAdmitted = ['ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED'].includes(c.status);
    const admissionLabel = isAdmitted ? '已录取' : c.status === 'MANUAL_REJECTED' ? '未录用' : '待定/面试中';
    return [
      `"${c.profile.name}"`,
      `"${c.profile.studentId}"`,
      `"${c.profile.major}"`,
      `"${c.profile.className}"`,
      `"${c.profile.phone}"`,
      `"${c.profile.wechat}"`,
      `"${c.profile.technicalFoundation}"`,
      `"${c.profile.techDirection}"`,
      c.aiScore ?? '',
      `"${c.aiRecommendation || ''}"`,
      `"${c.candidateType || ''}"`,
      `"${c.status}"`,
      `"${admissionLabel}"`,
      `"${c.registeredAt}"`,
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="candidates-recruitment.csv"');
  res.send(csvContent);
});

// --- Vite Middleware Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Tech Department Recruitment System listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
