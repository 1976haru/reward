// CSV/PDF/엑셀 업로드 수집기 변환 테스트 (체크리스트 12 — 필수 작업 6).
//
// 실행: `npm run test:upload-parser` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 가짜 데이터다. PII 패턴은 마스킹 검증 목적의 합성값이다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createUploadParserFixtures } from "./fixtures/createUploadParserFixtures.js";
import {
  convertRowToStandardRecord,
  inferDocumentType,
  mapHeaderToStandardField,
  parseAmountLike,
  parseDateLike,
  parseUploadedSubsidyFile,
  parseUploadedSubsidyFiles,
  resolveUploadFileType,
  sanitizeUploadRecord
} from "../src/parsers/uploadSubsidyParser.js";
import {
  StandardSubsidyRecordFromUpload,
  UPLOAD_FIELD_ALIASES
} from "../src/types/uploadParser.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

// 합성 PII 패턴 — 결과에 원문으로 남으면 안 됨
const PII_RAW = ["010-1234-5678", "test@example.com", "123-456-789012", "900101-1234567"];

let FIXTURE_DIR = "";
let OUTPUT_DIR = "";
let runRecords: StandardSubsidyRecordFromUpload[] = [];
let runRecordsFile = "";
let runParseLogFile = "";
let runErrorLogFile = "";
let fixturePaths: Awaited<ReturnType<typeof createUploadParserFixtures>>;

// ---------- 단위 함수 테스트 ----------

test("resolveUploadFileType 가 확장자별 타입을 반환한다", () => {
  assert.equal(resolveUploadFileType("a.csv"), "csv");
  assert.equal(resolveUploadFileType("a.XLSX"), "xlsx");
  assert.equal(resolveUploadFileType("a.pdf"), "pdf");
  assert.equal(resolveUploadFileType("a.hwp"), "unsupported");
});

test("UPLOAD_FIELD_ALIASES 가 주요 한글 헤더를 표준 필드로 매핑한다", () => {
  assert.equal(mapHeaderToStandardField("보조사업명"), "projectName");
  assert.equal(mapHeaderToStandardField("지원사업명"), "projectName");
  assert.equal(mapHeaderToStandardField("수급기관"), "recipientName");
  assert.equal(mapHeaderToStandardField("단체명"), "recipientName");
  assert.equal(mapHeaderToStandardField("교부액"), "subsidyAmount");
  assert.equal(mapHeaderToStandardField("정산액"), "settlementAmount");
  assert.equal(mapHeaderToStandardField("환수액"), "returnAmount");
  // 별칭 상수 자체 점검
  assert.ok(UPLOAD_FIELD_ALIASES.projectName.includes("사업명"));
});

test("parseAmountLike 가 단위(원/천원/백만원)를 숫자로 변환한다", () => {
  assert.equal(parseAmountLike("5,000,000원").amount, 5_000_000);
  assert.equal(parseAmountLike("1,200천원").amount, 1_200_000);
  assert.equal(parseAmountLike("3백만원").amount, 3_000_000);
  assert.equal(parseAmountLike("100만원").amount, 1_000_000);
  assert.equal(parseAmountLike("").amount, undefined);
});

test("parseDateLike 가 다양한 날짜 형식을 ISO 로 변환한다", () => {
  assert.equal(parseDateLike("2025-03-02"), "2025-03-02");
  assert.equal(parseDateLike("2025.03.10"), "2025-03-10");
  assert.equal(parseDateLike("2025년 4월 1일"), "2025-04-01");
  assert.equal(parseDateLike("없음"), undefined);
});

test("inferDocumentType 가 파일명/텍스트 키워드로 문서유형을 추론한다", () => {
  assert.equal(inferDocumentType("보조금_공고.csv"), "subsidy_notice");
  assert.equal(inferDocumentType("정산내역.xlsx"), "settlement");
  assert.equal(inferDocumentType("환수결과.pdf"), "recovery_return");
  assert.equal(inferDocumentType("감사결과.csv"), "audit_result");
  assert.equal(inferDocumentType("무관한파일.csv"), "unknown");
});

