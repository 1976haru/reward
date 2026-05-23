// 동일 주소 다수 단체 탐지 룰 모듈 (체크리스트 18).
//
// 보조사업 기준선 데이터(BaselineRecord)를 normalizedAddressKey / addressRegionKey 로 그룹화해
// 같은 주소 후보에 여러 단체(normalizedRecipientName)가 등장하는 "동일 주소 다수 단체 후보"를
// 점수화하고 TOP N(기본 50)을 산출한다.
//
// 안전 원칙:
//   - 위법 여부를 판단하지 않는다. 단정 표현(동일 주소 확정/위장 단체 확정/부정수급 확정/불법/사기)을 쓰지 않는다.
//   - 공유오피스·복지관·회관·공공시설 등 합리적 사유 가능성을 cautionNotes 에 중립적으로 반영한다.
//   - 대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않는다.
//   - addressGroupKey/evidence/reason/report 에 상세주소·개인정보 원문을 넣지 않는다(정규화 키만).
//   - 모든 후보는 reviewRequired=true. 외부 의존성 없이 구현한다.

import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { BaselineRecord } from "../types/dataQualityBaseline.js";
import {
  AddressClusterRecordEvidence,
  AddressClusterRiskCandidate,
  AddressClusterRiskLevel,
  AddressClusterRiskOptions,
  AddressClusterRiskReport,
  AddressClusterSignalCode,
  AddressKeyType,
  ADDRESS_CLUSTER_NOTICE,
  ADDRESS_CLUSTER_SIGNALS,
  MatchedSignal,
  PUBLIC_FACILITY_KEYWORDS
} from "../types/addressClusterRisk.js";

// ---------- 1. runId ----------

