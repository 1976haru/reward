// Approval Gate — 이 프로젝트의 핵심 안전 정책.
//
// AI 또는 시스템이 외부 신고기관에 직접 신고를 제출하지 못하도록 구조적으로 차단한다.
// 시스템이 할 수 있는 것은 "신고서 초안 복사 / 다운로드 / 공식 링크 열기 / 내부 상태 기록"뿐이다.
//
// SUBMITTED 상태는 사용자가 외부 공식 창구에 직접 제출한 사실을 내부 기록으로 표시하는 상태이며,
// 시스템이 외부에 어떤 HTTP 요청도 보내지 않는다.

export type AllowedAction =
  | "copy_report_draft"
  | "download_report_draft"
  | "open_official_reporting_link"
  | "mark_as_submitted_manually"
  | "add_review_note";

export type ProhibitedAction =
  | "auto_submit_report"
  | "auto_login_agency"
  | "agency_form_autofill"
  | "reward_claim_automation"
  | "bypass_human_review"
  | "circumvent_access_control";

export interface ApprovalGatePolicy {
  schemaVersion: "1.0.0";
  automaticSubmissionAllowed: false;
  allowedActions: AllowedAction[];
  prohibitedActions: ProhibitedAction[];
  requiredSubmittedConfirmation: true;
  submittedStateNotice: string;
  notice: string;
}

export const approvalGatePolicy: ApprovalGatePolicy = {
  schemaVersion: "1.0.0",
  automaticSubmissionAllowed: false,
  allowedActions: [
    "copy_report_draft",
    "download_report_draft",
    "open_official_reporting_link",
    "mark_as_submitted_manually",
    "add_review_note"
  ],
  prohibitedActions: [
    "auto_submit_report",
    "auto_login_agency",
    "agency_form_autofill",
    "reward_claim_automation",
    "bypass_human_review",
    "circumvent_access_control"
  ],
  requiredSubmittedConfirmation: true,
  submittedStateNotice:
    "SUBMITTED는 사용자가 외부 공식 신고 창구에 직접 제출한 뒤 내부 기록으로 표시하는 상태입니다. 시스템은 자동 제출을 수행하지 않습니다.",
  notice:
    "이 시스템은 외부 신고기관에 신고를 자동 제출하지 않습니다. 신고서 초안 복사·다운로드·공식 링크 안내까지만 제공합니다."
};

// ---------- 공식 신고처 링크 (단순 링크. 자동 입력·로그인 금지) ----------

export interface OfficialReportingLink {
  agencyId: string;
  agencyName: string;
  label: string;
  url: string;
  caution: string;
}

const FALSE_AD_LINKS: OfficialReportingLink[] = [
  {
    agencyId: "mfds",
    agencyName: "식품의약품안전처",
    label: "식품의약품안전처 온라인 불법유통 신고 안내",
    url: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    caution: "사용자가 직접 페이지를 열고 공식 양식에 따라 제출해야 합니다. 본 시스템은 자동 입력·자동 로그인·자동 제출을 수행하지 않습니다."
  },
  {
    agencyId: "epeople",
    agencyName: "국민신문고",
    label: "국민신문고 (민원·공익신고 통합 창구)",
    url: "https://www.epeople.go.kr",
    caution: "사용자가 직접 접속해 양식을 작성·제출해야 합니다. 자동화 도구를 사용하지 마십시오."
  },
  {
    agencyId: "acrc",
    agencyName: "국민권익위원회",
    label: "국민권익위원회 (공익신고 제도 안내)",
    url: "https://www.acrc.go.kr",
    caution: "공익신고 제도 일반 안내. 구체 접수 경로는 사이트 내 공식 안내를 확인하세요."
  }
];

const LINK_TABLE: Record<string, OfficialReportingLink[]> = {
  false_ad: FALSE_AD_LINKS
};

export function getOfficialReportingLinks(moduleId: string): OfficialReportingLink[] {
  return LINK_TABLE[moduleId] ?? [];
}

// ---------- 안전 헬퍼 ----------

/** 시스템은 절대 외부 신고기관에 자동 제출하지 않는다. 항상 false. */
export function canAutoSubmit(): false {
  return false;
}

/** 자동 제출을 시도하는 호출 자체를 방어하기 위한 런타임 가드. */
export class AutomaticSubmissionBlockedError extends Error {
  constructor(public readonly attemptedAction: string) {
    super(`Automatic submission blocked: ${attemptedAction}. This system does not submit reports to external agencies.`);
    this.name = "AutomaticSubmissionBlockedError";
  }
}

export function assertNoAutoSubmission(actionName: string): void {
  // 이 함수에 도달했다는 것은 어디선가 자동 제출을 시도했다는 뜻이다. 항상 throw.
  throw new AutomaticSubmissionBlockedError(actionName);
}

export interface SubmittedConfirmationInput {
  status: string;
  confirmManualSubmission?: boolean;
  reviewerName?: string;
  note?: string;
}

export type SubmittedConfirmationFailure =
  | { ok: true }
  | { ok: false; code: "CONFIRMATION_REQUIRED"; message: string }
  | { ok: false; code: "REVIEWER_REQUIRED"; message: string };

/**
 * SUBMITTED 상태 변경 시 사람 확인 요건을 검증한다.
 * - confirmManualSubmission === true 필수
 * - reviewerName 필수
 * - note는 권장 (없어도 통과하되 응답에 안내 가능)
 */
export function requireManualSubmissionConfirmation(input: SubmittedConfirmationInput): SubmittedConfirmationFailure {
  if (input.status !== "SUBMITTED") return { ok: true };
  const hasManualNote = typeof input.note === "string" && /직접\s*제출|수동\s*제출|manual(ly)?\s*submitted/i.test(input.note);
  if (input.confirmManualSubmission !== true && !hasManualNote) {
    return {
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      message:
        "SUBMITTED 상태로 변경하려면 confirmManualSubmission=true 또는 사람이 직접 제출했다는 메모(note)가 필요합니다. 이 도구는 외부 신고를 자동 제출하지 않습니다."
    };
  }
  if (!input.reviewerName || input.reviewerName.trim().length === 0) {
    return {
      ok: false,
      code: "REVIEWER_REQUIRED",
      message:
        "SUBMITTED 상태로 변경하려면 reviewerName(외부 공식 창구에 직접 제출한 사람)을 기록해야 합니다. 시스템 자동 제출이 아닙니다."
    };
  }
  return { ok: true };
}

export function getApprovalGateNotice(): string {
  return approvalGatePolicy.notice;
}

export const SUBMITTED_RESPONSE_MESSAGE =
  "SUBMITTED 상태로 기록되었습니다. 이는 사용자가 외부 공식 창구에 직접 제출한 사실을 내부 기록으로 남긴 것이며, 시스템은 자동 제출을 수행하지 않았습니다.";
