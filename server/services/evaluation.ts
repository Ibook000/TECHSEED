import type {
  AIEvaluation,
  AIRecommendationGrade,
  CandidateProfile,
  CapabilityScores,
  InterviewMessage,
} from '../../src/types.js';

export function hasCandidateAnswers(messages: readonly InterviewMessage[]): boolean {
  return messages.some(message => message.sender === 'candidate' && message.content.trim().length > 0);
}

export function readRequiredScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Evaluation response contains a missing or invalid capability score.');
  }
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function readOptionalScore(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function calculateOverallScore(scores: CapabilityScores): number {
  return Math.round(
    scores.learning * 0.25 +
    scores.initiative * 0.20 +
    scores.logic * 0.20 +
    scores.technology_interest * 0.15 +
    scores.communication * 0.10 +
    scores.technical_foundation * 0.10
  );
}

export function gradeForScore(score: number): AIRecommendationGrade {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  return 'C';
}

export function redactKnownProfileIdentifiers(text: string, profile: CandidateProfile): string {
  const identifiers = new Set<string>();
  const profileValues = [
    profile.name,
    profile.studentId,
    profile.major,
    profile.className,
    profile.phone,
    profile.wechat,
  ];

  for (const value of profileValues) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || Array.from(trimmed).length < 2) continue;
    identifiers.add(trimmed);

    const compact = trimmed.replace(/[\s()+.\-]/g, '');
    if (Array.from(compact).length >= 2) identifiers.add(compact);
  }

  return [...identifiers]
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, identifier) => {
      const pattern = Array.from(identifier)
        .map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\s()+.\\-]*');
      return redacted.replace(new RegExp(pattern, 'giu'), '[已隐藏]');
    }, text);
}

export function isInvalidAnswer(text: string): boolean {
  if (!text || text.trim().length < 2) return true;
  const clean = text.replace(/[\s\n\r]/g, '');
  if (clean.length < 3) return true;

  const charCounts: Record<string, number> = {};
  for (const ch of clean) charCounts[ch] = (charCounts[ch] || 0) + 1;
  const topCount = Math.max(...Object.values(charCounts));
  const topRatio = topCount / clean.length;
  if (topRatio > 0.6 && clean.length > 5) return true;

  // Accept letters from any writing system; do not assume Chinese or English.
  return !/\p{L}{2,}/u.test(clean);
}

export function createHeuristicEvaluation(
  candidateId: string,
  profile: CandidateProfile,
  messages: InterviewMessage[],
): AIEvaluation {
  const candAnswers = messages.filter(message => message.sender === 'candidate').map(message => message.content);
  if (candAnswers.length === 0) {
    throw new Error('Cannot evaluate an interview without a candidate answer.');
  }

  const hasDetailedEvidence = candAnswers.some(answer => /因为|后来|排查|报错|配置|文档|日志|查了|试过|定位|对比/.test(answer));
  const hasLearningEvidence = candAnswers.some(answer => /搜索|查阅|文档|教程|请教|尝试|学习|研究|排查/.test(answer));
  const hasActionEvidence = candAnswers.some(answer => /动手|写了|做了|搭建|配置|调试|安装|部署|使用|实现|项目|修改/.test(answer));
  const hasReasoningEvidence = candAnswers.some(answer => /因为|所以|发现|判断|定位|对比|尝试|后来|结果|原因|解决/.test(answer));
  const hasFoundation = profile.technicalFoundation !== '完全没有';
  const allInvalid = candAnswers.every(isInvalidAnswer);

  if (allInvalid) {
    const invalidScores: CapabilityScores = {
      learning: 30,
      initiative: 30,
      logic: 30,
      technology_interest: 30,
      communication: 30,
      technical_foundation: 20,
    };
    const overallScore = calculateOverallScore(invalidScores);
    return {
      id: `eval-${Date.now()}`,
      candidateId,
      overallScore,
      recommendation: gradeForScore(overallScore),
      candidateType: '信息不足 · 建议核对记录',
      scores: invalidScores,
      quality: { authenticity_score: 50, specificity_score: 50, consistency_score: 50 },
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
  const scores: CapabilityScores = {
    learning: hasLearningEvidence ? 80 : 70,
    initiative: hasActionEvidence ? 80 : 70,
    logic: hasReasoningEvidence ? 80 : 70,
    technology_interest: 70,
    communication: 70,
    technical_foundation: hasFoundation ? 70 : 65,
  };
  const overallScore = calculateOverallScore(scores);

  return {
    id: `eval-${Date.now()}`,
    candidateId,
    overallScore,
    recommendation: gradeForScore(overallScore),
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
