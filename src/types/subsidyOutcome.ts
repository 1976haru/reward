// 보조금 결과·보상 기록 + 상태 전이 타입 (체크리스트 68).
//
// 사용자가 외부 공식 창구에서 "직접" 신고한 뒤 내부에서 수동으로 결과를 기록한다.
// 자동 제출은 없으며, submittedManually=true & confirmManualSubmission=true 없이는 제출 기록을 만들지 않는다.
// 외부 접수번호 등 근거 없이는 submitted_manually 상태로 전환하지 않는다.
// 결과 기록은 내부 추적용이며 부정수급 확정/포상금 보장을 의미하지 않는다.
//
// 개인정보·API 키 원문은 저장 전 마스킹한다.

// ---------- 상태 ----------

export const SUBSIDY_CANDIDATE_STATES = [
  "draft",
  "review",
  "approved",
  "report_draft",
  "ready_for_manual_submission",
  "submitted_manually",
  "under_review",
  "completed",
  "rejected",
  "unknown"
] as const;
export type SubsidyCandidateState = (typeof SUBSIDY_CANDIDATE_STATES)[number];

/** 허용된 상태 전이(자동 submitted 금지 — submitted_manually 는 가드 충족 시에만). */
export const SUBSIDY_STATE_TRANSITIONS: Record<SubsidyCandidateState, SubsidyCandidateState[]> = {
  draft: ["review", "rejected", "unknown"],
  review: ["approved", "draft", "rejected", "unknown"],
  approved: ["report_draft", "review", "rejected", "unknown"],
  report_draft: ["ready_for_manual_submission", "approved", "rejected", "unknown"],
  ready_for_manual_submission: ["submitted_manually", "report_draft", "rejected", "unknown"],
  submitted_manually: ["under_review", "completed", "rejected", "unknown"],
  under_review: ["completed", "rejected", "unknown"],
  completed: ["unknown"],
  rejected: ["draft", "unknown"],
  unknown: ["draft", "review", "approved", "report_draft", "ready_for_manual_submission"]
};

export const SUBSIDY_OUTCOME_STATUSES = [
  "draft",
  "submitted_manually",
  "under_review",
  "completed",
  "rejected",
  "unknown"
] as const;
export type SubsidyOutcomeStatus = (typeof SUBSIDY_OUTCOME_STATUSES)[number];

// ---------- 기록 입력/저장 ----------

export interface SubsidyOutcomeInput {
  candidateId: string;
  caseId?: string;
  /** 사용자가 외부 공식 창구에서 직접 제출했음(true 필수 — 제출 기록 생성 조건). */
  submittedManually?: boolean;
  /** 직접 제출 확인 체크(true 필수 — 제출 기록 생성 조건). */
  confirmManualSubmission?: boolean;
  recorderName?: string;
  reviewerName?: string;
  agencyName?: string;
  officialUrl?: string;
  externalReceiptNo?: string;
  referenceNumber?: string;
  manualSubmissionNote?: string;
  submittedAt?: string;
  status?: SubsidyOutcomeStatus;
  decision?: string;
  result?: string;
  rewardRelated?: boolean;
  /** 실제 지급 확인 후 입력값만 허용(rewardConfirmedAt 동반 필요). 예상액/자동산정액 저장 금지. */
  rewardAmount?: number;
  rewardConfirmedAt?: string;
  memo?: string;
}

export interface SubsidyStateChangeLogEntry {
  candidateId: string;
  fromStatus: string;
  toStatus: string;
  changedAt: string;
  changedBy: string;
  reason: string;
  confirmManualSubmission: boolean;
}

export interface SubsidyOutcomeRecord {
  candidateId: string;
  caseId?: string;
  moduleId: "subsidy_fraud";
  submittedManually: boolean;
  confirmManualSubmission: boolean;
  recorderName?: string;
  reviewerName?: string;
  agencyName?: string;
  officialUrl?: string;
  externalReceiptNo?: string;
  referenceNumber?: string;
  manualSubmissionNote?: string;
  submittedAt?: string;
  status: SubsidyOutcomeStatus;
  decision?: string;
  result?: string;
  rewardRelated: boolean;
  rewardAmount?: number;
  rewardConfirmedAt?: string;
  /** 항상 false — 포상금 지급 보장이 아니다. */
  rewardGuaranteed: false;
  /** 항상 false — 공익레이더는 자동 제출하지 않는다. */
  autoSubmitted: false;
  /** 항상 true — 부정수급/위법 확정이 아니다. */
  notLegalConclusion: true;
  memo?: string;
  createdAt: string;
  updatedAt: string;
  stateLog: SubsidyStateChangeLogEntry[];
}

export const SUBSIDY_OUTCOME_NOTICE =
  "공익레이더는 신고를 자동 제출하지 않습니다. 사용자가 외부 공식 창구에서 직접 제출한 뒤 접수번호를 기록합니다. " +
  "포상금 지급 여부와 금액은 기관 판단에 따르며 보장되지 않습니다. 이 기록은 내부 추적용이며 부정수급/위법 확정이 아닙니다.";
