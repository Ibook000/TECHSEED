import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { db } from './server/db/index.js';
import { RecruitmentService } from './server/services/recruitment.js';
import { isManualReviewResult } from './server/services/manualReview.js';
import { normalizeRouteParam } from './server/services/routeParams.js';
import { HttpError } from './server/errors.js';
import { CandidateProfile, CandidateStatus, CANDIDATE_STATUSES, REGISTRATION_CONSENT_VERSION } from './src/types.js';
import { getAdminPasswordPolicyError } from './src/lib/passwordPolicy.js';

const app = express();
app.disable('x-powered-by');

function readIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

const PORT = readIntegerEnv('PORT', 3000, 1, 65535);
const HOST = process.env.HOST?.trim() || '127.0.0.1';
const trustedProxyHops = readIntegerEnv('TRUST_PROXY_HOPS', 0, 0, 10);
if (trustedProxyHops > 0) {
  app.set('trust proxy', trustedProxyHops);
}

function respondWithRouteError(res: Response, error: unknown, context: string, fallbackMessage: string): Response {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error(`[HTTP] ${context} failed:`, error);
  return res.status(500).json({ error: fallbackMessage });
}

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' https: data: blob:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
      ].join('; ')
    );
  }

  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb', parameterLimit: 100 }));
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

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
  const sessionVersion = db.getAdminSessionVersion(username);
  const payload = `${username}.${exp}.${sessionVersion}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${ADMIN_TOKEN_PREFIX}${payload}.${sig}`;
}

