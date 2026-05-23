// 결과물 부족·정산 확인 필요 탐지 룰 모듈 (체크리스트 19).
//
// 보조사업 기준선 데이터(BaselineRecord)에서 성과보고서/정산서/결과보고서/결과물 URL/증빙 URL/첨부파일
// 등 공개 근거가 부족한 "결과물 누락 후보 / 정산 확인 필요 후보 / 증빙 보완 필요 후보"를
// 레코드별로 점수화하고 TOP N(기본 50)을 산출한다.
//
// 안전 원칙:
//   - 위법 여부를 판단하지 않는다. 단정 표현(정산 미이행 확정/결과물 미제출 확정/부정수급 확정/불법/사기)을 쓰지 않는다.
//   - 공개자료에 없다는 것은 "확인 필요"일 뿐 실제 미제출 확정이 아니다.
//   - 로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않는다(본 모듈은 공개자료 메타만 사용).
//   - evidence/reason/report 에 개인정보 원문을 넣지 않는다.
//   - 모든 후보는 reviewRequired=true. 외부 의존성 없이 구현한다.

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { BaselineRecord } from "../types/dataQualityBaseline.js";
import {
  MissingSignal,
  OutputSettlementRecordEvidence,
  OutputSettlementRiskCandidate,
  OutputSettlementRiskLevel,
  OutputSettlementRiskOptions,
  OutputSettlementRiskReport,
  OutputSettlementSignalCode,
  OUTPUT_SETTLEMENT_ENDED_YEARS,
  OUTPUT_SETTLEMENT_NOTICE,
  OUTPUT_SETTLEMENT_SIGNALS
} from "../types/outputSettlementRisk.js";

// ---------- 1. runId ----------