export function createAddressClusterRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `addrcluster_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 2. riskLevel ----------

export function getAddressClusterRiskLevel(score: number): AddressClusterRiskLevel {
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

// ---------- 4. 그룹화 ----------

/** records 를 주소 키(normalizedAddressKey 또는 addressRegionKey)로 그룹화한다. */
export function groupRecordsByAddress(
  records: BaselineRecord[],
  keyType: AddressKeyType
): Map<string, BaselineRecord[]> {
  const groups = new Map<string, BaselineRecord[]>();
  for (const r of records) {
    const key = keyType === "normalizedAddressKey" ? r.normalizedAddressKey : r.addressRegionKey;
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return groups;
}

// ---------- 5. 단체 수 ----------

export function countDistinctRecipients(records: BaselineRecord[]): number {
  const set = new Set<string>();
  for (const r of records) {
    if (r.normalizedRecipientName && r.normalizedRecipientName.trim().length > 0) {
      set.add(r.normalizedRecipientName);
    }
  }
  return set.size;
}

// ---------- 6. 회계연도 목록 ----------

export function extractFiscalYears(records: BaselineRecord[]): number[] {
  const set = new Set<number>();
  for (const r of records) if (r.fiscalYear != null) set.add(r.fiscalYear);
  return Array.from(set).sort((a, b) => a - b);
}

// ---------- 7. 총 보조금액 ----------

export function calculateTotalSubsidyAmount(records: BaselineRecord[]): number {
  return records.reduce((sum, r) => sum + (typeof r.subsidyAmount === "number" ? r.subsidyAmount : 0), 0);
}

// ---------- 8. 근거 비율 ----------

export function calculateEvidenceCoverage(records: BaselineRecord[]): number {
  if (records.length === 0) return 0;
  const withEvidence = records.filter((r) => r.evidenceUrl || r.sourceUrl).length;
  return withEvidence / records.length;
}

// ---------- 9. 공공시설 힌트 ----------

/** 복지관/회관/센터/공공시설 등 키워드 탐지 → cautionNotes. 점수는 올리지 않고 감점/주의로만 사용. */
export function detectPublicFacilityHints(records: BaselineRecord[]): string[] {
  const hits = new Set<string>();
  for (const r of records) {
    const hay = `${r.recipientName ?? ""} ${r.projectName ?? ""} ${r.localGovName ?? ""}`;
    for (const kw of PUBLIC_FACILITY_KEYWORDS) {
      if (hay.includes(kw)) hits.add(kw);
    }
  }
  return Array.from(hits);
}

// ---------- 유사 사업명 반복 수 ----------

function countSimilarProjects(records: BaselineRecord[]): number {
  const byKey = new Map<string, number>();
  for (const r of records) {
    if (r.projectNameCompactKey) byKey.set(r.projectNameCompactKey, (byKey.get(r.projectNameCompactKey) ?? 0) + 1);
  }
  let repeats = 0;
  for (const n of byKey.values()) if (n >= 2) repeats += n - 1;
  return repeats;
}

// ---------- 10. 신호/점수 평가 ----------

export interface AddressClusterSignalResult {
  matchedSignals: MatchedSignal[];
  rawScore: number;
  cautionNotes: string[];
  distinctRecipientCount: number;
  fiscalYears: number[];
  totalSubsidyAmount: number;
}

function addSignal(list: MatchedSignal[], code: AddressClusterSignalCode, scoreOverride?: number): void {
  const def = ADDRESS_CLUSTER_SIGNALS[code];
  list.push({ code, label: def.label, score: scoreOverride ?? def.score });
}

export function evaluateAddressClusterSignals(
  records: BaselineRecord[],
  keyType: AddressKeyType
): AddressClusterSignalResult {
  const signals: MatchedSignal[] = [];
  const cautionNotes: string[] = [];

  // 주소 키 그룹 기본 점수
  if (keyType === "normalizedAddressKey") addSignal(signals, "ADDRESS_KEY_GROUP");
  else addSignal(signals, "REGION_KEY_GROUP");

  // 서로 다른 단체 수 (2:+10, 3~4:+18, 5+:+25)
  const distinctRecipientCount = countDistinctRecipients(records);
  if (distinctRecipientCount >= 5) addSignal(signals, "DISTINCT_RECIPIENTS", 25);
  else if (distinctRecipientCount >= 3) addSignal(signals, "DISTINCT_RECIPIENTS", 18);
  else if (distinctRecipientCount >= 2) addSignal(signals, "DISTINCT_RECIPIENTS", 10);

  // 여러 회계연도
  const fiscalYears = extractFiscalYears(records);
  if (fiscalYears.length >= 2) addSignal(signals, "REPEATED_YEARS");

  // 유사 사업명 반복
  if (countSimilarProjects(records) >= 1) addSignal(signals, "SIMILAR_PROJECTS");

  // 총 보조금액 구간 (>=1억:+15, >=5천만:+10, >=1천만:+5)
  const totalSubsidyAmount = calculateTotalSubsidyAmount(records);
  if (totalSubsidyAmount >= 100_000_000) addSignal(signals, "TOTAL_AMOUNT", 15);
  else if (totalSubsidyAmount >= 50_000_000) addSignal(signals, "TOTAL_AMOUNT", 10);
  else if (totalSubsidyAmount >= 10_000_000) addSignal(signals, "TOTAL_AMOUNT", 5);

  // 근거 비율
  if (calculateEvidenceCoverage(records) >= 0.5) addSignal(signals, "EVIDENCE_COVERAGE");

  // 공공시설 힌트 → 주의 + 감점
  const facilityHints = detectPublicFacilityHints(records);
  if (facilityHints.length > 0) {
    addSignal(signals, "PUBLIC_FACILITY_HINT");
    cautionNotes.push(
      `공유오피스·복지관·회관·공공시설 등 합리적 사유 가능성이 있는 키워드가 확인되었습니다(${facilityHints.join(", ")}). 추가 확인이 필요합니다.`
    );
  }

  const rawScore = signals.reduce((sum, s) => sum + s.score, 0);
  return { matchedSignals: signals, rawScore, cautionNotes, distinctRecipientCount, fiscalYears, totalSubsidyAmount };
}

// ---------- 11. 증거 추출 ----------

export function extractAddressClusterEvidence(r: BaselineRecord): AddressClusterRecordEvidence {
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

// ---------- reason ----------

function buildReason(keyType: AddressKeyType, hasFacilityHint: boolean): string {
  const phrases: string[] = [];
  if (keyType === "normalizedAddressKey") {
    phrases.push("동일 주소 후보에서 여러 단체가 확인되어 추가 검토가 필요합니다.");
  } else {
    phrases.push("동일 지역 주소 키에서 여러 보조사업 레코드가 확인되어 사실관계 확인이 필요합니다.");
  }
  phrases.push("공유오피스·복지관·회관·공공시설 등 합리적 사유 가능성을 함께 검토해야 합니다.");
  void hasFacilityHint;
  return phrases.join(" ");
}

// ---------- 13. 후보 생성 ----------

export function createAddressClusterRiskCandidate(
  groupKey: string,
  keyType: AddressKeyType,
  records: BaselineRecord[],
  runId = "run"
): AddressClusterRiskCandidate {
  const ev = evaluateAddressClusterSignals(records, keyType);
  const riskScore = clampRiskScore(ev.rawScore);
  const addressGroupKey = keyType === "normalizedAddressKey" ? `addr:${groupKey}` : `region:${groupKey}`;
  return {
    candidateId: `${runId}_${addressGroupKey}`,
    addressGroupKey,
    addressKeyType: keyType,
    involvedRecordIds: records.map((r) => r.id).slice(0, 50),
    distinctRecipientCount: ev.distinctRecipientCount,
    fiscalYears: ev.fiscalYears,
    totalSubsidyAmount: ev.totalSubsidyAmount,
    riskScore,
    riskLevel: getAddressClusterRiskLevel(riskScore),
    matchedSignals: ev.matchedSignals,
    evidence: records.slice(0, 20).map(extractAddressClusterEvidence),
    reason: buildReason(keyType, ev.cautionNotes.length > 0),
    cautionNotes: ev.cautionNotes,
    reviewRequired: true,
    createdAt: new Date().toISOString()
  };
}

// ---------- 14. dedupe ----------

/** 같은 addressGroupKey 후보 중 높은 점수 대표만 남긴다. */
export function dedupeAddressClusterCandidates(
  candidates: AddressClusterRiskCandidate[]
): AddressClusterRiskCandidate[] {
  const best = new Map<string, AddressClusterRiskCandidate>();
  for (const c of candidates) {
    const cur = best.get(c.addressGroupKey);
    if (!cur || c.riskScore > cur.riskScore) best.set(c.addressGroupKey, c);
  }
  return Array.from(best.values());
}

// ---------- 15. 정렬 ----------

export function sortAddressClusterCandidates(
  candidates: AddressClusterRiskCandidate[]
): AddressClusterRiskCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    if (b.distinctRecipientCount !== a.distinctRecipientCount)
      return b.distinctRecipientCount - a.distinctRecipientCount;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

// ---------- 16. TOP N ----------

export function selectTopAddressClusterCandidates(
  candidates: AddressClusterRiskCandidate[],
  limit = 50
): AddressClusterRiskCandidate[] {
  return sortAddressClusterCandidates(candidates).slice(0, limit);
}

// ---------- 17. 리포트 ----------

export function generateAddressClusterRiskReport(
  records: BaselineRecord[],
  options: AddressClusterRiskOptions = {}
): AddressClusterRiskReport {
  const runId = options.runId ?? createAddressClusterRunId();
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 40;
  const minDistinct = options.minDistinctRecipients ?? 2;
  const isRealData = options.isRealData ?? false;

  const addrGroups = groupRecordsByAddress(records, "normalizedAddressKey");
  const regionGroups = groupRecordsByAddress(records, "addressRegionKey");

  // normalizedAddressKey 그룹으로 이미 다룬 region 키는 region 후보에서 제외(중복 방지)
  const coveredRegionKeys = new Set<string>();
  const candidates: AddressClusterRiskCandidate[] = [];

  for (const [key, recs] of addrGroups) {
    if (countDistinctRecipients(recs) < minDistinct) continue;
    candidates.push(createAddressClusterRiskCandidate(key, "normalizedAddressKey", recs, runId));
    for (const r of recs) if (r.addressRegionKey) coveredRegionKeys.add(r.addressRegionKey);
  }

  for (const [key, recs] of regionGroups) {
    // 단일 normalizedAddressKey 로 모두 묶이는 그룹은 addr 후보가 이미 대표 → 건너뜀
    const distinctAddrKeys = new Set(recs.map((r) => r.normalizedAddressKey ?? "").filter(Boolean));
    if (distinctAddrKeys.size <= 1 && coveredRegionKeys.has(key)) continue;
    if (countDistinctRecipients(recs) < minDistinct) continue;
    candidates.push(createAddressClusterRiskCandidate(key, "addressRegionKey", recs, runId));
  }

  const deduped = dedupeAddressClusterCandidates(candidates).filter((c) => c.riskScore >= minScore);
  const top = selectTopAddressClusterCandidates(deduped, limit);

  const signalSummary: Record<string, number> = {};
  for (const c of deduped) for (const s of c.matchedSignals) signalSummary[s.code] = (signalSummary[s.code] ?? 0) + 1;

  const notes: string[] = [
    "동일 주소에 여러 단체가 있어도 공유오피스·복지관·회관·주민센터·행정복지센터·공공시설·공동체 공간일 수 있습니다.",
    "같은 시설을 여러 단체가 사용하는 경우 정상일 수 있으며, 결과는 검토 후보입니다.",
    "대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않으며 상세주소·개인정보 원문은 저장·노출하지 않습니다.",
    "결과는 동일 주소 다수 단체 후보이며 사실관계 점검과 사람 검토가 필요합니다."
  ];
  if (!isRealData) notes.push("본 실행은 fixture 기반 검증입니다 — 실제 탐지 완료가 아닙니다.");

  return {
    runId,
    generatedAt: new Date().toISOString(),
    isRealData,
    sourceNote: options.sourceNote ?? (isRealData ? "real-data" : "fixture-synthetic"),
    totalRecords: records.length,
    totalAddressGroups: addrGroups.size + regionGroups.size,
    totalCandidates: deduped.length,
    topCandidates: top,
    signalSummary,
    notes
  };
}

// ---------- 18. 마크다운 ----------

export function renderAddressClusterRiskReportMarkdown(report: AddressClusterRiskReport): string {
  const lines: string[] = [];
  lines.push(`# 동일 주소 다수 단체 후보표 (TOP ${Math.min(report.topCandidates.length, 50)}) — ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.generatedAt}`);
  lines.push(`- 데이터 구분: ${report.isRealData ? "실데이터" : "fixture(검증용 — 실제 탐지 완료 아님)"} / ${report.sourceNote}`);
  lines.push(`- 적재 레코드: ${report.totalRecords} / 주소 그룹: ${report.totalAddressGroups} / 후보: ${report.totalCandidates}`);
  lines.push("");
  lines.push("> 본 결과는 '동일 주소 다수 단체 후보 / 추가 확인 필요 후보'이며 위법 여부 판단이 아닙니다. 공유오피스·복지관·공공시설 등 합리적 사유 가능성을 함께 검토해야 합니다. 모든 후보는 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("## 신호 요약");
  lines.push("");
  for (const [code, n] of Object.entries(report.signalSummary)) lines.push(`- ${code}: ${n}건`);
  lines.push("");
  lines.push("## 동일 주소 다수 단체 후보 목록");
  lines.push("");
  lines.push("| 순위 | riskScore | riskLevel | addressGroupKey | keyType | 단체수 | 연도 | 총액 | cautionNotes |");
  lines.push("|---:|---:|---|---|---|---:|---|---:|---|");
  report.topCandidates.forEach((c, i) => {
    const caution = c.cautionNotes.length > 0 ? "주의(합리적 사유 가능성)" : "-";
    lines.push(
      `| ${i + 1} | ${c.riskScore} | ${c.riskLevel} | ${c.addressGroupKey} | ${c.addressKeyType} | ${c.distinctRecipientCount} | ${c.fiscalYears.join("·")} | ${c.totalSubsidyAmount} | ${caution} |`
    );
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const n of report.notes) lines.push(`- ${n}`);
  return lines.join("\n");
}

// ---------- 19. 저장 ----------

export async function writeAddressClusterRiskReport(
  outputDir: string,
  report: AddressClusterRiskReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "address-cluster-risk-report.json");
  const reportMdFile = path.join(runDir, "address-cluster-risk-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderAddressClusterRiskReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

export { ADDRESS_CLUSTER_NOTICE };
