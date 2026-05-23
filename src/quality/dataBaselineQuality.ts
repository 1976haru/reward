// 실데이터 1차 기준선 / 데이터 품질검증 모듈 (체크리스트 16).
//
// 업로드 parser / API collector 결과(records.jsonl) 또는 fixture 입력을 표준 기준선 레코드로
// 정규화해 경량 JSONL 저장소에 적재하고, 수집건수·중복률·결측률 등 품질 지표를 계산한다.
//
// 안전 원칙:
//   - 개인정보 원문은 저장하지 않는다(저장 전 sanitizeForStorage 통과).
//   - fixture 는 실데이터 기준선으로 간주하지 않는다(상태로 명확히 구분).
//   - 중복률·결측률은 품질 지표이며 부정수급 판단 근거가 아니다(중립 표현).
//   - 외부 의존성 없이 구현한다.
//
// 본 모듈은 법률 자문을 대체하지 않으며, 기준선은 분석 입력이지 신고 근거 확정 자료가 아니다.

import path from "node:path";
import { appendFile, writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { normalizeEntityName } from "../normalizers/entityNameNormalizer.js";
import { normalizeProjectName } from "../normalizers/projectNameSimilarity.js";
import {
  BaselineErrorEntry,
  BaselineErrorLog,
  BaselineQualityReport,
  BaselineRecord,
  BaselineSourceType,
  BaselineStatus,
  BASELINE_MISSING_RATE_FIELDS,
  BASELINE_REQUIRED_FIELDS,
  BASELINE_SOURCE_TYPES,
  BASELINE_TARGET_RECORDS,
  DATA_BASELINE_NOTICE
} from "../types/dataQualityBaseline.js";

// ---------- 옵션 ----------

export interface BaselineBuildOptions {
  sourceType: BaselineSourceType;
  sourceName: string;
  outputDir?: string;
  runId?: string;
}

export interface BaselineBuildResult {
  runId: string;
  records: BaselineRecord[];
  report: BaselineQualityReport;
  errorLog: BaselineErrorLog;
  recordsFile: string;
  qualityReportJsonFile: string;
  qualityReportMdFile: string;
  errorLogFile: string;
}

// ---------- 유틸 ----------

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (typeof value === "number") return Number.isNaN(value);
  if (Array.isArray(value)) return false; // 배열은 존재하면 결측 아님(빈 배열도 유효)
  return false;
}

