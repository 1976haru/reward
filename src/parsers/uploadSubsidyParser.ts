// CSV/PDF/엑셀 업로드 수집기 — 수동 업로드 파일 변환기 (체크리스트 12).
//
// 사람이 지자체 공개 페이지에서 내려받아 업로드했다고 가정한 CSV/XLSX/PDF 파일을
// 표준 보조금 레코드(StandardSubsidyRecordFromUpload)로 변환한다.
//
// 안전 원칙:
//   - 본 모듈은 웹 크롤러가 아니라 수동 업로드 파일 변환기다.
//   - 저장 전 모든 문자열은 sanitizeForStorage(privacyGuard) 로 마스킹한다.
//     주민번호/계좌번호/휴대폰/이메일/상세주소/민감정보 원문은 저장하지 않는다.
//   - sourceText 는 반드시 마스킹 후 저장한다.
//   - 변환 실패는 숨기지 않고 오류 로그로 남긴다. 오류 로그에도 개인정보 원문을 남기지 않는다.
//   - 스캔 이미지 PDF OCR 은 범위에서 제외한다 (텍스트 기반 PDF 기본 처리).
//
// 본 모듈은 위법 여부를 확정하지 않으며, 변환 결과는 의심 신호 분석의 입력 후보일 뿐이다.

import path from "node:path";
import zlib from "node:zlib";
import { appendFile, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { normalizeEntityName } from "../normalizers/entityNameNormalizer.js";
import { normalizeProjectName } from "../normalizers/projectNameSimilarity.js";
import {
  StandardSubsidyRecordFromUpload,
  UPLOAD_DOCUMENT_TYPE_KEYWORDS,
  UPLOAD_FIELD_ALIASES,
  UPLOAD_SUPPORTED_EXTENSIONS,
  UploadDocumentType,
  UploadParseStatus,
  UploadParserErrorEntry,
  UploadParserErrorLog,
  UploadParserFileSummary,
  UploadParserRunLog,
  UploadSourceFileType
} from "../types/uploadParser.js";

// ---------- 옵션 ----------

export interface UploadParseOptions {
  /** 출력 루트 (기본 data/upload-parser). runs/{runId} 하위에 저장. */
  outputDir?: string;
  /** 실행 ID 직접 지정. */
  runId?: string;
  /** XLSX 처리 시 대상 시트명 (미지정 시 첫 번째 시트). */
  sheetName?: string;
  /** 파일 컨텍스트 — 헤더에 없을 때 기본값으로 사용. */
  localGovName?: string;
  fiscalYear?: number;
}

export interface SingleFileParseResult {
  sourceFileName: string;
  sourceFileType: UploadSourceFileType;
  records: StandardSubsidyRecordFromUpload[];
  errors: UploadParserErrorEntry[];
}

export interface ParseRunResult {
  runId: string;
  records: StandardSubsidyRecordFromUpload[];
  runLog: UploadParserRunLog;
  errorLog: UploadParserErrorLog;
  recordsFile: string;
  parseLogFile: string;
  errorLogFile: string;
}

// ---------- 1. 파일 타입 판별 ----------

export function resolveUploadFileType(fileName: string): UploadSourceFileType {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".csv") return "csv";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".pdf") return "pdf";
  return "unsupported";
}

