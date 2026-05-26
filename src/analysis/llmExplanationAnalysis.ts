import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForAI, sanitizeForStorage } from "../policy/privacyGuard.js";
import {
  computedModelCitation,
  extractCitationsFromText,
  extractClaimsFromLlmExplanationResult,
  recordIdCitation,
  validateReportCitations
} from "./citationValidator.js";
import {
  CitationReference,
  CitationValidationMode,
  CitationValidationReport
} from "../types/citationValidation.js";
import {
  LLM_EXPLANATION_FORBIDDEN_PHRASES,
  LLM_EXPLANATION_NOTICE,
  LLM_EXPLANATION_RECOMMENDED_PHRASES,
  LLM_EXPLANATION_SAFETY_DISCLAIMERS,
  LlmExplanationCandidateInput,
  LlmExplanationOptions,
  LlmExplanationReport,
  LlmExplanationResult,
  SafeLlmPromptPayload
} from "../types/llmExplanationAnalysis.js";

type UnknownRecord = Record<string, unknown>;

const NEGATION_MARKERS = ["금지", "아님", "아니다", "않", "대체하지", "확정하지", "보장하지", "후보", "검토", "필요"];

export function createLlmExplanationRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `llm_explanation_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createLlmExplanationId(candidateId: string): string {
  const safe = sanitizeText(candidateId).replace(/[^a-zA-Z0-9가-힣_.:-]+/g, "_").slice(0, 120);
  return `explain_${safe || "candidate"}`;
}

function sanitizeText(value: unknown, forPrompt = false): string {
  if (typeof value !== "string") return "";
  const sanitized = forPrompt ? sanitizeForAI(value).sanitizedText : sanitizeForStorage(value).sanitizedText;
  const extraSanitized = sanitized
    .replace(/대표자명/g, "[개인명 마스킹]")
    .replace(/대표자\s*[:：]?\s*[가-힣]{2,4}/g, "대표자 [개인명 마스킹]");
  return sanitizeExplanationOutputText(extraSanitized.trim());
}

function sanitizeStringArray(value: unknown, forPrompt = false): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item, forPrompt)).filter((item) => item.length > 0);
}

function clampScore(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function recursiveSanitize(value: unknown, forPrompt = false): unknown {
  if (typeof value === "string") return sanitizeText(value, forPrompt);
  if (Array.isArray(value)) return value.map((item) => recursiveSanitize(item, forPrompt));
  if (value && typeof value === "object") {
    const out: UnknownRecord = {};
    for (const [key, nested] of Object.entries(value as UnknownRecord)) {
      out[sanitizeText(key, forPrompt) || key] = recursiveSanitize(nested, forPrompt);
    }
    return out;
  }
  return value;
}

export function sanitizeExplanationInput(input: unknown): unknown {
  return recursiveSanitize(input, true);
}

function isNegatedNearby(text: string, idx: number, len: number): boolean {
  const before = text.slice(Math.max(0, idx - 60), idx);
  const after = text.slice(idx + len, idx + len + 60);
  return NEGATION_MARKERS.some((marker) => before.includes(marker) || after.includes(marker));
}

export function containsForbiddenExplanationPhrase(text: string): boolean {
  const safe = sanitizeForStorage(String(text ?? "")).sanitizedText;
  for (const phrase of LLM_EXPLANATION_FORBIDDEN_PHRASES) {
    let idx = safe.indexOf(phrase);
    while (idx !== -1) {
      if (!isNegatedNearby(safe, idx, phrase.length)) return true;
      idx = safe.indexOf(phrase, idx + phrase.length);
    }
  }
  return false;
}

export function sanitizeExplanationOutputText(text: string): string {
  let next = sanitizeForStorage(String(text ?? "")).sanitizedText;
  for (const phrase of LLM_EXPLANATION_FORBIDDEN_PHRASES) {
    let idx = next.indexOf(phrase);
    while (idx !== -1) {
      if (!isNegatedNearby(next, idx, phrase.length)) {
        next = next.slice(0, idx) + "검토 후보" + next.slice(idx + phrase.length);
        idx = next.indexOf(phrase);
      } else {
        idx = next.indexOf(phrase, idx + phrase.length);
      }
    }
  }
  return next;
}

function normalizeCandidate(input: unknown): LlmExplanationCandidateInput {
  const safe = sanitizeExplanationInput(input) as UnknownRecord;
  const candidateId =
    sanitizeText(safe.candidateId) ||
    sanitizeText(safe.rewardScoreId) ||
    sanitizeText(safe.scoreId) ||
    sanitizeText(safe.id) ||
    `candidate_${Math.random().toString(36).slice(2, 10)}`;
  // 체크리스트 60 rule-results.json: involvedRecordIds → sourceCandidateIds 로 함께 인식.
  const sourceCandidateIds = sanitizeStringArray(safe.sourceCandidateIds).length
    ? sanitizeStringArray(safe.sourceCandidateIds)
    : sanitizeStringArray(safe.involvedRecordIds);
  const signals = [
    ...sanitizeStringArray(safe.signals),
    ...sanitizeStringArray(safe.riskSignals),
    ...sanitizeStringArray(safe.contributingSignals),
    ...sanitizeStringArray(safe.matchedSignals),
    ...sanitizeStringArray(safe.missingSignals),
    ...sanitizeStringArray(safe.spendingSignals),
    ...sanitizeStringArray(safe.networkSignals),
    ...sanitizeStringArray(safe.suggestedNextCheck)
  ];
  // 체크리스트 60 rule-results.json: evidenceRefs → keyEvidence 근거로 인식.
  const evidenceSummary = sanitizeStringArray(safe.evidenceSummary).length
    ? sanitizeStringArray(safe.evidenceSummary)
    : sanitizeStringArray(safe.evidence).length
      ? sanitizeStringArray(safe.evidence)
      : sanitizeStringArray(safe.evidenceRefs);
  const reasons = sanitizeStringArray(safe.reasons).length
    ? sanitizeStringArray(safe.reasons)
    : [sanitizeText(safe.reason)].filter(Boolean);
  const ruleSummaries = sanitizeStringArray(safe.ruleSummaries).length
    ? sanitizeStringArray(safe.ruleSummaries)
    : inferRuleSummaries(safe);
  return {
    candidateId,
    subjectKey: sanitizeText(safe.subjectKey),
    riskScore: clampScore(safe.riskScore ?? safe.finalRiskScore),
    riskGrade: sanitizeText(safe.riskGrade),
    rewardPossibilityScore: clampScore(safe.rewardPossibilityScore),
    rewardPossibilityLevel: sanitizeText(safe.rewardPossibilityLevel),
    sourceCandidateIds,
    ruleSummaries,
    signals: Array.from(new Set(signals.filter(Boolean))),
    evidenceSummary,
    reasons,
    isFixtureBased: Boolean(safe.isFixtureBased),
    createdAt: sanitizeText(safe.createdAt)
  };
}

function inferRuleSummaries(safe: UnknownRecord): string[] {
  const out: string[] = [];
  // 체크리스트 60 rule-results.json: ruleName/ruleId 를 룰 요약으로 인식.
  const ruleName = sanitizeText(safe.ruleName);
  if (ruleName) out.push(ruleName);
  else if (typeof safe.ruleId === "string" && safe.ruleId) out.push(`${sanitizeText(safe.ruleId)} 룰 검토 후보`);
  if (safe.finalRiskScore !== undefined || safe.riskGrade) out.push("100점 위험점수 결과");
  if (safe.rewardPossibilityScore !== undefined || safe.rewardPossibilityLevel) out.push("보상가능성 점수 결과");
  if (safe.networkKey || Array.isArray(safe.networkSignals)) out.push("계약업체 연관성 탐지 결과");
  if (Array.isArray(safe.spendingSignals)) out.push("예산 집행 이상 패턴 탐지 결과");
  if (Array.isArray(safe.missingSignals)) out.push("결과물 부족/정산 미흡 탐지 결과");
  if (safe.addressGroupKey) out.push("동일 주소 다수 단체 탐지 결과");
  if (Array.isArray(safe.matchedSignals)) out.push("반복 수급 탐지 결과");
  return out;
}

function riskDescriptor(candidate: LlmExplanationCandidateInput): string {
  if (candidate.riskScore === undefined) return "위험점수 정보는 입력에서 확인되지 않았습니다";
  const grade = candidate.riskGrade ? ` ${candidate.riskGrade}등급` : "";
  return `위험점수 ${candidate.riskScore}점${grade}`;
}

export function buildSafeLlmPrompt(input: LlmExplanationCandidateInput, options: LlmExplanationOptions = {}): SafeLlmPromptPayload {
  const candidate = normalizeCandidate(input);
  const userPayload = JSON.stringify(
    {
      candidateId: candidate.candidateId,
      subjectKey: candidate.subjectKey,
      riskScore: candidate.riskScore,
      riskGrade: candidate.riskGrade,
      rewardPossibilityScore: candidate.rewardPossibilityScore,
      rewardPossibilityLevel: candidate.rewardPossibilityLevel,
      ruleSummaries: candidate.ruleSummaries,
      signals: candidate.signals,
      evidenceSummary: candidate.evidenceSummary,
      reasons: candidate.reasons
    },
    null,
    2
  );
  return {
    promptVersion: options.promptVersion ?? "llm-explanation-fallback-v1",
    systemInstruction: sanitizeText(
      "당신은 공개자료 기준의 검토 후보를 설명하는 분석 보조자입니다. 단정 표현을 사용하지 말고 의심 신호, 검토 후보, 추가 확인 필요, 사람 검토 필요로만 설명하세요. AI 설명은 법률 자문, 수사 판단, 기관 심사 판단을 대체하지 않습니다.",
      true
    ),
    userPayload: sanitizeText(userPayload, true),
    safetyRules: [
      "단정 금지",
      "개인정보 원문 제외",
      "공개자료 기준",
      "사람 검토 필요",
      "보상/포상 가능성 검토는 공식 기준 확인 필요"
    ],
    deterministicFallbackOnly: true
  };
}

export function createFallbackSummary(candidate: LlmExplanationCandidateInput): string {
  const reward =
    candidate.rewardPossibilityScore !== undefined
      ? `, 보상/포상 가능성 검토 점수 ${candidate.rewardPossibilityScore}점 ${candidate.rewardPossibilityLevel ?? ""}`.trim()
      : "";
  return sanitizeExplanationOutputText(
    `${riskDescriptor(candidate)}${reward} 및 룰 기반 의심 신호를 공개자료 기준으로 종합한 설명형 검토 후보입니다. 사실관계 확인 필요와 사람 검토 필요가 전제됩니다.`
  );
}

export function createFallbackWhyFlagged(candidate: LlmExplanationCandidateInput): string[] {
  const items = [
    `${riskDescriptor(candidate)}가 확인되어 우선순위 검토 후보로 분류되었습니다.`,
    candidate.ruleSummaries?.length
      ? `${candidate.ruleSummaries.join(", ")}가 함께 입력되어 여러 검토 신호를 종합했습니다.`
      : "룰 기반 탐지 결과의 세부 신호를 추가 확인할 필요가 있습니다.",
    candidate.signals?.length
      ? `주요 의심 신호: ${candidate.signals.slice(0, 8).join(", ")}`
      : "주요 의심 신호는 입력에서 제한적으로 확인되었습니다."
  ];
  return items.map(sanitizeExplanationOutputText);
}

export function createFallbackKeyEvidence(candidate: LlmExplanationCandidateInput): string[] {
  const evidence = candidate.evidenceSummary?.filter(Boolean) ?? [];
  if (evidence.length === 0) {
    return ["공개자료 근거가 충분히 요약되지 않아 원문 URL, 증빙 URL, 정산 자료, 결과보고서 보강이 필요합니다."].map(
      sanitizeExplanationOutputText
    );
  }
  return evidence.slice(0, 8).map((item) => sanitizeExplanationOutputText(`공개자료 기준 근거: ${item}`));
}

export function createFallbackAdditionalChecks(_candidate: LlmExplanationCandidateInput): string[] {
  return [
    "추가 확인 필요: 원문 공고와 선정 결과가 동일 사업을 가리키는지 확인합니다.",
    "정산서, 집행액, 반납 또는 환수 관련 공개자료를 확인합니다.",
    "결과보고서와 결과물 URL 또는 첨부 증빙 존재 여부를 확인합니다.",
    "계약자료와 계약상대자, 계약금액, 계약일자를 공개자료 기준으로 재확인합니다.",
    "기관 기준과 공식 신고 기준을 확인하고 사람 검토 의견을 남깁니다."
  ].map(sanitizeExplanationOutputText);
}

export function createFallbackLimitations(candidate: LlmExplanationCandidateInput): string[] {
  const fixture = candidate.isFixtureBased ? "fixture 기반 검증 입력이므로 실제 데이터 분석 완료로 표현하지 않습니다." : "";
  return [
    "공개자료 기준 설명이므로 비공개자료나 로그인 필요 자료를 근거로 사용하지 않습니다.",
    "점수 모델과 룰 기반 탐지는 검토 우선순위 산출 도구이며 기관 심사 판단을 대체하지 않습니다.",
    "자료 누락은 공개자료에서 확인되지 않음으로만 해석해야 합니다.",
    fixture
  ]
    .filter(Boolean)
    .map(sanitizeExplanationOutputText);
}

export function createFallbackRewardPossibilityNote(candidate: LlmExplanationCandidateInput): string | undefined {
  if (candidate.rewardPossibilityScore === undefined && !candidate.rewardPossibilityLevel) return undefined;
  return sanitizeExplanationOutputText(
    `보상/포상 가능성 검토 참고: ${candidate.rewardPossibilityScore ?? "점수 미확인"}점 ${candidate.rewardPossibilityLevel ?? ""}. 공식 기준과 기관 심사 절차 확인이 필요합니다.`
  );
}

function assertSafeResult(result: LlmExplanationResult): void {
  const blob = JSON.stringify(result);
  if (containsForbiddenExplanationPhrase(blob)) {
    throw new Error("LLM explanation contains forbidden assertive phrase");
  }
  const prompt = sanitizeForAI(blob);
  if (prompt.changed && /010-\d{3,4}-\d{4}|\d{6}-\d{7}|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/.test(prompt.sanitizedText)) {
    throw new Error("LLM explanation contains unsafe personal data");
  }
}

// 체크리스트 25: 섹션별 근거(citation)를 deterministic하게 연결한다.
// keyEvidence는 공개자료 근거(recordId/원문 URL), 점수·신호는 computed_model로 표시한다.
export function buildLlmExplanationClaimCitations(
  candidate: LlmExplanationCandidateInput
): Record<string, CitationReference[]> {
  const fixture = Boolean(candidate.isFixtureBased);
  const recordCites = (candidate.sourceCandidateIds ?? [])
    .filter(Boolean)
    .slice(0, 12)
    .map((id) => recordIdCitation(sanitizeText(id), fixture));
  const urlCites = (candidate.evidenceSummary ?? []).flatMap((item) => extractCitationsFromText(item, fixture));
  return {
    summary: [computedModelCitation(), ...recordCites],
    whyFlagged: [computedModelCitation(), ...recordCites],
    keyEvidence: [...recordCites, ...urlCites],
    riskSignals: [computedModelCitation()],
    rewardPossibilityNote: [computedModelCitation()]
  };
}

export function createFallbackLlmExplanation(
  input: LlmExplanationCandidateInput,
  options: LlmExplanationOptions = {}
): LlmExplanationResult {
  const candidate = normalizeCandidate(input);
  const result: LlmExplanationResult = {
    explanationId: createLlmExplanationId(candidate.candidateId),
    candidateId: candidate.candidateId,
    subjectKey: candidate.subjectKey,
    summary: createFallbackSummary(candidate),
    whyFlagged: createFallbackWhyFlagged(candidate),
    keyEvidence: createFallbackKeyEvidence(candidate),
    riskSignals: (candidate.signals ?? []).slice(0, 20).map(sanitizeExplanationOutputText),
    rewardPossibilityNote: createFallbackRewardPossibilityNote(candidate),
    additionalChecks: createFallbackAdditionalChecks(candidate),
    limitations: createFallbackLimitations(candidate),
    safetyDisclaimers: [...LLM_EXPLANATION_SAFETY_DISCLAIMERS].map(sanitizeExplanationOutputText),
    reviewRequired: true,
    notLegalConclusion: true,
    rewardGuaranteed: false,
    createdAt: candidate.createdAt ?? new Date(0).toISOString(),
    isFixtureBased: Boolean(options.isFixtureBased || candidate.isFixtureBased),
    sourceCandidateIds: candidate.sourceCandidateIds,
    claimCitations: buildLlmExplanationClaimCitations(candidate)
  };
  assertSafeResult(result);
  return result;
}

// 체크리스트 25: LLM 설명형 리포트의 핵심 주장에 근거가 연결됐는지 검증한다.
export function validateLlmExplanationReportCitations(
  report: LlmExplanationReport,
  mode: CitationValidationMode = "warning"
): CitationValidationReport {
  const claims = report.explanations.flatMap((explanation) => extractClaimsFromLlmExplanationResult(explanation));
  return validateReportCitations(claims, {
    mode,
    isFixtureBased: report.isFixtureBased,
    reportId: `${report.runId}_citation`
  });
}

export function generateLlmExplanationReport(
  inputs: unknown[],
  options: LlmExplanationOptions = {}
): LlmExplanationReport {
  const runId = options.runId ?? createLlmExplanationRunId();
  const candidates = inputs.map(normalizeCandidate);
  const explanations = candidates
    .slice(0, options.limit ?? 50)
    .map((candidate) => createFallbackLlmExplanation(candidate, { ...options, runId }));
  const isFixtureBased = Boolean(options.isFixtureBased || candidates.some((candidate) => candidate.isFixtureBased));
  const notes = [
    "LLM 설명형 분석 요약은 deterministic fallback 분석기로 생성되었습니다.",
    "실제 LLM API 호출은 수행하지 않았으며 API 키를 사용하지 않습니다.",
    "결과는 공개자료 기준 설명형 검토 보조이며 확정 판단이 아닙니다.",
    "AI 설명은 법률 자문, 수사 판단, 기관 심사 판단을 대체하지 않습니다.",
    isFixtureBased ? "fixture 기반 검증입니다. 실제 데이터 분석 완료로 표현하지 않습니다." : "입력 리포트 기반 설명형 분석입니다."
  ].map(sanitizeExplanationOutputText);
  return {
    runId,
    totalInputCandidates: candidates.length,
    totalExplanations: explanations.length,
    explanations,
    createdAt: new Date().toISOString(),
    notes,
    isFixtureBased,
    sourceNote: options.sourceNote
  };
}

export function renderLlmExplanationReportMarkdown(report: LlmExplanationReport): string {
  const lines: string[] = [];
  lines.push(`# LLM 설명형 분석 요약 - ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.createdAt}`);
  lines.push(`- 입력 후보: ${report.totalInputCandidates}`);
  lines.push(`- 설명 결과: ${report.totalExplanations}`);
  lines.push(`- 데이터 구분: ${report.isFixtureBased ? "fixture 기반 검증" : "입력 리포트 기반"}`);
  lines.push("");
  lines.push("> 본 리포트는 설명형 검토 보조 자료이며 단정 표현 없이 사람 검토 필요를 전제로 합니다.");
  lines.push("");
  for (const explanation of report.explanations) {
    lines.push(`## ${explanation.candidateId}`);
    lines.push("");
    lines.push(`- summary: ${explanation.summary}`);
    lines.push(`- whyFlagged: ${explanation.whyFlagged.join(" / ")}`);
    lines.push(`- keyEvidence: ${explanation.keyEvidence.join(" / ")}`);
    if (explanation.rewardPossibilityNote) lines.push(`- rewardPossibilityNote: ${explanation.rewardPossibilityNote}`);
    lines.push(`- additionalChecks: ${explanation.additionalChecks.join(" / ")}`);
    lines.push(`- reviewRequired: ${explanation.reviewRequired}`);
    lines.push("");
  }
  lines.push("## 주의");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${note}`);
  const rendered = sanitizeExplanationOutputText(lines.join("\n"));
  if (containsForbiddenExplanationPhrase(rendered)) throw new Error("Markdown report contains forbidden phrase");
  return rendered;
}

/** 체크리스트 63 metadata.json 본문. */
export function buildLlmExplanationMetadata(report: LlmExplanationReport): Record<string, unknown> {
  return {
    runId: report.runId,
    createdAt: report.createdAt,
    totalInputCandidates: report.totalInputCandidates,
    totalExplanations: report.totalExplanations,
    isFixtureBased: report.isFixtureBased,
    sourceNote: report.sourceNote,
    deterministicFallbackOnly: true,
    llmApiCalled: false,
    reviewRequired: true,
    notLegalConclusion: true,
    rewardGuaranteed: false,
    notice: LLM_EXPLANATION_NOTICE
  };
}

export async function writeLlmExplanationReport(
  outputDir: string,
  report: LlmExplanationReport,
  options: { strictCitationValidation?: boolean } = {}
): Promise<{
  reportJsonFile: string;
  reportMdFile: string;
  summaryMdFile: string;
  metadataFile: string;
  citationValidation: CitationValidationReport;
}> {
  // 체크리스트 25: 리포트 생성 전 근거 검증 게이트.
  // 기본은 non-strict(warning)로 시작하되, strict일 때 핵심 주장 근거가 없으면 생성을 중단한다.
  const mode: CitationValidationMode = options.strictCitationValidation ? "strict" : "warning";
  const citationValidation = validateLlmExplanationReportCitations(report, mode);
  if (options.strictCitationValidation && citationValidation.status === "fail") {
    throw new Error(
      `LLM explanation citation validation failed: ${citationValidation.missingClaims} core claim(s) missing public citation (근거 보강 필요)`
    );
  }

  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "llm-explanation-report.json");
  const reportMdFile = path.join(runDir, "llm-explanation-report.md");
  const summaryMdFile = path.join(runDir, "llm-explanation-summary.md");
  const metadataFile = path.join(runDir, "metadata.json");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  const markdown = renderLlmExplanationReportMarkdown(report);
  await writeFile(reportMdFile, markdown, "utf8");
  // 체크리스트 63: llm-explanation-summary.md 및 metadata.json 추가 산출.
  await writeFile(summaryMdFile, markdown, "utf8");
  await writeFile(metadataFile, JSON.stringify(buildLlmExplanationMetadata(report), null, 2), "utf8");
  return { reportJsonFile, reportMdFile, summaryMdFile, metadataFile, citationValidation };
}

export { LLM_EXPLANATION_NOTICE, LLM_EXPLANATION_RECOMMENDED_PHRASES };
