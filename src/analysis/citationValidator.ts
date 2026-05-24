// Citation Validator — AI 리포트 근거 검증 모듈 (체크리스트 25).
//
// AI 리포트의 모든 핵심 주장에 공개자료 근거(원문 URL / 파일명+행번호 / recordId /
// evidenceId)를 연결하고, 근거 없는 핵심 주장은 자동 경고 또는 실패 처리한다.
// 로그인 필요·비공개 URL과 개인정보 원문이 포함된 citation은 차단한다.
// 실제 LLM API는 호출하지 않으며 deterministic하게 동작한다.

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { detectForbiddenPersonalData, sanitizeForStorage } from "../policy/privacyGuard.js";
import {
  AUXILIARY_CITATION_TYPES,
  CITATION_VALIDATION_REPORT_TITLE,
  CitationIssue,
  CitationIssueCode,
  CitationReference,
  CitationType,
  CitationValidationMode,
  CitationValidationOptions,
  CitationValidationReport,
  ClaimKind,
  ClaimValidationResult,
  ClaimValidationStatus,
  RejectedCitation,
  ReportClaim,
  STRONG_CITATION_TYPES
} from "../types/citationValidation.js";

type UnknownRecord = Record<string, unknown>;

// 로그인 필요/비공개/내부자료 URL 판별 마커.
const PRIVATE_URL_MARKERS = [
  "login",
  "signin",
  "sign-in",
  "auth",
  "logon",
  "members",
  "member/login",
  "mypage",
  "intranet",
  "private",
  "internal",
  "vpn",
  "localhost",
  "127.0.0.1",
  "로그인",
  "인증필요",
  "인증 필요",
  "비공개",
  "내부자료",
  "내부 자료"
];

const INTERNAL_HOST_RE = /^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1|localhost)/i;
const URL_IN_TEXT_RE = /https?:\/\/[^\s)"'<>]+/g;