export function isSupportedUploadFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (UPLOAD_SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

// ---------- 2. 헤더 정규화 / 표준 필드 매핑 ----------

/** 헤더를 비교용으로 정규화: 공백/괄호/특수문자 제거, 소문자화. */
export function normalizeHeader(header: string): string {
  if (typeof header !== "string") return "";
  return header
    .replace(/[\s()[\]{}·.\-_/\\]+/g, "")
    .replace(/﻿/g, "")
    .trim()
    .toLowerCase();
}

/**
 * 원본 헤더명을 표준 필드명으로 매핑. 없으면 undefined.
 * 1차: 정확히 일치하는 별칭 우선 (예: "보조사업자"→recipientName, "보조사업명"→projectName).
 * 2차: 부분 포함 매칭 — 단, 짧은 토큰 오탐을 막기 위해 정규화 별칭 길이 3 이상만 허용.
 */
export function mapHeaderToStandardField(header: string): keyof typeof UPLOAD_FIELD_ALIASES | undefined {
  const norm = normalizeHeader(header);
  if (!norm) return undefined;
  // pass 1: exact
  for (const [stdField, aliases] of Object.entries(UPLOAD_FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (norm === normalizeHeader(alias)) return stdField as keyof typeof UPLOAD_FIELD_ALIASES;
    }
  }
  // pass 2: substring (별칭 길이 >= 3)
  for (const [stdField, aliases] of Object.entries(UPLOAD_FIELD_ALIASES)) {
    for (const alias of aliases) {
      const na = normalizeHeader(alias);
      if (na.length >= 3 && norm.includes(na)) return stdField as keyof typeof UPLOAD_FIELD_ALIASES;
    }
  }
  return undefined;
}

// ---------- 3. 금액 파싱 ----------

export interface AmountParseResult {
  amount?: number;
  warning?: string;
}

/**
 * "1,000,000원" / "5백만원" / "1,200천원" / "100만원" / "3억원" 등을 원화 숫자로 변환.
 * 단위가 불명확하면 warning 을 남긴다 (단순 숫자는 원으로 간주).
 */
export function parseAmountLike(value: unknown): AmountParseResult {
  if (value == null) return {};
  const raw = String(value).trim();
  if (raw === "" || raw === "-") return {};

  // 단위 토큰 식별
  let multiplier = 1;
  let hadUnit = false;
  if (/억/.test(raw)) {
    multiplier = 100_000_000;
    hadUnit = true;
  } else if (/백만원|백만/.test(raw)) {
    multiplier = 1_000_000;
    hadUnit = true;
  } else if (/만원|만/.test(raw)) {
    multiplier = 10_000;
    hadUnit = true;
  } else if (/천원|천/.test(raw)) {
    multiplier = 1_000;
    hadUnit = true;
  } else if (/원/.test(raw)) {
    multiplier = 1;
    hadUnit = true;
  }

  // 숫자만 추출 (콤마 제거)
  const numMatch = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) {
    return { warning: `금액을 숫자로 변환할 수 없습니다: "${truncate(raw, 30)}"` };
  }
  const base = Number(numMatch[0]);
  if (!Number.isFinite(base)) {
    return { warning: `금액 변환 실패: "${truncate(raw, 30)}"` };
  }
  const amount = Math.round(base * multiplier);
  const result: AmountParseResult = { amount };
  if (!hadUnit && /[가-힣A-Za-z]/.test(raw.replace(/,/g, "").replace(numMatch[0], ""))) {
    result.warning = `금액 단위가 불명확하여 원 단위로 간주했습니다: "${truncate(raw, 30)}"`;
  }
  return result;
}

// ---------- 6. 날짜 파싱 ----------

/** YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD / YYYY년 MM월 DD일 → YYYY-MM-DD. */
export function parseDateLike(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  let m = raw.match(/(\d{4})\s*[년]\s*(\d{1,2})\s*[월]\s*(\d{1,2})\s*[일]?/);
  if (!m) m = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return undefined;
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return undefined;
  return `${y}-${mo}-${d}`;
}

function parseYearLike(value: unknown): number | undefined {
  if (value == null) return undefined;
  const m = String(value).match(/(19|20)\d{2}/);
  if (!m) return undefined;
  return Number(m[0]);
}

// ---------- 7. documentType 추론 ----------

export function inferDocumentType(fileName: string, rowText = ""): UploadDocumentType {
  const haystack = `${fileName ?? ""} ${rowText ?? ""}`;
  for (const { type, keywords } of UPLOAD_DOCUMENT_TYPE_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return type;
  }
  return "unknown";
}

// ---------- 8. 레코드 마스킹 ----------

const TEXT_FIELDS_TO_SANITIZE: Array<keyof StandardSubsidyRecordFromUpload> = [
  "sourceText",
  "projectName",
  "recipientName",
  "departmentName",
  "localGovName",
  "evidenceNote"
];

/**
 * 표준 레코드의 문자열 필드를 sanitizeForStorage 로 마스킹하고,
 * 탐지된 개인정보 유형을 privacyDetectedTypes 에 기록한다.
 */
