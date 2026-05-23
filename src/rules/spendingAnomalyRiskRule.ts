// 예산 집행 이상 패턴 탐지 룰 모듈 (체크리스트 20).
//
// 보조사업 기준선 데이터(BaselineRecord)에서 인건비/홍보비/용역비/장비구입비 등 특정 집행 항목의
// 과다 비중·반복 지출·특정 지급처 반복을 점수화해 "예산 집행 이상 패턴 후보 / 정산 확인 필요 후보"
// TOP N(기본 50)을 산출한다.
//
// 안전 원칙:
//   - 위법 여부를 판단하지 않는다. 단정 표현(부정집행 확정/횡령 확정/부정수급 확정/불법/사기)을 쓰지 않는다.
//   - 특정 항목 비중이 높거나 반복된다는 사실만으로 문제라고 단정하지 않는다.
//   - 지급처명은 마스킹 값(vendorNameMasked)만 사용하고, evidence/reason 에 개인정보 원문을 넣지 않는다.
//   - 로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않는다.
//   - 모든 후보는 reviewRequired=true. 외부 의존성 없이 구현한다.

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { BaselineRecord } from "../types/dataQualityBaseline.js";
import {
  SpendingAnomalyRiskCandidate,
  SpendingAnomalyRiskEvidence,
  SpendingAnomalyRiskLevel,
  SpendingAnomalyRiskOptions,
  SpendingAnomalyRiskReport,
  SpendingAnomalySignal,
  SpendingAnomalySignalCode,
  SpendingBreakdownSummary,
  SpendingCategory,
  SPENDING_ANOMALY_RISK_NOTICE,
  SPENDING_ANOMALY_RISK_THRESHOLDS,
  SPENDING_ANOMALY_SIGNAL_WEIGHTS,
  SPENDING_CATEGORY_THRESHOLDS,
  SPENDING_LARGE_SINGLE_RATIO,
  SPENDING_REPEAT_THRESHOLD,
  SPENDING_SIMILAR_AMOUNT_TOLERANCE
} from "../types/spendingAnomalyRisk.js";

// ---------- 1. runId ----------

export function createSpendingAnomalyRiskRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `spending_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 2. riskLevel ----------

export function getSpendingAnomalyRiskLevel(score: number): SpendingAnomalyRiskLevel {
  if (score >= SPENDING_ANOMALY_RISK_THRESHOLDS.high) return "high";
  if (score >= SPENDING_ANOMALY_RISK_THRESHOLDS.medium) return "medium";
  if (score >= SPENDING_ANOMALY_RISK_THRESHOLDS.low) return "low";
  return "minimal";
}

// ---------- 3. clamp ----------

export function clampSpendingAnomalyRiskScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------- 4. 카테고리 정규화 ----------

export function normalizeSpendingCategory(label: string | undefined): SpendingCategory {
  const s = (label ?? "").toString();
  if (/인건비|인력비|급여|임금|보수|수당/.test(s)) return "labor";
  if (/홍보비|광고비|홍보물|마케팅|홍보/.test(s)) return "promotion";
  if (/용역비|외주|컨설팅|위탁|자문/.test(s)) return "service";
  if (/장비구입비|장비|기자재|비품|설비/.test(s)) return "equipment";
  if (/여비|출장|교통비/.test(s)) return "travel";
  if (/재료비|원료|소모품|재료/.test(s)) return "material";
  if (/임차료|임대|대관|임차/.test(s)) return "rent";
  // 이미 정규화된 카테고리 코드면 그대로
  if (["labor", "promotion", "service", "equipment", "travel", "material", "rent", "other"].includes(s)) {
    return s as SpendingCategory;
  }
  return "other";
}

// ---------- 5. 지출 요약 ----------

export function buildSpendingBreakdownSummary(r: BaselineRecord): SpendingBreakdownSummary {
  const byCategory: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const add = (cat: string, amt: number) => {
    if (!Number.isFinite(amt) || amt <= 0) return;
    byCategory[cat] = (byCategory[cat] ?? 0) + amt;
  };

  // 명시적 카테고리 금액
  add("labor", r.laborCostAmount ?? 0);
  add("promotion", r.promotionCostAmount ?? 0);
  add("service", r.serviceCostAmount ?? 0);
  add("equipment", r.equipmentCostAmount ?? 0);
  add("material", r.materialCostAmount ?? 0);
  add("rent", r.rentCostAmount ?? 0);
  add("travel", r.travelCostAmount ?? 0);
  add("other", r.otherCostAmount ?? 0);

  // 라인아이템
  const items = r.spendingLineItems ?? [];
  const amountsByCat = new Map<string, number[]>();
  const vendorMap = new Map<string, { count: number; total: number }>();
  let largestSingle = 0;
  for (const it of items) {
    const cat = normalizeSpendingCategory(it.category ?? it.label);
    const amt = typeof it.amount === "number" ? it.amount : 0;
    add(cat, amt);
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    if (amt > largestSingle) largestSingle = amt;
    const arr = amountsByCat.get(cat) ?? [];
    arr.push(amt);
    amountsByCat.set(cat, arr);
    if (it.vendorNameMasked) {
      const v = vendorMap.get(it.vendorNameMasked) ?? { count: 0, total: 0 };
      v.count += 1;
      v.total += amt;
      vendorMap.set(it.vendorNameMasked, v);
    }
  }

  const totalSpending =
    Object.values(byCategory).reduce((a, b) => a + b, 0) ||
    r.executionAmount ||
    r.subsidyAmount ||
    0;

  const categoryRatios: Record<string, number> = {};
  for (const [cat, amt] of Object.entries(byCategory)) {
    categoryRatios[cat] = totalSpending > 0 ? amt / totalSpending : 0;
  }

  // 유사 금액 반복 카테고리
  const similarAmountCategories: string[] = [];
  for (const [cat, amounts] of amountsByCat) {
    if (hasSimilarAmountRepeat(amounts, SPENDING_REPEAT_THRESHOLD, SPENDING_SIMILAR_AMOUNT_TOLERANCE)) {
      similarAmountCategories.push(cat);
    }
  }

  const topVendors = Array.from(vendorMap.entries())
    .map(([vendorNameMasked, v]) => ({ vendorNameMasked, count: v.count, total: v.total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalSpending,
    byCategory,
    categoryRatios,
    lineItemCount: items.length,
    categoryCounts,
    similarAmountCategories,
    topVendors,
    largestSingleRatio: totalSpending > 0 ? largestSingle / totalSpending : 0
  };
}

function hasSimilarAmountRepeat(amounts: number[], threshold: number, tolerance: number): boolean {
  for (let i = 0; i < amounts.length; i++) {
    let cnt = 1;
    for (let j = 0; j < amounts.length; j++) {
      if (i === j) continue;
      const max = Math.max(Math.abs(amounts[i]), Math.abs(amounts[j]));
      if (max === 0) {
        if (amounts[i] === amounts[j]) cnt++;
      } else if (Math.abs(amounts[i] - amounts[j]) / max <= tolerance) {
        cnt++;
      }
    }
    if (cnt >= threshold) return true;
  }
  return false;
}

// ---------- 6. 신호 평가 ----------

export interface SpendingSignalResult {
  spendingSignals: SpendingAnomalySignal[];
  rawScore: number;
  cautionNotes: string[];
}

function addSignal(list: SpendingAnomalySignal[], code: SpendingAnomalySignalCode): void {
  const def = SPENDING_ANOMALY_SIGNAL_WEIGHTS[code];
  list.push({ code, label: def.label, score: def.score });
}

export function evaluateSpendingAnomalySignals(
  r: BaselineRecord,
  summary: SpendingBreakdownSummary
): SpendingSignalResult {
  const signals: SpendingAnomalySignal[] = [];
  const cautionNotes: string[] = [];
  const ratios = summary.categoryRatios;

  if ((ratios.labor ?? 0) >= SPENDING_CATEGORY_THRESHOLDS.labor) {
    addSignal(signals, "highLaborCostRatio");
    cautionNotes.push("돌봄·교육·상담 등 인건비 중심 사업은 인건비 비중이 높을 수 있습니다.");
  }
  if ((ratios.promotion ?? 0) >= SPENDING_CATEGORY_THRESHOLDS.promotion) {
    addSignal(signals, "highPromotionCostRatio");
    cautionNotes.push("캠페인·홍보 목적 사업은 홍보비 비중이 높을 수 있습니다.");
  }
  if ((ratios.service ?? 0) >= SPENDING_CATEGORY_THRESHOLDS.service) {
    addSignal(signals, "highServiceCostRatio");
    cautionNotes.push("전문 용역 사업은 용역비 비중이 높을 수 있습니다.");
  }
  if ((ratios.equipment ?? 0) >= SPENDING_CATEGORY_THRESHOLDS.equipment) {
    addSignal(signals, "highEquipmentCostRatio");
    cautionNotes.push("장비 지원 사업은 장비구입비 비중이 높을 수 있습니다.");
  }

  // 반복 지출(같은 항목 N회 이상)
  if (Object.values(summary.categoryCounts).some((c) => c >= SPENDING_REPEAT_THRESHOLD)) {
    addSignal(signals, "repeatedSameCategory");
    cautionNotes.push("월별 정기 지급 등 정상 반복 지출일 수 있습니다.");
  }
  // 유사 금액 반복
  if (summary.similarAmountCategories.length > 0) {
    addSignal(signals, "repeatedSimilarAmount");
    cautionNotes.push("정액 계약에 따른 반복 지급일 수 있습니다.");
  }
  // 특정 지급처 반복
  if (summary.topVendors.some((v) => v.count >= SPENDING_REPEAT_THRESHOLD)) {
    addSignal(signals, "repeatedVendor");
    cautionNotes.push("장기계약·정기 용역에 따른 반복 지급일 수 있습니다.");
  }
  // 세부내역 부족
  const hasBreakdown = !!r.hasSpendingBreakdown || summary.lineItemCount > 0 || Object.keys(summary.byCategory).length > 0;
  if (!hasBreakdown) addSignal(signals, "missingBreakdown");
  // 증빙 부족
  const hasReceipt = (r.spendingEvidenceUrls?.length ?? 0) > 0 || !!r.evidenceUrl || !!r.sourceUrl;
  if (!hasReceipt) addSignal(signals, "missingReceiptEvidence");
  // 단일 지출 과다
  if (summary.largestSingleRatio >= SPENDING_LARGE_SINGLE_RATIO) addSignal(signals, "largeSingleSpending");
  // 공개자료 확인(보조 감점)
  if (hasReceipt) addSignal(signals, "publicSourceConfirmed");

  const rawScore = signals.reduce((sum, s) => sum + s.score, 0);
  return { spendingSignals: signals, rawScore, cautionNotes };
}

// ---------- 7. 증거 추출 ----------

export function extractSpendingAnomalyEvidence(
  r: BaselineRecord,
  summary: SpendingBreakdownSummary
): SpendingAnomalyRiskEvidence {
  const safe = (v?: string) => (v ? sanitizeForStorage(v).sanitizedText : undefined);
  const roundedRatios: Record<string, number> = {};
  for (const [k, v] of Object.entries(summary.categoryRatios)) roundedRatios[k] = Math.round(v * 100) / 100;
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
    totalSpending: summary.totalSpending,
    categoryRatios: roundedRatios,
    hasSpendingBreakdown: summary.lineItemCount > 0 || Object.keys(summary.byCategory).length > 0,
    spendingEvidenceCount: r.spendingEvidenceUrls?.length ?? 0,
    // vendorNameMasked 만 노출(원문 금지)
    topVendorsMasked: summary.topVendors.map((v) => `${v.vendorNameMasked}(${v.count})`)
  };
}

// ---------- groupKey ----------

export function buildSpendingGroupKey(r: BaselineRecord): string {
  return [
    (r.normalizedRecipientName ?? "?").toLowerCase(),
    (r.projectNameCompactKey ?? "?").toLowerCase(),
    r.fiscalYear ?? "?"
  ].join("|");
}

// ---------- reason ----------

function buildReason(signals: SpendingAnomalySignal[]): string {
  const codes = new Set(signals.map((s) => s.code));
  const phrases: string[] = [];
  if (
    codes.has("highLaborCostRatio") ||
    codes.has("highPromotionCostRatio") ||
    codes.has("highServiceCostRatio") ||
    codes.has("highEquipmentCostRatio")
  ) {
    phrases.push("공개자료 기준으로 특정 집행 항목 비중이 높아 정산 자료 확인이 필요합니다.");
  }
  if (codes.has("repeatedSameCategory")) {
    phrases.push("동일 항목의 반복 지출 후보가 확인되어 세부 증빙 확인이 필요합니다.");
  }
  if (codes.has("repeatedSimilarAmount") || codes.has("repeatedVendor")) {
    phrases.push("유사 금액 반복 또는 특정 지급처 반복 지출 후보가 확인되어 계약·정산 근거 확인이 필요합니다.");
  }
  if (phrases.length === 0) {
    phrases.push("일부 집행 신호가 확인되어 추가 확인이 필요합니다.");
  }
  phrases.push("사업 유형에 따라 정상 지출일 수 있으므로 사람 검토가 필요합니다.");
  return phrases.join(" ");
}

// ---------- 8. 후보 생성 ----------

export function createSpendingAnomalyRiskCandidate(
  r: BaselineRecord,
  options: { runId?: string } = {}
): SpendingAnomalyRiskCandidate {
  const summary = buildSpendingBreakdownSummary(r);
  const { spendingSignals, rawScore, cautionNotes } = evaluateSpendingAnomalySignals(r, summary);
  const riskScore = clampSpendingAnomalyRiskScore(rawScore);
  const runId = options.runId ?? "run";
  return {
    candidateId: `${runId}_${r.id}`,
    recordId: r.id,
    groupKey: buildSpendingGroupKey(r),
    riskScore,
    riskLevel: getSpendingAnomalyRiskLevel(riskScore),
    spendingSignals,
    spendingBreakdownSummary: summary,
    evidence: extractSpendingAnomalyEvidence(r, summary),
    reason: buildReason(spendingSignals),
    cautionNotes,
    reviewRequired: true,
    createdAt: new Date().toISOString()
  };
}

// ---------- 9. dedupe / sort / top ----------

export function dedupeSpendingAnomalyCandidates(
  candidates: SpendingAnomalyRiskCandidate[]
): SpendingAnomalyRiskCandidate[] {
  const best = new Map<string, SpendingAnomalyRiskCandidate>();
  for (const c of candidates) {
    const cur = best.get(c.groupKey);
    if (!cur || c.riskScore > cur.riskScore) best.set(c.groupKey, c);
  }
  return Array.from(best.values());
}

export function sortSpendingAnomalyCandidates(
  candidates: SpendingAnomalyRiskCandidate[]
): SpendingAnomalyRiskCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    if (b.spendingSignals.length !== a.spendingSignals.length)
      return b.spendingSignals.length - a.spendingSignals.length;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function selectTopSpendingAnomalyCandidates(
  candidates: SpendingAnomalyRiskCandidate[],
  limit = 50
): SpendingAnomalyRiskCandidate[] {
  return sortSpendingAnomalyCandidates(candidates).slice(0, limit);
}

// ---------- 10. 리포트 ----------

export function generateSpendingAnomalyRiskReport(
  records: BaselineRecord[],
  options: SpendingAnomalyRiskOptions = {}
): SpendingAnomalyRiskReport {
  const runId = options.runId ?? createSpendingAnomalyRiskRunId();
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 40;
  const isRealData = options.isRealData ?? false;

  const candidates: SpendingAnomalyRiskCandidate[] = [];
  for (const r of records) {
    const cand = createSpendingAnomalyRiskCandidate(r, { runId });
    if (cand.riskScore >= minScore) candidates.push(cand);
  }

  const deduped = dedupeSpendingAnomalyCandidates(candidates);
  const top = selectTopSpendingAnomalyCandidates(deduped, limit);

  const signalSummary: Record<string, number> = {};
  for (const c of deduped) for (const s of c.spendingSignals) signalSummary[s.code] = (signalSummary[s.code] ?? 0) + 1;

  const notes: string[] = [
    "특정 항목 비중이 높거나 반복된다는 사실만으로 문제라고 단정하지 않습니다.",
    "인건비 중심 사업·홍보 캠페인·전문 용역·장비 지원 사업은 해당 항목 비중이 높을 수 있습니다.",
    "공개자료에 세부 지출내역이 없으면 정확한 판정이 어렵습니다.",
    "지급처명은 마스킹 값만 사용하며 개인정보 원문은 저장·노출하지 않습니다.",
    "결과는 예산 집행 이상 패턴 후보 / 정산 확인 필요 후보이며 정산 자료 확인과 사람 검토가 필요합니다."
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

// ---------- 11. 마크다운 ----------

export function renderSpendingAnomalyRiskReportMarkdown(report: SpendingAnomalyRiskReport): string {
  const lines: string[] = [];
  lines.push(`# 예산 집행 이상 패턴 후보 TOP ${Math.min(report.topCandidates.length, 50)} — ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.generatedAt}`);
  lines.push(`- 데이터 구분: ${report.isRealData ? "실데이터" : "fixture(검증용 — 실제 탐지 완료 아님)"} / ${report.sourceNote}`);
  lines.push(`- 적재 레코드: ${report.totalRecords} / 후보: ${report.totalCandidates}`);
  lines.push("");
  lines.push("> 본 결과는 '예산 집행 이상 패턴 후보 / 정산 확인 필요 후보'이며 위법 여부 판단이 아닙니다. 특정 항목 비중이 높거나 반복된다고 해서 문제로 단정하지 않습니다. 모든 후보는 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("## 신호 요약");
  lines.push("");
  for (const [code, n] of Object.entries(report.signalSummary)) lines.push(`- ${code}: ${n}건`);
  lines.push("");
  lines.push("## 후보 목록");
  lines.push("");
  lines.push("| 순위 | riskScore | riskLevel | groupKey | 신호 | reason |");
  lines.push("|---:|---:|---|---|---|---|");
  report.topCandidates.forEach((c, i) => {
    const sigs = c.spendingSignals.filter((s) => s.score > 0).map((s) => s.code).join(", ");
    lines.push(`| ${i + 1} | ${c.riskScore} | ${c.riskLevel} | ${c.groupKey} | ${sigs} | ${c.reason} |`);
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const n of report.notes) lines.push(`- ${n}`);
  return lines.join("\n");
}

// ---------- 12. 저장 ----------

export async function writeSpendingAnomalyRiskReport(
  outputDir: string,
  report: SpendingAnomalyRiskReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "spending-anomaly-risk-report.json");
  const reportMdFile = path.join(runDir, "spending-anomaly-risk-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderSpendingAnomalyRiskReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

export { SPENDING_ANOMALY_RISK_NOTICE };