export function createCitationValidationId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `citation_validation_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeForStorage(value).sanitizedText.trim();
}

// 거부된 citation을 리포트에 남길 때 개인정보 원문을 마스킹한다.
function sanitizeCitationForReport(citation: CitationReference): CitationReference {
  const out: CitationReference = { type: citation.type };
  if (citation.sourceUrl) out.sourceUrl = sanitize(citation.sourceUrl);
  if (citation.evidenceUrl) out.evidenceUrl = sanitize(citation.evidenceUrl);
  if (citation.attachmentUrl) out.attachmentUrl = sanitize(citation.attachmentUrl);
  if (citation.sourceFileName) out.sourceFileName = sanitize(citation.sourceFileName);
  if (citation.sourceRowNumber !== undefined) out.sourceRowNumber = citation.sourceRowNumber;
  if (citation.recordId) out.recordId = sanitize(citation.recordId);
  if (citation.evidenceId) out.evidenceId = sanitize(citation.evidenceId);
  if (citation.label) out.label = sanitize(citation.label);
  if (citation.requiresLogin) out.requiresLogin = true;
  if (citation.isPrivate) out.isPrivate = true;
  if (citation.isFixtureBased) out.isFixtureBased = true;
  return out;
}

// ---------- citation 평가 ----------

export function isStrongCitationType(type: CitationType): boolean {
  return STRONG_CITATION_TYPES.includes(type);
}

export function isAuxiliaryCitationType(type: CitationType): boolean {
  return AUXILIARY_CITATION_TYPES.includes(type);
}

function citationUrls(citation: CitationReference): string[] {
  return [citation.sourceUrl, citation.evidenceUrl, citation.attachmentUrl]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.trim());
}

export function isPrivateOrLoginUrl(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  const lower = url.toLowerCase();
  if (INTERNAL_HOST_RE.test(lower)) return true;
  return PRIVATE_URL_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

function isPublicHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && !isPrivateOrLoginUrl(url);
}

// citation에 개인정보 원문이 포함되는지 검사한다 (URL/파일명/라벨/식별자 전체).
export function citationContainsPersonalInfo(citation: CitationReference): boolean {
  const blob = [
    citation.sourceUrl,
    citation.evidenceUrl,
    citation.attachmentUrl,
    citation.sourceFileName,
    citation.label,
    citation.recordId,
    citation.evidenceId,
    citation.sourceRowNumber !== undefined ? String(citation.sourceRowNumber) : ""
  ]
    .filter(Boolean)
    .join(" ");
  if (!blob) return false;
  if (detectForbiddenPersonalData(blob).length > 0) return true;
  // 대표자명 등 한국식 이름 컨텍스트.
  if (/대표자\s*[:：]?\s*[가-힣]{2,4}/.test(blob)) return true;
  return false;
}

export interface CitationEvaluation {
  accepted: boolean;
  effectiveType?: CitationType;
  rejection?: { reason: string; code: CitationIssueCode };
  isFixtureBased: boolean;
  isPersonalInfo: boolean;
  isPrivateUrl: boolean;
}

export function evaluateCitation(citation: CitationReference): CitationEvaluation {
  const isFixtureBased = Boolean(citation.isFixtureBased);

  if (citationContainsPersonalInfo(citation)) {
    return {
      accepted: false,
      isFixtureBased,
      isPersonalInfo: true,
      isPrivateUrl: false,
      rejection: { reason: "citation에 개인정보 원문이 포함되어 차단되었습니다.", code: "personal_info" }
    };
  }

  if (citation.isPrivate || citation.requiresLogin) {
    return {
      accepted: false,
      isFixtureBased,
      isPersonalInfo: false,
      isPrivateUrl: true,
      rejection: {
        reason: "로그인 필요 또는 비공개 자료로 표시되어 근거로 인정하지 않습니다.",
        code: citation.requiresLogin ? "login_required_url" : "private_url"
      }
    };
  }

  const urls = citationUrls(citation);
  for (const url of urls) {
    if (isPrivateOrLoginUrl(url)) {
      return {
        accepted: false,
        isFixtureBased,
        isPersonalInfo: false,
        isPrivateUrl: true,
        rejection: { reason: "로그인 필요/비공개/내부자료 URL은 근거로 인정하지 않습니다.", code: "private_url" }
      };
    }
  }

  switch (citation.type) {
    case "source_url":
    case "evidence_url":
    case "attachment_url": {
      const url = urls[0];
      if (!url) {
        return {
          accepted: false,
          isFixtureBased,
          isPersonalInfo: false,
          isPrivateUrl: false,
          rejection: { reason: "URL 근거에 원문 URL이 비어 있습니다.", code: "empty_citation" }
        };
      }
      if (!isPublicHttpUrl(url)) {
        return {
          accepted: false,
          isFixtureBased,
          isPersonalInfo: false,
          isPrivateUrl: false,
          rejection: { reason: "공개 http(s) URL이 아니어서 근거로 인정하지 않습니다.", code: "non_public_url" }
        };
      }
      return { accepted: true, effectiveType: citation.type, isFixtureBased, isPersonalInfo: false, isPrivateUrl: false };
    }
    case "source_file": {
      if (!citation.sourceFileName || citation.sourceRowNumber === undefined || citation.sourceRowNumber === "") {
        return {
          accepted: false,
          isFixtureBased,
          isPersonalInfo: false,
          isPrivateUrl: false,
          rejection: { reason: "파일 근거에는 파일명과 행/페이지 번호가 모두 필요합니다.", code: "empty_citation" }
        };
      }
      return { accepted: true, effectiveType: "source_file", isFixtureBased, isPersonalInfo: false, isPrivateUrl: false };
    }
    case "record_id": {
      if (!citation.recordId) {
        return {
          accepted: false,
          isFixtureBased,
          isPersonalInfo: false,
          isPrivateUrl: false,
          rejection: { reason: "recordId 근거에 식별자가 비어 있습니다.", code: "empty_citation" }
        };
      }
      return { accepted: true, effectiveType: "record_id", isFixtureBased, isPersonalInfo: false, isPrivateUrl: false };
    }
    case "evidence_id": {
      if (!citation.evidenceId) {
        return {
          accepted: false,
          isFixtureBased,
          isPersonalInfo: false,
          isPrivateUrl: false,
          rejection: { reason: "evidenceId 근거에 식별자가 비어 있습니다.", code: "empty_citation" }
        };
      }
      return { accepted: true, effectiveType: "evidence_id", isFixtureBased, isPersonalInfo: false, isPrivateUrl: false };
    }
    case "computed_model":
      return { accepted: true, effectiveType: "computed_model", isFixtureBased, isPersonalInfo: false, isPrivateUrl: false };
    default:
      return {
        accepted: false,
        isFixtureBased,
        isPersonalInfo: false,
        isPrivateUrl: false,
        rejection: { reason: "알 수 없는 citation 유형입니다.", code: "empty_citation" }
      };
  }
}

// ---------- claim 검증 ----------

export function validateClaim(claim: ReportClaim, mode: CitationValidationMode): ClaimValidationResult {
  const issues: CitationIssue[] = [];
  const rejectedCitations: RejectedCitation[] = [];
  const acceptedTypes: CitationType[] = [];
  let isFixtureBased = false;
  let blockedPersonalInfo = false;

  for (const citation of claim.citations ?? []) {
    const result = evaluateCitation(citation);
    if (result.isFixtureBased) isFixtureBased = true;
    if (result.accepted && result.effectiveType) {
      acceptedTypes.push(result.effectiveType);
    } else if (result.rejection) {
      rejectedCitations.push({
        citation: sanitizeCitationForReport(citation),
        reason: result.rejection.reason,
        code: result.rejection.code
      });
      if (result.isPersonalInfo) blockedPersonalInfo = true;
      issues.push({
        claimId: claim.claimId,
        level: result.isPersonalInfo ? "error" : "warning",
        code: result.rejection.code,
        message: result.rejection.reason
      });
    }
  }

  const hasStrong = acceptedTypes.some((t) => isStrongCitationType(t));
  const hasModel = acceptedTypes.includes("computed_model");
  const hasAccepted = acceptedTypes.length > 0;

  let status: ClaimValidationStatus = "pass";
  let needsReinforcement = false;

  // 개인정보가 포함된 citation은 모드와 무관하게 항상 차단(fail).
  if (blockedPersonalInfo) {
    status = "fail";
    needsReinforcement = true;
  } else {
    switch (claim.kind) {
      case "disclaimer":
        status = "pass"; // 안내문/면책문구는 citation 필수 대상에서 제외.
        break;
      case "computed":
        // 모델 계산 결과는 computed_model citation으로 통과할 수 있다.
        if (hasModel || hasStrong) {
          status = "pass";
        } else {
          status = "warning";
          needsReinforcement = true;
          issues.push({
            claimId: claim.claimId,
            level: "warning",
            code: "computed_missing_model_citation",
            message: "모델 계산 결과에는 computed_model 또는 공개자료 근거 표시가 필요합니다."
          });
        }
        break;
      case "supporting":
        if (hasAccepted) {
          status = "pass";
        } else {
          status = "warning";
          needsReinforcement = true;
          issues.push({
            claimId: claim.claimId,
            level: "warning",
            code: "missing_citation",
            message: "보조 주장에 근거가 부족합니다. 공개자료 기준 추가 확인 필요."
          });
        }
        break;
      case "core":
      default:
        if (hasStrong) {
          status = "pass";
        } else if (mode === "strict") {
          status = "fail";
          needsReinforcement = true;
          issues.push({
            claimId: claim.claimId,
            level: "error",
            code: "core_missing_strong_citation",
            message: "핵심 주장에 원문 URL/파일+행번호/evidenceId 같은 공개자료 근거가 없습니다. (근거 보강 필요)"
          });
        } else {
          status = "warning";
          needsReinforcement = true;
          issues.push({
            claimId: claim.claimId,
            level: "warning",
            code: "core_missing_strong_citation",
            message: "핵심 주장에 공개자료 근거가 없습니다. 근거 보강 필요 (공개자료 기준 추가 확인 필요)."
          });
        }
        break;
    }
  }

  return {
    claimId: claim.claimId,
    kind: claim.kind,
    section: claim.section,
    status,
    hasAcceptedCitation: hasAccepted,
    acceptedCitationTypes: Array.from(new Set(acceptedTypes)),
    rejectedCitations,
    issues,
    needsCitationReinforcement: needsReinforcement,
    isFixtureBased
  };
}

// ---------- 리포트 검증 ----------

export function validateReportCitations(
  claims: ReportClaim[],
  options: CitationValidationOptions = {}
): CitationValidationReport {
  const mode: CitationValidationMode = options.mode ?? "warning";
  const withDefaults = options.defaultCitations?.length
    ? attachDefaultCitations(claims, options.defaultCitations)
    : claims;
  const claimResults = withDefaults.map((claim) => validateClaim(claim, mode));

  let blockedPersonalInfoCount = 0;
  let blockedPrivateUrlCount = 0;
  let fixtureCitationCount = 0;
  const allIssues: CitationIssue[] = [];
  const missingClaimIds: string[] = [];

  for (const result of claimResults) {
    allIssues.push(...result.issues);
    if (result.isFixtureBased) fixtureCitationCount++;
    if (result.needsCitationReinforcement && !result.hasAcceptedCitation) missingClaimIds.push(result.claimId);
    for (const rejected of result.rejectedCitations) {
      if (rejected.code === "personal_info") blockedPersonalInfoCount++;
      if (rejected.code === "private_url" || rejected.code === "login_required_url") blockedPrivateUrlCount++;
    }
  }

  const citedClaims = claimResults.filter((r) => r.hasAcceptedCitation).length;
  const coreClaims = claimResults.filter((r) => r.kind === "core").length;
  const missingClaims = claimResults.filter((r) => r.needsCitationReinforcement && !r.hasAcceptedCitation).length;

  const hasFail = claimResults.some((r) => r.status === "fail");
  const hasWarning = claimResults.some((r) => r.status === "warning");
  const status: ClaimValidationStatus = hasFail ? "fail" : hasWarning ? "warning" : "pass";

  const isFixtureBased = Boolean(options.isFixtureBased) || fixtureCitationCount > 0;
  const notes = [
    "근거 검증은 deterministic하게 수행되었으며 실제 LLM API를 호출하지 않습니다.",
    "근거 없는 핵심 주장은 strict 모드에서 fail, warning 모드에서 warning으로 처리되며 근거 보강 필요로 표시됩니다.",
    "로그인 필요·비공개·내부자료 URL과 개인정보 원문이 포함된 citation은 근거로 인정하지 않습니다.",
    "모든 결과는 공개자료 기준 검토 보조이며 사람 검토가 필요합니다.",
    isFixtureBased ? "fixture 기반 검증입니다. 실데이터 근거처럼 표현하지 않습니다." : "입력 리포트 기반 근거 검증입니다."
  ];

  return {
    reportId: options.reportId ?? createCitationValidationId(),
    title: CITATION_VALIDATION_REPORT_TITLE,
    mode,
    status,
    totalClaims: claimResults.length,
    citedClaims,
    missingClaims,
    coreClaims,
    blockedPersonalInfoCount,
    blockedPrivateUrlCount,
    fixtureCitationCount,
    claimResults,
    missingClaimIds,
    issues: allIssues,
    notes,
    isFixtureBased,
    createdAt: options.createdAt ?? new Date().toISOString()
  };
}

// ---------- citation 헬퍼 ----------

export function computedModelCitation(label = "모델 계산 결과 (검토 신호)"): CitationReference {
  return { type: "computed_model", label: sanitize(label) || "모델 계산 결과 (검토 신호)" };
}

export function recordIdCitation(recordId: string, isFixtureBased = false): CitationReference {
  return { type: "record_id", recordId: sanitize(recordId), isFixtureBased };
}

export function evidenceIdCitation(evidenceId: string, isFixtureBased = false): CitationReference {
  return { type: "evidence_id", evidenceId: sanitize(evidenceId), isFixtureBased };
}

// 자유 텍스트에서 공개 http(s) URL을 추출해 citation 후보로 만든다.
export function extractCitationsFromText(text: unknown, isFixtureBased = false): CitationReference[] {
  const safe = sanitize(text);
  if (!safe) return [];
  const out: CitationReference[] = [];
  const matches = safe.match(URL_IN_TEXT_RE) ?? [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;]+$/, "");
    if (isPublicHttpUrl(url)) out.push({ type: "source_url", sourceUrl: url, isFixtureBased });
  }
  return out;
}

// report 전체 공통 citation을 각 claim에 연결한다 (중복 없이).
export function attachDefaultCitations(claims: ReportClaim[], defaultCitations: CitationReference[]): ReportClaim[] {
  if (!defaultCitations?.length) return claims;
  return claims.map((claim) => ({
    ...claim,
    // 안내문/면책문구(disclaimer)에는 공통 근거를 강제로 붙이지 않는다.
    citations: claim.kind === "disclaimer" ? claim.citations ?? [] : [...(claim.citations ?? []), ...defaultCitations]
  }));
}

// ---------- claim 추출기 ----------

function buildClaim(
  base: { sourceResultId?: string; counter: { n: number } },
  kind: ClaimKind,
  section: string,
  text: unknown,
  citations: CitationReference[]
): ReportClaim | undefined {
  const safe = sanitize(text);
  if (!safe) return undefined;
  base.counter.n += 1;
  const idPart = base.sourceResultId ? `${base.sourceResultId}` : "claim";
  return {
    claimId: `${idPart}#${section}-${base.counter.n}`,
    text: safe,
    kind,
    section,
    sourceResultId: base.sourceResultId,
    citations
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => sanitize(v)).filter(Boolean);
}

