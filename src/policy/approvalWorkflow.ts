// Approval Workflow (체크리스트 3) — 자동신고 금지 워크플로우 게이트.
//
// AI 가 직접 신고를 제출하지 못하도록, 신고서 초안 / 증거 패키지 / 사람 검토 / 사람 승인 /
// 사람이 외부 창구에서 직접 제출 후 접수번호 기록까지의 단계를 명시적으로 분리한다.
//
// 본 모듈은 순수 함수 + 타입으로만 구성되어 결정적으로 테스트할 수 있다.
// 영속화(승인 로그 저장)는 호출자가 별도 어댑터(JSONL/Trace/Repository)에 위임한다.
//
// 본 모듈은 src/policy/approvalGate.ts (정책 상수 + 런타임 가드) 와 함께 사용한다.

import { requireFactCheckBeforeApproval, summarizeFactCheck } from "./factCheckGate.js";

// ---------- 상태 정의 ----------

export const ALLOWED_GATE_STATUSES = [
  "draft_created",
  "evidence_packaged",
  "human_review_required",
  "human_approved",
  "manually_submitted",
  "rejected",
  "needs_more_evidence"
] as const;

export const FORBIDDEN_GATE_STATUSES = [
  "ai_submitted",
  "auto_submitted",
  "submitted_without_review",
  "reward_claim_auto_submitted"
] as const;

export type AllowedGateStatus = (typeof ALLOWED_GATE_STATUSES)[number];
export type ForbiddenGateStatus = (typeof FORBIDDEN_GATE_STATUSES)[number];

const ALLOWED_GATE_STATUS_SET = new Set<string>(ALLOWED_GATE_STATUSES);
const FORBIDDEN_GATE_STATUS_SET = new Set<string>(FORBIDDEN_GATE_STATUSES);

export type GateDecision =
  | "approved"
  | "rejected"
  | "needs_more_evidence"
  | "manually_submitted_confirmed";

// ---------- 에러 ----------

export type ApprovalGateErrorCode =
  | "INVALID_CASE_DATA"
  | "REVIEWER_REQUIRED"
  | "REASON_REQUIRED"
  | "EVIDENCE_PACKAGE_REQUIRED"
  | "DRAFT_REPORT_REQUIRED"
  | "PRIOR_APPROVAL_REQUIRED"
  | "EXTERNAL_RECEIPT_REQUIRED"
  | "MANUAL_SUBMISSION_REQUIRED"
  | "FORBIDDEN_STATUS"
  | "AUTO_SUBMISSION_FLAG_DETECTED";

export class ApprovalGateError extends Error {
  constructor(
    public readonly code: ApprovalGateErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApprovalGateError";
  }
}

// ---------- 입력/출력 타입 ----------

export interface CaseData {
  caseId: string;
  evidencePackageId?: string;
  draftReportId?: string;
  moduleId?: string;
  summary?: string;
}

export interface ReviewRequest {
  caseId: string;
  evidencePackageId?: string;
  draftReportId?: string;
  status: "human_review_required";
  requestedAt: string;
}

export interface ReviewerInfo {
  reviewerId?: string;
  reviewerName?: string;
}

export interface ReviewData extends ReviewerInfo {
  caseId: string;
  reason: string;
  evidencePackageId?: string;
  draftReportId?: string;
  /**
   * 신고 전 사실관계 점검 결과 (체크리스트 6).
   * approveForManualSubmission 에 전달되면 requireFactCheckBeforeApproval 가드가 강제된다.
   * 본 필드가 없으면 점검 게이트는 비활성 — 라우터/호출자가 별도로 강제할 수 있다.
   */
  factCheckResult?: import("./factCheckGate.js").FactCheckResult;
  /** 외부 시스템에서 영속화된 사실관계 점검표를 가리키는 ID (감사 로그용). */
  factCheckId?: string;
}

export interface SubmissionData extends ReviewerInfo {
  caseId: string;
  priorStatus: AllowedGateStatus | string;
  externalReceiptNo: string;
  submittedByHuman: boolean;
  evidencePackageId?: string;
  draftReportId?: string;
  reason?: string;
  /** 다음 플래그가 truthy 이면 즉시 거부된다. */
  aiSubmitted?: boolean;
  autoSubmitted?: boolean;
  submittedWithoutReview?: boolean;
  rewardClaimAutoSubmitted?: boolean;
}

export interface ApprovalLogEntry {
  caseId: string;
  reviewerId?: string;
  reviewerName?: string;
  decision: GateDecision;
  reviewedAt: string;
  reason: string;
  evidencePackageId?: string;
  draftReportId?: string;
  resultingStatus: AllowedGateStatus;
  manualSubmissionConfirmed?: true;
  externalReceiptNo?: string;
  /** 체크리스트 6: 사실관계 점검표 ID (있으면 감사 로그에 함께 남긴다). */
  factCheckId?: string;
  /** 체크리스트 6: 사실관계 점검 요약 (중립 표현). */
  factCheckSummary?: string;
}

