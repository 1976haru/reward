// Citation Validation Types — AI 리포트 근거 검증 (체크리스트 25).
//
// 본 모듈은 AI 리포트(LLM 설명형 분석, 위험점수, 보상가능성 점수, 룰 리포트)의
// 모든 핵심 주장에 공개자료 근거(원문 URL / 파일명+행번호 / recordId / evidenceId)를
// 연결하는 표준 타입을 정의한다. AI 환각을 줄이고 사람이 원문을 따라 사실관계를
// 확인할 수 있도록 돕는 보조 도구이며, 확정 판단이나 자동 신고를 수행하지 않는다.

export const CITATION_TYPES = [
  "source_url", // 공개 공고/공공데이터 URL
  "evidence_url", // 원문 증거 URL
  "attachment_url", // 공개 첨부파일 URL
  "source_file", // 업로드 파일명 + 행/페이지 번호
  "record_id", // 표준 기준선 레코드 ID (보조)
  "evidence_id", // 증거 패키지 ID
  "computed_model" // 모델 계산 결과 / 검토 신호 (내부 판단)
] as const;
export type CitationType = (typeof CITATION_TYPES)[number];

// 핵심 주장(core)은 외부 공개자료 근거가 필요하고, computed는 모델 계산 결과,
// supporting은 보조 신호, disclaimer는 안내문/면책문구로 citation 필수 대상에서 제외한다.
export const CLAIM_KINDS = ["core", "computed", "supporting", "disclaimer"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_VALIDATION_STATUSES = ["pass", "warning", "fail"] as const;
export type ClaimValidationStatus = (typeof CLAIM_VALIDATION_STATUSES)[number];

export const CITATION_VALIDATION_MODES = ["strict", "warning"] as const;
export type CitationValidationMode = (typeof CITATION_VALIDATION_MODES)[number];

// 핵심 주장을 단독으로 통과시킬 수 있는 강한(공개) 근거 유형.
export const STRONG_CITATION_TYPES: CitationType[] = [
  "source_url",
  "evidence_url",
  "attachment_url",
  "source_file",
  "evidence_id"
];

// 보조 근거 유형 — supporting/computed에는 인정되지만 core 단독 통과에는 부족하다.
export const AUXILIARY_CITATION_TYPES: CitationType[] = ["record_id", "computed_model"];

export interface CitationReference {
  type: CitationType;
  sourceUrl?: string;
  evidenceUrl?: string;
  attachmentUrl?: string;
  sourceFileName?: string;
  sourceRowNumber?: number | string;
  recordId?: string;
  evidenceId?: string;
  label?: string;
  // 로그인 필요/비공개 자료임을 호출자가 명시할 수 있다 — 이 경우 근거로 인정하지 않는다.
  requiresLogin?: boolean;
  isPrivate?: boolean;
  isFixtureBased?: boolean;
}

export interface ReportClaim {
  claimId: string;
  text: string;
  kind: ClaimKind;
  section: string;
  sourceResultId?: string;
  citations: CitationReference[];
}

export interface RejectedCitation {
  citation: CitationReference;
  reason: string;
  code: CitationIssueCode;
}

export const CITATION_ISSUE_CODES = [
  "missing_citation",
  "core_missing_strong_citation",
  "computed_missing_model_citation",
  "private_url",
  "login_required_url",
  "non_public_url",
  "personal_info",
  "empty_citation"
] as const;
export type CitationIssueCode = (typeof CITATION_ISSUE_CODES)[number];

export interface CitationIssue {
  claimId: string;
  level: "warning" | "error";
  code: CitationIssueCode;
  message: string;
}

export interface ClaimValidationResult {
  claimId: string;
  kind: ClaimKind;
  section: string;
  status: ClaimValidationStatus;
  hasAcceptedCitation: boolean;
  acceptedCitationTypes: CitationType[];
  rejectedCitations: RejectedCitation[];
  issues: CitationIssue[];
  needsCitationReinforcement: boolean;
  isFixtureBased: boolean;
}

/** 근거 없는 주장에 대한 보강 제안(체크리스트 64). */
export interface CitationSuggestedFix {
  claimId: string;
  section: string;
  kind: ClaimKind;
  suggestion: string;
}

export interface CitationValidationReport {
  reportId: string;
  title: string;
  mode: CitationValidationMode;
  status: ClaimValidationStatus;
  totalClaims: number;
  citedClaims: number;
  missingClaims: number;
  coreClaims: number;
  // 체크리스트 64 표준 필드(이름 통일). 위 citedClaims/missingClaims와 동일 값 별칭 포함.
  supportedClaims: number;
  unsupportedClaims: number;
  warningClaims: number;
  failedClaims: number;
  /** strict 모드 기준 통과 여부(근거 없는 핵심 주장·fail 없음). */
  strictPassed: boolean;
  /** 근거 없는 주장 보강 제안. */
  suggestedFixes: CitationSuggestedFix[];
  /** 개인정보/비공개 URL로 차단된 citation 총 건수. */
  privacyBlockedCitations: number;
  blockedPersonalInfoCount: number;
  blockedPrivateUrlCount: number;
  fixtureCitationCount: number;
  claimResults: ClaimValidationResult[];
  missingClaimIds: string[];
  issues: CitationIssue[];
  notes: string[];
  isFixtureBased: boolean;
  createdAt: string;
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface CitationValidationOptions {
  mode?: CitationValidationMode;
  reportId?: string;
  isFixtureBased?: boolean;
  defaultCitations?: CitationReference[];
  createdAt?: string;
}

export const CITATION_VALIDATION_REPORT_TITLE = "AI 리포트 근거 검증 결과";

export const CITATION_VALIDATION_NOTICE =
  "본 모듈은 AI 리포트의 모든 핵심 주장에 원문 URL, 파일명, 행번호, recordId, evidenceId 같은 공개자료 근거를 연결해 환각을 줄이는 보조 도구입니다. " +
  "근거 없는 핵심 주장은 strict 모드에서 fail, warning 모드에서 warning 처리됩니다. " +
  "로그인 필요·비공개·내부자료 URL은 근거로 인정하지 않으며, 개인정보 원문이 포함된 citation은 차단됩니다. " +
  "점수 계산 결과와 내부 판단은 모델 계산 결과(검토 신호)로 표시하며 외부 사실처럼 쓰지 않습니다. " +
  "모든 결과는 사람 검토 대상이며 확정 판단이나 자동 신고가 아닙니다.";