function citationsFromRecordIds(ids: unknown, isFixtureBased: boolean): CitationReference[] {
  const arr = asStringArray(ids);
  return arr.slice(0, 12).map((id) => recordIdCitation(id, isFixtureBased));
}

// 명시 citations 필드(citations / claimCitations[section])를 읽는다.
function explicitCitations(result: UnknownRecord, section?: string): CitationReference[] {
  const out: CitationReference[] = [];
  const claimCitations = result.claimCitations as Record<string, CitationReference[]> | undefined;
  if (section && claimCitations && Array.isArray(claimCitations[section])) out.push(...claimCitations[section]);
  if (Array.isArray(result.citations)) out.push(...(result.citations as CitationReference[]));
  return out;
}

export function extractClaimsFromLlmExplanationResult(result: unknown): ReportClaim[] {
  if (!result || typeof result !== "object") return [];
  const r = result as UnknownRecord;
  const fixture = Boolean(r.isFixtureBased);
  const sourceResultId = sanitize(r.explanationId) || sanitize(r.candidateId) || "llm-explanation";
  const base = { sourceResultId, counter: { n: 0 } };
  const recordCites = citationsFromRecordIds(r.sourceCandidateIds, fixture);
  const claims: ReportClaim[] = [];

  const push = (kind: ClaimKind, section: string, text: unknown, extra: CitationReference[]) => {
    const cites = [...extra, ...explicitCitations(r, section), ...extractCitationsFromText(text, fixture)];
    const claim = buildClaim(base, kind, section, text, cites);
    if (claim) claims.push(claim);
  };

  push("supporting", "summary", r.summary, [computedModelCitation(), ...recordCites]);
  for (const item of asStringArray(r.whyFlagged)) push("supporting", "whyFlagged", item, [computedModelCitation(), ...recordCites]);
  // keyEvidence는 공개자료 근거를 주장하는 핵심 항목 → 강한 근거가 필요하다.
  for (const item of asStringArray(r.keyEvidence)) push("core", "keyEvidence", item, [...recordCites]);
  for (const item of asStringArray(r.riskSignals)) push("computed", "riskSignals", item, [computedModelCitation()]);
  if (r.rewardPossibilityNote) push("computed", "rewardPossibilityNote", r.rewardPossibilityNote, [computedModelCitation()]);
  for (const item of asStringArray(r.additionalChecks)) push("disclaimer", "additionalChecks", item, []);
  for (const item of asStringArray(r.limitations)) push("disclaimer", "limitations", item, []);
  for (const item of asStringArray(r.safetyDisclaimers)) push("disclaimer", "safetyDisclaimers", item, []);

  return claims;
}