export interface BlockAutoSubmissionPayload {
  status?: string;
  aiSubmitted?: boolean;
  autoSubmitted?: boolean;
  submittedWithoutReview?: boolean;
  rewardClaimAutoSubmitted?: boolean;
}

// ---------- 헬퍼 ----------

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireReviewer(input: ReviewerInfo): void {
  if (!isNonEmpty(input.reviewerId) && !isNonEmpty(input.reviewerName)) {
    throw new ApprovalGateError(
      "REVIEWER_REQUIRED",
      "reviewerId 또는 reviewerName 중 하나는 반드시 기록되어야 합니다."
    );
  }
}

function requireReason(reason: unknown): asserts reason is string {
  if (!isNonEmpty(reason)) {
    throw new ApprovalGateError(
      "REASON_REQUIRED",
      "검토 결정에는 reason(사유) 이 반드시 필요합니다."
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------- 1. createReviewRequest ----------

/**
 * 신고서 초안 / 증거 패키지가 준비된 Case 를 사람 검토 대기열에 올린다.
 * - status 는 항상 `human_review_required` 로 고정된다.
 * - 자동 제출 관련 상태는 만들지 않는다.
 */
export function createReviewRequest(caseData: CaseData): ReviewRequest {
  if (!caseData || !isNonEmpty(caseData.caseId)) {
    throw new ApprovalGateError(
      "INVALID_CASE_DATA",
      "createReviewRequest 는 caseId 가 포함된 caseData 가 필요합니다."
    );
  }
  return {
    caseId: caseData.caseId,
    evidencePackageId: caseData.evidencePackageId,
    draftReportId: caseData.draftReportId,
    status: "human_review_required",
    requestedAt: nowIso()
  };
}

// ---------- 2. approveForManualSubmission ----------

/**
 * 사람 검토자가 "외부 공식 창구에 직접 제출 가능" 으로 승인할 때만 사용한다.
 * - reviewerId/Name, reason, evidencePackageId, draftReportId 모두 필수.
 * - 결과 status: `human_approved` (manually_submitted 가 아니다 — 아직 제출되지 않음).
 */
export function approveForManualSubmission(reviewData: ReviewData): ApprovalLogEntry {
  if (!reviewData || !isNonEmpty(reviewData.caseId)) {
    throw new ApprovalGateError("INVALID_CASE_DATA", "caseId 가 필요합니다.");
  }
  requireReviewer(reviewData);
  requireReason(reviewData.reason);
  if (!isNonEmpty(reviewData.evidencePackageId)) {
    throw new ApprovalGateError(
      "EVIDENCE_PACKAGE_REQUIRED",
      "approveForManualSubmission 은 evidencePackageId 가 필요합니다."
    );
  }
  if (!isNonEmpty(reviewData.draftReportId)) {
    throw new ApprovalGateError(
      "DRAFT_REPORT_REQUIRED",
      "approveForManualSubmission 은 draftReportId 가 필요합니다."
    );
  }

  // 체크리스트 6: factCheckResult 가 첨부되면 사실관계 점검 게이트를 강제한다.
  // (factCheckResult 가 없으면 기존 호출자 호환을 위해 게이트 비활성 — 라우터/호출자 책임으로 분리한다.
  //  외부에서 강제하려면 requireFactCheckBeforeApproval(reviewData) 를 호출자 측에서 직접 사용한다.)
  let factCheckSummaryMsg: string | undefined;
  if (reviewData.factCheckResult) {
    const fc = requireFactCheckBeforeApproval(reviewData);
    factCheckSummaryMsg = summarizeFactCheck(fc).message;
  }

  return {
    caseId: reviewData.caseId,
    reviewerId: reviewData.reviewerId,
    reviewerName: reviewData.reviewerName,
    decision: "approved",
    reviewedAt: nowIso(),
    reason: reviewData.reason,
    evidencePackageId: reviewData.evidencePackageId,
    draftReportId: reviewData.draftReportId,
    resultingStatus: "human_approved",
    factCheckId: reviewData.factCheckResult?.factCheckId ?? reviewData.factCheckId,
    factCheckSummary: factCheckSummaryMsg
  };
}

// ---------- 3. rejectCase ----------

export function rejectCase(reviewData: ReviewData): ApprovalLogEntry {
  if (!reviewData || !isNonEmpty(reviewData.caseId)) {
    throw new ApprovalGateError("INVALID_CASE_DATA", "caseId 가 필요합니다.");
  }
  requireReviewer(reviewData);
  requireReason(reviewData.reason);
  return {
    caseId: reviewData.caseId,
    reviewerId: reviewData.reviewerId,
    reviewerName: reviewData.reviewerName,
    decision: "rejected",
    reviewedAt: nowIso(),
    reason: reviewData.reason,
    evidencePackageId: reviewData.evidencePackageId,
    draftReportId: reviewData.draftReportId,
    resultingStatus: "rejected"
  };
}

// ---------- 4. requestMoreEvidence ----------

export function requestMoreEvidence(reviewData: ReviewData): ApprovalLogEntry {
  if (!reviewData || !isNonEmpty(reviewData.caseId)) {
    throw new ApprovalGateError("INVALID_CASE_DATA", "caseId 가 필요합니다.");
  }
  requireReviewer(reviewData);
  requireReason(reviewData.reason);
  return {
    caseId: reviewData.caseId,
    reviewerId: reviewData.reviewerId,
    reviewerName: reviewData.reviewerName,
    decision: "needs_more_evidence",
    reviewedAt: nowIso(),
    reason: reviewData.reason,
    evidencePackageId: reviewData.evidencePackageId,
    draftReportId: reviewData.draftReportId,
    resultingStatus: "needs_more_evidence"
  };
}

// ---------- 5. confirmManualSubmission ----------

/**
 * 사람이 외부 공식 창구에서 직접 제출한 뒤, 접수번호와 함께 내부 기록만 남긴다.
 * - 사전 상태(priorStatus)는 반드시 `human_approved` 여야 한다.
 * - submittedByHuman === true 필수, externalReceiptNo 필수.
 * - 자동 제출/AI 제출 플래그가 truthy 이면 즉시 거부한다.
 * - 시스템은 외부 신고기관에 HTTP 요청을 보내지 않는다 — 이 함수는 기록만 남긴다.
 */
export function confirmManualSubmission(submissionData: SubmissionData): ApprovalLogEntry {
  if (!submissionData || !isNonEmpty(submissionData.caseId)) {
    throw new ApprovalGateError("INVALID_CASE_DATA", "caseId 가 필요합니다.");
  }
  blockAutoSubmission(submissionData);
  if (submissionData.priorStatus !== "human_approved") {
    throw new ApprovalGateError(
      "PRIOR_APPROVAL_REQUIRED",
      "confirmManualSubmission 은 사전 상태가 human_approved 여야 합니다."
    );
  }
  requireReviewer(submissionData);
  if (!isNonEmpty(submissionData.externalReceiptNo)) {
    throw new ApprovalGateError(
      "EXTERNAL_RECEIPT_REQUIRED",
      "외부 기관에서 부여한 접수번호(externalReceiptNo) 가 반드시 필요합니다."
    );
  }
  if (submissionData.submittedByHuman !== true) {
    throw new ApprovalGateError(
      "MANUAL_SUBMISSION_REQUIRED",
      "submittedByHuman === true 가 아니면 manually_submitted 로 기록할 수 없습니다."
    );
  }
  return {
    caseId: submissionData.caseId,
    reviewerId: submissionData.reviewerId,
    reviewerName: submissionData.reviewerName,
    decision: "manually_submitted_confirmed",
    reviewedAt: nowIso(),
    reason:
      submissionData.reason ??
      "사람이 외부 공식 창구에 직접 제출한 사실을 내부 기록으로 남깁니다.",
    evidencePackageId: submissionData.evidencePackageId,
    draftReportId: submissionData.draftReportId,
    resultingStatus: "manually_submitted",
    manualSubmissionConfirmed: true,
    externalReceiptNo: submissionData.externalReceiptNo
  };
}

// ---------- 6. blockAutoSubmission ----------

/**
 * 어떤 입력 payload 에서도 자동 제출 플래그 / 금지 상태값을 발견하면 즉시 throw 한다.
 * - 본 함수는 어떤 부수효과도 없다 — 거부만 한다.
 * - confirmManualSubmission 내부에서 선행 검사로 호출된다.
 * - 외부에서도 (예: API 라우터 입구) 명시적으로 호출해 방어선을 한 겹 더 둘 수 있다.
 */
export function blockAutoSubmission(payload: BlockAutoSubmissionPayload | null | undefined): void {
  if (!payload || typeof payload !== "object") return;
  if (
    payload.aiSubmitted === true ||
    payload.autoSubmitted === true ||
    payload.submittedWithoutReview === true ||
    payload.rewardClaimAutoSubmitted === true
  ) {
    const flag =
      payload.aiSubmitted === true
        ? "aiSubmitted"
        : payload.autoSubmitted === true
        ? "autoSubmitted"
        : payload.submittedWithoutReview === true
        ? "submittedWithoutReview"
        : "rewardClaimAutoSubmitted";
    throw new ApprovalGateError(
      "AUTO_SUBMISSION_FLAG_DETECTED",
      `자동 제출 플래그(${flag})가 감지되었습니다. 본 시스템은 외부 신고기관에 자동 제출하지 않습니다.`
    );
  }
  if (typeof payload.status === "string" && FORBIDDEN_GATE_STATUS_SET.has(payload.status)) {
    throw new ApprovalGateError(
      "FORBIDDEN_STATUS",
      `금지 상태값(${payload.status}) 이 감지되었습니다. 본 시스템은 자동 신고를 수행하지 않습니다.`
    );
  }
}

// ---------- 헬퍼: 외부에서 상태 유효성 검사용 ----------

export function isAllowedGateStatus(status: string): status is AllowedGateStatus {
  return ALLOWED_GATE_STATUS_SET.has(status);
}

export function isForbiddenGateStatus(status: string): status is ForbiddenGateStatus {
  return FORBIDDEN_GATE_STATUS_SET.has(status);
}