function sanitizeText(value: unknown, detected: Set<string>): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const res = sanitizeForStorage(s);
  for (const t of res.detectedTypes) detected.add(t);
  return res.sanitizedText;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function createBaselineRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `baseline_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 1. 레코드 정규화 ----------

/**
 * 임의 입력 객체(업로드 parser/collector 레코드 또는 fixture)를 표준 BaselineRecord 로 정규화한다.
 * 저장 전 sanitizeForStorage 로 마스킹하고, 정규화 키(사업명/기관명)를 채운다.
 */
export function normalizeToBaselineRecord(
  raw: Record<string, unknown>,
  ctx: { sourceType: BaselineSourceType; sourceName: string; index: number; runId: string }
): BaselineRecord {
  const detected = new Set<string>(
    Array.isArray(raw.privacyDetectedTypes) ? (raw.privacyDetectedTypes as string[]) : []
  );
  const warnings: string[] = Array.isArray(raw.qualityWarnings)
    ? [...(raw.qualityWarnings as string[])]
    : Array.isArray(raw.parseWarnings)
      ? [...(raw.parseWarnings as string[])]
      : [];

  const projectName = sanitizeText(raw.projectName, detected) ?? "";
  const recipientName = sanitizeText(raw.recipientName, detected);

  const projectNameCompactKey =
    (typeof raw.projectNameCompactKey === "string" && raw.projectNameCompactKey) ||
    (projectName && !projectName.startsWith("(") ? normalizeProjectName(projectName).compactName : "") ||
    undefined;
  const normalizedRecipientName =
    (typeof raw.normalizedRecipientName === "string" && raw.normalizedRecipientName) ||
    (recipientName ? normalizeEntityName(recipientName).compactName : "") ||
    undefined;

  const record: BaselineRecord = {
    id: typeof raw.id === "string" && raw.id ? raw.id : `${ctx.runId}_${ctx.index}`,
    sourceType: ctx.sourceType,
    sourceName: ctx.sourceName,
    sourceFileName: sanitizeText(raw.sourceFileName, detected),
    sourceUrl: sanitizeText(raw.sourceUrl, detected),
    collectedAt: typeof raw.collectedAt === "string" && raw.collectedAt ? raw.collectedAt : new Date().toISOString(),
    fiscalYear: toNumberOrUndefined(raw.fiscalYear),
    localGovName: sanitizeText(raw.localGovName, detected),
    ministryName: sanitizeText(raw.ministryName, detected),
    agencyName: sanitizeText(raw.agencyName, detected),
    projectName,
    projectNameCompactKey,
    recipientName,
    normalizedRecipientName,
    normalizedAddressKey: typeof raw.normalizedAddressKey === "string" ? raw.normalizedAddressKey : undefined,
    addressRegionKey: typeof raw.addressRegionKey === "string" ? raw.addressRegionKey : undefined,
    subsidyAmount: toNumberOrUndefined(raw.subsidyAmount),
    executionAmount: toNumberOrUndefined(raw.executionAmount),
    settlementAmount: toNumberOrUndefined(raw.settlementAmount),
    returnAmount: toNumberOrUndefined(raw.returnAmount),
    documentType: (typeof raw.documentType === "string" && raw.documentType) || "unknown",
    evidenceUrl: sanitizeText(raw.evidenceUrl, detected),
    privacyDetectedTypes: Array.from(detected),
    qualityWarnings: warnings.length > 0 ? warnings : undefined
  };

  // 필수 필드 결측 경고
  const missingRequired = BASELINE_REQUIRED_FIELDS.filter((f) => isMissing(record[f]));
  if (missingRequired.length > 0) {
    record.qualityWarnings = [
      ...(record.qualityWarnings ?? []),
      `필수 필드 결측: ${missingRequired.join(", ")}`
    ];
  }

  return record;
}

// ---------- 2. dedupe 키 ----------

/** Runbook §6 기본 dedupeKey. 중복은 삭제가 아니라 후보로만 표시한다. */
export function computeDedupeKey(r: BaselineRecord): string {
  return [
    r.sourceType ?? "",
    r.fiscalYear ?? "",
    (r.localGovName ?? "").toLowerCase(),
    (r.projectNameCompactKey ?? "").toLowerCase(),
    (r.normalizedRecipientName ?? "").toLowerCase(),
    r.subsidyAmount ?? ""
  ].join("|");
}

// ---------- 3. 품질 지표 계산 ----------

export interface BaselineQualityMetrics {
  totalRecords: number;
  uniqueRecords: number;
  duplicateCount: number;
  duplicateRate: number;
  missingRate: number;
  fieldMissingRates: Record<string, number>;
  privacyDetectedCount: number;
  parseWarningCount: number;
  sourceCoverage: Record<string, number>;
  yearCoverage: Record<string, number>;
  duplicateCandidates: Array<{ dedupeKey: string; ids: string[]; count: number }>;
}

export function computeBaselineQuality(records: BaselineRecord[]): BaselineQualityMetrics {
  const total = records.length;

  // 중복: dedupeKey 그룹화 (식별 토큰이 비어 거의 빈 키면 중복 판정에서 제외)
  const groups = new Map<string, string[]>();
  for (const r of records) {
    const key = computeDedupeKey(r);
    const meaningful = key.replace(/\|/g, "").trim().length > 0 && (r.projectNameCompactKey ?? "").length > 0;
    if (!meaningful) continue;
    const arr = groups.get(key) ?? [];
    arr.push(r.id);
    groups.set(key, arr);
  }
  const duplicateCandidates: Array<{ dedupeKey: string; ids: string[]; count: number }> = [];
  let duplicateCount = 0;
  for (const [key, ids] of groups) {
    if (ids.length > 1) {
      duplicateCount += ids.length - 1; // 첫 건 제외 나머지가 중복 의심
      duplicateCandidates.push({ dedupeKey: key, ids, count: ids.length });
    }
  }
  const uniqueRecords = total - duplicateCount;
  const duplicateRate = total > 0 ? duplicateCount / total : 0;

  // 결측률
  const fieldMissingRates: Record<string, number> = {};
  let totalMissingCells = 0;
  for (const field of BASELINE_MISSING_RATE_FIELDS) {
    let miss = 0;
    for (const r of records) if (isMissing(r[field])) miss++;
    fieldMissingRates[field as string] = total > 0 ? miss / total : 0;
    totalMissingCells += miss;
  }
  const missingRate =
    total > 0 ? totalMissingCells / (total * BASELINE_MISSING_RATE_FIELDS.length) : 0;

  // 기타 집계
  let privacyDetectedCount = 0;
  let parseWarningCount = 0;
  const sourceCoverage: Record<string, number> = {};
  const yearCoverage: Record<string, number> = {};
  for (const r of records) {
    if (r.privacyDetectedTypes.length > 0) privacyDetectedCount++;
    if (r.qualityWarnings && r.qualityWarnings.length > 0) parseWarningCount++;
    const sk = `${r.sourceType}:${r.sourceName}`;
    sourceCoverage[sk] = (sourceCoverage[sk] ?? 0) + 1;
    const yk = r.fiscalYear != null ? String(r.fiscalYear) : "unknown";
    yearCoverage[yk] = (yearCoverage[yk] ?? 0) + 1;
  }

  duplicateCandidates.sort((a, b) => b.count - a.count);

  return {
    totalRecords: total,
    uniqueRecords,
    duplicateCount,
    duplicateRate,
    missingRate,
    fieldMissingRates,
    privacyDetectedCount,
    parseWarningCount,
    sourceCoverage,
    yearCoverage,
    duplicateCandidates: duplicateCandidates.slice(0, 100) // 상위 100그룹만 보관
  };
}

// ---------- 4. 상태 판정 ----------

export function determineBaselineStatus(records: BaselineRecord[]): {
  status: BaselineStatus;
  isRealData: boolean;
} {
  const total = records.length;
  const realCount = records.filter(
    (r) => r.sourceType === "api" || r.sourceType === "upload" || r.sourceType === "manual"
  ).length;
  if (total < BASELINE_TARGET_RECORDS) return { status: "incomplete", isRealData: false };
  if (realCount >= BASELINE_TARGET_RECORDS) return { status: "real_baseline_ok", isRealData: true };
  return { status: "fixture_pending", isRealData: false };
}

// ---------- 5. 품질 리포트 마크다운 ----------

const STATUS_LABEL: Record<BaselineStatus, string> = {
  real_baseline_ok: "실데이터 기준선 구축 가능 (api/upload/manual 1,000건 이상)",
  fixture_pending: "fixture 경로 검증 완료 — 실데이터 기준선 구축 보류",
  incomplete: "1,000건 미만 — 적재 미완료"
};

export function renderQualityReportMarkdown(report: BaselineQualityReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const lines: string[] = [];
  lines.push(`# 데이터 품질 리포트 (${report.runId})`);
  lines.push("");
  lines.push(`- 생성일시: ${report.generatedAt}`);
  lines.push(`- 상태: ${report.status} — ${STATUS_LABEL[report.status]}`);
  lines.push(`- 실데이터 여부: ${report.isRealData ? "예" : "아니오 (fixture/혼합 — 실데이터 기준선 아님)"}`);
  lines.push(`- 적재 출처 유형: ${report.sourceTypesPresent.join(", ")}`);
  lines.push("");
  lines.push("## 수집/품질 지표");
  lines.push("");
  lines.push("| 지표 | 값 |");
  lines.push("|---|---|");
  lines.push(`| 수집건수(totalRecords) | ${report.totalRecords} |`);
  lines.push(`| 고유건수(uniqueRecords) | ${report.uniqueRecords} |`);
  lines.push(`| 중복 의심(duplicateCount) | ${report.duplicateCount} |`);
  lines.push(`| 중복률(duplicateRate) | ${pct(report.duplicateRate)} |`);
  lines.push(`| 결측률(missingRate, 대상 필드 평균) | ${pct(report.missingRate)} |`);
  lines.push(`| 개인정보 탐지 건수 | ${report.privacyDetectedCount} |`);
  lines.push(`| 품질 경고 건수 | ${report.parseWarningCount} |`);
  lines.push("");
  lines.push("## 필드별 결측률");
  lines.push("");
  lines.push("| 필드 | 결측률 |");
  lines.push("|---|---|");
  for (const [field, rate] of Object.entries(report.fieldMissingRates)) {
    lines.push(`| ${field} | ${pct(rate)} |`);
  }
  lines.push("");
  lines.push("## 출처별 커버리지");
  lines.push("");
  for (const [k, v] of Object.entries(report.sourceCoverage)) lines.push(`- ${k}: ${v}건`);
  lines.push("");
  lines.push("## 연도별 커버리지");
  lines.push("");
  for (const [k, v] of Object.entries(report.yearCoverage)) lines.push(`- ${k}: ${v}건`);
  lines.push("");
  lines.push("## 중복 후보 (상위)");
  lines.push("");
  lines.push(`- 중복 후보 그룹 수: ${report.duplicateCandidates.length}`);
  lines.push("- 중복은 삭제하지 않고 후보로만 표시합니다.");
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const n of report.notes) lines.push(`- ${n}`);
  return lines.join("\n");
}