export function sanitizeUploadRecord(
  record: StandardSubsidyRecordFromUpload
): StandardSubsidyRecordFromUpload {
  const detected = new Set<string>(record.privacyDetectedTypes ?? []);
  const out = { ...record };

  for (const field of TEXT_FIELDS_TO_SANITIZE) {
    const val = out[field];
    if (typeof val === "string" && val.length > 0) {
      const res = sanitizeForStorage(val);
      (out as unknown as Record<string, unknown>)[field] = res.sanitizedText;
      for (const t of res.detectedTypes) detected.add(t);
    }
  }

  out.privacyDetectedTypes = Array.from(detected);
  return out;
}

// ---------- 9. 행 → 표준 레코드 변환 ----------

export interface RowConvertContext {
  sourceFileName: string;
  sourceFileType: UploadSourceFileType;
  sourceRowNumber?: number;
  localGovName?: string;
  fiscalYear?: number;
  documentTypeHint?: UploadDocumentType;
}

/**
 * CSV/XLSX 한 행(헤더→값 맵)을 표준 레코드로 변환.
 * projectName 이 없으면 partial(다른 필드 존재) 또는 failed(빈 행) 처리.
 */
export function convertRowToStandardRecord(
  row: Record<string, string>,
  context: RowConvertContext
): StandardSubsidyRecordFromUpload {
  const warnings: string[] = [];
  const mapped: Record<string, string> = {};

  for (const [header, value] of Object.entries(row)) {
    if (value == null || String(value).trim() === "") continue;
    const std = mapHeaderToStandardField(header);
    if (std && !(std in mapped)) {
      mapped[std] = String(value).trim();
    }
  }

  const rowText = Object.values(row)
    .filter((v) => v != null && String(v).trim() !== "")
    .join(" ");

  const record: StandardSubsidyRecordFromUpload = {
    recordId: makeUploadRecordId(context.sourceFileType, context.sourceFileName, context.sourceRowNumber),
    parsedAt: new Date().toISOString(),
    sourceFileName: context.sourceFileName,
    sourceFileType: context.sourceFileType,
    sourceRowNumber: context.sourceRowNumber,
    pageNumber: context.sourceFileType === "pdf" ? context.sourceRowNumber : undefined,
    sourceText: truncate(rowText, 500),
    documentType:
      context.documentTypeHint ?? inferDocumentType(context.sourceFileName, rowText),
    projectName: mapped.projectName ?? "",
    privacyDetectedTypes: [],
    parseStatus: "parsed"
  };

  // 컨텍스트 / 헤더 기반 채움
  record.localGovName = mapped.localGovName ?? context.localGovName;
  record.recipientName = mapped.recipientName;
  record.departmentName = mapped.departmentName;
  record.fiscalYear = parseYearLike(mapped.fiscalYear) ?? context.fiscalYear;

  // 금액
  for (const [field, key] of [
    ["subsidyAmount", "subsidyAmount"],
    ["executionAmount", "executionAmount"],
    ["settlementAmount", "settlementAmount"],
    ["returnAmount", "returnAmount"]
  ] as const) {
    if (mapped[key] != null) {
      const { amount, warning } = parseAmountLike(mapped[key]);
      if (amount != null) (record as unknown as Record<string, unknown>)[field] = amount;
      if (warning) warnings.push(warning);
    }
  }

  // 일자
  if (mapped.projectPeriodStart) record.projectPeriodStart = parseDateLike(mapped.projectPeriodStart);
  if (mapped.projectPeriodEnd) record.projectPeriodEnd = parseDateLike(mapped.projectPeriodEnd);
  if (mapped.noticeDate) record.noticeDate = parseDateLike(mapped.noticeDate);

  // 상태 판정
  const hasAnyField = Object.keys(mapped).length > 0;
  if (!record.projectName) {
    if (hasAnyField) {
      record.parseStatus = "partial";
      warnings.push("필수 필드 projectName(사업명)을 찾지 못해 partial 처리했습니다.");
      record.projectName = "(미상 사업명)";
    } else {
      record.parseStatus = "failed";
      warnings.push("표준 필드로 매핑된 값이 없어 failed 처리했습니다.");
      record.projectName = "(변환 실패)";
    }
  } else if (warnings.length > 0) {
    record.parseStatus = "partial";
  }

  if (warnings.length > 0) record.parseWarnings = warnings;

  // 저장 전 마스킹
  const sanitized = sanitizeUploadRecord(record);

  // 기관명·단체명 정규화 (체크리스트 13) — 동일 기관 "후보" 키. 확정 병합 아님.
  if (sanitized.recipientName && sanitized.recipientName.trim().length > 0) {
    const norm = normalizeEntityName(sanitized.recipientName);
    if (norm.compactName.length > 0) sanitized.normalizedRecipientName = norm.compactName;
  }

  // 사업명 유사도 키 (체크리스트 15) — 유사 사업명/반복 신청 검토 후보 비교용. 확정 아님.
  if (sanitized.projectName && sanitized.projectName.trim().length > 0 && !sanitized.projectName.startsWith("(")) {
    const pn = normalizeProjectName(sanitized.projectName);
    if (pn.compactName.length > 0) sanitized.projectNameCompactKey = pn.compactName;
  }

  return sanitized;
}

