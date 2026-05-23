// 반복 수급 탐지 룰 테스트 (체크리스트 17 — 필수 작업 5).
//
// 실행: `npm run test:risk-repeat` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 가짜 데이터다. 결과는 "반복 수급 후보"이며 부정수급 판단이 아니다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRepeatRiskFixtures } from "./fixtures/createRepeatRiskFixtures.js";
import {
  calculateAmountSimilarity,
  clampRiskScore,
  createRepeatRiskCandidate,
  generateRepeatRiskReport,
  getRepeatRiskLevel,
  isAdjacentFiscalYear,
  writeRepeatRiskReport
} from "../src/rules/repeatSubsidyRiskRule.js";
import { BaselineRecord } from "../src/types/dataQualityBaseline.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PII_RAW = ["010-1234-5678", "010-9876-5432", "900101-1234567", "test@example.com"];
const cleanupDirs: string[] = [];

let fixtureRecords: BaselineRecord[];
let report: ReturnType<typeof generateRepeatRiskReport>;
let outDir = "";

// ---------- 단위 함수 ----------

test("getRepeatRiskLevel: 점수 구간별 등급", () => {
  assert.equal(getRepeatRiskLevel(90), "high");
  assert.equal(getRepeatRiskLevel(65), "medium");
  assert.equal(getRepeatRiskLevel(45), "low");
  assert.equal(getRepeatRiskLevel(10), "minimal");
});

test("clampRiskScore: 0~100 범위 제한", () => {
  assert.equal(clampRiskScore(150), 100);
  assert.equal(clampRiskScore(-5), 0);
  assert.equal(clampRiskScore(NaN), 0);
});

test("calculateAmountSimilarity: 차이 비율 기반, 결측 시 0", () => {
  assert.equal(calculateAmountSimilarity(5_000_000, 5_000_000), 1);
  assert.ok(calculateAmountSimilarity(5_000_000, 5_100_000) >= 0.9);
  assert.equal(calculateAmountSimilarity(undefined, 5_000_000), 0);
});

test("isAdjacentFiscalYear: 같은/±1년", () => {
  assert.equal(isAdjacentFiscalYear(2024, 2024), true);
  assert.equal(isAdjacentFiscalYear(2024, 2025), true);
  assert.equal(isAdjacentFiscalYear(2024, 2026), false);
});

// ---------- 리포트 생성 ----------

test("[setup] fixture 1,000건에서 반복 수급 후보 + 리포트 생성", async () => {
  fixtureRecords = createRepeatRiskFixtures(1000).records;
  assert.equal(fixtureRecords.length, 1000);
  outDir = path.join(os.tmpdir(), `risk-test-${Date.now()}`);
  cleanupDirs.push(outDir);
  report = generateRepeatRiskReport(fixtureRecords, { isRealData: false });
  await writeRepeatRiskReport(outDir, report);
});

test("1. fixture 1,000건에서 반복 수급 후보를 생성한다", () => {
  assert.ok(report.totalCandidates >= 1, "후보가 없음");
  assert.ok(report.totalPairsEvaluated >= 1);
});

test("2. TOP 후보가 생성된다 / 3. topCandidates.length <= 50", () => {
  assert.ok(report.topCandidates.length >= 1);
  assert.ok(report.topCandidates.length <= 50);
});

test("4. 반복 패턴이 심어진 레코드가 high 또는 medium 후보로 탐지된다", () => {
  const hi = report.topCandidates.filter((c) => c.riskLevel === "high" || c.riskLevel === "medium");
  assert.ok(hi.length >= 1, "high/medium 후보가 없음");
  // 클러스터 A(행복나눔)가 high 로 탐지
  const a = report.topCandidates.find((c) => c.groupKey.includes("recip:행복나눔") && c.riskLevel === "high");
  assert.ok(a, "행복나눔 high 후보 미탐지");
});

test("5. 동일 normalizedRecipientName 신호가 점수에 반영된다", () => {
  const c = report.topCandidates.find((x) => x.matchedSignals.some((s) => s.code === "RECIPIENT_KEY_MATCH"));
  assert.ok(c, "RECIPIENT_KEY_MATCH 신호 없음");
});

test("6. 동일 normalizedAddressKey 신호가 점수에 반영된다", () => {
  const c = report.topCandidates.find((x) => x.matchedSignals.some((s) => s.code === "ADDRESS_KEY_MATCH"));
  assert.ok(c, "ADDRESS_KEY_MATCH 신호 없음");
});

test("7. projectNameCompactKey/유사 사업명 신호가 점수에 반영된다", () => {
  const c = report.topCandidates.find((x) => x.matchedSignals.some((s) => s.code === "PROJECT_SIMILAR"));
  assert.ok(c, "PROJECT_SIMILAR 신호 없음");
});

test("8. 같은/인접 연도 신호가 점수에 반영된다", () => {
  const c = report.topCandidates.find((x) =>
    x.matchedSignals.some((s) => s.code === "FISCAL_YEAR_SAME" || s.code === "FISCAL_YEAR_ADJACENT")
  );
  assert.ok(c, "연도 신호 없음");
});

