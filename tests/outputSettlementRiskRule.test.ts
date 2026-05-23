// 결과물 부족·정산 확인 필요 탐지 룰 테스트 (체크리스트 19 — 필수 작업 7).
//
// 실행: `npm run test:risk-output-settlement` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 가짜 데이터다. 결과는 "결과물 누락 후보 / 정산 확인 필요 후보"이며 위법 여부 판단이 아니다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createOutputSettlementRiskFixtures } from "./fixtures/createOutputSettlementRiskFixtures.js";
import {
  createOutputSettlementRiskCandidate,
  evaluateOutputSettlementSignals,
  generateOutputSettlementRiskReport,
  getOutputSettlementRiskLevel,
  writeOutputSettlementRiskReport
} from "../src/rules/outputSettlementRiskRule.js";
import { BaselineRecord } from "../src/types/dataQualityBaseline.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CURRENT_YEAR = 2026; // 테스트 결정성

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PII_RAW = ["010-1234-5678", "test@example.com", "900101-1234567"];
const cleanupDirs: string[] = [];

let report: ReturnType<typeof generateOutputSettlementRiskReport>;

const signalCodes = (recId: string): string[] => {
  const c = report.topCandidates.find((x) => x.recordId === recId);
  return c ? c.missingSignals.map((s) => s.code) : [];
};

// ---------- 단위 ----------

test("getOutputSettlementRiskLevel: 점수 구간", () => {
  assert.equal(getOutputSettlementRiskLevel(90), "high");
  assert.equal(getOutputSettlementRiskLevel(65), "medium");
  assert.equal(getOutputSettlementRiskLevel(45), "low");
  assert.equal(getOutputSettlementRiskLevel(10), "minimal");
});

test("evaluateOutputSettlementSignals: 전부 누락 시 다수 신호 + 높은 점수", () => {
  const r: BaselineRecord = {
    id: "x",
    sourceType: "fixture",
    sourceName: "f",
    collectedAt: "2022-01-01T00:00:00.000Z",
    fiscalYear: 2022,
    projectName: "테스트 사업",
    documentType: "settlement",
    privacyDetectedTypes: []
  };
  const { missingSignals, rawScore } = evaluateOutputSettlementSignals(r, { currentYear: CURRENT_YEAR });
  assert.ok(rawScore >= 80, `점수 낮음: ${rawScore}`);
  assert.ok(missingSignals.some((s) => s.code === "missingSettlementDocument"));
});

// ---------- 리포트 ----------

test("[setup] fixture 1,000건에서 결과물 부족/정산 확인 필요 후보 + 리포트 생성", async () => {
  const { records } = createOutputSettlementRiskFixtures(1000);
  assert.equal(records.length, 1000);
  report = generateOutputSettlementRiskReport(records, { isRealData: false, currentYear: CURRENT_YEAR });
  const out = path.join(os.tmpdir(), `os-test-${Date.now()}`);
  cleanupDirs.push(out);
  await writeOutputSettlementRiskReport(out, report);
});

test("1. 후보를 생성한다 / 2. TOP 목록 / 3. <= 50", () => {
  assert.ok(report.totalCandidates >= 1);
  assert.ok(report.topCandidates.length >= 1);
  assert.ok(report.topCandidates.length <= 50);
});

test("4. 성과보고서 누락 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("missAll_0").includes("missingPerformanceReport"));
});

test("5. 정산서 누락 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("missSettle_0").includes("missingSettlementDocument"));
});

test("6. 결과보고서/결과물 URL 누락 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("missAll_0").includes("missingResultReport"));
});

test("7. evidenceUrl/sourceUrl 누락 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("missAll_0").includes("missingEvidenceUrl"));
  assert.ok(signalCodes("missEvidence_1").includes("missingEvidenceUrl"));
});

test("8. 첨부파일 누락 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("missAll_0").includes("missingAttachment"));
});

test("9. settlementAmount/executionAmount 누락 신호가 점수에 반영된다", () => {
  assert.ok(signalCodes("missAll_0").includes("missingSettlementAmount"));
  assert.ok(signalCodes("missAll_0").includes("missingExecutionAmount"));
  assert.ok(signalCodes("missSettle_0").includes("missingSettlementAmount"));
});

