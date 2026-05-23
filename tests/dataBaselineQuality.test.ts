// 실데이터 1차 기준선 / 데이터 품질검증 테스트 (체크리스트 16 — 필수 작업 6).
//
// 실행: `npm run test:data-baseline` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 가짜 보조사업 데이터다. fixture 는 실데이터 기준선으로 간주하지 않는다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createBaselineFixtures } from "./fixtures/createBaselineFixtures.js";
import {
  buildDataBaseline,
  computeBaselineQuality,
  determineBaselineStatus,
  normalizeToBaselineRecord
} from "../src/quality/dataBaselineQuality.js";
import { BASELINE_TARGET_RECORDS } from "../src/types/dataQualityBaseline.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PII_RAW = ["010-1234-5678", "test@example.com", "900101-1234567"];

const cleanupDirs: string[] = [];
let fixtureBuild: Awaited<ReturnType<typeof buildDataBaseline>>;

// ---------- 1~2. fixture 생성/정규화 ----------

test("1. fixture 1,000건을 생성한다", () => {
  const raws = createBaselineFixtures(1000);
  assert.equal(raws.length, 1000);
});

test("2. fixture 를 BaselineRecord 로 정규화한다 (필수 필드 채움)", () => {
  const raws = createBaselineFixtures(5);
  const rec = normalizeToBaselineRecord(raws[1] as Record<string, unknown>, {
    sourceType: "fixture",
    sourceName: "fixture-synthetic",
    index: 1,
    runId: "t"
  });
  assert.ok(rec.id);
  assert.equal(rec.sourceType, "fixture");
  assert.ok(rec.collectedAt);
  assert.ok(rec.documentType);
  assert.ok(Array.isArray(rec.privacyDetectedTypes));
});

// ---------- 3~12. 적재 + 품질 리포트 (fixture 1000) ----------

test("[setup] fixture 1,000건 적재 + 품질 리포트 생성", async () => {
  const outDir = path.join(os.tmpdir(), `baseline-test-${Date.now()}`);
  cleanupDirs.push(outDir);
  const raws = createBaselineFixtures(1000) as unknown as Record<string, unknown>[];
  fixtureBuild = await buildDataBaseline(raws, {
    sourceType: "fixture",
    sourceName: "fixture-synthetic",
    outputDir: outDir
  });
});

