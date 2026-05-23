// 반복 수급 탐지 룰 모듈 (체크리스트 17).
//
// 보조사업 기준선 데이터(BaselineRecord)에서 동일/유사 기관·주소·사업명·연도·금액이 반복되는
// "반복 수급 후보 / 검토 필요 후보"를 점수화해 TOP N(기본 50)을 산출한다.
//
// 안전 원칙:
//   - 위법 여부를 판단하지 않는다. 단정 표현(반복 수급 확정/부정수급 확정/불법/사기)을 쓰지 않는다.
//   - 대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않는다(보조 신호 최대 +5, 원문 미사용).
//   - groupKey/reason/evidence 에 개인정보 원문을 넣지 않는다(정규화 키·요약만 사용).
//   - 모든 후보는 reviewRequired=true.
//   - 외부 의존성 없이 구현한다(정규화 모듈만 재사용).

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { createEntityMatchCandidate } from "../normalizers/entityNameNormalizer.js";
import { createProjectSimilarityCandidate } from "../normalizers/projectNameSimilarity.js";
import { BaselineRecord } from "../types/dataQualityBaseline.js";
import {
  MatchedSignal,
  RepeatRiskCandidate,
  RepeatRiskLevel,
  RepeatRiskOptions,
  RepeatRiskRecordEvidence,
  RepeatRiskReport,
  REPEAT_RISK_AUX_MAX_SCORE,
  REPEAT_RISK_NOTICE,
  REPEAT_RISK_SIGNALS,
  RepeatRiskSignalCode
} from "../types/repeatSubsidyRisk.js";

// ---------- 1. runId ----------

