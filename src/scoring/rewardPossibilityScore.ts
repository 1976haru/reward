import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import {
  REWARD_FORBIDDEN_CLAIM_PHRASES,
  REWARD_POSSIBILITY_LEVEL_THRESHOLDS,
  REWARD_POSSIBILITY_SCORE_NOTICE,
  REWARD_SCORE_COMPONENT_WEIGHTS,
  RewardPossibilityInputCandidate,
  RewardPossibilityLevel,
  RewardPossibilityScoreOptions,
  RewardPossibilityScoreReport,
  RewardPossibilityScoreResult,
  RewardPossibilitySourceType,
  RewardScoreBreakdown,
  RewardScoreComponent,
  RewardScoreContribution,
  SUBSIDY_RULE_ID_TO_REWARD_SOURCE,
  REWARD_SEVERITY_TO_SCORE
} from "../types/rewardPossibilityScore.js";

type UnknownCandidate = Partial<RewardPossibilityInputCandidate> & Record<string, unknown>;

const SCORE_FIELDS: Array<keyof RewardScoreBreakdown> = [
  "recoveryPossibilityScore",
  "lossPreventionScore",
  "evidenceClarityScore",
  "legalFitScore"
];

const COMPONENT_TO_FIELD: Record<RewardScoreComponent, keyof RewardScoreBreakdown> = {
  recovery_possibility: "recoveryPossibilityScore",
  loss_prevention: "lossPreventionScore",
  evidence_clarity: "evidenceClarityScore",
  legal_fit: "legalFitScore"
};

const FIELD_TO_COMPONENT: Record<keyof RewardScoreBreakdown, RewardScoreComponent | undefined> = {
  recoveryPossibilityScore: "recovery_possibility",
  lossPreventionScore: "loss_prevention",
  evidenceClarityScore: "evidence_clarity",
  legalFitScore: "legal_fit",
  totalBeforeClamp: undefined,
  rewardPossibilityScore: undefined
};

const DEFAULT_DISCLAIMERS = [
  "보상/포상 여부는 법령, 기관 심사, 신고 내용, 환수 여부, 공익 기여도, 신고자 요건 등에 따라 달라집니다.",
  "본 결과는 참고용이며 법률 자문이나 기관 판단을 대체하지 않습니다.",
  "공식 기준과 기관 심사 절차 확인이 필요하며 자동 신고를 수행하지 않습니다."
];