test("10. 환수/반납 문맥은 있으나 금액이 없는 경우 신호가 반영된다", () => {
  assert.ok(signalCodes("missReturn_0").includes("missingReturnAmountAfterIssue"));
});

test("11. 증빙이 충분한(base) 레코드는 낮은 점수 또는 후보 제외된다", () => {
  const baseCand = report.topCandidates.filter((c) => c.recordId.startsWith("base_"));
  assert.equal(baseCand.length, 0, "정상 base 레코드가 후보로 산출됨");
});

test("12. riskScore 는 0~100 / 13. riskLevel 이 기준에 맞다", () => {
  for (const c of report.topCandidates) {
    assert.ok(c.riskScore >= 0 && c.riskScore <= 100, `범위 오류: ${c.riskScore}`);
    assert.equal(c.riskLevel, getOutputSettlementRiskLevel(c.riskScore));
  }
});

test("의도적으로 심은 전부-누락 그룹이 high 로 탐지된다", () => {
  const m = report.topCandidates.find((c) => c.recordId === "missAll_0");
  assert.ok(m, "missAll 후보 없음");
  assert.equal(m!.riskLevel, "high");
});

test("14. evidence/groupKey 에 개인정보 원문이 들어가지 않는다", () => {
  for (const c of report.topCandidates) {
    const blob = JSON.stringify(c.evidence) + c.groupKey;
    for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `evidence/groupKey PII: ${raw}`);
  }
});

test("15. reason 에 단정 표현이 없다 (미제출 확정 등)", () => {
  const banned = ["정산 미이행 확정", "결과물 미제출 확정", "부정수급 확정", "불법", "사기", "미제출 확정"];
  for (const c of report.topCandidates) {
    for (const b of banned) assert.ok(!c.reason.includes(b), `reason 단정 표현: ${b}`);
  }
});

test("16. reviewRequired 는 항상 true 다", () => {
  for (const c of report.topCandidates) assert.equal(c.reviewRequired, true);
});

test("17. report.json / 18. report.md 가 생성되고 제목이 '결과물 누락 후보' 또는 '정산 확인 필요'", async () => {
  const j = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  assert.equal(j.runId, report.runId);
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.ok(md.includes("결과물 누락 후보") || md.includes("정산 확인 필요"));
});

test("개인정보 원문이 리포트(json/md)에 남지 않는다", async () => {
  const j = await readFile(report.reportJsonFile!, "utf8");
  const md = await readFile(report.reportMdFile!, "utf8");
  for (const raw of PII_RAW) {
    assert.ok(!j.includes(raw), `report.json PII: ${raw}`);
    assert.ok(!md.includes(raw), `report.md PII: ${raw}`);
  }
});

test("21. 공개자료에 없다는 이유만으로 미제출 확정처럼 표현하지 않는다(notes 중립)", () => {
  const joined = report.notes.join(" ");
  assert.ok(joined.includes("단정할 수 없습니다") || joined.includes("확인 필요"));
});

test("createOutputSettlementRiskCandidate: 단일 레코드 후보 구조", () => {
  const { records } = createOutputSettlementRiskFixtures(1000);
  const r = records.find((x) => x.id === "missAll_0")!;
  const cand = createOutputSettlementRiskCandidate(r, { currentYear: CURRENT_YEAR, runId: "t" });
  assert.ok(cand.riskScore >= 80);
  assert.equal(cand.reviewRequired, true);
  assert.equal(cand.recordId, "missAll_0");
});

// ---------- 19. CLI ----------

test("19. CLI 가 --fixture 1000 으로 실행되고 OUTPUT_SETTLEMENT_RISK_RUN_OK 를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `os-cli-${Date.now()}`);
  cleanupDirs.push(cliOut);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-output-settlement-risk-rule.ts"), "--fixture", "1000"],
    { env: { ...process.env, RISK_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("OUTPUT_SETTLEMENT_RISK_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("totalCandidates"));
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
  console.log(`\nOutputSettlementRiskRule tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