export function createRepeatRiskRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `repeat_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 2. riskLevel ----------

export function getRepeatRiskLevel(score: number): RepeatRiskLevel {
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

// ---------- 4. 금액 유사도 ----------

/** 금액 차이 비율 기반 유사도(0~1). 둘 중 하나가 없으면 0. */
export function calculateAmountSimilarity(a?: number, b?: number): number {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  if (a === 0 && b === 0) return 1;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 1;
  const diff = Math.abs(a - b) / max;
  return Math.max(0, 1 - diff);
}

// ---------- 5. 연도 인접 ----------

export function isAdjacentFiscalYear(a?: number, b?: number): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= 1;
}

// ---------- 6. groupKey ----------

/** 기관명 키 / 주소 키 / 사업명 키를 조합한 groupKey. 개인정보 원문 미포함. */
export function buildRepeatGroupKey(a: BaselineRecord, b: BaselineRecord): string {
  const parts: string[] = [];
  if (a.normalizedRecipientName && a.normalizedRecipientName === b.normalizedRecipientName) {
    parts.push(`recip:${a.normalizedRecipientName}`);
  }
  if (a.normalizedAddressKey && a.normalizedAddressKey === b.normalizedAddressKey) {
    parts.push(`addr:${a.normalizedAddressKey}`);
  } else if (a.addressRegionKey && a.addressRegionKey === b.addressRegionKey) {
    parts.push(`region:${a.addressRegionKey}`);
  }
  if (a.projectNameCompactKey && a.projectNameCompactKey === b.projectNameCompactKey) {
    parts.push(`proj:${a.projectNameCompactKey}`);
  }
  if (parts.length === 0) {
    // 키 일치가 없으면(유사도 기반) 가장 약한 식별자로 묶는다 — 원문은 넣지 않음
    parts.push(`recip:${a.normalizedRecipientName ?? "?"}`);
    parts.push(`proj:${a.projectNameCompactKey ?? "?"}`);
  }
  return parts.sort().join("|").toLowerCase();
}

// ---------- 7. 증거 추출 ----------

/** BaselineRecord 에서 증거용 필드만 추출. 개인정보 원문 제외(정규화 키·요약만). */
export function extractRepeatEvidence(r: BaselineRecord): RepeatRiskRecordEvidence {
  // localGovName/projectName 은 기준선 단계에서 이미 마스킹되었지만 방어적으로 재마스킹.
  const safe = (v?: string) => (v ? sanitizeForStorage(v).sanitizedText : undefined);
  return {
    id: r.id,
    fiscalYear: r.fiscalYear,
    localGovName: safe(r.localGovName),
    projectName: safe(r.projectName),
    projectNameCompactKey: r.projectNameCompactKey,
    normalizedRecipientName: r.normalizedRecipientName,
    normalizedAddressKey: r.normalizedAddressKey,
    addressRegionKey: r.addressRegionKey,
    subsidyAmount: r.subsidyAmount,
    documentType: r.documentType,
    sourceUrl: r.sourceUrl,
    evidenceUrl: r.evidenceUrl
  };
}

// ---------- 8. 신호 평가 ----------

export interface RepeatSignalResult {
  matchedSignals: MatchedSignal[];
  rawScore: number;
}

function addSignal(list: MatchedSignal[], code: RepeatRiskSignalCode, scoreOverride?: number): void {
  const def = REPEAT_RISK_SIGNALS[code];
  list.push({ code, label: def.label, score: scoreOverride ?? def.score });
}

/**
 * 두 레코드 간 matchedSignals 와 rawScore 계산.
 * 정규화 키(기관명/주소/사업명) + 연도 + 금액 + 근거를 사용한다.
 * 대표자명·전화번호는 원문 기준으로 사용하지 않는다(보조 신호 최대 +5, 기본 미적용).
 */
export function evaluateRepeatSignals(
  a: BaselineRecord,
  b: BaselineRecord
): RepeatSignalResult {
  const signals: MatchedSignal[] = [];

  // 기관명
  const recipKeyMatch =
    !!a.normalizedRecipientName && a.normalizedRecipientName === b.normalizedRecipientName;
  if (recipKeyMatch) {
    addSignal(signals, "RECIPIENT_KEY_MATCH");
  } else if (a.recipientName && b.recipientName) {
    const dec = createEntityMatchCandidate(a.recipientName, b.recipientName).decision;
    if (dec === "strong_match" || dec === "likely_match") addSignal(signals, "RECIPIENT_NAME_SIMILAR");
  }

  // 주소 (단독 기준 금지 — 다른 신호와 결합되어야 의미)
  if (a.normalizedAddressKey && a.normalizedAddressKey === b.normalizedAddressKey) {
    addSignal(signals, "ADDRESS_KEY_MATCH");
  } else if (a.addressRegionKey && a.addressRegionKey === b.addressRegionKey) {
    addSignal(signals, "ADDRESS_REGION_MATCH");
  }

  // 사업명
  let projSimilar = false;
  if (a.projectNameCompactKey && a.projectNameCompactKey === b.projectNameCompactKey) {
    projSimilar = true;
  } else if (a.projectName && b.projectName) {
    const dec = createProjectSimilarityCandidate(a.projectName, b.projectName).decision;
    if (dec === "strong_similar" || dec === "similar_candidate") projSimilar = true;
  }
  if (projSimilar) addSignal(signals, "PROJECT_SIMILAR");

  // 연도
  if (a.fiscalYear != null && b.fiscalYear != null) {
    if (a.fiscalYear === b.fiscalYear) addSignal(signals, "FISCAL_YEAR_SAME");
    else if (isAdjacentFiscalYear(a.fiscalYear, b.fiscalYear)) addSignal(signals, "FISCAL_YEAR_ADJACENT");
  }

  // 금액 (차이 10% 이내)
  if (calculateAmountSimilarity(a.subsidyAmount, b.subsidyAmount) >= 0.9) {
    addSignal(signals, "AMOUNT_SIMILAR");
  }

  // 근거 존재
  if ((a.evidenceUrl || a.sourceUrl) && (b.evidenceUrl || b.sourceUrl)) {
    addSignal(signals, "EVIDENCE_PRESENT");
  }

  // 대표자명/전화번호 보조 신호: BaselineRecord 는 원문을 보관하지 않으므로 적용하지 않는다(0).
  // (향후 마스킹/해시된 보조 신호가 별도로 제공될 때만 최대 +REPEAT_RISK_AUX_MAX_SCORE 가산)
  void REPEAT_RISK_AUX_MAX_SCORE;

  const rawScore = signals.reduce((sum, s) => sum + s.score, 0);
  return { matchedSignals: signals, rawScore };
}

// ---------- reason ----------

function buildReason(signals: MatchedSignal[]): string {
  const codes = new Set(signals.map((s) => s.code));
  const phrases: string[] = [];
  if (codes.has("RECIPIENT_KEY_MATCH") || codes.has("RECIPIENT_NAME_SIMILAR")) {
    if (codes.has("PROJECT_SIMILAR")) {
      phrases.push("동일 기관명 키와 유사 사업명이 반복되어 검토가 필요합니다.");
    } else {
      phrases.push("동일 기관명 후보가 여러 보조사업에서 확인되어 추가 확인이 필요합니다.");
    }
  }
  if (codes.has("ADDRESS_KEY_MATCH") || codes.has("ADDRESS_REGION_MATCH")) {
    phrases.push("동일 주소 후보에서 여러 보조사업 레코드가 확인되어 추가 확인이 필요합니다.");
  }
  if (codes.has("AMOUNT_SIMILAR") && (codes.has("FISCAL_YEAR_SAME") || codes.has("FISCAL_YEAR_ADJACENT"))) {
    phrases.push("금액과 연도가 유사하므로 반복 신청 검토 후보로 분류되었습니다.");
  }
  if (phrases.length === 0) {
    phrases.push("일부 정규화 신호가 일치하여 반복 수급 검토 후보로 분류되었습니다.");
  }
  return phrases.join(" ");
}

// ---------- 9. 후보 생성 ----------

export function createRepeatRiskCandidate(
  a: BaselineRecord,
  b: BaselineRecord,
  runId = "run"
): RepeatRiskCandidate {
  const { matchedSignals, rawScore } = evaluateRepeatSignals(a, b);
  const riskScore = clampRiskScore(rawScore);
  return {
    candidateId: `${runId}_${a.id}__${b.id}`,
    involvedRecordIds: [a.id, b.id],
    riskScore,
    riskLevel: getRepeatRiskLevel(riskScore),
    groupKey: buildRepeatGroupKey(a, b),
    matchedSignals,
    evidence: { left: extractRepeatEvidence(a), right: extractRepeatEvidence(b) },
    reason: buildReason(matchedSignals),
    reviewRequired: true,
    createdAt: new Date().toISOString()
  };
}

// ---------- 10. dedupe ----------

/** 같은 groupKey 후보 중 가장 높은 점수만 대표로 남긴다. */
export function dedupeRepeatCandidates(candidates: RepeatRiskCandidate[]): RepeatRiskCandidate[] {
  const best = new Map<string, RepeatRiskCandidate>();
  for (const c of candidates) {
    const cur = best.get(c.groupKey);
    if (!cur || c.riskScore > cur.riskScore) best.set(c.groupKey, c);
  }
  return Array.from(best.values());
}

// ---------- 11. 정렬 ----------

export function sortRepeatCandidates(candidates: RepeatRiskCandidate[]): RepeatRiskCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    if (b.matchedSignals.length !== a.matchedSignals.length)
      return b.matchedSignals.length - a.matchedSignals.length;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// ---------- 12. TOP N ----------

export function selectTopRepeatCandidates(
  candidates: RepeatRiskCandidate[],
  limit = 50
): RepeatRiskCandidate[] {
  return sortRepeatCandidates(candidates).slice(0, limit);
}

// ---------- blocking (효율적 쌍 생성) ----------

function buildPairs(records: BaselineRecord[]): Array<[number, number]> {
  const blocks = new Map<string, number[]>();
  const addBlock = (key: string | undefined, idx: number) => {
    if (!key) return;
    const arr = blocks.get(key) ?? [];
    arr.push(idx);
    blocks.set(key, arr);
  };
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    addBlock(r.normalizedRecipientName ? `recip:${r.normalizedRecipientName}` : undefined, i);
    addBlock(r.normalizedAddressKey ? `addr:${r.normalizedAddressKey}` : undefined, i);
    addBlock(r.addressRegionKey ? `region:${r.addressRegionKey}` : undefined, i);
    addBlock(r.projectNameCompactKey ? `proj:${r.projectNameCompactKey}` : undefined, i);
  }
  const seen = new Set<string>();
  const pairs: Array<[number, number]> = [];
  for (const idxs of blocks.values()) {
    if (idxs.length < 2 || idxs.length > 500) continue; // 과대 블록은 생략(성능/품질)
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const i = Math.min(idxs[x], idxs[y]);
        const j = Math.max(idxs[x], idxs[y]);
        const pk = `${i}_${j}`;
        if (seen.has(pk)) continue;
        seen.add(pk);
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}

// ---------- 13. 리포트 생성 ----------

export function generateRepeatRiskReport(
  records: BaselineRecord[],
  options: RepeatRiskOptions = {}
): RepeatRiskReport {
  const runId = options.runId ?? createRepeatRiskRunId();
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 40;
  const isRealData = options.isRealData ?? false;

  const pairs = buildPairs(records);
  const candidates: RepeatRiskCandidate[] = [];
  for (const [i, j] of pairs) {
    const cand = createRepeatRiskCandidate(records[i], records[j], runId);
    if (cand.riskScore >= minScore) candidates.push(cand);
  }

  const deduped = dedupeRepeatCandidates(candidates);
  const top = selectTopRepeatCandidates(deduped, limit);

  const signalSummary: Record<string, number> = {};
  for (const c of deduped) {
    for (const s of c.matchedSignals) signalSummary[s.code] = (signalSummary[s.code] ?? 0) + 1;
  }

  const notes: string[] = [
    "동일 기관/주소/유사 사업명/연도/금액은 의심 신호가 아니라 검토 신호입니다.",
    "동일 주소는 공유공간·공공시설·복지관·회관일 수 있고, 같은 기관이 여러 보조사업을 수행하는 것은 정상일 수 있습니다.",
    "대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않으며 개인정보 원문은 저장·노출하지 않습니다.",
    "결과는 반복 수급 후보이며 사실관계 점검과 사람 검토가 필요합니다."
  ];
  if (!isRealData) {
    notes.push("본 실행은 fixture 기반 검증입니다 — 실제 반복 수급 탐지 완료가 아닙니다.");
  }

  return {
    runId,
    generatedAt: new Date().toISOString(),
    isRealData,
    sourceNote: options.sourceNote ?? (isRealData ? "real-data" : "fixture-synthetic"),
    totalRecords: records.length,
    totalPairsEvaluated: pairs.length,
    totalCandidates: deduped.length,
    topCandidates: top,
    signalSummary,
    notes
  };
}

// ---------- 14. 마크다운 ----------

export function renderRepeatRiskReportMarkdown(report: RepeatRiskReport): string {
  const lines: string[] = [];
  lines.push(`# 반복 수급 후보 TOP ${Math.min(report.topCandidates.length, 50)} (${report.runId})`);
  lines.push("");
  lines.push(`- 생성일시: ${report.generatedAt}`);
  lines.push(`- 데이터 구분: ${report.isRealData ? "실데이터" : "fixture(검증용 — 실제 탐지 완료 아님)"} / ${report.sourceNote}`);
  lines.push(`- 적재 레코드: ${report.totalRecords} / 평가 쌍: ${report.totalPairsEvaluated} / 후보: ${report.totalCandidates}`);
  lines.push("");
  lines.push("> 본 결과는 '반복 수급 후보 / 검토 필요 후보'이며 부정수급 판단이 아닙니다. 모든 후보는 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("## 신호 요약");
  lines.push("");
  for (const [code, n] of Object.entries(report.signalSummary)) lines.push(`- ${code}: ${n}건`);
  lines.push("");
  lines.push("## 후보 목록");
  lines.push("");
  lines.push("| 순위 | riskScore | riskLevel | groupKey | matchedSignals | reason |");
  lines.push("|---:|---:|---|---|---|---|");
  report.topCandidates.forEach((c, i) => {
    const sigs = c.matchedSignals.map((s) => s.code).join(", ");
    lines.push(`| ${i + 1} | ${c.riskScore} | ${c.riskLevel} | ${c.groupKey} | ${sigs} | ${c.reason} |`);
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const n of report.notes) lines.push(`- ${n}`);
  return lines.join("\n");
}

// ---------- 15. 저장 ----------

export async function writeRepeatRiskReport(
  outputDir: string,
  report: RepeatRiskReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "repeat-risk-report.json");
  const reportMdFile = path.join(runDir, "repeat-risk-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderRepeatRiskReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

export { REPEAT_RISK_NOTICE };