// ---------- 10. CSV 파서 ----------

/** 따옴표/콤마/이스케이프("") 를 처리하는 간단 CSV 파서. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // BOM 제거
  const s = text.replace(/^﻿/, "");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // skip — \r\n 의 \r
      } else {
        field += c;
      }
    }
  }
  // 마지막 필드/행
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export async function parseCsvFile(
  filePath: string,
  context: Omit<RowConvertContext, "sourceFileType" | "sourceRowNumber">
): Promise<{ records: StandardSubsidyRecordFromUpload[]; warnings: string[] }> {
  const buf = await readFile(filePath);
  let text = buf.toString("utf8");
  const warnings: string[] = [];
  if (text.includes("�")) {
    warnings.push("UTF-8 디코딩 중 깨진 문자가 감지되었습니다(EUC-KR 가능성). 인코딩 자동 감지는 제한적입니다.");
  }
  const rows = parseCsvText(text);
  if (rows.length < 2) {
    return { records: [], warnings: [...warnings, "헤더 또는 데이터 행이 없습니다."] };
  }
  const headers = rows[0];
  const records: StandardSubsidyRecordFromUpload[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rows[i][idx] ?? "";
    });
    records.push(
      convertRowToStandardRecord(rowObj, {
        ...context,
        sourceFileType: "csv",
        sourceRowNumber: i
      })
    );
  }
  return { records, warnings };
}

// ---------- 11. XLSX 파서 ----------

export async function parseXlsxFile(
  filePath: string,
  context: Omit<RowConvertContext, "sourceFileType" | "sourceRowNumber">,
  sheetName?: string
): Promise<{ records: StandardSubsidyRecordFromUpload[]; warnings: string[] }> {
  const warnings: string[] = [];
  // 동적 import — xlsx 의존성. CJS interop 상 일부 메서드는 default 에만 노출되므로 default 우선.
  const mod = await import("xlsx");
  const XLSX = ((mod as unknown as { default?: typeof import("xlsx") }).default ?? mod) as typeof import("xlsx");
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const targetSheet = sheetName ?? wb.SheetNames[0];
  if (!targetSheet) return { records: [], warnings: ["시트를 찾을 수 없습니다."] };
  if (wb.SheetNames.length > 1) {
    warnings.push(`시트가 ${wb.SheetNames.length}개입니다 — '${targetSheet}' 시트만 처리했습니다.`);
  }
  const sheet = wb.Sheets[targetSheet];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  if (matrix.length < 2) return { records: [], warnings: [...warnings, "헤더 또는 데이터 행이 없습니다."] };

  const headers = (matrix[0] as unknown[]).map((h) => String(h ?? ""));
  const records: StandardSubsidyRecordFromUpload[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] as unknown[];
    if (!cells.some((c) => String(c ?? "").trim() !== "")) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = String(cells[idx] ?? "");
    });
    records.push(
      convertRowToStandardRecord(rowObj, {
        ...context,
        sourceFileType: "xlsx",
        sourceRowNumber: i
      })
    );
  }
  return { records, warnings };
}

// ---------- 12. PDF 파서 (텍스트 기반) ----------

/**
 * 텍스트 기반 PDF 에서 content stream 의 텍스트를 방어적으로 추출한다.
 * FlateDecode 스트림은 zlib 로 해제한다. 스캔 이미지 OCR 은 지원하지 않는다.
 */