test("convertRowToStandardRecord 는 projectName 없으면 partial 처리한다", () => {
  const rec = convertRowToStandardRecord(
    { 보조사업자: "어떤단체", 보조금액: "1,000,000원" },
    { sourceFileName: "x.csv", sourceFileType: "csv" }
  );
  assert.equal(rec.parseStatus, "partial");
  assert.equal(rec.recipientName, "어떤단체");
});

test("[CL56] convertRowToStandardRecord 는 recordId 와 parsedAt 을 채운다", () => {
  const rec = convertRowToStandardRecord(
    { 사업명: "테스트 사업", 보조금액: "1,000,000원", 보조사업자: "어떤단체" },
    { sourceFileName: "subsidy.csv", sourceFileType: "csv", sourceRowNumber: 3 }
  );
  assert.ok(typeof rec.recordId === "string" && rec.recordId.length > 0, "recordId 존재");
  assert.ok(rec.recordId!.startsWith("csv_"), "recordId 는 파일타입 prefix 포함");
  assert.ok(typeof rec.parsedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(rec.parsedAt!), "parsedAt ISO 시각");
  assert.equal(rec.sourceRowNumber, 3);
  assert.equal(rec.subsidyAmount, 1_000_000);
});

test("[CL57-59] 정규화 결과 연결: recipientName/주소/사업명 → 정규화 키 (상세주소 원문 미저장)", () => {
  const rec = convertRowToStandardRecord(
    {
      사업명: "2024년 1차 청년 창업 지원사업",
      보조사업자: "(주)행복나눔",
      보조금액: "10,000,000원",
      회계연도: "2024",
      소재지: "경기도 수원시 팔달구 효원로 1 행복빌딩 3층 302호"
    },
    { sourceFileName: "subsidy.csv", sourceFileType: "csv", sourceRowNumber: 2 }
  );
  // 57) 기관명 → normalizedRecipientName (법인표현 제거된 compact 키)
  assert.ok(typeof rec.normalizedRecipientName === "string" && rec.normalizedRecipientName!.length > 0, "normalizedRecipientName 연결");
  assert.ok(!rec.normalizedRecipientName!.includes("(주)"), "법인표현 제거됨");
  // 59) 사업명 → projectNameCompactKey (연도/차수 제외 핵심 키)
  assert.ok(typeof rec.projectNameCompactKey === "string" && rec.projectNameCompactKey!.length > 0, "projectNameCompactKey 연결");
  assert.ok(!/2024/.test(rec.projectNameCompactKey!), "연도 제거됨");
  // 58) 주소 → normalizedAddressKey / addressRegionKey (상세주소 제외)
  assert.ok(typeof rec.normalizedAddressKey === "string" && rec.normalizedAddressKey!.length > 0, "normalizedAddressKey 연결");
  assert.ok(typeof rec.addressRegionKey === "string" && rec.addressRegionKey!.length > 0, "addressRegionKey 연결");
  assert.ok(!rec.normalizedAddressKey!.includes("302") && !rec.addressRegionKey!.includes("302"), "상세주소(호수) 키에 미포함");
  // 상세주소 원문(층/호)이 레코드 어디에도 그대로 저장되지 않는다
  const blob = JSON.stringify(rec);
  assert.ok(!blob.includes("302호") && !blob.includes("3층"), "상세주소 원문 미저장");
});

test("sanitizeUploadRecord 가 sourceText 의 개인정보 패턴을 마스킹한다", () => {
  const rec: StandardSubsidyRecordFromUpload = {
    sourceFileName: "x.csv",
    sourceFileType: "csv",
    projectName: "테스트",
    sourceText: "연락처 010-1234-5678 이메일 test@example.com 주민번호 900101-1234567",
    documentType: "unknown",
    privacyDetectedTypes: [],
    parseStatus: "parsed"
  };
  const out = sanitizeUploadRecord(rec);
  assert.ok(!out.sourceText!.includes("010-1234-5678"));
  assert.ok(!out.sourceText!.includes("900101-1234567"));
  assert.ok(out.privacyDetectedTypes.length > 0);
});

// ---------- 전체 변환 (10개 파일) ----------

