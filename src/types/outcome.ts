// Outcome Tracker (체크리스트 30)
//
// 본 모듈은 "실제 신고 결과 기록" 기능이다.
// 시스템은 외부 신고기관에 자동 제출하지 않으며, 접수번호/처리결과는 사용자가
// 외부 공식 창구에서 직접 확인한 뒤 수동으로 입력한다.
// 포상금/보상금 지급 여부는 공식기관 판단과 처리 결과에 따라 달라지며 보장하지 않는다.

export const OUTCOME_STATUSES = [
  "NOT_SUBMITTED",        // 아직 외부 공식 창구에 제출하지 않음
  "SUBMITTED_MANUALLY",   // 사용자가 직접 제출했다고 내부 기록
  "RECEIVED",             // 접수번호 또는 접수 확인이 있음
  "IN_REVIEW",            // 기관 처리 중
  "SUPPLEMENT_REQUESTED", // 보완자료 요청
  "ACCEPTED",             // 신고 내용이 일부 또는 전부 인정/처리됨
  "REJECTED",             // 반려 또는 불수용
  "CLOSED_NO_ACTION",     // 조치 없이 종결
  "TRANSFERRED",          // 타 기관 이송
  "REWARD_REVIEW",        // 포상금/보상금 검토 중
  "REWARD_PAID",          // 포상금/보상금 지급 확인
  "REWARD_REJECTED",      // 포상금/보상금 지급 거절
  "UNKNOWN"               // 결과 확인 불가
] as const;
export type OutcomeStatus = typeof OUTCOME_STATUSES[number];

export const OUTCOME_STATUS_LABELS: Record<OutcomeStatus, string> = {
  NOT_SUBMITTED: "미제출",
  SUBMITTED_MANUALLY: "제출 기록",
  RECEIVED: "접수 확인",
  IN_REVIEW: "처리 중",
  SUPPLEMENT_REQUESTED: "보완 요청",
  ACCEPTED: "수용/인정",
  REJECTED: "반려",
  CLOSED_NO_ACTION: "조치 없이 종결",
  TRANSFERRED: "타 기관 이송",
  REWARD_REVIEW: "포상/보상 검토",
  REWARD_PAID: "지급 확인",
  REWARD_REJECTED: "지급 거절",
  UNKNOWN: "확인 불가"
};

export const OUTCOME_DECISIONS = [
  "PENDING",
  "ACCEPTED",
  "PARTIAL_ACCEPTED",
  "REJECTED",
  "TRANSFERRED",
  "CLOSED",
  "UNKNOWN"
] as const;
export type OutcomeDecision = typeof OUTCOME_DECISIONS[number];

export const OUTCOME_DECISION_LABELS: Record<OutcomeDecision, string> = {
  PENDING: "검토 중",
  ACCEPTED: "수용/인정",
  PARTIAL_ACCEPTED: "일부 수용",
  REJECTED: "반려/불수용",
  TRANSFERRED: "타 기관 이송",
  CLOSED: "종결",
  UNKNOWN: "확인 불가"
};

export const REWARD_OUTCOMES = [
  "NOT_APPLICABLE",   // 포상/보상 대상 아님
  "NOT_REQUESTED",    // 신청 안 함
  "UNDER_REVIEW",     // 검토 중
  "PAID",             // 지급 확인 (사용자 직접 확인)
  "REJECTED",         // 지급 거절
  "UNKNOWN"           // 확인 불가
] as const;
export type RewardOutcome = typeof REWARD_OUTCOMES[number];

export const REWARD_OUTCOME_LABELS: Record<RewardOutcome, string> = {
  NOT_APPLICABLE: "대상 아님",
  NOT_REQUESTED: "신청 안 함",
  UNDER_REVIEW: "검토 중",
  PAID: "지급 확인",
  REJECTED: "지급 거절",
  UNKNOWN: "확인 불가"
};