export function extractPdfText(buf: Buffer): string[] {
  const latin1 = buf.toString("latin1");
  const lines: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;

  const collectFromContent = (content: Buffer): void => {
    const text = content.toString("latin1");
    let current: string[] = [];
    // (...) Tj / ' 와 [...] TJ 안의 (...) 문자열을 추출하고, 줄바꿈 연산자(Td/TD/T*)로 줄을 분리
    const tokenRe =
      /(\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'))|(\[((?:\\.|[^\\\]])*)\]\s*TJ)|((?:Td|TD|T\*))/g;
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(text)) !== null) {
      if (t[6]) {
        // 줄바꿈 연산자
        if (current.length > 0) {
          lines.push(decodePdfString(current.join("")));
          current = [];
        }
      } else if (t[2] != null) {
        current.push(t[2]);
      } else if (t[5] != null) {
        // TJ 배열 안의 (...) 추출
        const arr = t[5];
        const inner = /\(((?:\\.|[^\\()])*)\)/g;
        let im: RegExpExecArray | null;
        while ((im = inner.exec(arr)) !== null) current.push(im[1]);
      }
    }
    if (current.length > 0) lines.push(decodePdfString(current.join("")));
  };

  while ((m = streamRe.exec(latin1)) !== null) {
    const rawStart = m.index + m[0].indexOf(m[1]);
    const rawBytes = buf.subarray(rawStart, rawStart + Buffer.byteLength(m[1], "latin1"));
    // 앞 200바이트 딕셔너리에서 FlateDecode 여부 확인
    const dictStart = Math.max(0, m.index - 300);
    const dict = latin1.slice(dictStart, m.index);
    let content = rawBytes;
    if (/FlateDecode/.test(dict)) {
      try {
        content = zlib.inflateSync(rawBytes);
      } catch {
        // 해제 실패 — 원본으로 시도
      }
    }
    collectFromContent(content);
  }
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

/** PDF 문자열 이스케이프 해제 후 UTF-8 로 디코드. */
function decodePdfString(s: string): string {
  const unescaped = s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
  // latin1 로 들고 있던 바이트를 UTF-8 로 재해석
  return Buffer.from(unescaped, "latin1").toString("utf8");
}

/** "키: 값 | 키: 값" 형태의 줄을 헤더→값 맵으로 파싱. */
function parsePdfLineToRow(line: string): Record<string, string> {
  const row: Record<string, string> = {};
  const segments = line.includes("|") ? line.split("|") : [line];
  for (const seg of segments) {
    const idx = seg.indexOf(":");
    if (idx > 0) {
      const key = seg.slice(0, idx).trim();
      const val = seg.slice(idx + 1).trim();
      if (key) row[key] = val;
    }
  }
  return row;
}

export async function parsePdfFile(
  filePath: string,
  context: Omit<RowConvertContext, "sourceFileType" | "sourceRowNumber">
): Promise<{ records: StandardSubsidyRecordFromUpload[]; warnings: string[] }> {
  const buf = await readFile(filePath);
  const warnings: string[] = [];
  if (!buf.subarray(0, 5).toString("latin1").startsWith("%PDF")) {
    warnings.push("PDF 시그니처(%PDF)가 없습니다 — 텍스트 fixture 로 간주합니다.");
  }
  const lines = extractPdfText(buf);
  if (lines.length === 0) {
    return {
      records: [],
      warnings: [
        ...warnings,
        "텍스트를 추출하지 못했습니다. 스캔 이미지 PDF(OCR 필요)일 수 있으며 OCR은 범위에서 제외됩니다."
      ]
    };
  }

  // 컨텍스트 줄(지자체/회계연도) 추출
  let ctxLocalGov = context.localGovName;
  let ctxYear = context.fiscalYear;
  const fullText = lines.join(" ");
  const docHint = inferDocumentType(context.sourceFileName, fullText);

  const records: StandardSubsidyRecordFromUpload[] = [];
  let pageRow = 0;
  for (const line of lines) {
    const row = parsePdfLineToRow(line);
    const keys = Object.keys(row);
    // 컨텍스트 줄: 지자체/회계연도만 있는 경우
    if (keys.length > 0 && !hasProjectField(row)) {
      for (const k of keys) {
        const std = mapHeaderToStandardField(k);
        if (std === "localGovName" && row[k]) ctxLocalGov = row[k];
        if (std === "fiscalYear" && row[k]) ctxYear = parseYearLike(row[k]) ?? ctxYear;
      }
      // 사업 관련 필드가 전혀 없으면 데이터 행으로 만들지 않음
      if (!keys.some((k) => mapHeaderToStandardField(k) && mapHeaderToStandardField(k) !== "localGovName" && mapHeaderToStandardField(k) !== "fiscalYear")) {
        continue;
      }
    }
    if (keys.length === 0) continue;
    pageRow++;
    records.push(
      convertRowToStandardRecord(row, {
        ...context,
        sourceFileType: "pdf",
        sourceRowNumber: pageRow,
        localGovName: ctxLocalGov,
        fiscalYear: ctxYear,
        documentTypeHint: docHint
      })
    );
  }

  if (records.length === 0) {
    warnings.push("키:값 형태의 데이터 줄을 찾지 못했습니다.");
  }
  return { records, warnings };
}

