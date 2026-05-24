import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import {
  RISK_GRADE_THRESHOLDS,
  RISK_SCORE_COMPONENT_WEIGHTS,
  RISK_SCORE_MODEL_NOTICE,
  RiskGrade,
  RiskScoreBreakdown,
  RiskScoreComponent,
  RiskScoreContribution,
  RiskScoreModelOptions,
  RiskScoreReport,
  RiskScoreResult,
  UnifiedRiskInputCandidate,
  UnifiedRiskRuleType
} from "../types/riskScoreModel.js";

type UnknownCandidate = Partial<UnifiedRiskInputCandidate> & Record<string, unknown>;

const SCORE_FIELDS: Array<keyof RiskScoreBreakdown> = [
  "repetitionScore",
  "amountScore",
  "growthScore",
  "outputScore",
  "addressScore",
  "settlementScore",
  "contractorScore",
  "evidenceScore"
];

const COMPONENT_TO_FIELD: Record<RiskScoreComponent, keyof RiskScoreBreakdown> = {
  repetition: "repetitionScore",
  amount: "amountScore",
  growth: "growthScore",
  output: "outputScore",
  address: "addressScore",
  settlement: "settlementScore",
  contractor: "contractorScore",
  evidence: "evidenceScore"
};

export function createRiskScoreRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `risk_score_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clampRiskScore100(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getRiskGrade(score: number): RiskGrade {
  const s = clampRiskScore100(score);
  if (s >= RISK_GRADE_THRESHOLDS.A) return "A";
  if (s >= RISK_GRADE_THRESHOLDS.B) return "B";
  return "C";
}

function safeText(v: unknown): string | undefined {
  if (typeof v !== "string" || v.trim().length === 0) return undefined;
  const sanitized = sanitizeForStorage(v).sanitizedText.trim();
  return sanitized.length > 0 ? sanitized : undefined;
}

function safeKey(v: unknown): string | undefined {
  const s = safeText(v);
  if (!s) return undefined;
  return s.replace(/[^a-zA-Z0-9가-힣:_|.-]+/g, "_").slice(0, 140);
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => safeText(x)).filter((x): x is string => !!x);
}

function idsFromCandidate(c: UnknownCandidate): string[] {
  const ids = new Set<string>();
  for (const key of ["recordIds", "involvedRecordIds", "involvedContractIds"] as const) {
    for (const id of stringArray(c[key])) ids.add(id);
  }
  for (const key of ["recordId", "subsidyRecordId"] as const) {
    const id = safeText(c[key]);
    if (id) ids.add(id);
  }
  const evidence = c.evidence as unknown;
  if (evidence && typeof evidence === "object") {
    const list = Array.isArray(evidence) ? evidence : [evidence];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      for (const key of ["id", "subsidyRecordId", "recordId"] as const) {
        const id = safeText(obj[key]);
        if (id) ids.add(id);
      }
      for (const side of ["left", "right"] as const) {
        const nested = obj[side];
        if (nested && typeof nested === "object") {
          const id = safeText((nested as Record<string, unknown>).id);
          if (id) ids.add(id);
        }
      }
    }
  }
  return Array.from(ids).sort();
}

function inferRuleType(c: UnknownCandidate): UnifiedRiskRuleType {
  if (c.ruleType) return c.ruleType as UnifiedRiskRuleType;
  if (Array.isArray(c.networkSignals) || c.networkKey) return "contractor_network";
  if (Array.isArray(c.spendingSignals) || c.spendingBreakdownSummary) return "spending_anomaly";
  if (Array.isArray(c.missingSignals)) return "output_settlement";
  if (Array.isArray(c.matchedSignals) && c.addressGroupKey) return "address_cluster";
  if (Array.isArray(c.matchedSignals)) return "repeat_subsidy";
  if (c.fieldMissingRates || c.missingRate !== undefined || c.duplicateRate !== undefined) return "data_quality";
  return "manual";
}

function extractSignals(c: UnknownCandidate): string[] {
  const raw =
    c.signals ??
    c.matchedSignals ??
    c.missingSignals ??
    c.spendingSignals ??
    c.networkSignals ??
    [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (typeof s === "string") return safeText(s);
      if (s && typeof s === "object") {
        const o = s as Record<string, unknown>;
        return safeText(o.code) ?? safeText(o.label);
      }
      return undefined;
    })
    .filter((s): s is string => !!s);
}

export function inferSubjectKey(candidate: UnifiedRiskInputCandidate): string {
  const direct = safeKey(candidate.subjectKey);
  if (direct) return direct;
  const firstRecord = candidate.recordIds[0] ? safeKey(candidate.recordIds[0]) : undefined;
  if (firstRecord) return `record:${firstRecord}`;
  return `candidate:${safeKey(candidate.candidateId) ?? "unknown"}`;
}

export function normalizeInputCandidate(input: unknown): UnifiedRiskInputCandidate {
  const c = (input ?? {}) as UnknownCandidate;
  const candidateId = safeText(c.candidateId) ?? safeText(c.id) ?? `candidate_${Math.random().toString(36).slice(2, 10)}`;
  const recordIds = idsFromCandidate(c);
  const ruleType = inferRuleType(c);
  const normalized: UnifiedRiskInputCandidate = {
    candidateId,
    ruleType,
    riskScore: clampRiskScore100(Number(c.riskScore ?? c.finalRiskScore ?? 0)),
    riskLevel: safeText(c.riskLevel),
    recordIds,
    subjectKey: safeKey(c.subjectKey ?? c.groupKey ?? c.addressGroupKey ?? c.networkKey),
    signals: extractSignals(c),
    evidence: c.evidence ?? {},
    reason: safeText(c.reason),
    createdAt: safeText(c.createdAt ?? c.generatedAt),
    isFixtureBased: Boolean(c.isFixtureBased)
  };
  normalized.subjectKey = inferSubjectKey(normalized);
  return normalized;
}

export function groupCandidatesBySubject(candidates: UnifiedRiskInputCandidate[]): Map<string, UnifiedRiskInputCandidate[]> {
  const groups = new Map<string, UnifiedRiskInputCandidate[]>();
  for (const candidate of candidates) {
    const key = inferSubjectKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return groups;
}

function hasSignal(candidate: UnifiedRiskInputCandidate, patterns: RegExp[]): boolean {
  const text = `${candidate.ruleType} ${candidate.signals.join(" ")} ${candidate.reason ?? ""}`;
  return patterns.some((pattern) => pattern.test(text));
}

function scaled(candidate: UnifiedRiskInputCandidate, component: RiskScoreComponent, ratio = 1): number {
  const weight = RISK_SCORE_COMPONENT_WEIGHTS[component];
  const byRisk = (candidate.riskScore / 100) * weight;
  return Math.min(weight, Math.max(1, byRisk * ratio));
}

function contribution(
  candidate: UnifiedRiskInputCandidate,
  component: RiskScoreComponent,
  score: number,
  signal: string
): RiskScoreContribution {
  return {
    component,
    score: Math.round(score * 10) / 10,
    sourceCandidateId: candidate.candidateId,
    ruleType: candidate.ruleType,
    signal
  };
}

export function mapRuleToScoreComponents(candidate: UnifiedRiskInputCandidate): RiskScoreContribution[] {
  const out: RiskScoreContribution[] = [];
  const add = (component: RiskScoreComponent, signal: string, ratio = 1) =>
    out.push(contribution(candidate, component, scaled(candidate, component, ratio), signal));

  if (candidate.ruleType === "repeat_subsidy") {
    add("repetition", "repeat_subsidy");
    if (hasSignal(candidate, [/AMOUNT|amount|금액/i])) add("amount", "repeat_amount_similarity", 0.8);
    if (hasSignal(candidate, [/FISCAL_YEAR|year|연도/i])) add("growth", "repeat_year_pattern", 0.8);
    if (hasSignal(candidate, [/EVIDENCE|sourceUrl|evidence/i])) add("evidence", "repeat_evidence_present", 0.7);
  } else if (candidate.ruleType === "address_cluster") {
    add("address", "address_cluster");
    if (hasSignal(candidate, [/REPEATED_YEARS|year|연도/i])) add("growth", "address_repeated_years", 0.6);
    if (hasSignal(candidate, [/TOTAL_AMOUNT|amount|금액/i])) add("amount", "address_total_amount", 0.6);
    if (hasSignal(candidate, [/EVIDENCE|evidence/i])) add("evidence", "address_evidence_coverage", 0.6);
  } else if (candidate.ruleType === "output_settlement") {
    add("output", "output_or_result_gap");
    add("settlement", "settlement_review_needed", 0.9);
    if (hasSignal(candidate, [/publicSourceConfirmed|Evidence|evidence|source/i])) add("evidence", "output_evidence_context", 0.5);
  } else if (candidate.ruleType === "spending_anomaly") {
    add("amount", "spending_amount_pattern");
    add("settlement", "spending_settlement_review", 0.7);
    if (hasSignal(candidate, [/repeated|반복/i])) add("repetition", "spending_repeated_pattern", 0.5);
  } else if (candidate.ruleType === "contractor_network") {
    add("contractor", "contractor_network");
    if (hasSignal(candidate, [/similarContractAmount|amount|금액/i])) add("amount", "contract_amount_similarity", 0.6);
    if (hasSignal(candidate, [/sameOrAdjacentFiscalYear|year|연도/i])) add("growth", "contract_year_pattern", 0.6);
    if (hasSignal(candidate, [/addressKeyRelated|address|주소/i])) add("address", "contractor_address_related", 0.5);
    if (hasSignal(candidate, [/evidenceUrlPresent|source|evidence/i])) add("evidence", "contractor_evidence_present", 0.7);
  } else if (candidate.ruleType === "data_quality") {
    add("evidence", "data_quality_evidence_context", 0.6);
    add("settlement", "data_quality_review_context", 0.4);
  } else {
    add("evidence", "manual_review_signal", 0.5);
  }

  return out;
}

function emptyBreakdown(): RiskScoreBreakdown {
  return {
    repetitionScore: 0,
    amountScore: 0,
    growthScore: 0,
    outputScore: 0,
    addressScore: 0,
    settlementScore: 0,
    contractorScore: 0,
    evidenceScore: 0,
    totalBeforeClamp: 0,
    finalRiskScore: 0
  };
}

export function mergeScoreBreakdowns(
  breakdowns: RiskScoreBreakdown[],
  options: RiskScoreModelOptions = {}
): RiskScoreBreakdown {
  const strategy = options.mergeStrategy ?? "capped_sum";
  const merged = emptyBreakdown();
  for (const field of SCORE_FIELDS) {
    const component = field.replace(/Score$/, "") as RiskScoreComponent;
    const cap = RISK_SCORE_COMPONENT_WEIGHTS[component];
    const values = breakdowns.map((b) => Number(b[field]) || 0);
    const next = strategy === "max" ? Math.max(0, ...values) : values.reduce((sum, v) => sum + v, 0);
    merged[field] = Math.min(cap, Math.round(next * 10) / 10);
  }
  merged.totalBeforeClamp = Math.round(SCORE_FIELDS.reduce((sum, field) => sum + Number(merged[field]), 0) * 10) / 10;
  merged.finalRiskScore = clampRiskScore100(merged.totalBeforeClamp);
  return merged;
}

function breakdownFromContributions(contributions: RiskScoreContribution[]): RiskScoreBreakdown {
  const b = emptyBreakdown();
  for (const c of contributions) {
    const field = COMPONENT_TO_FIELD[c.component];
    b[field] = Math.round((Number(b[field]) + c.score) * 10) / 10;
  }
  b.totalBeforeClamp = Math.round(SCORE_FIELDS.reduce((sum, field) => sum + Number(b[field]), 0) * 10) / 10;
  b.finalRiskScore = clampRiskScore100(b.totalBeforeClamp);
  return b;
}

function evidenceSummaryFor(candidates: UnifiedRiskInputCandidate[]): string[] {
  return candidates.slice(0, 12).map((candidate) => {
    const ids = candidate.recordIds.slice(0, 3).join(",");
    return sanitizeForStorage(`${candidate.ruleType}:${candidate.candidateId}${ids ? ` records=${ids}` : ""}`).sanitizedText;
  });
}

export function createRiskScoreReason(result: Pick<RiskScoreResult, "riskGrade" | "scoreBreakdown">): string {
  const b = result.scoreBreakdown;
  if (result.riskGrade === "A") {
    return "여러 검토 신호가 함께 확인되어 우선 검토 후보로 분류되었습니다. 공개자료 기준의 검토 후보이며 사실관계 확인이 필요합니다.";
  }
  if (result.riskGrade === "B") {
    return "반복성, 주소 유사성, 정산 확인 필요 신호 중 일부가 확인되어 추가 확인이 필요합니다. 사람 검토를 통해 근거를 보강해야 합니다.";
  }
  const active = SCORE_FIELDS.filter((field) => Number(b[field]) > 0).length;
  return active > 0
    ? "일부 검토 신호가 확인되어 보조 검토 후보로 분류되었습니다. 공개자료 기준의 낮은 우선순위 후보입니다."
    : "통합 점수 신호가 제한적이어서 낮은 우선순위 후보로 분류되었습니다.";
}

export function calculateFinalRiskScoreForSubject(
  subjectKey: string,
  candidates: UnifiedRiskInputCandidate[],
  options: RiskScoreModelOptions = {}
): RiskScoreResult {
  const allContributions = candidates.flatMap(mapRuleToScoreComponents);
  const perCandidate = candidates.map((candidate) => breakdownFromContributions(mapRuleToScoreComponents(candidate)));
  const merged = mergeScoreBreakdowns(perCandidate, options);
  const keptContributions = allContributions.filter((c) => merged[COMPONENT_TO_FIELD[c.component]] > 0);
  const riskGrade = getRiskGrade(merged.finalRiskScore);
  const base: RiskScoreResult = {
    scoreId: `${options.runId ?? "run"}_${safeKey(subjectKey) ?? "subject"}`,
    subjectKey: safeKey(subjectKey) ?? "subject:unknown",
    sourceCandidateIds: Array.from(new Set(candidates.map((c) => c.candidateId))).sort(),
    finalRiskScore: merged.finalRiskScore,
    riskGrade,
    scoreBreakdown: merged,
    contributingSignals: keptContributions,
    evidenceSummary: evidenceSummaryFor(candidates),
    reason: "",
    reviewRequired: true,
    createdAt: new Date().toISOString(),
    isFixtureBased: Boolean(options.isFixtureBased || candidates.some((c) => c.isFixtureBased))
  };
  return { ...base, reason: createRiskScoreReason(base) };
}

export function generateRiskScoreReport(
  inputs: unknown[],
  options: RiskScoreModelOptions = {}
): RiskScoreReport {
  const runId = options.runId ?? createRiskScoreRunId();
  const candidates = inputs.map(normalizeInputCandidate);
  const groups = groupCandidatesBySubject(candidates);
  const results = Array.from(groups.entries()).map(([subjectKey, group]) =>
    calculateFinalRiskScoreForSubject(subjectKey, group, { ...options, runId })
  );
  results.sort((a, b) => {
    if (b.finalRiskScore !== a.finalRiskScore) return b.finalRiskScore - a.finalRiskScore;
    return a.subjectKey.localeCompare(b.subjectKey);
  });
  const topScores = results.slice(0, options.limit ?? 50);
  const gradeSummary: Record<RiskGrade, number> = { A: 0, B: 0, C: 0 };
  for (const r of results) gradeSummary[r.riskGrade] += 1;
  const isFixtureBased = Boolean(options.isFixtureBased || candidates.some((c) => c.isFixtureBased));
  const notes = [
    "결과는 위험 후보, 우선 검토 후보, 추가 확인 필요 후보 정렬을 위한 보조 점수입니다.",
    "A/B/C 등급은 확정 판단이 아니며 모든 결과는 사람 검토가 필요합니다.",
    "점수 항목별 contribution을 scoreBreakdown과 contributingSignals에 남깁니다.",
    "개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 report에 넣지 않습니다."
  ];
  if (isFixtureBased) notes.push("fixture 기반 검증 결과이며 실제 데이터 탐지 완료로 표현하지 않습니다.");
  return {
    runId,
    totalInputCandidates: candidates.length,
    totalScoredSubjects: results.length,
    gradeSummary,
    topScores,
    createdAt: new Date().toISOString(),
    notes,
    isFixtureBased,
    sourceNote: options.sourceNote ?? (isFixtureBased ? "fixture-synthetic" : "input-risk-reports")
  };
}

export function renderRiskScoreReportMarkdown(report: RiskScoreReport): string {
  const lines: string[] = [];
  lines.push(`# 100점 위험점수 모델 결과 TOP ${Math.min(report.topScores.length, 50)} - ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.createdAt}`);
  lines.push(`- 입력 후보: ${report.totalInputCandidates} / 점수화 subject: ${report.totalScoredSubjects}`);
  lines.push(`- 등급 요약: A ${report.gradeSummary.A}, B ${report.gradeSummary.B}, C ${report.gradeSummary.C}`);
  lines.push(`- 데이터 구분: ${report.isFixtureBased ? "fixture 기반 검증" : "입력 risk report"} / ${report.sourceNote}`);
  lines.push("");
  lines.push("> 본 결과는 위험 후보 또는 우선 검토 후보 정렬용 점수이며 확정 판단이 아닙니다. 모든 후보는 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("| 순위 | riskScore | riskGrade | subjectKey | scoreBreakdown | reason |");
  lines.push("|---:|---:|---|---|---|---|");
  report.topScores.forEach((r, i) => {
    const b = r.scoreBreakdown;
    const breakdown = `rep=${b.repetitionScore}, amount=${b.amountScore}, growth=${b.growthScore}, output=${b.outputScore}, address=${b.addressScore}, settlement=${b.settlementScore}, contractor=${b.contractorScore}, evidence=${b.evidenceScore}`;
    lines.push(`| ${i + 1} | ${r.finalRiskScore} | ${r.riskGrade} | ${r.subjectKey} | ${breakdown} | ${r.reason} |`);
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${note}`);
  return lines.join("\n");
}

export async function writeRiskScoreReport(
  outputDir: string,
  report: RiskScoreReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "risk-score-report.json");
  const reportMdFile = path.join(runDir, "risk-score-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderRiskScoreReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

export { RISK_SCORE_MODEL_NOTICE };