test("3. records.jsonl 에 1,000건 이상 적재된다", async () => {
  const content = await readFile(fixtureBuild.recordsFile, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  assert.ok(lines.length >= 1000, `적재 건수 부족: ${lines.length}`);
});

test("4. quality-report.json 이 생성된다", async () => {
  const j = JSON.parse(await readFile(fixtureBuild.qualityReportJsonFile, "utf8"));
  assert.equal(j.runId, fixtureBuild.runId);
});

test("5. quality-report.md 가 생성된다", async () => {
  const md = await readFile(fixtureBuild.qualityReportMdFile, "utf8");
  assert.ok(md.includes("데이터 품질 리포트"));
});

test("6. error-log.json 이 생성된다", async () => {
  const e = JSON.parse(await readFile(fixtureBuild.errorLogFile, "utf8"));
  assert.ok(typeof e.errorsCount === "number");
  assert.ok(Array.isArray(e.errors));
});

test("7. totalRecords >= 1000", () => {
  assert.ok(fixtureBuild.report.totalRecords >= 1000);
});

test("8. duplicateRate 가 계산된다 (0~1)", () => {
  const d = fixtureBuild.report.duplicateRate;
  assert.ok(d >= 0 && d <= 1, `duplicateRate 범위 오류: ${d}`);
  assert.ok(fixtureBuild.report.duplicateCount >= 1, "의도된 중복이 잡히지 않음");
});

test("9. missingRate 가 계산된다 (0~1)", () => {
  const m = fixtureBuild.report.missingRate;
  assert.ok(m >= 0 && m <= 1, `missingRate 범위 오류: ${m}`);
});

test("10. fieldMissingRates 가 계산된다", () => {
  const f = fixtureBuild.report.fieldMissingRates;
  assert.ok(typeof f.projectName === "number");
  assert.ok(typeof f.subsidyAmount === "number");
  // fixture 는 일부 subsidyAmount 결측을 포함
  assert.ok(f.subsidyAmount > 0, "subsidyAmount 결측이 반영되지 않음");
});

test("11. sourceCoverage 가 계산된다", () => {
  const sc = fixtureBuild.report.sourceCoverage;
  const total = Object.values(sc).reduce((a, b) => a + b, 0);
  assert.equal(total, fixtureBuild.report.totalRecords);
});

test("12. yearCoverage 가 계산된다 (최근 2~3년 분포)", () => {
  const yc = fixtureBuild.report.yearCoverage;
  assert.ok(Object.keys(yc).length >= 2, "연도 분포가 부족함");
  assert.ok(yc["2024"] != null || yc["2025"] != null);
});

// ---------- 13~15. 정규화 키/중복 후보 ----------

test("13. duplicateCandidates 가 생성된다", () => {
  assert.ok(Array.isArray(fixtureBuild.report.duplicateCandidates));
  assert.ok(fixtureBuild.report.duplicateCandidates.length >= 1, "중복 후보가 없음");
  assert.ok(fixtureBuild.report.duplicateCandidates[0].count >= 2);
});

test("14. projectNameCompactKey 가 생성된다", () => {
  const withKey = fixtureBuild.records.filter((r) => r.projectNameCompactKey && r.projectNameCompactKey.length > 0);
  assert.ok(withKey.length >= 900, `projectNameCompactKey 생성 부족: ${withKey.length}`);
});

test("15. normalizedRecipientName 이 생성된다", () => {
  const withKey = fixtureBuild.records.filter((r) => r.normalizedRecipientName && r.normalizedRecipientName.length > 0);
  assert.ok(withKey.length >= 900, `normalizedRecipientName 생성 부족: ${withKey.length}`);
});

// ---------- 16. 마스킹 ----------

test("16. 개인정보 원문이 records.jsonl 에 남지 않는다", async () => {
  const content = await readFile(fixtureBuild.recordsFile, "utf8");
  for (const raw of PII_RAW) {
    assert.ok(!content.includes(raw), `records.jsonl 에 PII 원문이 남음: ${raw}`);
  }
  // 마스킹된 흔적은 있어야 한다(개인정보 탐지 건수 > 0)
  assert.ok(fixtureBuild.report.privacyDetectedCount > 0, "개인정보 탐지/마스킹이 동작하지 않음");
});

// ---------- 17~19. 상태 판정 ----------

test("17. fixture 1,000건은 실데이터 완료가 아니라 fixture_pending 으로 표시된다", () => {
  assert.equal(fixtureBuild.report.status, "fixture_pending");
  assert.equal(fixtureBuild.report.isRealData, false);
});

test("18. sourceType=upload 1,000건이면 real_baseline_ok 상태가 된다", async () => {
  const outDir = path.join(os.tmpdir(), `baseline-real-${Date.now()}`);
  cleanupDirs.push(outDir);
  const raws = createBaselineFixtures(1000) as unknown as Record<string, unknown>[];
  const built = await buildDataBaseline(raws, {
    sourceType: "upload",
    sourceName: "local-upload",
    outputDir: outDir
  });
  assert.equal(built.report.status, "real_baseline_ok");
  assert.equal(built.report.isRealData, true);
});

test("19. 1,000건 미만이면 incomplete 상태가 된다", () => {
  const raws = createBaselineFixtures(500).map((r) =>
    normalizeToBaselineRecord(r as Record<string, unknown>, {
      sourceType: "upload",
      sourceName: "x",
      index: 0,
      runId: "t"
    })
  );
  const { status } = determineBaselineStatus(raws);
  assert.equal(status, "incomplete");
  // 품질 지표도 500건 기준으로 계산되는지
  const m = computeBaselineQuality(raws);
  assert.equal(m.totalRecords, 500);
});

// ---------- 20. CLI ----------

test("20. CLI 가 --fixture 1000 으로 실행되고 PENDING 메시지를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `baseline-cli-${Date.now()}`);
  cleanupDirs.push(cliOut);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "build-data-baseline.ts"), "--fixture", "1000"],
    { env: { ...process.env, DATA_BASELINE_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("DATA_BASELINE_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("DATA_BASELINE_FIXTURE_1000_OK_BUT_REAL_BASELINE_PENDING"), "PENDING 메시지 누락");
  assert.ok(stdout.includes("totalRecords"));
  for (const raw of PII_RAW) {
    assert.ok(!stdout.includes(raw), `CLI 출력에 PII 원문이 남음: ${raw}`);
  }
});

// ---------- 21~22. 중립 표현 ----------

test("21. 품질 리포트가 중립 표현을 사용한다(부정수급 단정 없음)", async () => {
  const md = await readFile(fixtureBuild.qualityReportMdFile, "utf8");
  assert.ok(!md.includes("부정수급 확정"), "리포트에 단정 표현이 있음");
  assert.ok(md.includes("품질 지표") || md.includes("품질"), "품질 표현 누락");
});

test("22. 중복률이 부정수급 판단처럼 표현되지 않는다(중립 메모 포함)", () => {
  const joined = fixtureBuild.report.notes.join(" ");
  assert.ok(
    joined.includes("부정수급 판단 근거가 아닙니다"),
    "중복률·결측률 중립 표현 메모가 없음"
  );
  assert.ok(BASELINE_TARGET_RECORDS === 1000);
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
  for (const d of cleanupDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
  console.log(`\nDataBaselineQuality tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