export function extractClaimsFromRiskScoreResult(result: unknown): ReportClaim[] {
  if (!result || typeof result !== "object") return [];
  const r = result as UnknownRecord;
  const fixture = Boolean(r.isFixtureBased);
  const sourceResultId = sanitize(r.scoreId) || "risk-score";
  const base = { sourceResultId, counter: { n: 0 } };
  const recordCites = citationsFromRecordIds(r.sourceCandidateIds, fixture);
  const claims: ReportClaim[] = [];

  const push = (kind: ClaimKind, section: string, text: unknown, extra: CitationReference[]) => {
    const cites = [...extra, ...explicitCitations(r, section), ...extractCitationsFromText(text, fixture)];
    const claim = buildClaim(base, kind, section, text, cites);
    if (claim) claims.push(claim);
  };

  // 위험점수/등급 분류는 모델 계산 결과(검토 신호)다.
  if (r.finalRiskScore !== undefined || r.riskGrade) {
    push("computed", "riskGrade", `위험점수 ${r.finalRiskScore ?? "?"}점 ${r.riskGrade ?? ""}등급 검토 후보로 분류됨`, [
      computedModelCitation()
    ]);
  }
  push("computed", "reason", r.reason, [computedModelCitation(), ...recordCites]);
  const signals = r.contributingSignals;
  if (Array.isArray(signals)) {
    for (const s of signals) {
      const sig = s as UnknownRecord;
      push("computed", "contributingSignals", `${sanitize(sig.component)} 신호: ${sanitize(sig.signal)}`, [
        computedModelCitation(),
        ...(sig.sourceCandidateId ? [recordIdCitation(String(sig.sourceCandidateId), fixture)] : [])
      ]);
    }
  }
  for (const item of asStringArray(r.evidenceSummary)) push("supporting", "evidenceSummary", item, [...recordCites]);

  return claims;
}