export function createRewardScoreRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `reward_score_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clampRewardScore100(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRewardPossibilityLevel(score: number): RewardPossibilityLevel {
  const s = clampRewardScore100(score);
  if (s >= REWARD_POSSIBILITY_LEVEL_THRESHOLDS.High) return "High";
  if (s >= REWARD_POSSIBILITY_LEVEL_THRESHOLDS.Medium) return "Medium";
  return "Low";
}

function safeText(v: unknown): string | undefined {
  if (typeof v !== "string" || v.trim().length === 0) return undefined;
  const sanitized = sanitizeForStorage(v).sanitizedText.trim();
  return sanitized.length > 0 ? sanitized : undefined;
}

function safeKey(v: unknown): string | undefined {
  const s = safeText(v);
  if (!s) return undefined;
  return s.replace(/[^a-zA-Z0-9가-힣_|:.-]+/g, "_").slice(0, 140);
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeText(x)).filter((x): x is string => !!x);
}

function asNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function idsFromCandidate(c: UnknownCandidate): string[] {
  const ids = new Set<string>();
  for (const key of ["recordIds", "involvedRecordIds", "involvedContractIds", "sourceCandidateIds"] as const) {
    for (const id of stringArray(c[key])) ids.add(id);
  }
  for (const key of ["recordId", "subsidyRecordId", "candidateId"] as const) {
    const id = safeText(c[key]);
    if (id) ids.add(id);
  }
  const evidence = c.evidence as unknown;
  if (evidence && typeof evidence === "object") {
    const list = Array.isArray(evidence) ? evidence : [evidence];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      for (const key of ["id", "recordId", "subsidyRecordId", "contractRecordId"] as const) {
        const id = safeText(obj[key]);
        if (id) ids.add(id);
      }
    }
  }
  return Array.from(ids).sort();
}

function inferSourceType(c: UnknownCandidate): RewardPossibilitySourceType {
  if (c.sourceType) return c.sourceType as RewardPossibilitySourceType;
  // 체크리스트 60 룰 5종 결과(ruleId) 매핑 — rule-results.json 직접 입력 지원.
  const ruleId = typeof c.ruleId === "string" ? c.ruleId : undefined;
  if (ruleId && SUBSIDY_RULE_ID_TO_REWARD_SOURCE[ruleId]) return SUBSIDY_RULE_ID_TO_REWARD_SOURCE[ruleId];
  if (c.riskGrade || c.finalRiskScore !== undefined || c.scoreBreakdown) return "risk_score";
  if (Array.isArray(c.networkSignals) || c.networkKey) return "contractor_network";
  if (Array.isArray(c.spendingSignals) || c.spendingBreakdownSummary) return "spending_anomaly";
  if (Array.isArray(c.missingSignals)) return "output_settlement";
  if (Array.isArray(c.matchedSignals) && c.addressGroupKey) return "address_cluster";
  if (Array.isArray(c.matchedSignals)) return "repeat_subsidy";
  if (c.ruleType === "repeat_subsidy" || c.ruleType === "address_cluster" || c.ruleType === "output_settlement") {
    return c.ruleType as RewardPossibilitySourceType;
  }
  if (c.ruleType === "spending_anomaly" || c.ruleType === "contractor_network") return c.ruleType as RewardPossibilitySourceType;
  return "manual";
}

function extractSignals(c: UnknownCandidate): string[] {
  const raw = [
    ...stringArray(c.rewardSignals),
    ...stringArray(c.signals),
    ...stringArray(c.matchedSignals),
    ...stringArray(c.missingSignals),
    ...stringArray(c.spendingSignals),
    ...stringArray(c.networkSignals),
    ...stringArray(c.contributingSignals)
  ];
  for (const key of ["riskGrade", "riskLevel", "rewardPossibilityLevel"] as const) {
    const v = safeText(c[key]);
    if (v) raw.push(`${key}:${v}`);
  }
  if (c.sourceUrl) raw.push("sourceUrlPresent");
  if (c.evidenceUrl) raw.push("evidenceUrlPresent");
  return Array.from(new Set(raw));
}

function extractAmountInfo(c: UnknownCandidate): RewardPossibilityInputCandidate["amountInfo"] {
  const amountInfo = c.amountInfo && typeof c.amountInfo === "object" ? (c.amountInfo as Record<string, unknown>) : {};
  return {
    subsidyAmount: asNumber(amountInfo.subsidyAmount ?? c.subsidyAmount),
    contractAmount: asNumber(amountInfo.contractAmount ?? c.contractAmount),
    executionAmount: asNumber(amountInfo.executionAmount ?? c.executionAmount),
    returnAmount: asNumber(amountInfo.returnAmount ?? c.returnAmount ?? c.recoveredAmount),
    currency: safeText(amountInfo.currency ?? c.currency)
  };
}

export function inferRewardSubjectKey(candidate: RewardPossibilityInputCandidate): string {
  const direct = safeKey(candidate.subjectKey);
  if (direct) return direct;
  const firstRecord = candidate.recordIds[0] ? safeKey(candidate.recordIds[0]) : undefined;
  if (firstRecord) return `record:${firstRecord}`;
  return `candidate:${safeKey(candidate.candidateId) ?? "unknown"}`;
}

export function normalizeRewardInputCandidate(input: unknown): RewardPossibilityInputCandidate {
  const c = (input ?? {}) as UnknownCandidate;
  const candidateId =
    safeText(c.candidateId) ??
    safeText(c.rewardScoreId) ??
    safeText(c.scoreId) ??
    safeText(c.id) ??
    `reward_candidate_${Math.random().toString(36).slice(2, 10)}`;
  const recordIds = idsFromCandidate(c);
  // 체크리스트 60 룰 결과는 severity 만 가질 수 있다 → 보조 점수로 환산.
  const severity = typeof c.severity === "string" ? c.severity.toLowerCase() : undefined;
  const severityScore = severity ? REWARD_SEVERITY_TO_SCORE[severity] : undefined;
  const riskScore = asNumber(c.riskScore ?? c.finalRiskScore ?? c.rewardPossibilityScore ?? severityScore);
  const normalized: RewardPossibilityInputCandidate = {
    candidateId,
    sourceType: inferSourceType(c),
    riskScore: riskScore === undefined ? undefined : clampRewardScore100(riskScore),
    riskGrade: safeText(c.riskGrade),
    riskLevel: safeText(c.riskLevel),
    rewardSignals: extractSignals(c),
    recordIds,
    subjectKey: safeKey(c.subjectKey ?? c.groupKey ?? c.addressGroupKey ?? c.networkKey),
    amountInfo: extractAmountInfo(c),
    evidence: c.evidence ?? c.evidenceSummary ?? {},
    reason: safeText(c.reason),
    createdAt: safeText(c.createdAt ?? c.generatedAt),
    isFixtureBased: Boolean(c.isFixtureBased)
  };
  normalized.subjectKey = inferRewardSubjectKey(normalized);
  return normalized;
}

export function groupRewardCandidatesBySubject(
  candidates: RewardPossibilityInputCandidate[]
): Map<string, RewardPossibilityInputCandidate[]> {
  const groups = new Map<string, RewardPossibilityInputCandidate[]>();
  for (const candidate of candidates) {
    const key = inferRewardSubjectKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return groups;
}

function textFor(candidate: RewardPossibilityInputCandidate): string {
  return `${candidate.sourceType} ${candidate.rewardSignals?.join(" ") ?? ""} ${candidate.reason ?? ""}`;
}

function hasSignal(candidate: RewardPossibilityInputCandidate, patterns: RegExp[]): boolean {
  const text = textFor(candidate);
  return patterns.some((pattern) => pattern.test(text));
}

function evidenceText(candidate: RewardPossibilityInputCandidate): string {
  return JSON.stringify(candidate.evidence ?? {});
}

function hasEvidence(candidate: RewardPossibilityInputCandidate, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(`${textFor(candidate)} ${evidenceText(candidate)}`));
}

function weighted(candidate: RewardPossibilityInputCandidate, component: RewardScoreComponent, ratio: number): number {
  const cap = REWARD_SCORE_COMPONENT_WEIGHTS[component];
  const base = candidate.riskScore === undefined ? cap : (candidate.riskScore / 100) * cap;
  return Math.min(cap, Math.max(1, base * ratio));
}

function contribution(
  candidate: RewardPossibilityInputCandidate,
  component: RewardScoreComponent,
  score: number,
  signal: string
): RewardScoreContribution {
  return {
    component,
    score: Math.round(score * 10) / 10,
    sourceCandidateId: candidate.candidateId,
    sourceType: candidate.sourceType,
    signal
  };
}

function addContribution(
  out: RewardScoreContribution[],
  candidate: RewardPossibilityInputCandidate,
  component: RewardScoreComponent,
  signal: string,
  ratio: number
): void {
  out.push(contribution(candidate, component, weighted(candidate, component, ratio), signal));
}

export function mapCandidateToRewardComponents(candidate: RewardPossibilityInputCandidate): RewardScoreContribution[] {
  const out: RewardScoreContribution[] = [];
  const amount = candidate.amountInfo ?? {};
  const hasAmount = Boolean(amount.subsidyAmount || amount.contractAmount || amount.executionAmount || amount.returnAmount);
  const evidencePresent = hasEvidence(candidate, [/sourceUrlPresent|evidenceUrlPresent|attachmentPresent|sourceUrl|evidenceUrl|attachment/i]);

  if (candidate.sourceType === "output_settlement") {
    addContribution(out, candidate, "recovery_possibility", "settlementIssueSignal", 0.75);
    addContribution(out, candidate, "evidence_clarity", "settlementDocumentPresent", evidencePresent ? 0.8 : 0.45);
    if (hasSignal(candidate, [/returnAmountPresent|returnAmount|환수|반납/i])) addContribution(out, candidate, "recovery_possibility", "returnAmountPresent", 0.55);
    if (hasSignal(candidate, [/resultReportPresent|resultReport|결과보고/i])) addContribution(out, candidate, "evidence_clarity", "resultReportPresent", 0.45);
  } else if (candidate.sourceType === "spending_anomaly") {
    addContribution(out, candidate, "recovery_possibility", "spendingSettlementReview", 0.8);
    if (hasAmount) addContribution(out, candidate, "recovery_possibility", "clearSubsidyAmount", 0.4);
    if (hasSignal(candidate, [/largeSubsidyAmount|high.*Amount|amount|금액/i])) addContribution(out, candidate, "loss_prevention", "largeSubsidyAmount", 0.4);
  } else if (candidate.sourceType === "repeat_subsidy") {
    addContribution(out, candidate, "recovery_possibility", hasAmount ? "repeatedPatternWithAmount" : "repeatedRecipientPattern", hasAmount ? 0.65 : 0.45);
    addContribution(out, candidate, "loss_prevention", "repeatedRecipientPattern", 0.55);
  } else if (candidate.sourceType === "address_cluster") {
    addContribution(out, candidate, "loss_prevention", "addressClusterPattern", 0.75);
    if (hasAmount) addContribution(out, candidate, "loss_prevention", "largeSubsidyAmount", 0.35);
  } else if (candidate.sourceType === "contractor_network") {
    addContribution(out, candidate, "loss_prevention", "contractorNetworkPattern", 0.7);
    addContribution(out, candidate, "evidence_clarity", evidencePresent ? "evidenceUrlPresent" : "contractorNetworkReviewSignal", evidencePresent ? 0.65 : 0.35);
  } else if (candidate.sourceType === "similar_project") {
    // 체크리스트 60 룰 E(사업명 유사 반복) — 반복 신청 환수/손실방지 검토 후보.
    addContribution(out, candidate, "loss_prevention", "similarProjectRepeatPattern", 0.6);
    addContribution(out, candidate, "recovery_possibility", "similarProjectReviewSignal", 0.4);
    addContribution(out, candidate, "legal_fit", "officialCriteriaReviewNeeded", 0.3);
  } else if (candidate.sourceType === "risk_score") {
    const highRisk = candidate.riskGrade === "A" || (candidate.riskScore ?? 0) >= 80;
    const mediumRisk = candidate.riskGrade === "B" || (candidate.riskScore ?? 0) >= 60;
    if (highRisk) {
      addContribution(out, candidate, "recovery_possibility", "highRiskScoreReference", 0.45);
      addContribution(out, candidate, "loss_prevention", "highRiskScoreReference", 0.45);
      addContribution(out, candidate, "legal_fit", "officialCriteriaReviewNeeded", 0.55);
    } else if (mediumRisk) {
      addContribution(out, candidate, "recovery_possibility", "mediumRiskScoreReference", 0.3);
      addContribution(out, candidate, "legal_fit", "officialCriteriaReviewNeeded", 0.35);
    } else {
      addContribution(out, candidate, "legal_fit", "officialCriteriaReviewNeeded", 0.25);
    }
  } else {
    addContribution(out, candidate, "legal_fit", "manualOfficialCriteriaReview", 0.3);
  }

  if (hasSignal(candidate, [/ongoingOrRecentProject|futurePaymentRisk|recent|진행|향후/i])) {
    addContribution(out, candidate, "loss_prevention", "ongoingOrRecentProject", 0.4);
  }
  if (hasSignal(candidate, [/multipleIndependentSources/i])) {
    addContribution(out, candidate, "evidence_clarity", "multipleIndependentSources", 0.45);
  }
  if (hasSignal(candidate, [/sourceUrlPresent/i])) {
    addContribution(out, candidate, "evidence_clarity", "sourceUrlPresent", 0.25);
  }
  if (hasSignal(candidate, [/evidenceUrlPresent/i])) {
    addContribution(out, candidate, "evidence_clarity", "evidenceUrlPresent", 0.35);
  }
  if (hasSignal(candidate, [/attachmentPresent/i])) {
    addContribution(out, candidate, "evidence_clarity", "attachmentPresent", 0.25);
  }
  if (!hasAmount && hasSignal(candidate, [/missingAmountInfo|amountMissing|금액 부족/i])) {
    out.push(contribution(candidate, "recovery_possibility", -5, "missingAmountInfo"));
  }

  return out;
}

function emptyBreakdown(): RewardScoreBreakdown {
  return {
    recoveryPossibilityScore: 0,
    lossPreventionScore: 0,
    evidenceClarityScore: 0,
    legalFitScore: 0,
    totalBeforeClamp: 0,
    rewardPossibilityScore: 0
  };
}

export function mergeRewardScoreBreakdowns(
  breakdowns: RewardScoreBreakdown[],
  options: RewardPossibilityScoreOptions = {}
): RewardScoreBreakdown {
  const strategy = options.mergeStrategy ?? "capped_sum";
  const merged = emptyBreakdown();
  for (const field of SCORE_FIELDS) {
    const component = FIELD_TO_COMPONENT[field]!;
    const cap = REWARD_SCORE_COMPONENT_WEIGHTS[component];
    const values = breakdowns.map((b) => Number(b[field]) || 0);
    const next = strategy === "max" ? Math.max(0, ...values) : values.reduce((sum, v) => sum + v, 0);
    merged[field] = Math.max(0, Math.min(cap, Math.round(next * 10) / 10));
  }
  merged.totalBeforeClamp = Math.round(SCORE_FIELDS.reduce((sum, field) => sum + Number(merged[field]), 0) * 10) / 10;
  merged.rewardPossibilityScore = clampRewardScore100(merged.totalBeforeClamp);
  return merged;
}

function breakdownFromContributions(contributions: RewardScoreContribution[]): RewardScoreBreakdown {
  const b = emptyBreakdown();
  for (const c of contributions) {
    const field = COMPONENT_TO_FIELD[c.component];
    b[field] = Math.round((Number(b[field]) + c.score) * 10) / 10;
  }
  b.totalBeforeClamp = Math.round(SCORE_FIELDS.reduce((sum, field) => sum + Number(b[field]), 0) * 10) / 10;
  b.rewardPossibilityScore = clampRewardScore100(b.totalBeforeClamp);
  return b;
}

export function sanitizeRewardText(text: string): string {
  let next = sanitizeForStorage(text).sanitizedText;
  for (const phrase of REWARD_FORBIDDEN_CLAIM_PHRASES) {
    next = next.split(phrase).join("기관 기준 확인 필요");
  }
  return next;
}

function evidenceSummaryFor(candidates: RewardPossibilityInputCandidate[]): string[] {
  return candidates.slice(0, 12).map((candidate) => {
    const ids = candidate.recordIds.slice(0, 3).join(",");
    const source = `${candidate.sourceType}:${candidate.candidateId}${ids ? ` records=${ids}` : ""}`;
    return sanitizeRewardText(source);
  });
}

export function createRewardScoreReason(result: Pick<RewardPossibilityScoreResult, "rewardPossibilityLevel" | "scoreBreakdown">): string {
  if (result.rewardPossibilityLevel === "High") {
    return sanitizeRewardText("환수 가능성, 손실방지 가능성, 증거 명확성 신호가 함께 확인되어 보상/포상 가능성 검토 우선순위 High로 분류되었습니다. 공식 기준과 기관 심사 절차 확인이 필요합니다.");
  }
  if (result.rewardPossibilityLevel === "Medium") {
    return sanitizeRewardText("일부 보상/포상 가능성 검토 신호가 확인되어 추가 확인 필요 Medium으로 분류되었습니다. 증거 보강과 공식 기준 확인이 필요합니다.");
  }
  return sanitizeRewardText("자료 부족 또는 제한적인 신호로 인해 보상/포상 가능성 낮은 우선순위 Low로 분류되었습니다. 기관 기준 확인 필요 상태입니다.");
}

export function calculateRewardScoreForSubject(
  subjectKey: string,
  candidates: RewardPossibilityInputCandidate[],
  options: RewardPossibilityScoreOptions = {}
): RewardPossibilityScoreResult {
  const allContributions = candidates.flatMap(mapCandidateToRewardComponents);
  const perCandidate = candidates.map((candidate) => breakdownFromContributions(mapCandidateToRewardComponents(candidate)));
  const merged = mergeRewardScoreBreakdowns(perCandidate, options);
  const level = getRewardPossibilityLevel(merged.rewardPossibilityScore);
  const normalizedSubject = safeKey(subjectKey) ?? "subject:unknown";
  const resultBase: RewardPossibilityScoreResult = {
    rewardScoreId: `${options.runId ?? "run"}_${safeKey(subjectKey) ?? "subject"}`,
    candidateId: normalizedSubject,
    subjectKey: normalizedSubject,
    sourceCandidateIds: Array.from(new Set(candidates.map((c) => c.candidateId))).sort(),
    rewardPossibilityScore: merged.rewardPossibilityScore,
    rewardPossibilityLevel: level,
    scoreBreakdown: merged,
    contributingSignals: allContributions.filter((c) => merged[COMPONENT_TO_FIELD[c.component]] > 0),
    evidenceSummary: evidenceSummaryFor(candidates),
    reason: "",
    nextChecks: [
      "공식 신고 기준(환수·처분·신고자 요건 등) 적용 여부를 기관에 확인",
      "신고 전 사실관계·증빙 추가 확인(다음 단계의 신고 전 사실점검)",
      "근거자료(공시 URL·결과물·정산)가 충분한지 사람 검토"
    ],
    disclaimers: DEFAULT_DISCLAIMERS.map(sanitizeRewardText),
    rewardGuaranteed: false,
    reviewRequired: true,
    notLegalConclusion: true,
    createdAt: new Date().toISOString(),
    isFixtureBased: Boolean(options.isFixtureBased || candidates.some((c) => c.isFixtureBased))
  };
  return { ...resultBase, reason: createRewardScoreReason(resultBase) };
}

export function generateRewardPossibilityScoreReport(
  inputs: unknown[],
  options: RewardPossibilityScoreOptions = {}
): RewardPossibilityScoreReport {
  const runId = options.runId ?? createRewardScoreRunId();
  const candidates = inputs.map(normalizeRewardInputCandidate);
  const groups = groupRewardCandidatesBySubject(candidates);
  const results = Array.from(groups.entries()).map(([subjectKey, group]) =>
    calculateRewardScoreForSubject(subjectKey, group, { ...options, runId })
  );
  results.sort((a, b) => {
    if (b.rewardPossibilityScore !== a.rewardPossibilityScore) return b.rewardPossibilityScore - a.rewardPossibilityScore;
    return a.subjectKey.localeCompare(b.subjectKey);
  });
  const topScores = results.slice(0, options.limit ?? 50);
  const levelSummary: Record<RewardPossibilityLevel, number> = { High: 0, Medium: 0, Low: 0 };
  for (const result of results) levelSummary[result.rewardPossibilityLevel] += 1;
  const isFixtureBased = Boolean(options.isFixtureBased || candidates.some((c) => c.isFixtureBased));
  const notes = [
    "결과는 보상/포상 가능성 검토 후보와 추가 확인 필요 후보를 정렬하기 위한 보조 점수입니다.",
    "High/Medium/Low는 공식 기준과 기관 심사 절차를 대체하지 않습니다.",
    "점수 항목별 근거는 scoreBreakdown과 contributingSignals에 포함됩니다.",
    "개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 report에 넣지 않습니다.",
    "clean.go.kr 등 공식 안내는 사람 검토 단계에서 최신 기준을 확인해야 합니다."
  ].map(sanitizeRewardText);
  if (isFixtureBased) notes.push("fixture 기반 검증 결과이며 실제 보상/포상 가능성 검토 완료로 표현하지 않습니다.");
  return {
    runId,
    totalInputCandidates: candidates.length,
    totalScoredSubjects: results.length,
    levelSummary,
    topScores,
    createdAt: new Date().toISOString(),
    notes,
    isFixtureBased,
    sourceNote: options.sourceNote ?? (isFixtureBased ? "fixture-synthetic" : "input-risk-reports")
  };
}

export function renderRewardPossibilityScoreReportMarkdown(report: RewardPossibilityScoreReport): string {
  const lines: string[] = [];
  lines.push(`# 보상/포상 가능성 검토 점수 TOP ${Math.min(report.topScores.length, 50)} - ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.createdAt}`);
  lines.push(`- 입력 후보: ${report.totalInputCandidates} / 점수화 subject: ${report.totalScoredSubjects}`);
  lines.push(`- 등급 요약: High ${report.levelSummary.High}, Medium ${report.levelSummary.Medium}, Low ${report.levelSummary.Low}`);
  lines.push(`- 데이터 구분: ${report.isFixtureBased ? "fixture 기반 검증" : "입력 risk report"} / ${report.sourceNote}`);
  lines.push("");
  lines.push("> 본 결과는 보상/포상 가능성 검토 우선순위이며, 공식 기준과 기관 심사 절차 확인이 필요합니다. 자동 신고를 수행하지 않습니다.");
  lines.push("");
  lines.push("| 순위 | rewardPossibilityScore | rewardPossibilityLevel | subjectKey | scoreBreakdown | reason |");
  lines.push("|---:|---:|---|---|---|---|");
  report.topScores.forEach((result, index) => {
    const b = result.scoreBreakdown;
    const breakdown = `recovery=${b.recoveryPossibilityScore}, loss=${b.lossPreventionScore}, evidence=${b.evidenceClarityScore}, legal=${b.legalFitScore}`;
    lines.push(
      `| ${index + 1} | ${result.rewardPossibilityScore} | ${result.rewardPossibilityLevel} | ${result.subjectKey} | ${breakdown} | ${sanitizeRewardText(result.reason)} |`
    );
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${sanitizeRewardText(note)}`);
  return sanitizeRewardText(lines.join("\n"));
}

/** 체크리스트 62 metadata.json 본문. */
export function buildRewardScoreMetadata(report: RewardPossibilityScoreReport): Record<string, unknown> {
  return {
    runId: report.runId,
    createdAt: report.createdAt,
    totalInputCandidates: report.totalInputCandidates,
    totalScoredSubjects: report.totalScoredSubjects,
    levelSummary: report.levelSummary,
    isFixtureBased: report.isFixtureBased,
    sourceNote: report.sourceNote,
    topN: report.topScores.length,
    rewardGuaranteed: false,
    notice: REWARD_POSSIBILITY_SCORE_NOTICE
  };
}

export async function writeRewardPossibilityScoreReport(
  outputDir: string,
  report: RewardPossibilityScoreReport
): Promise<{ reportJsonFile: string; reportMdFile: string; summaryMdFile: string; metadataFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "reward-possibility-score-report.json");
  const reportMdFile = path.join(runDir, "reward-possibility-score-report.md");
  const summaryMdFile = path.join(runDir, "reward-score-summary.md");
  const metadataFile = path.join(runDir, "metadata.json");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  const markdown = renderRewardPossibilityScoreReportMarkdown(report);
  await writeFile(reportMdFile, markdown, "utf8");
  // 체크리스트 62: reward-score-summary.md 및 metadata.json 추가 산출.
  await writeFile(summaryMdFile, markdown, "utf8");
  await writeFile(metadataFile, JSON.stringify(buildRewardScoreMetadata(report), null, 2), "utf8");
  return { reportJsonFile, reportMdFile, summaryMdFile, metadataFile };
}

export { REWARD_POSSIBILITY_SCORE_NOTICE };