function hasProjectField(row: Record<string, string>): boolean {
  return Object.keys(row).some((k) => mapHeaderToStandardField(k) === "projectName");
}

// ---------- 13. 단일 파일 변환 ----------

export async function parseUploadedSubsidyFile(
  filePath: string,
  options: UploadParseOptions = {}
): Promise<SingleFileParseResult> {
  const sourceFileName = path.basename(filePath);
  const sourceFileType = resolveUploadFileType(sourceFileName);
  const errors: UploadParserErrorEntry[] = [];
  const context = { sourceFileName, localGovName: options.localGovName, fiscalYear: options.fiscalYear };

  if (sourceFileType === "unsupported") {
    errors.push({
      at: new Date().toISOString(),
      sourceFileName,
      phase: "detect",
      reason: `지원하지 않는 확장자입니다(${path.extname(sourceFileName) || "확장자 없음"}). 지원: .csv/.xlsx/.pdf`
    });
    return { sourceFileName, sourceFileType, records: [], errors };
  }

  try {
    let out: { records: StandardSubsidyRecordFromUpload[]; warnings: string[] };
    if (sourceFileType === "csv") out = await parseCsvFile(filePath, context);
    else if (sourceFileType === "xlsx") out = await parseXlsxFile(filePath, context, options.sheetName);
    else out = await parsePdfFile(filePath, context);

    // 파일 수준 경고를 각 레코드에 부착하지 않고, 레코드가 0이면 오류로 승격
    if (out.records.length === 0) {
      errors.push({
        at: new Date().toISOString(),
        sourceFileName,
        phase: "parse",
        reason: `변환된 레코드가 없습니다. ${out.warnings.join(" / ") || "사유 미상"}`
      });
    }
    return { sourceFileName, sourceFileType, records: out.records, errors };
  } catch (e) {
    // 예외 메시지에 개인정보 원문이 섞이지 않도록 일반화
    const reason = `파싱 중 예외: ${generalizeError(e)}`;
    errors.push({ at: new Date().toISOString(), sourceFileName, phase: "parse", reason });
    return { sourceFileName, sourceFileType, records: [], errors };
  }
}

// ---------- 14. 다중 파일 처리 + 저장 ----------

export function createUploadParserRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `upload_${stamp}_${rand}`;
}