test("[setup] fixture 10개 생성 후 일괄 변환 실행", async () => {
  FIXTURE_DIR = path.join(os.tmpdir(), `upload-fixtures-${Date.now()}`);
  OUTPUT_DIR = path.join(os.tmpdir(), `upload-out-${Date.now()}`);
  fixturePaths = await createUploadParserFixtures(FIXTURE_DIR);
  assert.equal(fixturePaths.csv.length, 4, "CSV 4개");
  assert.equal(fixturePaths.xlsx.length, 4, "XLSX 4개");
  assert.equal(fixturePaths.pdf.length, 2, "PDF 2개");
  assert.equal(fixturePaths.supported.length, 10, "지원 형식 총 10개");

  const result = await parseUploadedSubsidyFiles(fixturePaths.supported, { outputDir: OUTPUT_DIR });
  runRecords = result.records;
  runRecordsFile = result.recordsFile;
  runParseLogFile = result.parseLogFile;
  runErrorLogFile = result.errorLogFile;
});

test("CSV 4개 파일이 변환되어 레코드를 생성한다", () => {
  const csvNames = fixturePaths.csv.map((p) => path.basename(p));
  for (const name of csvNames) {
    const recs = runRecords.filter((r) => r.sourceFileName === name);
    assert.ok(recs.length >= 1, `CSV 변환 레코드 없음: ${name}`);
  }
});

test("XLSX 4개 파일이 변환되어 레코드를 생성한다", () => {
  const names = fixturePaths.xlsx.map((p) => path.basename(p));
  for (const name of names) {
    const recs = runRecords.filter((r) => r.sourceFileName === name);
    assert.ok(recs.length >= 1, `XLSX 변환 레코드 없음: ${name}`);
  }
});

test("PDF 2개 파일이 변환되어 레코드를 생성한다 (부분성공 허용)", () => {
  const names = fixturePaths.pdf.map((p) => path.basename(p));
  for (const name of names) {
    const recs = runRecords.filter((r) => r.sourceFileName === name);
    assert.ok(recs.length >= 1, `PDF 변환 레코드 없음: ${name}`);
  }
});

test("총 10개 파일 처리 + 표준 레코드 10건 이상 생성", () => {
  const distinctFiles = new Set(runRecords.map((r) => r.sourceFileName));
  assert.ok(distinctFiles.size >= 10, `처리된 파일 수 부족: ${distinctFiles.size}`);
  assert.ok(runRecords.length >= 10, `레코드 수 부족: ${runRecords.length}`);
});

test("projectName 이 표준 필드로 매핑된다", () => {
  const withProject = runRecords.filter((r) => r.projectName && !r.projectName.startsWith("("));
  assert.ok(withProject.length >= 8, `projectName 매핑 레코드 부족: ${withProject.length}`);
  assert.ok(withProject.some((r) => r.projectName.includes("청년창업")));
});

test("recipientName 이 표준 필드로 매핑된다", () => {
  const withRecipient = runRecords.filter((r) => r.recipientName && r.recipientName.length > 0);
  assert.ok(withRecipient.length >= 8, `recipientName 매핑 레코드 부족: ${withRecipient.length}`);
});

test("subsidyAmount/정산액 등 금액이 숫자로 변환된다", () => {
  const numericAmounts = runRecords.filter(
    (r) =>
      typeof r.subsidyAmount === "number" ||
      typeof r.settlementAmount === "number" ||
      typeof r.returnAmount === "number" ||
      typeof r.executionAmount === "number"
  );
  assert.ok(numericAmounts.length >= 8, `금액 숫자 변환 레코드 부족: ${numericAmounts.length}`);
  const five = runRecords.find((r) => r.projectName.includes("청년창업 지원"));
  assert.equal(five?.subsidyAmount, 5_000_000);
});

test("documentType 이 파일명/텍스트에서 추론된다", () => {
  const noticeRec = runRecords.find((r) => r.sourceFileName.includes("공고"));
  assert.equal(noticeRec?.documentType, "subsidy_notice");
  const settleRec = runRecords.find((r) => r.sourceFileName === "csv02_보조금_정산.csv");
  assert.equal(settleRec?.documentType, "settlement");
});