// ---------- 6. 메인 빌드 ----------

export async function buildDataBaseline(
  rawRecords: Record<string, unknown>[],
  options: BaselineBuildOptions
): Promise<BaselineBuildResult> {
  const runId = options.runId ?? createBaselineRunId();
  const outputRoot = options.outputDir ?? process.env.DATA_BASELINE_OUTPUT_DIR ?? "data/baseline";
  const runDir = path.join(outputRoot, "runs", runId);
  const recordsFile = path.join(runDir, "records.jsonl");
  const qualityReportJsonFile = path.join(runDir, "quality-report.json");
  const qualityReportMdFile = path.join(runDir, "quality-report.md");
  const errorLogFile = path.join(runDir, "error-log.json");

  await ensureDir(runDir);
  await writeFile(recordsFile, "", "utf8");

  const errors: BaselineErrorEntry[] = [];
  const records: BaselineRecord[] = [];

  for (let i = 0; i < rawRecords.length; i++) {
    try {
      const rec = normalizeToBaselineRecord(rawRecords[i] ?? {}, {
        sourceType: options.sourceType,
        sourceName: options.sourceName,
        index: i,
        runId
      });
      records.push(rec);
      await appendFile(recordsFile, JSON.stringify(rec) + "\n", "utf8");
    } catch (e) {
      errors.push({
        at: new Date().toISOString(),
        phase: "normalize",
        reason: `레코드 ${i} 정규화 실패: ${(e instanceof Error ? e.message : String(e)).replace(/\d{3,}/g, "[num]").slice(0, 160)}`
      });
    }
  }

  const metrics = computeBaselineQuality(records);
  const { status, isRealData } = determineBaselineStatus(records);
  const sourceTypesPresent = Array.from(
    new Set(records.map((r) => r.sourceType))
  ).filter((t) => (BASELINE_SOURCE_TYPES as readonly string[]).includes(t)) as BaselineSourceType[];

  const notes: string[] = [
    "중복률·결측률은 데이터 품질 지표이며 부정수급 판단 근거가 아닙니다.",
    "기준선은 분석 입력이며 신고 근거 확정 자료가 아닙니다.",
    `중복 판정 dedupeKey = sourceType + fiscalYear + localGovName + projectNameCompactKey + normalizedRecipientName + subsidyAmount (식별 토큰이 비면 중복 계산 제외).`,
    `결측률 = 대상 ${BASELINE_MISSING_RATE_FIELDS.length}개 필드의 빈 값 셀 비율 평균.`
  ];
  if (status === "fixture_pending") {
    notes.push("fixture 1,000건은 적재 경로/품질 리포트 검증용입니다. 실데이터 기준선 구축은 보류 상태입니다.");
  } else if (status === "incomplete") {
    notes.push("적재 건수가 1,000건 미만입니다. 기준선 구축 미완료입니다.");
  }

  const report: BaselineQualityReport = {
    runId,
    generatedAt: new Date().toISOString(),
    status,
    isRealData,
    sourceTypesPresent,
    ...metrics,
    notes,
    recordsFile,
    qualityReportJsonFile,
    qualityReportMdFile,
    errorLogFile
  };

  const errorLog: BaselineErrorLog = { runId, errorsCount: errors.length, errors };

  await writeFile(qualityReportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(qualityReportMdFile, renderQualityReportMarkdown(report), "utf8");
  await writeFile(errorLogFile, JSON.stringify(errorLog, null, 2), "utf8");

  return {
    runId,
    records,
    report,
    errorLog,
    recordsFile,
    qualityReportJsonFile,
    qualityReportMdFile,
    errorLogFile
  };
}

export { DATA_BASELINE_NOTICE };
