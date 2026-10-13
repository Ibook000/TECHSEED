export const CANDIDATE_STATUSES = [
  'REGISTERED',
  'AI_INTERVIEWING',
  'AI_COMPLETED',
  'AI_RECOMMENDED',
  'AI_NOT_RECOMMENDED',
  'WAITING_MANUAL_INTERVIEW',
  'MANUAL_INTERVIEWING',
  'MANUAL_PASSED',
  'MANUAL_REJECTED',
  'MANUAL_WAITLIST',
  'QR_AVAILABLE',
  'GROUP_JOIN_PENDING',
  'GROUP_JOIN_CONFIRMED',
  'ADMITTED',
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const REGISTRATION_CONSENT_VERSION = 'registration-consent-v2';

export interface CandidatePrivacyConsent {
  version: string;
  acceptedAt: string;
}

export type AIRecommendationGrade = 'S' | 'A' | 'B' | 'C';

export type TechnicalFoundation =
  | '完全没有'
  | '了解一点'
  | '有基础'
  | '可以独立写简单程序'
  | '有项目经验';

export type TechDirection =
  | 'Web 前端'
  | '后端'
  | 'AI'
  | '算法'
  | '嵌入式'
  | '硬件'
  | 'UI / UX'
  | '产品'
  | '暂时不确定';

export type UserRole = 'ADMIN';

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

export interface RecruitmentBatch {
  id: string;
  name: string;
  year: number;
  isActive: boolean;
  startDate: string;
  endDate?: string;
  description: string;
}

export interface CandidateProfile {
  name: string;
  studentId: string;
  major: string;
  className: string;
  phone: string;
  wechat: string;
  technicalFoundation: TechnicalFoundation;
  techDirection: TechDirection;
  selfIntro: string;
}

export interface Candidate {
  id: string;
  batchId: string;
  profile: CandidateProfile;
  privacyConsent?: CandidatePrivacyConsent;
  status: CandidateStatus;
  aiScore?: number;
  aiRecommendation?: AIRecommendationGrade;
  candidateType?: string;
  registeredAt: string;
  aiCompletedAt?: string;
  manualReviewedAt?: string;
  groupJoinedAt?: string;
  admittedAt?: string;
  updatedAt: string;
}

export interface CapabilityScores {
  learning: number;               // 学习能力 25%
  initiative: number;             // 主动性 20%
  logic: number;                  // 逻辑思维 20%
  technology_interest: number;    // 技术兴趣 15%
  communication: number;          // 表达能力 10%
  technical_foundation: number;   // 技术基础 10%
}

export interface QualityScores {
  authenticity_score: number;     // Legacy compatibility field; new evaluations keep this neutral.
  specificity_score: number;      // Observable detail in the answers
  consistency_score: number;      // Observable consistency across answers
}

export interface AIEvaluation {
  id: string;
  candidateId: string;
  overallScore: number;
  recommendation: AIRecommendationGrade;
  candidateType: string;
  scores: CapabilityScores;
  quality: QualityScores;
  strengths: string[];
  risks: string[];
  summary: string;
  recommendationReason: string;
  antiTemplateFlag: boolean;
  templateAnalysis?: string;
  evaluationSource?: 'llm' | 'heuristic';
  evaluatedAt: string;
}

export interface InterviewMessage {
  id: string;
  sender: 'ai' | 'candidate';
  content: string;
  timestamp: string;
  round?: number;
  analysis?: string; // AI per-round internal observation
  latencyMs?: number;
}

export interface InterviewSession {
  id: string;
  candidateId: string;
  batchId: string;
  status: 'INIT' | 'INTERVIEWING' | 'EVALUATING' | 'COMPLETED' | 'FAILED';
  currentRound: number;
  maxRounds: number;
  messages: InterviewMessage[];
  lastAnswerSubmissionId?: string;
  startedAt: string;
  completedAt?: string;
  updatedAt: string;
}

export interface ManualReview {
  id: string;
  candidateId: string;
  reviewerId: string;
  reviewerName: string;
  result: 'PASSED' | 'REJECTED' | 'WAITLIST';
  technicalRating: number;   // 1-5
  communicationRating: number;// 1-5
  teamworkRating: number;    // 1-5
  potentialRating: number;   // 1-5
  overallEvaluation: string;
  internalComments?: string;
  reviewedAt: string;
}

export interface CandidateNote {
  id: string;
  candidateId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface WeChatGroupQR {
  id: string;
  batchId: string;
  imageUrl: string;
  title: string;
  status: 'ACTIVE' | 'INACTIVE';
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateStatusHistory {
  id: string;
  candidateId: string;
  fromStatus: CandidateStatus;
  toStatus: CandidateStatus;
  operator: string;
  reason?: string;
  comment?: string;
  timestamp: string;
}

export type StatusTransition = CandidateStatusHistory;

export interface AIPromptConfig {
  id: string;
  key: 'interviewer_system_prompt' | 'question_generation_prompt' | 'followup_prompt' | 'evaluation_prompt';
  name: string;
  version: number;
  prompt: string;
  updatedAt: string;
  updatedBy: string;
}

export type PromptConfig = AIPromptConfig;

export interface AIProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AISettings {
  id: string;
  primary: AIProviderConfig;
  fallback: AIProviderConfig;
  updatedAt: string;
  updatedBy: string;
}

export interface AISettingsPublic extends Omit<AISettings, 'primary' | 'fallback'> {
  primary: Omit<AIProviderConfig, 'apiKey'> & { apiKeyMasked: string; hasKey: boolean };
  fallback: Omit<AIProviderConfig, 'apiKey'> & { apiKeyMasked: string; hasKey: boolean };
}

export interface DashboardStats {
  totalRegistered: number;
  aiCompleted: number;
  aiRecommended: number;
  pendingReviewCount: number;
  waitingManualInterview?: number;
  manualPassed?: number;
  manualRejected?: number;
  admittedCount: number;
  rejectedCount: number;
  qrAvailable: number;
  groupJoinConfirmed: number;
  groupJoinRate: number;
  gradeDistribution: { S: number; A: number; B: number; C: number };
  capabilityAverages: CapabilityScores;
  techDirectionDistribution: Record<string, number>;
  majorDistribution: Record<string, number>;
}