test("개인정보 포함 sourceText 가 마스킹되고 privacyDetectedTypes 가 기록된다", () => {
  const piiRec = runRecords.find((r) => r.sourceFileName === "csv03_수급기관_연락.csv");
  assert.ok(piiRec, "PII fixture 레코드를 찾을 수 없음");
  assert.ok((piiRec!.privacyDetectedTypes?.length ?? 0) > 0, "개인정보 유형이 탐지되지 않음");
  for (const raw of PII_RAW) {
    assert.ok(!JSON.stringify(piiRec).includes(raw), `PII 원문이 남음: ${raw}`);
  }
});

test("휴대폰/이메일/주민번호/계좌번호 원문이 records.jsonl 전체에 남지 않는다", async () => {
  const content = await readFile(runRecordsFile, "utf8");
  for (const raw of PII_RAW) {
    assert.ok(!content.includes(raw), `records.jsonl 에 PII 원문이 남음: ${raw}`);
  }
});

test("records.jsonl 이 생성되고 10줄 이상이다", async () => {
  const content = await readFile(runRecordsFile, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  assert.ok(lines.length >= 10, `records.jsonl 줄 수 부족: ${lines.length}`);
  JSON.parse(lines[0]); // 파싱 가능
});

test("parse-log.json 이 생성되고 집계 필드를 포함한다", async () => {
  const log = JSON.parse(await readFile(runParseLogFile, "utf8"));
  assert.equal(log.totalFiles, 10);
  assert.ok(log.totalRecords >= 10);
  assert.ok(typeof log.parsedCount === "number");
  assert.ok(typeof log.partialCount === "number");
  assert.ok(typeof log.failedCount === "number");
  assert.ok(typeof log.startedAt === "string" && typeof log.finishedAt === "string");
  assert.ok(Array.isArray(log.files) && log.files.length === 10);
});

test("error-log.json 이 생성된다", async () => {
  const errLog = JSON.parse(await readFile(runErrorLogFile, "utf8"));
  assert.ok(typeof errLog.errorsCount === "number");
  assert.ok(Array.isArray(errLog.errors));
});

test("unsupported(.hwp) 파일은 오류 로그에 남는다", async () => {
  const single = await parseUploadedSubsidyFile(fixturePaths.unsupported[0], { outputDir: OUTPUT_DIR });
  assert.equal(single.sourceFileType, "unsupported");
  assert.equal(single.records.length, 0);
  assert.ok(single.errors.length >= 1);
  assert.equal(single.errors[0].phase, "detect");
  // 별도 일괄 실행에 unsupported 포함 시 error-log 에 반영되는지
  const out = await parseUploadedSubsidyFiles([fixturePaths.unsupported[0]], { outputDir: OUTPUT_DIR });
  assert.ok(out.errorLog.errorsCount >= 1, "unsupported 파일이 error-log 에 반영되지 않음");
});

test("projectName 이 없는 행은 partial 또는 failed 로 처리된다", () => {
  const partials = runRecords.filter((r) => r.parseStatus === "partial" || r.parseStatus === "failed");
  assert.ok(partials.length >= 1, "partial/failed 레코드가 없음 (csv04 빈 사업명 행 기대)");
});

test("CLI 스크립트가 fixture 폴더를 처리하고 UPLOAD_PARSER_RUN_OK 를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `upload-cli-${Date.now()}`);
  // shell 없이 node + tsx 로더로 직접 실행 (저장소 경로에 공백/한글 포함 — 셸 재파싱 회피)
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "parse-uploaded-subsidy-files.ts"), FIXTURE_DIR],
    { env: { ...process.env, UPLOAD_PARSER_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("UPLOAD_PARSER_RUN_OK"), "CLI 가 RUN_OK 를 출력하지 않음");
  assert.ok(stdout.includes("totalFiles"), "CLI 요약 누락");
  // CLI 콘솔에 PII 원문이 출력되지 않는다
  for (const raw of PII_RAW) {
    assert.ok(!stdout.includes(raw), `CLI 출력에 PII 원문이 남음: ${raw}`);
  }
  await rm(cliOut, { recursive: true, force: true }).catch(() => {});
});

// ---------- 러너 ----------

async function main() {
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  OK   ${t.name}`);
    } catch (err) {
      failed++;
      failures.push({ name: t.name, error: err });
      console.error(`  FAIL ${t.name}`);
      console.error(err);
    }
  }

  // 정리
  for (const dir of [FIXTURE_DIR, OUTPUT_DIR]) {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\nUploadSubsidyParser tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