export async function parseUploadedSubsidyFiles(
  filePaths: string[],
  options: UploadParseOptions = {}
): Promise<ParseRunResult> {
  const runId = options.runId ?? createUploadParserRunId();
  const outputRoot = options.outputDir ?? process.env.UPLOAD_PARSER_OUTPUT_DIR ?? "data/upload-parser";
  const runDir = path.join(outputRoot, "runs", runId);
  const recordsFile = path.join(runDir, "records.jsonl");
  const parseLogFile = path.join(runDir, "parse-log.json");
  const errorLogFile = path.join(runDir, "error-log.json");

  await ensureDir(runDir);
  await writeFile(recordsFile, "", "utf8");

  const startedAt = new Date().toISOString();
  const allRecords: StandardSubsidyRecordFromUpload[] = [];
  const allErrors: UploadParserErrorEntry[] = [];
  const fileSummaries: UploadParserFileSummary[] = [];
  const notes: string[] = [];
  let sanitizedRecordCount = 0;

  for (const fp of filePaths) {
    const result = await parseUploadedSubsidyFile(fp, options);
    allErrors.push(...result.errors);

    let parsed = 0;
    let partial = 0;
    let failed = 0;
    const fileWarnings = new Set<string>();
    for (const rec of result.records) {
      if (rec.parseStatus === "parsed") parsed++;
      else if (rec.parseStatus === "partial") partial++;
      else failed++;
      if (rec.privacyDetectedTypes.length > 0) sanitizedRecordCount++;
      (rec.parseWarnings ?? []).forEach((w) => fileWarnings.add(w));
      await appendUploadParserJsonl(recordsFile, rec);
      allRecords.push(rec);
    }

    fileSummaries.push({
      sourceFileName: result.sourceFileName,
      sourceFileType: result.sourceFileType,
      recordCount: result.records.length,
      parsedCount: parsed,
      partialCount: partial,
      failedCount: failed,
      warnings: Array.from(fileWarnings)
    });
  }

  const finishedAt = new Date().toISOString();
  const parsedCount = allRecords.filter((r) => r.parseStatus === "parsed").length;
  const partialCount = allRecords.filter((r) => r.parseStatus === "partial").length;
  const failedCount = allRecords.filter((r) => r.parseStatus === "failed").length;

  if (sanitizedRecordCount > 0) {
    notes.push(`${sanitizedRecordCount}건 레코드에서 개인정보 패턴이 마스킹되었습니다.`);
  }

  const runLog: UploadParserRunLog = {
    runId,
    startedAt,
    finishedAt,
    totalFiles: filePaths.length,
    totalRecords: allRecords.length,
    parsedCount,
    partialCount,
    failedCount,
    sanitizedRecordCount,
    recordsFile,
    parseLogFile,
    errorLogFile,
    files: fileSummaries,
    notes
  };

  const errorLog: UploadParserErrorLog = {
    runId,
    errorsCount: allErrors.length,
    errors: allErrors
  };

  await writeUploadParserLog(parseLogFile, runLog);
  await writeUploadParserLog(errorLogFile, errorLog);

  return { runId, records: allRecords, runLog, errorLog, recordsFile, parseLogFile, errorLogFile };
}

// ---------- 15 & 16. 저장 헬퍼 ----------

export async function writeUploadParserJsonl(
  filePath: string,
  records: StandardSubsidyRecordFromUpload[]
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const lines = records.map((r) => JSON.stringify(r)).join("\n");
  await writeFile(filePath, records.length > 0 ? lines + "\n" : "", "utf8");
}

async function appendUploadParserJsonl(
  filePath: string,
  record: StandardSubsidyRecordFromUpload
): Promise<void> {
  await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
}

export async function writeUploadParserLog(
  filePath: string,
  log: UploadParserRunLog | UploadParserErrorLog
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(log, null, 2), "utf8");
}

// ---------- 폴더 처리 헬퍼 ----------

/** 폴더에서 지원 확장자 파일만 수집한다 (단일 파일 경로면 그 파일만). */
export async function collectUploadFilePaths(inputPath: string): Promise<string[]> {
  const s = await stat(inputPath);
  if (s.isFile()) return [inputPath];
  if (s.isDirectory()) {
    const entries = await readdir(inputPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && isSupportedUploadFile(e.name))
      .map((e) => path.join(inputPath, e.name))
      .sort();
  }
  return [];
}

// ---------- 유틸 ----------

function truncate(s: string, n: number): string {
  if (typeof s !== "string") return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** 레코드 고유 식별자 생성: 파일타입_안전파일명_행번호_랜덤. 개인정보 미포함. */
function makeUploadRecordId(
  fileType: UploadSourceFileType,
  fileName: string,
  rowNumber?: number
): string {
  const safeBase = path
    .basename(fileName ?? "file")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9가-힣._-]+/g, "_")
    .slice(0, 40);
  const row = rowNumber != null ? rowNumber : 0;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${fileType}_${safeBase}_${row}_${rand}`;
}

function generalizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // 숫자/이메일/전화 같은 패턴은 개인정보 가능성 → 제거
  return msg.replace(/[\w.+-]+@[\w.-]+/g, "[redacted]").replace(/\d{3,}/g, "[num]").slice(0, 200);
}