function verifyAdminToken(token: string): boolean {
  const secret = db.getAuthSecret();
  if (!secret || !token.startsWith(ADMIN_TOKEN_PREFIX)) return false;

  const parts = token.slice(ADMIN_TOKEN_PREFIX.length).split('.');
  if (parts.length !== 3 && parts.length !== 4) return false;
  const [usernamePart, expPart] = parts;
  const hasSessionVersion = parts.length === 4;
  const tokenSessionVersion = hasSessionVersion ? parts[2] : '0';
  const sig = hasSessionVersion ? parts[3] : parts[2];
  if (!usernamePart || !expPart || !sig) return false;
  if (tokenSessionVersion !== db.getAdminSessionVersion(usernamePart)) return false;

  const exp = Number(expPart);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  // Three-part tokens were issued before session versions existed. Keep them valid
  // while the version remains at 0; a password change moves it and revokes them.
  const payload = hasSessionVersion
    ? `${usernamePart}.${expPart}.${tokenSessionVersion}`
    : `${usernamePart}.${expPart}`;
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

function extractStudentToken(req: Request): string {
  return typeof req.headers['x-student-token'] === 'string' ? req.headers['x-student-token'].trim() : '';
}

function hasStudentAccess(req: Request, candidateId: string): boolean {
  if (isAdminAuthed(req)) return true;
  const token = extractStudentToken(req);
  const savedHash = db.getStudentAccessTokenHash(candidateId);
  if (!token || !savedHash) return false;
  const actual = Buffer.from(createHash('sha256').update(token).digest('hex'));
  const expected = Buffer.from(savedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requireStudentOrAdmin(req: Request, res: Response, candidateId: string): boolean {
  if (hasStudentAccess(req, candidateId)) return true;
  res.status(401).json({ error: '身份凭据无效，请重新验证本人信息' });
  return false;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
let rateLimitCalls = 0;

function rateLimit(name: string, maxRequests: number, windowMs: number, keySuffix?: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (++rateLimitCalls % 256 === 0 || rateLimitBuckets.size > 10000) {
      for (const [key, bucket] of rateLimitBuckets) {
        if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
      }
      while (rateLimitBuckets.size > 10000) {
        const oldestKey = rateLimitBuckets.keys().next().value;
        if (oldestKey === undefined) break;
        rateLimitBuckets.delete(oldestKey);
      }
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${name}:${ip}:${keySuffix ? keySuffix(req) : ''}`;
    let bucket = rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    next();
  };
}

const loginRateLimit = rateLimit('admin-login', 10, 15 * 60 * 1000);
const registrationRateLimit = rateLimit('candidate-registration', 60, 60 * 60 * 1000);
const recoveryRateLimit = rateLimit('student-recovery-ip', 30, 15 * 60 * 1000);
const recoveryCandidateRateLimit = rateLimit('student-recovery-id', 5, 15 * 60 * 1000, req => String(req.body?.studentId || '').trim().slice(0, 100));
const interviewStartRateLimit = rateLimit('interview-start-ip', 120, 60 * 60 * 1000);
const interviewStartCandidateRateLimit = rateLimit('interview-start-candidate', 3, 15 * 60 * 1000, req => String(req.body?.candidateId || '').slice(0, 120));
const interviewAnswerRateLimit = rateLimit('interview-answer', 10, 60 * 1000, req => (normalizeRouteParam(req.params.id) || 'unknown').slice(0, 120));
const interviewCompleteRateLimit = rateLimit('interview-complete', 4, 15 * 60 * 1000, req => (normalizeRouteParam(req.params.id) || 'unknown').slice(0, 120));

// Interview messages carry a per-round AI "internal observation" that only the admin
// transcript viewer reads. Strip it for student-facing reads.
function redactInterview(interview: ReturnType<typeof db.getInterviewByCandidateId>) {
  if (!interview) return null;
  return {
    ...interview,
    messages: (interview.messages || []).map(({ analysis: _analysis, ...rest }) => rest),
  };
}

// Student-facing candidate responses omit direct contact details and internal AI
// assessment metadata. Administrators can access the complete record after login.
function redactCandidate(candidate: NonNullable<ReturnType<typeof db.getCandidateById>>) {
  const studentCandidate = { ...candidate };
  delete studentCandidate.aiScore;
  delete studentCandidate.aiRecommendation;
  delete studentCandidate.candidateType;
  delete studentCandidate.aiCompletedAt;

  return {
    ...studentCandidate,
    profile: {
      ...candidate.profile,
      phone: candidate.profile.phone ? '已隐藏' : '',
      wechat: candidate.profile.wechat ? '已隐藏' : '',
    },
  };
}

function redactEvaluationForStudent<T extends { evaluation?: unknown }>(result: T): Omit<T, 'evaluation'> {
  const studentResult = { ...result };
  delete studentResult.evaluation;
  return studentResult as Omit<T, 'evaluation'>;
}

// Routes that students can reach without an admin session. Candidate-specific handlers
// still validate a per-student token before returning or changing any private data.
const PUBLIC_ROUTES = new Set<string>([
  'GET /api/health',
  'POST /api/auth/login',
  'GET /api/logo-status',
  'POST /api/candidates',
  'POST /api/student/recover',
  'GET /api/candidates/:id',
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

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api/')) return next();
  if (isPublicRoute(req.method, req.path)) return next();
  if (verifyAdminToken(extractToken(req))) return next();

  return res.status(401).json({ error: '未授权：请登录后再访问后台管理接口' });
});

// --- API Routes ---

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth - Strict Independent Admin Authentication
app.post('/api/auth/login', loginRateLimit, (req: Request, res: Response) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || password.length === 0) {
    return res.status(400).json({ success: false, error: '请输入账号与访问密码' });
  }

  const cleanUser = username.trim();

  if (db.verifyPassword(cleanUser, password)) {
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
  const { username, oldPassword, newPassword } = req.body || {};

  if (typeof username !== 'string' || typeof oldPassword !== 'string' || typeof newPassword !== 'string' ||
      !username.trim() || oldPassword.length === 0 || newPassword.length === 0) {
    return res.status(400).json({ success: false, error: '参数不完整：请提供旧密码与新密码' });
  }

  const cleanUser = username.trim();
  const cleanOld = oldPassword;
  const cleanNew = newPassword;

  const passwordPolicyError = getAdminPasswordPolicyError(cleanNew);
  if (passwordPolicyError) {
    return res.status(400).json({ success: false, error: passwordPolicyError });
  }

  if (!db.verifyPassword(cleanUser, cleanOld)) {
    return res.status(401).json({ success: false, error: '原管理密码错误，无法完成修改' });
  }

  if (!db.changePassword(cleanUser, cleanNew)) {
    return res.status(400).json({ success: false, error: '管理员密码未符合安全要求，修改失败' });
  }
  return res.json({
    success: true,
    message: '后台管理密码已成功修改，其他登录会话已失效',
    token: createAdminToken(cleanUser),
    expiresInMs: ADMIN_TOKEN_TTL_MS,
  });
});

app.get('/api/auth/users', (_req: Request, res: Response) => {
  res.json(db.getAdminUsers());
});

// Logo status and upload
app.get('/api/logo-status', (_req: Request, res: Response) => {
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
    return respondWithRouteError(res, err, 'Logo upload', '上传 Logo 失败，请稍后重试');
  }
});

// Reset candidate data for one validated batch only.
app.post('/api/admin/clear-data', (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { batchId } = body;
    if (typeof batchId !== 'string' || !db.getBatches().some(batch => batch.id === batchId)) {
      return res.status(400).json({ error: '必须指定一个有效招新批次才能重置数据' });
    }
    const deletedCount = db.clearCandidateDataForBatch(batchId);
    res.json({ success: true, deletedCount, message: `已清空当前批次的 ${deletedCount} 份候选人档案及关联记录` });
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Candidate data reset', '清空失败，请稍后重试');
  }
});

// Candidate Registration & Lookup
app.post('/api/candidates', registrationRateLimit, (req: Request, res: Response) => {
  try {
    const { profile: rawProfile, batchId, privacyConsentVersion } = req.body || {};
    if (privacyConsentVersion !== REGISTRATION_CONSENT_VERSION) {
      return res.status(400).json({ error: '请阅读并确认报名信息使用说明后再提交' });
    }
    if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
      return res.status(400).json({ error: '请完整填写姓名、学号、手机号等必填字段' });
    }

    const limits: Record<string, number> = {
      name: 80,
      studentId: 64,
      major: 120,
      className: 80,
      phone: 40,
      wechat: 80,
      technicalFoundation: 80,
      techDirection: 80,
      selfIntro: 4000,
    };
    const profile: Record<string, string> = {};
    for (const [field, maxLength] of Object.entries(limits)) {
      const value = rawProfile[field] ?? '';
      if (typeof value !== 'string' || value.length > maxLength) {
        return res.status(400).json({ error: '报名信息格式不正确或内容过长' });
      }
      profile[field] = value.trim();
    }
    if (!profile.name || !profile.studentId || !profile.phone) {
      return res.status(400).json({ error: '请完整填写姓名、学号、手机号等必填字段' });
    }
    if (batchId !== undefined && (typeof batchId !== 'string' || batchId.length > 100)) {
      return res.status(400).json({ error: '招新批次无效' });
    }
    const targetBatchId = batchId || db.getActiveBatch()?.id;
    const targetBatch = db.getBatches().find(batch => batch.id === targetBatchId);
    if (!targetBatch || (!targetBatch.isActive && !isAdminAuthed(req))) {
      return res.status(400).json({ error: '当前招新批次不可报名' });
    }

    const { candidate, isNew } = RecruitmentService.registerCandidate(
      profile as unknown as CandidateProfile,
      targetBatchId,
      { version: REGISTRATION_CONSENT_VERSION, acceptedAt: new Date().toISOString() },
    );
    if (!isNew) {
      return res.status(409).json({ error: '该学号已有报名档案，请通过“进度找回”验证身份' });
    }

    const studentToken = randomBytes(32).toString('base64url');
    db.setStudentAccessTokenHash(candidate.id, createHash('sha256').update(studentToken).digest('hex'));
    return res.status(201).json({ candidate: redactCandidate(candidate), studentToken, isNew: true });
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Candidate registration', '报名失败，请稍后重试');
  }
});

// Recover a lost student session using registration details, then rotate its token.
// The response is deliberately identical for a missing candidate and mismatched details.
app.post('/api/student/recover', recoveryRateLimit, recoveryCandidateRateLimit, (req: Request, res: Response) => {
  const { studentId, name, phone } = req.body || {};
  if ([studentId, name, phone].some(value => typeof value !== 'string' || value.length > 100)) {
    return res.status(400).json({ error: '请填写报名时的学号、姓名和手机号' });
  }

  const candidate = db.findCandidateByStudentId(String(studentId).trim());
  const normalizeName = (value: string) => value.trim().normalize('NFKC').toLowerCase();
  const normalizePhone = (value: string) => value.trim().replace(/[\s()\-]/g, '');
  if (!candidate ||
      normalizeName(candidate.profile.name) !== normalizeName(name) ||
      normalizePhone(candidate.profile.phone) !== normalizePhone(phone)) {
    return res.status(401).json({ error: '信息不匹配，请检查报名时填写的内容' });
  }

  const studentToken = randomBytes(32).toString('base64url');
  db.setStudentAccessTokenHash(candidate.id, createHash('sha256').update(studentToken).digest('hex'));
  const interview = db.getInterviewByCandidateId(candidate.id);
  return res.json({ candidate: redactCandidate(candidate), interview: redactInterview(interview), studentToken });
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

// Candidate detail is available to an authenticated student for their own record or
// to an administrator for review. Only administrators receive internal review data.
app.get('/api/candidates/:id', (req: Request, res: Response) => {
  if (!requireStudentOrAdmin(req, res, normalizeRouteParam(req.params.id))) return;
  const candidate = db.getCandidateById(normalizeRouteParam(req.params.id));
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

// Candidate status update (Admin/Reviewer)
app.patch('/api/candidates/:id/status', (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { status, operator, reason } = body;
  if (typeof status !== 'string' || !CANDIDATE_STATUSES.includes(status as CandidateStatus)) {
    return res.status(400).json({ error: '目标状态无效' });
  }
  if (operator !== undefined && (typeof operator !== 'string' || operator.length > 100)) {
    return res.status(400).json({ error: '操作人格式无效' });
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 2000)) {
    return res.status(400).json({ error: '状态变更说明过长或格式无效' });
  }

  const updated = db.updateCandidateStatus(normalizeRouteParam(req.params.id), status as CandidateStatus, operator || 'admin', reason);
  if (!updated) return res.status(404).json({ error: '候选人不存在' });

  res.json(updated);
});

// Direct Admit candidate (Tech Dept Admin)
app.post('/api/candidates/:id/admit', (req: Request, res: Response) => {
  try {
    const { operator, comment } = req.body;
    const result = RecruitmentService.admitCandidate(normalizeRouteParam(req.params.id), operator || 'admin', comment);
    res.json(result);
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Candidate admission', '审核操作失败，请稍后重试');
  }
});

// Direct Reject candidate (Tech Dept Admin)
app.post('/api/candidates/:id/reject', (req: Request, res: Response) => {
  try {
    const { operator, reason } = req.body;
    const result = RecruitmentService.rejectCandidate(normalizeRouteParam(req.params.id), operator || 'admin', reason);
    res.json(result);
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Candidate rejection', '审核操作失败，请稍后重试');
  }
});

// Legacy manual-review route (alias to admit / reject for compatibility)
app.post('/api/candidates/:id/manual-review', (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { result, reviewerName, overallEvaluation } = body;
    if (!isManualReviewResult(result)) {
      return res.status(400).json({ error: '审核结果无效，仅支持 PASSED 或 REJECTED' });
    }
    if (result === 'PASSED') {
      const cand = RecruitmentService.admitCandidate(normalizeRouteParam(req.params.id), reviewerName || 'admin', overallEvaluation);
      return res.json({ candidate: cand });
    } else {
      const cand = RecruitmentService.rejectCandidate(normalizeRouteParam(req.params.id), reviewerName || 'admin', overallEvaluation);
      return res.json({ candidate: cand });
    }
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Legacy manual review', '审核操作失败，请稍后重试');
  }
});

// Delete candidate record
app.delete('/api/candidates/:id', (req: Request, res: Response) => {
  const success = db.deleteCandidate(normalizeRouteParam(req.params.id));
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
    candidateId: normalizeRouteParam(req.params.id),
    authorId: authorId || 'admin',
    authorName: authorName || '技术部考官',
    content: content.trim(),
    createdAt: new Date().toISOString(),
  });

  res.json(note);
});

// Student confirms group join
app.post('/api/candidates/:id/join-confirm', (req: Request, res: Response) => {
  if (!requireStudentOrAdmin(req, res, normalizeRouteParam(req.params.id))) return;
  try {
    const candidate = RecruitmentService.confirmGroupJoin(normalizeRouteParam(req.params.id));
    if (!candidate) return res.status(404).json({ error: '候选人不存在' });
    res.json({ success: true, candidate: redactCandidate(candidate) });
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Group join confirmation', '入群确认失败，请稍后重试');
  }
});

// AI Interview Sessions
app.post('/api/interviews', interviewStartRateLimit, interviewStartCandidateRateLimit, async (req: Request, res: Response) => {
  try {
    const { candidateId } = req.body;
    if (typeof candidateId !== 'string' || !candidateId || candidateId.length > 120) {
      return res.status(400).json({ error: '缺少有效的候选人编号' });
    }
    if (!requireStudentOrAdmin(req, res, candidateId)) return;

    const result = await RecruitmentService.startOrResumeInterview(candidateId);
    res.json({
      ...result,
      candidate: isAdminAuthed(req) ? result.candidate : redactCandidate(result.candidate),
      interview: redactInterview(result.interview),
    });
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Interview start', '面试暂时无法开始，请稍后重试');
  }
});

app.get('/api/interviews/:id', (req: Request, res: Response) => {
  if (!requireStudentOrAdmin(req, res, normalizeRouteParam(req.params.id))) return;
  const interview = db.getInterviewByCandidateId(normalizeRouteParam(req.params.id));
  if (!interview) return res.status(404).json({ error: '面试记录未找到' });
  // Student responses never include per-round AI observations.
  res.json(redactInterview(interview));
});

app.post('/api/interviews/:id/answer', interviewAnswerRateLimit, async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { answer, submissionId } = body;
    if (!requireStudentOrAdmin(req, res, normalizeRouteParam(req.params.id))) return;
    if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: '回答内容不能为空' });
    if (answer.length > 4000) return res.status(413).json({ error: '单次回答不能超过 4000 字' });
    if (submissionId !== undefined && (typeof submissionId !== 'string' || submissionId.length < 8 || submissionId.length > 100)) {
      return res.status(400).json({ error: '回答提交编号无效' });
    }

    const result = await RecruitmentService.submitAnswer(normalizeRouteParam(req.params.id), answer, submissionId);
    const visibleResult = isAdminAuthed(req) ? result : redactEvaluationForStudent(result);
    res.json({ ...visibleResult, interview: redactInterview(result.interview) });
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Interview answer submission', '回答暂时无法提交，请稍后重试');
  }
});

app.post('/api/interviews/:id/complete', interviewCompleteRateLimit, async (req: Request, res: Response) => {
  try {
    if (!requireStudentOrAdmin(req, res, normalizeRouteParam(req.params.id))) return;
    const result = await RecruitmentService.completeInterview(normalizeRouteParam(req.params.id));
    const visibleResult = isAdminAuthed(req) ? result : redactEvaluationForStudent(result);
    res.json({ ...visibleResult, interview: redactInterview(result.interview) });
  } catch (err: any) {
    return respondWithRouteError(res, err, 'Interview completion', '面试暂时无法完成，请稍后重试');
  }
});

// Evaluation
app.get('/api/evaluations/:candidateId', (req: Request, res: Response) => {
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: '未授权：请登录后再访问后台管理接口' });
  }
  const evalData = db.getEvaluationByCandidateId(normalizeRouteParam(req.params.candidateId));
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
app.get('/api/recruitment-batches', (_req: Request, res: Response) => {
  res.json(db.getBatches());
});

app.post('/api/recruitment-batches', (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { name, year, description } = body;
  const numericYear = typeof year === 'number' || typeof year === 'string' ? Number(year) : NaN;
  if (typeof name !== 'string' || !name.trim() || name.length > 120) {
    return res.status(400).json({ error: '批次名称不能为空，且不能超过 120 个字符' });
  }
  if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2200) {
    return res.status(400).json({ error: '年份必须是 2000–2200 之间的整数' });
  }
  if (description !== undefined && (typeof description !== 'string' || description.length > 1000)) {
    return res.status(400).json({ error: '批次说明不能超过 1000 个字符' });
  }

  const newBatch = db.createBatch({
    id: `batch-${numericYear}-${Date.now().toString(36).substring(4)}`,
    name: name.trim(),
    year: numericYear,
    isActive: false,
    startDate: new Date().toISOString(),
    description: description?.trim() || '',
  });

  res.json(newBatch);
});

app.patch('/api/recruitment-batches/:id/active', (req: Request, res: Response) => {
  if (!db.setActiveBatch(normalizeRouteParam(req.params.id))) return res.status(404).json({ error: '招新批次不存在' });
  res.json({ success: true, activeBatchId: normalizeRouteParam(req.params.id) });
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
    if (!requireStudentOrAdmin(req, res, candidateId)) return;
    const result = RecruitmentService.getWeChatQRForStudent(candidateId);
    return res.json(result);
  }

  // Bare batch query returns the QR with NO admission check, so it must be admin-only:
  // otherwise anyone with the batch id bypasses the "admitted to see the QR" gate.
  if (!isAdminAuthed(req)) {
    return res.status(401).json({ error: '未授权：请登录后再访问后台管理接口' });
  }
  const targetBatch = batchId ? String(batchId) : (db.getActiveBatch()?.id || `batch-${new Date().getFullYear()}`);
  const qr = db.getWeChatQR(targetBatch);
  res.json(qr || null);
});

app.post('/api/wechat-qr', (req: Request, res: Response) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { batchId, imageUrl, title, expiresAt, id } = body;
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return res.status(400).json({ error: '二维码图片不可为空' });
  }
  const normalizedImageUrl = imageUrl.trim();
  if (normalizedImageUrl.length > 1_900_000) {
    return res.status(413).json({ error: '二维码图片过大，请压缩至 1.4 MB 以内' });
  }
  const isSupportedImageDataUrl = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(normalizedImageUrl);
  if (!isSupportedImageDataUrl) {
    if (normalizedImageUrl.length > 2048) {
      return res.status(413).json({ error: '二维码图片链接不能超过 2048 个字符' });
    }
    try {
      const url = new URL(normalizedImageUrl);
      if (url.protocol !== 'https:' || !url.hostname) throw new Error('Unsupported QR image URL');
    } catch {
      return res.status(400).json({ error: '二维码需为 HTTPS 图片链接，或 PNG、JPG、WebP 图片数据' });
    }
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim().length > 120)) {
    return res.status(400).json({ error: '二维码标题不能超过 120 个字符' });
  }
  if (batchId !== undefined && typeof batchId !== 'string') {
    return res.status(400).json({ error: '招新批次无效' });
  }
  let normalizedExpiresAt: string | undefined;
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    if (typeof expiresAt !== 'string') return res.status(400).json({ error: '二维码有效期格式无效' });
    const expiryTimestamp = Date.parse(expiresAt);
    if (!Number.isFinite(expiryTimestamp) || expiryTimestamp <= Date.now()) {
      return res.status(400).json({ error: '二维码有效期必须是未来时间' });
    }
    normalizedExpiresAt = new Date(expiryTimestamp).toISOString();
  }
  const targetBatch = batchId || db.getActiveBatch()?.id;
  if (!targetBatch || !db.getBatches().some(batch => batch.id === targetBatch)) {
    return res.status(400).json({ error: '请选择一个有效招新批次' });
  }

  const qr = db.saveWeChatQR({
    id: typeof id === 'string' && id.length <= 120 ? id : `qr-${targetBatch}`,
    batchId: targetBatch,
    imageUrl: normalizedImageUrl,
    title: title?.trim() || '技术部招新官方微信群',
    status: 'ACTIVE',
    expiresAt: normalizedExpiresAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  res.json(qr);
});

app.delete('/api/wechat-qr/:id', (req: Request, res: Response) => {
  const targetBatch = req.query.batchId ? String(req.query.batchId) : undefined;
  const success = db.deleteWeChatQR(normalizeRouteParam(req.params.id), targetBatch);
  res.json({ success });
});

// AI Prompts
app.get('/api/prompts', (_req: Request, res: Response) => {
  res.json(db.getPrompts());
});

app.patch('/api/prompts/:id', (req: Request, res: Response) => {
  const { prompt, updatedBy } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt 内容不能为空' });

  const updated = db.updatePrompt(normalizeRouteParam(req.params.id), prompt, updatedBy || 'admin');
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

app.get('/api/ai-settings', (_req: Request, res: Response) => {
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
      c.profile.name,
      c.profile.studentId,
      c.profile.major,
      c.profile.className,
      c.profile.phone,
      c.profile.wechat,
      c.profile.technicalFoundation,
      c.profile.techDirection,
      c.aiScore ?? '',
      c.aiRecommendation || '',
      c.candidateType || '',
      c.status,
      admissionLabel,
      c.registeredAt,
    ].map(csvCell).join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="candidates-recruitment.csv"');
  res.send(csvContent);
});

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const spreadsheetFormula = /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(text);
  const safeText = spreadsheetFormula ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

// --- Vite Middleware Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Keep the development-only toolchain out of production containers.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    console.error('[HTTP] Unhandled request error:', err);
    return res.status(500).json({ error: '服务器暂时无法完成请求，请稍后重试' });
  });

  app.listen(PORT, HOST, () => {
    console.log(`[Server] Tech Department Recruitment System listening on http://${HOST}:${PORT}`);
  });
}

startServer();