export interface OutcomeEntry {
  schemaVersion: "1.0.0";
  id: string;
  caseId: string;
  moduleId?: string;
  // 신고처
  agencyName?: string;
  agencyChannel?: string;
  // 제출 / 접수 정보
  submittedAt?: string;           // YYYY-MM-DD (사용자 입력)
  receivedAt?: string;
  referenceNumber?: string;       // 접수번호 (마스킹된 형태로 저장 가능)
  referenceNumberMasked?: boolean;
  // 처리 정보
  status: OutcomeStatus;
  decision: OutcomeDecision;
  resultSummary?: string;         // 처리결과 요약 (저장 전 마스킹)
  rejectionReason?: string;       // 반려 사유 (마스킹)
  supplementRequest?: string;     // 보완 요청 내용 (마스킹)
  // 포상/보상
  rewardOutcome: RewardOutcome;
  rewardAmount?: number | null;   // "사용자 입력 지급 확인 금액" — 0 이상
  rewardCurrency?: string;        // "KRW" 등
  // 후속 처리
  followUpDueAt?: string;         // 다음 확인일
  notes?: string;                 // 메모 (마스킹)
  // 마스킹 발생 여부
  piiMasked?: boolean;
  // 메타
  createdAt: string;
  updatedAt: string;
  safetyNotice: string;
}

export interface CreateOutcomeInput {
  caseId: string;
  moduleId?: string;
  agencyName?: string;
  agencyChannel?: string;
  submittedAt?: string;
  receivedAt?: string;
  referenceNumber?: string;
  status?: OutcomeStatus;
  decision?: OutcomeDecision;
  resultSummary?: string;
  rejectionReason?: string;
  supplementRequest?: string;
  rewardOutcome?: RewardOutcome;
  rewardAmount?: number | null;
  rewardCurrency?: string;
  followUpDueAt?: string;
  notes?: string;
}

export interface UpdateOutcomeInput extends Partial<CreateOutcomeInput> {}

export interface OutcomeListQuery {
  caseId?: string;
  moduleId?: string;
  agencyName?: string;
  status?: OutcomeStatus;
  decision?: OutcomeDecision;
  rewardOutcome?: RewardOutcome;
  followUpDue?: boolean;
  limit?: number;
  offset?: number;
}

export interface OutcomeStats {
  total: number;
  byStatus: Record<string, number>;
  byDecision: Record<string, number>;
  byRewardOutcome: Record<string, number>;
  // 핵심 KPI — Dashboard 에 사용
  submittedCount: number;
  receivedCount: number;
  inReviewCount: number;
  supplementRequestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  rewardReviewCount: number;
  rewardPaidCount: number;
  followUpDueCount: number;
  // 포상금 — "사용자 입력 지급 확인 금액" 합산. 예측이 아님.
  rewardPaidAmountTotal: number;
  rewardPaidEntries: number;
}

export interface OutcomePatternStats {
  // 모듈별
  byModule: Array<{ moduleId: string; total: number; accepted: number; rejected: number; rewardPaid: number }>;
  // 신고처별
  byAgency: Array<{ agencyName: string; total: number; accepted: number; rejected: number; rewardPaid: number }>;
  // 자주 나오는 반려 사유 (텍스트는 마스킹 후 저장된 값 기준)
  topRejectionReasons: Array<{ reason: string; count: number }>;
  safetyNotice: string;
}

export interface FollowUpItem {
  outcomeId: string;
  caseId: string;
  moduleId?: string;
  agencyName?: string;
  status: OutcomeStatus;
  followUpDueAt: string;
  daysOverdue: number;   // 음수면 아직 안 됨 (D-N), 양수면 지남 (D+N)
}

export const OUTCOME_SAFETY_NOTICE =
  "Outcome Tracker 는 사용자가 외부 공식 창구에서 직접 확인한 결과를 내부 기록으로 저장하는 기능입니다. 시스템은 신고 제출이나 포상금 신청을 자동 수행하지 않으며, 포상금/보상금 수령을 보장하지 않습니다. 접수번호/메모에는 담당자 개인정보를 포함하지 마세요.";

// 입력값 길이/검증 한계
export const OUTCOME_LIMITS = {
  agencyName: 80,
  agencyChannel: 120,
  referenceNumber: 80,
  resultSummary: 1000,
  rejectionReason: 1000,
  supplementRequest: 1000,
  notes: 2000,
  rewardCurrency: 8
};
