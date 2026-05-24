import { CitationReference } from "./citationValidation.js";

export const REWARD_POSSIBILITY_LEVELS = ["High", "Medium", "Low"] as const;
export type RewardPossibilityLevel = (typeof REWARD_POSSIBILITY_LEVELS)[number];

export const REWARD_SCORE_COMPONENTS = [
  "recovery_possibility",
  "loss_prevention",
  "evidence_clarity",
  "legal_fit"
] as const;
export type RewardScoreComponent = (typeof REWARD_SCORE_COMPONENTS)[number];

export const REWARD_SOURCE_TYPES = [
  "risk_score",
  "repeat_subsidy",
  "address_cluster",
  "output_settlement",
  "spending_anomaly",
  "contractor_network",
  "manual"
] as const;
export type RewardPossibilitySourceType = (typeof REWARD_SOURCE_TYPES)[number];

export const REWARD_SCORE_COMPONENT_WEIGHTS = {
  recovery_possibility: 35,
  loss_prevention: 30,
  evidence_clarity: 25,
  legal_fit: 10
} as const satisfies Record<RewardScoreComponent, number>;

export const REWARD_POSSIBILITY_LEVEL_THRESHOLDS = {
  High: 75,
  Medium: 50
} as const;

export const REWARD_FORBIDDEN_CLAIM_PHRASES = [
  ["보상금", "지급", "확정"],
  ["포상금", "지급", "확정"],
  ["보상금", "받을", "수", "있음"],
  ["포상금", "받을", "수", "있음"],
  ["수령", "보장"],
  ["지급", "보장"],
  ["무조건", "보상"],
  ["신고하면", "보상"],
  ["보상", "확정"],
  ["포상", "확정"]
].map((parts) => parts.join(" "));

export interface RewardAmountInfo {
  subsidyAmount?: number;
  contractAmount?: number;
  executionAmount?: number;
  returnAmount?: number;
  currency?: string;
}

export interface RewardPossibilityInputCandidate {
  candidateId: string;
  sourceType: RewardPossibilitySourceType;
  riskScore?: number;
  riskGrade?: string;
  riskLevel?: string;
  rewardSignals?: string[];
  recordIds: string[];
  subjectKey?: string;
  amountInfo?: RewardAmountInfo;
  evidence: unknown;
  reason?: string;
  createdAt?: string;
  isFixtureBased?: boolean;
}

export interface RewardScoreBreakdown {
  recoveryPossibilityScore: number;
  lossPreventionScore: number;
  evidenceClarityScore: number;
  legalFitScore: number;
  totalBeforeClamp: number;
  rewardPossibilityScore: number;
}

export interface RewardScoreContribution {
  component: RewardScoreComponent;
  score: number;
  sourceCandidateId: string;
  sourceType: RewardPossibilitySourceType;
  signal: string;
}

export interface RewardPossibilityScoreResult {
  rewardScoreId: string;
  subjectKey: string;
  sourceCandidateIds: string[];
  rewardPossibilityScore: number;
  rewardPossibilityLevel: RewardPossibilityLevel;
  scoreBreakdown: RewardScoreBreakdown;
  contributingSignals: RewardScoreContribution[];
  evidenceSummary: string[];
  reason: string;
  disclaimers: string[];
  reviewRequired: boolean;
  createdAt: string;
  isFixtureBased?: boolean;
  // 체크리스트 25: 근거 검증용 citation (computed_model + record_id/evidence_id 등).
  citations?: CitationReference[];
}

export interface RewardPossibilityScoreReport {
  runId: string;
  totalInputCandidates: number;
  totalScoredSubjects: number;
  levelSummary: Record<RewardPossibilityLevel, number>;
  topScores: RewardPossibilityScoreResult[];
  createdAt: string;
  notes: string[];
  isFixtureBased: boolean;
  sourceNote: string;
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface RewardPossibilityScoreOptions {
  limit?: number;
  runId?: string;
  outputDir?: string;
  isFixtureBased?: boolean;
  sourceNote?: string;
  mergeStrategy?: "capped_sum" | "max";
  manualComponentScores?: Partial<Record<RewardScoreComponent, number>>;
}

export const REWARD_POSSIBILITY_SCORE_NOTICE =
  "보상가능성 점수는 환수 가능성, 공공기관 손실방지 가능성, 증거 명확성을 분리해 보상/포상 가능성 검토 우선순위를 산출하는 보조 점수입니다. " +
  "이 점수는 지급 여부 판단이 아니며 공식 기준과 기관 심사 절차 확인이 필요합니다. " +
  "개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 evidenceSummary, reason, report에 넣지 않습니다. " +
  "모든 결과는 사람 검토 대상이며 reviewRequired=true입니다.";