export function createOutputSettlementRiskRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `outsettle_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 2. riskLevel ----------

export function getOutputSettlementRiskLevel(score: number): OutputSettlementRiskLevel {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  if (score >= 40) return "low";
  return "minimal";
}

// ---------- 3. clamp ----------

export function clampRiskScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------- 4. 존재 판정 헬퍼 ----------

export function hasPerformanceReport(r: BaselineRecord): boolean {
  return !!(r.hasPerformanceReport || r.performanceReportUrl);
}
export function hasSettlementDocument(r: BaselineRecord): boolean {
  return !!(r.hasSettlementDocument || r.settlementDocumentUrl);
}
export function hasResultReport(r: BaselineRecord): boolean {
  return !!(r.hasResultReport || r.resultReportUrl);
}
export function hasResultUrl(r: BaselineRecord): boolean {
  return !!(r.hasResultUrl || r.resultUrl);
}
export function hasAttachment(r: BaselineRecord): boolean {
  return !!(r.hasAttachment || (r.attachmentUrls && r.attachmentUrls.length > 0) || (r.attachmentCount ?? 0) > 0);
}
export function hasEvidence(r: BaselineRecord): boolean {
  return !!(r.evidenceUrl || r.sourceUrl);
}

/** 환수/반납 문맥 여부 (documentType 또는 사업명 키워드 기준). */
function hasReturnContext(r: BaselineRecord): boolean {
  if (r.documentType === "recovery_return") return true;
  const hay = `${r.projectName ?? ""} ${r.documentType ?? ""}`;
  return /환수|반납|회수/.test(hay);
}

// ---------- 5. 신호 평가 ----------

export interface OutputSettlementSignalResult {
  missingSignals: MissingSignal[];
  rawScore: number;
}

function addSignal(list: MissingSignal[], code: OutputSettlementSignalCode): void {
  const def = OUTPUT_SETTLEMENT_SIGNALS[code];
  list.push({ code, label: def.label, score: def.score });
}

export function evaluateOutputSettlementSignals(
  r: BaselineRecord,
  options: { currentYear?: number } = {}
): OutputSettlementSignalResult {
  const signals: MissingSignal[] = [];
  const currentYear = options.currentYear ?? new Date().getUTCFullYear();

  if (!hasPerformanceReport(r)) addSignal(signals, "missingPerformanceReport");
  if (!hasSettlementDocument(r)) addSignal(signals, "missingSettlementDocument");
  if (!hasResultReport(r) && !hasResultUrl(r)) addSignal(signals, "missingResultReport");
  if (!hasEvidence(r)) addSignal(signals, "missingEvidenceUrl");
  if (!hasAttachment(r)) addSignal(signals, "missingAttachment");
  if (r.settlementAmount == null) addSignal(signals, "missingSettlementAmount");
  if (r.executionAmount == null) addSignal(signals, "missingExecutionAmount");
  if (hasReturnContext(r) && r.returnAmount == null) addSignal(signals, "missingReturnAmountAfterIssue");
  if (r.fiscalYear != null && currentYear - r.fiscalYear >= OUTPUT_SETTLEMENT_ENDED_YEARS) {
    addSignal(signals, "projectEndedLongAgo");
  }
  // 근거 신뢰도 보조(감점) — 공개 원문이 확인되면 누락 점수를 일부 상쇄
  if (hasEvidence(r)) addSignal(signals, "publicSourceConfirmed");

  const rawScore = signals.reduce((sum, s) => sum + s.score, 0);
  return { missingSignals: signals, rawScore };
}

// ---------- 6. 증거 추출 ----------

export function extractOutputSettlementEvidence(r: BaselineRecord): OutputSettlementRecordEvidence {
  const safe = (v?: string) => (v ? sanitizeForStorage(v).sanitizedText : undefined);
  return {
    id: r.id,
    fiscalYear: r.fiscalYear,
    localGovName: safe(r.localGovName),
    projectName: safe(r.projectName),
    projectNameCompactKey: r.projectNameCompactKey,
    normalizedRecipientName: r.normalizedRecipientName,
    documentType: r.documentType,
    subsidyAmount: r.subsidyAmount,
    executionAmount: r.executionAmount,
    settlementAmount: r.settlementAmount,
    returnAmount: r.returnAmount,
    hasSourceUrl: !!r.sourceUrl,
    hasEvidenceUrl: !!r.evidenceUrl,
    hasPerformanceReport: hasPerformanceReport(r),
    hasSettlementDocument: hasSettlementDocument(r),
    hasResultReport: hasResultReport(r),
    hasResultUrl: hasResultUrl(r),
    hasAttachment: hasAttachment(r),
    attachmentCount: r.attachmentCount ?? (r.attachmentUrls?.length ?? 0)
  };
}

// ---------- groupKey ----------

export function buildOutputSettlementGroupKey(r: BaselineRecord): string {
  return [
    (r.normalizedRecipientName ?? "?").toLowerCase(),
    (r.projectNameCompactKey ?? "?").toLowerCase(),
    r.fiscalYear ?? "?",
    r.sourceName ?? "?"
  ].join("|");
}

// ---------- reason ----------

function buildReason(signals: MissingSignal[]): string {
  const codes = new Set(signals.map((s) => s.code));
  const phrases: string[] = [];
  if (codes.has("missingSettlementDocument") || codes.has("missingSettlementAmount")) {
    phrases.push("공개자료 기준으로 정산 관련 근거가 확인되지 않아 추가 확인이 필요합니다.");
  }
  if (codes.has("missingResultReport") || codes.has("missingPerformanceReport")) {
    phrases.push("결과보고서 또는 결과물 URL이 확인되지 않아 증빙 보완 여부 확인이 필요합니다.");
  }
  if (codes.has("missingEvidenceUrl") || codes.has("missingAttachment")) {
    phrases.push("원문 URL 또는 첨부파일 정보가 부족하여 사실관계 점검이 필요합니다.");
  }
  if (phrases.length === 0) {
    phrases.push("일부 공개 근거가 확인되지 않아 추가 확인이 필요합니다.");
  }
  return phrases.join(" ");
}

// ---------- 7. 후보 생성 ----------

export function createOutputSettlementRiskCandidate(
  r: BaselineRecord,
  options: { currentYear?: number; runId?: string } = {}
): OutputSettlementRiskCandidate {
  const { missingSignals, rawScore } = evaluateOutputSettlementSignals(r, options);
  const riskScore = clampRiskScore(rawScore);
  const runId = options.runId ?? "run";
  return {
    candidateId: `${runId}_${r.id}`,
    recordId: r.id,
    groupKey: buildOutputSettlementGroupKey(r),
    riskScore,
    riskLevel: getOutputSettlementRiskLevel(riskScore),
    missingSignals,
    evidence: extractOutputSettlementEvidence(r),
    reason: buildReason(missingSignals),
    reviewRequired: true,
    createdAt: new Date().toISOString()
  };
}

// ---------- 8. dedupe ----------

/** 같은 groupKey 후보 중 높은 점수 대표만 남긴다. */
export function dedupeOutputSettlementCandidates(
  candidates: OutputSettlementRiskCandidate[]
): OutputSettlementRiskCandidate[] {
  const best = new Map<string, OutputSettlementRiskCandidate>();
  for (const c of candidates) {
    const cur = best.get(c.groupKey);
    if (!cur || c.riskScore > cur.riskScore) best.set(c.groupKey, c);
  }
  return Array.from(best.values());
}

// ---------- 9. 정렬 ----------

export function sortOutputSettlementCandidates(
  candidates: OutputSettlementRiskCandidate[]
): OutputSettlementRiskCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    if (b.missingSignals.length !== a.missingSignals.length)
      return b.missingSignals.length - a.missingSignals.length;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// ---------- 10. TOP N ----------

export function selectTopOutputSettlementCandidates(
  candidates: OutputSettlementRiskCandidate[],
  limit = 50
): OutputSettlementRiskCandidate[] {
  return sortOutputSettlementCandidates(candidates).slice(0, limit);
}

// ---------- 11. 리포트 ----------

export function generateOutputSettlementRiskReport(
  records: BaselineRecord[],
  options: OutputSettlementRiskOptions = {}
): OutputSettlementRiskReport {
  const runId = options.runId ?? createOutputSettlementRiskRunId();
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 40;
  const isRealData = options.isRealData ?? false;

  const candidates: OutputSettlementRiskCandidate[] = [];
  for (const r of records) {
    const cand = createOutputSettlementRiskCandidate(r, { currentYear: options.currentYear, runId });
    if (cand.riskScore >= minScore) candidates.push(cand);
  }

  const deduped = dedupeOutputSettlementCandidates(candidates);
  const top = selectTopOutputSettlementCandidates(deduped, limit);

  const signalSummary: Record<string, number> = {};
  for (const c of deduped) for (const s of c.missingSignals) signalSummary[s.code] = (signalSummary[s.code] ?? 0) + 1;

  const notes: string[] = [
    "공개자료에 없다고 해서 실제 결과물이나 정산서가 제출되지 않았다고 단정할 수 없습니다.",
    "일부 지자체는 결과보고서·정산서를 별도 공개하지 않을 수 있고, 정산 정보는 내부 시스템에만 존재할 수 있습니다.",
    "로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않으며, 개인정보 원문은 저장·노출하지 않습니다.",
    "결과는 결과물 누락 후보 / 정산 확인 필요 후보이며 사실관계 점검과 사람 검토가 필요합니다."
  ];
  if (!isRealData) notes.push("본 실행은 fixture 기반 검증입니다 — 실제 탐지 완료가 아닙니다.");

  return {
    runId,
    generatedAt: new Date().toISOString(),
    isRealData,
    sourceNote: options.sourceNote ?? (isRealData ? "real-data" : "fixture-synthetic"),
    totalRecords: records.length,
    totalCandidates: deduped.length,
    topCandidates: top,
    signalSummary,
    notes
  };
}

// ---------- 12. 마크다운 ----------

export function renderOutputSettlementRiskReportMarkdown(report: OutputSettlementRiskReport): string {
  const lines: string[] = [];
  lines.push(`# 결과물 누락 후보 / 정산 확인 필요 후보 TOP ${Math.min(report.topCandidates.length, 50)} — ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.generatedAt}`);
  lines.push(`- 데이터 구분: ${report.isRealData ? "실데이터" : "fixture(검증용 — 실제 탐지 완료 아님)"} / ${report.sourceNote}`);
  lines.push(`- 적재 레코드: ${report.totalRecords} / 후보: ${report.totalCandidates}`);
  lines.push("");
  lines.push("> 본 결과는 '결과물 누락 후보 / 정산 확인 필요 후보 / 증빙 보완 필요 후보'이며 위법 여부 판단이 아닙니다. 공개자료에 없다는 것은 확인 필요일 뿐 미제출 확정이 아닙니다. 모든 후보는 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("## 신호 요약");
  lines.push("");
  for (const [code, n] of Object.entries(report.signalSummary)) lines.push(`- ${code}: ${n}건`);
  lines.push("");
  lines.push("## 후보 목록");
  lines.push("");
  lines.push("| 순위 | riskScore | riskLevel | groupKey | 누락 신호 | reason |");
  lines.push("|---:|---:|---|---|---|---|");
  report.topCandidates.forEach((c, i) => {
    const sigs = c.missingSignals.filter((s) => s.score > 0).map((s) => s.code).join(", ");
    lines.push(`| ${i + 1} | ${c.riskScore} | ${c.riskLevel} | ${c.groupKey} | ${sigs} | ${c.reason} |`);
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const n of report.notes) lines.push(`- ${n}`);
  return lines.join("\n");
}

// ---------- 13. 저장 ----------

export async function writeOutputSettlementRiskReport(
  outputDir: string,
  report: OutputSettlementRiskReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "output-settlement-risk-report.json");
  const reportMdFile = path.join(runDir, "output-settlement-risk-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderOutputSettlementRiskReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

export { OUTPUT_SETTLEMENT_NOTICE };