export function extractClaimsFromRewardScoreResult(result: unknown): ReportClaim[] {
  if (!result || typeof result !== "object") return [];
  const r = result as UnknownRecord;
  const fixture = Boolean(r.isFixtureBased);
  const sourceResultId = sanitize(r.rewardScoreId) || "reward-score";
  const base = { sourceResultId, counter: { n: 0 } };
  const recordCites = citationsFromRecordIds(r.sourceCandidateIds, fixture);
  const claims: ReportClaim[] = [];

  const push = (kind: ClaimKind, section: string, text: unknown, extra: CitationReference[]) => {
    const cites = [...extra, ...explicitCitations(r, section), ...extractCitationsFromText(text, fixture)];
    const claim = buildClaim(base, kind, section, text, cites);
    if (claim) claims.push(claim);
  };

  if (r.rewardPossibilityScore !== undefined || r.rewardPossibilityLevel) {
    push(
      "computed",
      "rewardLevel",
      `보상/포상 가능성 검토 우선순위 ${r.rewardPossibilityLevel ?? "?"} (${r.rewardPossibilityScore ?? "?"}점)로 분류됨. 공식 기준 확인 필요`,
      [computedModelCitation()]
    );
  }
  push("computed", "reason", r.reason, [computedModelCitation(), ...recordCites]);
  const signals = r.contributingSignals;
  if (Array.isArray(signals)) {
    for (const s of signals) {
      const sig = s as UnknownRecord;
      push("computed", "contributingSignals", `${sanitize(sig.component)} 신호: ${sanitize(sig.signal)}`, [
        computedModelCitation(),
        ...(sig.sourceCandidateId ? [recordIdCitation(String(sig.sourceCandidateId), fixture)] : [])
      ]);
    }
  }
  for (const item of asStringArray(r.evidenceSummary)) push("supporting", "evidenceSummary", item, [...recordCites]);
  for (const item of asStringArray(r.disclaimers)) push("disclaimer", "disclaimers", item, []);

  return claims;
}