test("9. subsidyAmount 유사 신호가 점수에 반영된다", () => {
  const c = report.topCandidates.find((x) => x.matchedSignals.some((s) => s.code === "AMOUNT_SIMILAR"));
  assert.ok(c, "AMOUNT_SIMILAR 신호 없음");
});

test("10. evidenceUrl/sourceUrl 존재 신호가 점수에 반영된다", () => {
  const c = report.topCandidates.find((x) => x.matchedSignals.some((s) => s.code === "EVIDENCE_PRESENT"));
  assert.ok(c, "EVIDENCE_PRESENT 신호 없음");
});

test("11. 대표자명/전화번호 원문을 단독 기준으로 쓰지 않는다 (AUX 신호 미적용)", () => {
  // BaselineRecord 는 원문 대표자/전화를 보관하지 않으며, AUX_REP_PHONE 신호는 적용되지 않는다.
  const auxUsed = report.topCandidates.some((c) => c.matchedSignals.some((s) => s.code === "AUX_REP_PHONE"));
  assert.equal(auxUsed, false, "대표자/전화 보조 신호가 (원문 기반으로) 사용됨");
});

test("12. riskScore 는 0~100 범위다", () => {
  for (const c of report.topCandidates) {
    assert.ok(c.riskScore >= 0 && c.riskScore <= 100, `범위 오류: ${c.riskScore}`);
  }
});

test("13. riskLevel 이 점수 기준에 맞게 계산된다", () => {
  for (const c of report.topCandidates) {
    assert.equal(c.riskLevel, getRepeatRiskLevel(c.riskScore));
  }
});

test("14. groupKey 에 개인정보 원문이 들어가지 않는다", () => {
  for (const c of report.topCandidates) {
    for (const raw of PII_RAW) assert.ok(!c.groupKey.includes(raw), `groupKey 에 PII: ${raw}`);
  }
});

test("15. reason 에 단정 표현이 없다", () => {
  const banned = ["부정수급 확정", "반복 수급 확정", "불법", "사기"];
  for (const c of report.topCandidates) {
    for (const b of banned) assert.ok(!c.reason.includes(b), `reason 단정 표현: ${b}`);
  }
});

test("16. reviewRequired 는 항상 true 다", () => {
  for (const c of report.topCandidates) assert.equal(c.reviewRequired, true);
});

test("17. repeat-risk-report.json 이 생성된다 / 18. .md 가 생성된다", async () => {
  const j = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  assert.equal(j.runId, report.runId);
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.ok(md.includes("반복 수급 후보 TOP"));
});

test("개인정보 원문이 리포트(json/md)에 남지 않는다", async () => {
  const j = await readFile(report.reportJsonFile!, "utf8");
  const md = await readFile(report.reportMdFile!, "utf8");
  for (const raw of PII_RAW) {
    assert.ok(!j.includes(raw), `report.json 에 PII: ${raw}`);
    assert.ok(!md.includes(raw), `report.md 에 PII: ${raw}`);
  }
});

test("20. 결과 제목/문구가 '반복 수급 후보'로 되어 있다", async () => {
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.ok(md.includes("반복 수급 후보"));
});

test("21. 무관한 레코드 쌍은 후보에서 제외된다", () => {
  // base_* 무관 레코드만으로 이뤄진 후보는 없어야 한다(키 미공유 → 평가 자체 안 됨).
  const baseOnly = report.topCandidates.filter((c) => c.involvedRecordIds.every((id) => id.startsWith("base_")));
  assert.equal(baseOnly.length, 0, "무관 base 레코드가 후보로 산출됨");
});

test("createRepeatRiskCandidate: 단일 쌍 후보 구조", () => {
  const recs = createRepeatRiskFixtures(1000).records;
  const a = recs.find((r) => r.id === "clusterA_0")!;
  const b = recs.find((r) => r.id === "clusterA_1")!;
  const cand = createRepeatRiskCandidate(a, b, "t");
  assert.ok(cand.riskScore >= 80, `clusterA 점수 낮음: ${cand.riskScore}`);
  assert.equal(cand.reviewRequired, true);
  assert.deepEqual(cand.involvedRecordIds, ["clusterA_0", "clusterA_1"]);
});

// ---------- 19. CLI ----------

test("19. CLI 가 --fixture 1000 으로 실행되고 REPEAT_RISK_RUN_OK 를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `risk-cli-${Date.now()}`);
  cleanupDirs.push(cliOut);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-repeat-risk-rule.ts"), "--fixture", "1000"],
    { env: { ...process.env, RISK_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("REPEAT_RISK_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("totalRecords"));
  assert.ok(stdout.includes("topCandidates"));
  assert.ok(stdout.includes("fixture 기반 검증"), "fixture 안내 누락");
  for (const raw of PII_RAW) assert.ok(!stdout.includes(raw), `CLI 출력 PII: ${raw}`);
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
  console.log(`\nRepeatSubsidyRiskRule tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
