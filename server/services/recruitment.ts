import { db } from '../db/index.js';
import { HttpError } from '../errors.js';
import {
  Candidate,
  CandidateStatus,
  CandidateProfile,
  DashboardStats,
  CapabilityScores,
  WeChatGroupQR,
  CandidatePrivacyConsent,
} from '../../src/types.js';
import { AIService } from './ai.js';

/**
 * Per-candidate interview lock: serializes all interview operations
 * (start, submit, complete) for the same candidate to prevent
 * read-modify-write race conditions during async LLM calls.
 */
const interviewLocks = new Map<string, Promise<any>>();

async function serializeInterviewOp<T>(candidateId: string, fn: () => Promise<T>): Promise<T> {
  const prev = interviewLocks.get(candidateId) || Promise.resolve();
  const next = prev.then(fn, fn); // resolve or reject, both advance the chain
  const cleanup = next.catch(() => {}).then(() => {
    // Only delete if this is still the latest pending op for this candidate
    if (interviewLocks.get(candidateId) === next) {
      interviewLocks.delete(candidateId);
    }
  });
  interviewLocks.set(candidateId, cleanup);
  return next;
}

export class RecruitmentService {
  /**
   * Register a new candidate for recruitment
   */
  public static registerCandidate(
    profile: CandidateProfile,
    batchId: string | undefined,
    privacyConsent: CandidatePrivacyConsent,
  ): { candidate: Candidate; isNew: boolean } {
    const effectiveBatchId = batchId || 'default';

    // Check if student already registered
    const existing = db.findCandidateByStudentId(profile.studentId, effectiveBatchId) ||
      db.getCandidates().find(c => c.profile.studentId === profile.studentId);

    if (existing) {
      return { candidate: existing, isNew: false };
    }

    const candidateId = `cand-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const newCandidate: Candidate = {
      id: candidateId,
      batchId: effectiveBatchId,
      profile,
      privacyConsent,
      status: 'REGISTERED',
      registeredAt: now,
      updatedAt: now,
    };

    db.createCandidate(newCandidate);
    return { candidate: newCandidate, isNew: true };
  }

  /**
   * Start or resume an AI screening interview
   * Serialized per candidate to prevent duplicate interview creation.
   */
  public static async startOrResumeInterview(candidateId: string) {
    return serializeInterviewOp(candidateId, async () => {
      return this._startOrResumeInterview(candidateId);
    });
  }

  private static async _startOrResumeInterview(candidateId: string) {
    const candidate = db.getCandidateById(candidateId);
    if (!candidate) {
      throw new HttpError('候选人信息不存在', 404);
    }

    let interview = db.getInterviewByCandidateId(candidateId);

    if (!interview) {
      // First time starting interview
      const openingQuestion = await AIService.generateOpeningQuestion(candidate.profile);
      const now = new Date().toISOString();

      interview = {
        id: `intv-${candidateId}`,
        candidateId,
        batchId: candidate.batchId || 'default',
        status: 'INTERVIEWING',
        currentRound: 1,
        maxRounds: 5,
        messages: [
          {
            id: `msg-${Date.now()}-0`,
            sender: 'ai',
            content: openingQuestion,
            timestamp: now,
            round: 1,
            analysis: '首轮开场提问，破冰并建立舒适交流氛围',
          },
        ],
        startedAt: now,
        updatedAt: now,
      };

      db.createInterview(interview);
      db.updateCandidateStatus(candidateId, 'AI_INTERVIEWING', 'student', '开始 AI 智能面试');
    } else if (candidate.status === 'REGISTERED') {
      db.updateCandidateStatus(candidateId, 'AI_INTERVIEWING', 'student', '恢复 AI 智能面试');
    }

    return { candidate, interview };
  }

  /**
   * Submit answer to the current AI question
   * Serialized per candidate to prevent read-modify-write races during LLM calls.
   */
  public static async submitAnswer(candidateId: string, answerText: string) {
    return serializeInterviewOp(candidateId, async () => {
      return this._submitAnswer(candidateId, answerText);
    });
  }

  private static async _submitAnswer(candidateId: string, answerText: string) {
    const candidate = db.getCandidateById(candidateId);
    const interview = db.getInterviewByCandidateId(candidateId);

    if (!candidate || !interview) {
      throw new HttpError('面试或候选人不存在', 404);
    }

    if (interview.status === 'COMPLETED') {
      throw new HttpError('该面试已完成，不可重复提交回答', 409);
    }

    const now = new Date().toISOString();
    const candidateMsg = {
      id: `msg-${Date.now()}-c`,
      sender: 'candidate' as const,
      content: answerText.trim(),
      timestamp: now,
      round: interview.currentRound,
    };

    interview.messages.push(candidateMsg);

    // If max rounds reached or candidate completed 4 rounds with sufficient depth
    if (interview.currentRound >= interview.maxRounds) {
      return this._completeInterview(candidateId);
    }

    // Generate dynamic follow-up
    const nextRoundNumber = interview.currentRound + 1;
    const followUp = await AIService.generateFollowUp(candidate.profile, interview.messages, interview.currentRound);

    const aiMsg = {
      id: `msg-${Date.now()}-ai`,
      sender: 'ai' as const,
      content: followUp.question,
      timestamp: new Date().toISOString(),
      round: nextRoundNumber,
      analysis: followUp.analysis,
    };

    interview.messages.push(aiMsg);
    interview.currentRound = nextRoundNumber;
    interview.updatedAt = new Date().toISOString();
    db.updateInterview(interview);

    return { interview, isCompleted: false };
  }

  /**
   * Complete interview and trigger AI evaluation
   * Serialized per candidate and idempotent (safe to call multiple times).
   */
  public static async completeInterview(candidateId: string) {
    return serializeInterviewOp(candidateId, async () => {
      return this._completeInterview(candidateId);
    });
  }

  private static async _completeInterview(candidateId: string) {
    const candidate = db.getCandidateById(candidateId);
    const interview = db.getInterviewByCandidateId(candidateId);

    if (!candidate || !interview) {
      throw new HttpError('候选人或面试不存在', 404);
    }

    // Idempotent: if already completed, return existing result
    if (interview.status === 'COMPLETED') {
      const evaluation = db.getEvaluationByCandidateId(candidateId);
      if (evaluation) {
        return { interview, evaluation, isCompleted: true };
      }
      // Interview marked completed but evaluation missing — re-run evaluation
    }

    const now = new Date().toISOString();
    interview.status = 'COMPLETED';
    interview.completedAt = now;
    interview.updatedAt = now;
    db.updateInterview(interview);

    // Perform structured AI evaluation
    const evaluation = await AIService.evaluateCandidate(candidateId, candidate.profile, interview.messages);
    db.saveEvaluation(evaluation);

    // Update candidate's score and grade
    db.updateCandidateScores(candidateId, evaluation.overallScore, evaluation.recommendation, evaluation.candidateType);

    // AI results are advisory only. Every completed interview enters the same
    // human-review queue, regardless of score or grade.
    db.updateCandidateStatus(
      candidateId,
      'AI_COMPLETED',
      'ai_system',
      `AI初筛已完成，评分: ${evaluation.overallScore}分，等级: ${evaluation.recommendation}；等待人工审核`,
    );

    return {
      interview,
      evaluation,
      isCompleted: true,
    };
  }

  /**
   * Final Admission of Candidate by Tech Dept Admin
   * Direct admission, unlocks WeChat QR Code
   */
  public static admitCandidate(candidateId: string, operator = 'admin', comment = '技术部审核通过，正式录取为技术部成员') {
    const candidate = db.getCandidateById(candidateId);
    if (!candidate) throw new HttpError('候选人不存在', 404);

    db.updateCandidateStatus(candidateId, 'ADMITTED', operator, comment);
    return db.getCandidateById(candidateId);
  }

  /**
   * Reject Candidate by Tech Dept Admin
   */
  public static rejectCandidate(candidateId: string, operator = 'admin', reason = '综合考量未予录用') {
    const candidate = db.getCandidateById(candidateId);
    if (!candidate) throw new HttpError('候选人不存在', 404);

    db.updateCandidateStatus(candidateId, 'MANUAL_REJECTED', operator, reason);
    return db.getCandidateById(candidateId);
  }

  /**
   * Student confirms joining the WeChat group
   */
  public static confirmGroupJoin(candidateId: string) {
    const candidate = db.getCandidateById(candidateId);
    if (!candidate) throw new HttpError('候选人不存在', 404);

    const allowedStatuses: CandidateStatus[] = [
      'MANUAL_PASSED',
      'QR_AVAILABLE',
      'GROUP_JOIN_PENDING',
      'GROUP_JOIN_CONFIRMED',
      'ADMITTED',
    ];

    if (!allowedStatuses.includes(candidate.status)) {
      throw new HttpError('未获录取资格，暂无入群权限', 403);
    }

    db.updateCandidateStatus(candidateId, 'GROUP_JOIN_CONFIRMED', 'student', '学生在客户端确认已扫码加入技术部招新微信群');
    return db.getCandidateById(candidateId);
  }

  /**
   * Get WeChat QR code for student
   * STRICT SECURITY: Only allowed if candidate is admitted or confirmed
   */
  public static getWeChatQRForStudent(candidateId: string) {
    const candidate = db.getCandidateById(candidateId);
    if (!candidate) return { authorized: false, error: '候选人不存在' };

    const authorizedStatuses: CandidateStatus[] = [
      'MANUAL_PASSED',
      'QR_AVAILABLE',
      'GROUP_JOIN_PENDING',
      'GROUP_JOIN_CONFIRMED',
      'ADMITTED',
    ];

    if (!authorizedStatuses.includes(candidate.status)) {
      return {
        authorized: false,
        status: candidate.status,
        message: '需技术部正式录取后，方可获取招新群二维码',
      };
    }

    // Do not expose another cohort's group QR when this batch has no active code.
    const qr = db.getWeChatQR(candidate.batchId);
    return {
      authorized: true,
      status: candidate.status,
      qr: qr || null,
      message: qr ? '请扫码入群' : '当前尚未配置微信群二维码，请联系技术部管理员',
    };
  }

  /**
   * Compute dashboard stats
   */
  public static getDashboardStats(batchId?: string): DashboardStats {
    const candidates = db.getCandidates(batchId);
    const evaluations = candidates
      .map(c => db.getEvaluationByCandidateId(c.id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    const totalRegistered = candidates.length;
    const aiCompleted = candidates.filter(c => c.aiScore !== undefined).length;
    const aiRecommended = candidates.filter(c => c.aiRecommendation === 'S' || c.aiRecommendation === 'A' || c.aiRecommendation === 'B').length;
    const pendingReviewCount = candidates.filter(c => [
      'AI_COMPLETED',
      'AI_RECOMMENDED',
      'AI_NOT_RECOMMENDED',
      'WAITING_MANUAL_INTERVIEW',
      'MANUAL_INTERVIEWING',
    ].includes(c.status)).length;

    const admittedCount = candidates.filter(c =>
      ['ADMITTED', 'MANUAL_PASSED', 'GROUP_JOIN_CONFIRMED'].includes(c.status)
    ).length;
    const rejectedCount = candidates.filter(c => c.status === 'MANUAL_REJECTED').length;

    const qrAvailable = admittedCount;
    const groupJoinConfirmed = candidates.filter(c => c.status === 'GROUP_JOIN_CONFIRMED').length;
    const groupJoinRate = admittedCount > 0 ? Math.round((groupJoinConfirmed / admittedCount) * 1000) / 10 : 0;

    const gradeDistribution = { S: 0, A: 0, B: 0, C: 0 };
    for (const c of candidates) {
      if (c.aiRecommendation && gradeDistribution[c.aiRecommendation] !== undefined) {
        gradeDistribution[c.aiRecommendation]++;
      }
    }

    // Capability averages
    const totalEvals = evaluations.length || 1;
    const sumScores = evaluations.reduce<CapabilityScores>(
      (acc, curr) => ({
        learning: acc.learning + curr.scores.learning,
        initiative: acc.initiative + curr.scores.initiative,
        logic: acc.logic + curr.scores.logic,
        technology_interest: acc.technology_interest + curr.scores.technology_interest,
        communication: acc.communication + curr.scores.communication,
        technical_foundation: acc.technical_foundation + curr.scores.technical_foundation,
      }),
      { learning: 0, initiative: 0, logic: 0, technology_interest: 0, communication: 0, technical_foundation: 0 }
    );

    const capabilityAverages: CapabilityScores = {
      learning: Math.round(sumScores.learning / totalEvals),
      initiative: Math.round(sumScores.initiative / totalEvals),
      logic: Math.round(sumScores.logic / totalEvals),
      technology_interest: Math.round(sumScores.technology_interest / totalEvals),
      communication: Math.round(sumScores.communication / totalEvals),
      technical_foundation: Math.round(sumScores.technical_foundation / totalEvals),
    };

    const techDirectionDistribution: Record<string, number> = {};
    const majorDistribution: Record<string, number> = {};

    for (const c of candidates) {
      const dir = c.profile.techDirection || '未指定';
      techDirectionDistribution[dir] = (techDirectionDistribution[dir] || 0) + 1;

      const maj = c.profile.major || '其他专业';
      majorDistribution[maj] = (majorDistribution[maj] || 0) + 1;
    }

    return {
      totalRegistered,
      aiCompleted,
      aiRecommended,
      pendingReviewCount,
      admittedCount,
      rejectedCount,
      qrAvailable,
      groupJoinConfirmed,
      groupJoinRate,
      gradeDistribution,
      capabilityAverages,
      techDirectionDistribution,
      majorDistribution,
    };
  }
}