// ---------- 리포트 렌더링 / 저장 ----------

export function renderCitationValidationReportMarkdown(report: CitationValidationReport): string {
  const lines: string[] = [];
  const statusLabel = report.status === "pass" ? "pass" : report.status === "warning" ? "warning" : "fail";
  lines.push(`# ${report.title} - ${report.reportId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.createdAt}`);
  lines.push(`- 검증 모드: ${report.mode}`);
  lines.push(`- 검증 상태: ${statusLabel}`);
  lines.push(`- 데이터 구분: ${report.isFixtureBased ? "fixture 기반 검증" : "입력 리포트 기반"}`);
  lines.push("");
  lines.push("## 요약");
  lines.push("");
  lines.push(`- 전체 claims: ${report.totalClaims}`);
  lines.push(`- 핵심 주장(core): ${report.coreClaims}`);
  lines.push(`- 근거 보유 claims: ${report.citedClaims}`);
  lines.push(`- 근거 누락 claims: ${report.missingClaims}`);
  lines.push(`- 개인정보 차단 건수: ${report.blockedPersonalInfoCount}`);
  lines.push(`- 로그인필요/비공개 URL 차단 건수: ${report.blockedPrivateUrlCount}`);
  lines.push(`- fixture citation claims: ${report.fixtureCitationCount}`);
  lines.push("");

  if (report.missingClaimIds.length > 0) {
    lines.push("## 근거 보강 필요 claims");
    lines.push("");
    for (const result of report.claimResults) {
      if (!report.missingClaimIds.includes(result.claimId)) continue;
      lines.push(`- [${result.kind}/${result.section}] ${result.claimId}: 근거 보강 필요 (공개자료 기준 추가 확인 필요)`);
    }
    lines.push("");
  }

  const blockedIssues = report.issues.filter((i) => i.code === "personal_info" || i.code === "private_url" || i.code === "login_required_url");
  if (blockedIssues.length > 0) {
    lines.push("## 차단된 근거");
    lines.push("");
    for (const issue of blockedIssues) lines.push(`- [${issue.code}] ${issue.claimId}: ${issue.message}`);
    lines.push("");
  }

  lines.push("## 주의");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${note}`);

  return sanitizeForStorage(lines.join("\n")).sanitizedText;
}

export async function writeCitationValidationReport(
  outputDir: string,
  report: CitationValidationReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.reportId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "citation-validation-report.json");
  const reportMdFile = path.join(runDir, "citation-validation-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderCitationValidationReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

// 입력 리포트 JSON의 형태를 보고 적절한 추출기를 선택한다.
export function extractClaimsFromReportJson(value: unknown): { claims: ReportClaim[]; kind: string } {
  if (!value || typeof value !== "object") return { claims: [], kind: "unknown" };
  const obj = value as UnknownRecord;

  // 묶음 리포트
  if (Array.isArray(obj.explanations)) {
    const claims = (obj.explanations as unknown[]).flatMap(extractClaimsFromLlmExplanationResult);
    return { claims, kind: "llm-explanation" };
  }
  if (Array.isArray(obj.topScores)) {
    const list = obj.topScores as UnknownRecord[];
    const isReward = list.some((s) => s && s.rewardPossibilityScore !== undefined);
    const claims = list.flatMap(isReward ? extractClaimsFromRewardScoreResult : extractClaimsFromRiskScoreResult);
    return { claims, kind: isReward ? "reward-score" : "risk-score" };
  }
  // 단일 결과
  if (obj.summary !== undefined || obj.whyFlagged !== undefined || obj.explanationId !== undefined) {
    return { claims: extractClaimsFromLlmExplanationResult(obj), kind: "llm-explanation" };
  }
  if (obj.rewardPossibilityScore !== undefined) {
    return { claims: extractClaimsFromRewardScoreResult(obj), kind: "reward-score" };
  }
  if (obj.finalRiskScore !== undefined || obj.riskGrade !== undefined) {
    return { claims: extractClaimsFromRiskScoreResult(obj), kind: "risk-score" };
  }
  if (Array.isArray(obj.claims)) {
    return { claims: obj.claims as ReportClaim[], kind: "claims" };
  }
  return { claims: [], kind: "unknown" };
}

export { CITATION_VALIDATION_NOTICE } from "../types/citationValidation.js";
