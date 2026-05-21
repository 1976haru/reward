// Pre-Submission Fact Check Gate (체크리스트 6) — 신고 전 사실관계 점검 게이트.
//
// 신고서 초안 (draft) 과 신고서 확정 (human_approved) 사이에 사람이 반드시
// 통과해야 하는 사실관계 점검표를 코드화한다. 본 모듈은 순수 함수 + 타입으로
// 구성되어 테스트가 결정적이다. 영속화(점검표 저장)는 호출자가 책임진다.
//
// 본 모듈은 src/policy/approvalWorkflow.ts 의 approveForManualSubmission 직전에
// requireFactCheckBeforeApproval 로 게이트된다.
//
// 본 모듈은 법률 자문을 대체하지 않는다.

// ---------- 타입 ----------

export type FactCheckDecision = "approved" | "rejected" | "needs_more_evidence";

export type FactCheckStatus = "completed" | "incomplete";

export const FACT_CHECK_REQUIRED_FLAGS = [
  "publicSourceConfirmed",
  "originalUrlConfirmed",
  "amountConfirmed",
  "periodConfirmed",
  "recipientConfirmed",
  "projectNameConfirmed",
  "suspicionBasisConfirmed",
  "counterExplanationReviewed",
  "privacyChecked",
  "neutralLanguageChecked",
  "evidencePackageConfirmed"
] as const;

export type FactCheckFlag = (typeof FACT_CHECK_REQUIRED_FLAGS)[number];

export interface FactCheckInput {
  caseId: string;
  reviewerId?: string;
  reviewerName?: string;
  checkedAt?: string;

  publicSourceConfirmed?: boolean;
  originalUrlConfirmed?: boolean;
  amountConfirmed?: boolean;
  periodConfirmed?: boolean;
  recipientConfirmed?: boolean;
  projectNameConfirmed?: boolean;
  suspicionBasisConfirmed?: boolean;
  counterExplanationReviewed?: boolean;
  privacyChecked?: boolean;
  neutralLanguageChecked?: boolean;
  evidencePackageConfirmed?: boolean;

  reviewerComment?: string;
  decision?: FactCheckDecision;
}

export interface FactCheckResult {
  factCheckId: string;
  caseId: string;
  reviewerId?: string;
  reviewerName?: string;
  checkedAt: string;

  publicSourceConfirmed: boolean;
  originalUrlConfirmed: boolean;
  amountConfirmed: boolean;
  periodConfirmed: boolean;
  recipientConfirmed: boolean;
  projectNameConfirmed: boolean;
  suspicionBasisConfirmed: boolean;
  counterExplanationReviewed: boolean;
  privacyChecked: boolean;
  neutralLanguageChecked: boolean;
  evidencePackageConfirmed: boolean;

  reviewerComment: string;
  decision: FactCheckDecision;

  // 파생 필드
  status: FactCheckStatus;
  missingFields: string[];
}

export interface FactCheckSummary {
  factCheckId: string;
  caseId: string;
  reviewer: string;
  checkedAt: string;
  status: FactCheckStatus;
  decision: FactCheckDecision;
  confirmedCount: number;
  totalCount: number;
  missingFields: string[];
  /** 중립 표현으로 작성된 한 줄 요약. */
  message: string;
}

// ---------- 에러 ----------

export type FactCheckErrorCode =
  | "INVALID_CASE_DATA"
  | "REVIEWER_REQUIRED"
  | "REVIEWER_COMMENT_REQUIRED"
  | "DECISION_REQUIRED"
  | "INCOMPLETE_FACT_CHECK"
  | "FACT_CHECK_NOT_APPROVED"
  | "FACT_CHECK_CASE_MISMATCH";

export class FactCheckGateError extends Error {
  constructor(
    public readonly code: FactCheckErrorCode,
    message: string,
    public readonly details?: { missingFields?: string[]; expectedCaseId?: string; gotCaseId?: string }
  ) {
    super(message);
    this.name = "FactCheckGateError";
  }
}

// ---------- 헬퍼 ----------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextFactCheckId(): string {
  // 결정적 테스트 가능하도록 timestamp + 랜덤 6자리
  return `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isFactCheckDecision(value: unknown): value is FactCheckDecision {
  return value === "approved" || value === "rejected" || value === "needs_more_evidence";
}

// ---------- 1. createFactCheckResult ----------

/**
 * 사실관계 점검 결과 객체를 생성한다.
 * - 입력 필수 항목(caseId, reviewer, reviewerComment, decision) 누락 시 즉시 throw.
 * - 11개 확인 플래그 중 하나라도 false/누락이면 status = "incomplete" 이며 missingFields 에 항목 이름 기록.
 * - 모두 true 이면 status = "completed".
 * - decision 은 별도 — completed 라도 decision = "rejected" 이면 승인 게이트(requireFactCheckBeforeApproval) 가 거부.
 */
export function createFactCheckResult(input: FactCheckInput): FactCheckResult {
  if (!input || !isNonEmptyString(input.caseId)) {
    throw new FactCheckGateError("INVALID_CASE_DATA", "createFactCheckResult 는 caseId 가 포함된 input 이 필요합니다.");
  }
  if (!isNonEmptyString(input.reviewerId) && !isNonEmptyString(input.reviewerName)) {
    throw new FactCheckGateError(
      "REVIEWER_REQUIRED",
      "사실관계 점검에는 reviewerId 또는 reviewerName 중 하나가 반드시 필요합니다."
    );
  }
  if (!isNonEmptyString(input.reviewerComment)) {
    throw new FactCheckGateError("REVIEWER_COMMENT_REQUIRED", "검토자 의견(reviewerComment) 이 비어있을 수 없습니다.");
  }
  if (!isFactCheckDecision(input.decision)) {
    throw new FactCheckGateError(
      "DECISION_REQUIRED",
      "decision 은 approved / rejected / needs_more_evidence 중 하나여야 합니다."
    );
  }

  const flags = {
    publicSourceConfirmed: input.publicSourceConfirmed === true,
    originalUrlConfirmed: input.originalUrlConfirmed === true,
    amountConfirmed: input.amountConfirmed === true,
    periodConfirmed: input.periodConfirmed === true,
    recipientConfirmed: input.recipientConfirmed === true,
    projectNameConfirmed: input.projectNameConfirmed === true,
    suspicionBasisConfirmed: input.suspicionBasisConfirmed === true,
    counterExplanationReviewed: input.counterExplanationReviewed === true,
    privacyChecked: input.privacyChecked === true,
    neutralLanguageChecked: input.neutralLanguageChecked === true,
    evidencePackageConfirmed: input.evidencePackageConfirmed === true
  };

  const missingFields = FACT_CHECK_REQUIRED_FLAGS.filter((k) => !flags[k]);
  const status: FactCheckStatus = missingFields.length === 0 ? "completed" : "incomplete";

  return {
    factCheckId: nextFactCheckId(),
    caseId: input.caseId,
    reviewerId: input.reviewerId,
    reviewerName: input.reviewerName,
    checkedAt: input.checkedAt ?? nowIso(),
    ...flags,
    reviewerComment: input.reviewerComment,
    decision: input.decision,
    status,
    missingFields
  };
}

// ---------- 2. requireFactCheckBeforeApproval ----------

export interface ReviewLikeInput {
  caseId: string;
  factCheckResult?: FactCheckResult;
  factCheckId?: string;
}

/**
 * approveForManualSubmission 직전에 호출하는 가드.
 * 통과 조건 (모두 만족해야 함):
 *  - factCheckResult 가 존재
 *  - factCheckResult.status === "completed"
 *  - factCheckResult.decision === "approved"
 *  - factCheckResult.caseId === reviewData.caseId
 *
 * 위 중 하나라도 어긋나면 FactCheckGateError 를 throw 한다.
 */
export function requireFactCheckBeforeApproval(reviewData: ReviewLikeInput): FactCheckResult {
  if (!reviewData || !isNonEmptyString(reviewData.caseId)) {
    throw new FactCheckGateError("INVALID_CASE_DATA", "reviewData.caseId 가 필요합니다.");
  }
  const fc = reviewData.factCheckResult;
  if (!fc) {
    throw new FactCheckGateError(
      "INCOMPLETE_FACT_CHECK",
      "사실관계 점검표(factCheckResult) 가 첨부되지 않았습니다. 본 시스템은 사람 검토 없이 신고서를 확정하지 않습니다."
    );
  }
  if (fc.status !== "completed") {
    throw new FactCheckGateError(
      "INCOMPLETE_FACT_CHECK",
      `사실관계 점검표가 미완료 상태입니다. 누락 항목: ${fc.missingFields.join(", ")}`,
      { missingFields: fc.missingFields }
    );
  }
  if (fc.decision !== "approved") {
    throw new FactCheckGateError(
      "FACT_CHECK_NOT_APPROVED",
      `사실관계 점검의 decision 이 "${fc.decision}" 입니다. 신고서 확정은 decision="approved" 일 때만 가능합니다.`
    );
  }
  if (fc.caseId !== reviewData.caseId) {
    throw new FactCheckGateError(
      "FACT_CHECK_CASE_MISMATCH",
      `사실관계 점검표의 caseId(${fc.caseId}) 가 검토 대상 Case(${reviewData.caseId}) 와 일치하지 않습니다.`,
      { expectedCaseId: reviewData.caseId, gotCaseId: fc.caseId }
    );
  }
  return fc;
}

// ---------- 3. summarizeFactCheck ----------

/**
 * 승인 로그 / UI 표시용 한 줄 요약을 만든다.
 * 단정 표현 없이 "확인 완료 / 보완 필요" 중심으로 작성한다.
 */
export function summarizeFactCheck(result: FactCheckResult): FactCheckSummary {
  const total = FACT_CHECK_REQUIRED_FLAGS.length;
  const confirmed = FACT_CHECK_REQUIRED_FLAGS.filter((k) => (result as unknown as Record<string, boolean>)[k] === true).length;
  const reviewer = result.reviewerName ?? result.reviewerId ?? "(unknown)";

  let message: string;
  if (result.status === "completed" && result.decision === "approved") {
    message = `사실관계 점검 ${confirmed}/${total} 항목 확인 완료 — 수동 제출 검토 가능.`;
  } else if (result.status === "incomplete") {
    message = `사실관계 점검 보완 필요 (${confirmed}/${total} 확인, 누락: ${result.missingFields.join(", ")}).`;
  } else if (result.decision === "rejected") {
    message = `사실관계 점검 폐기 결정 — 검토자가 신고 부적합으로 판단.`;
  } else {
    // needs_more_evidence
    message = `사실관계 점검 보완 필요 — 검토자가 추가 자료 필요로 판단.`;
  }

  return {
    factCheckId: result.factCheckId,
    caseId: result.caseId,
    reviewer,
    checkedAt: result.checkedAt,
    status: result.status,
    decision: result.decision,
    confirmedCount: confirmed,
    totalCount: total,
    missingFields: result.missingFields.slice(),
    message
  };
}

// ---------- export 모음 ----------

export const FACT_CHECK_STANDARD_NOTICE =
  "검토자는 본 신고서 초안이 실제 신고가 아니라 검토용 문서임을 확인했습니다. " +
  "공개자료, 원문 URL, 금액, 기간, 수급기관, 의심근거를 확인했으며, 개인정보와 단정 표현을 점검했습니다. " +
  "실제 신고 여부는 관계 법령과 기관 안내를 확인한 후 사람이 최종 판단합니다.";
