import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  calculateFinalRiskScoreForSubject,
  clampRiskScore100,
  generateRiskScoreReport,
  getRiskGrade,
  normalizeInputCandidate,
  writeRiskScoreReport
} from "../src/scoring/riskScoreModel.js";
import { RiskScoreResult } from "../src/types/riskScoreModel.js";
import { createRiskScoreFixtures } from "./fixtures/createRiskScoreFixtures.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const BANNED_ASSERTIVE = [
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"],
  ["환수", "대상", "확정"],
  ["신고", "확정"],
  ["A등급", "확정"]
].map((parts) => parts.join(" "));
const PHONE_SAMPLE = ["010", "1234", "5678"].join("-");
const RRN_SAMPLE = ["900101", "1234567"].join("-");
const ACCOUNT_SAMPLE = ["123", "456", "789012"].join("-");
const ADDRESS_SAMPLE = ["서울시 테스트구", "상세로 123"].join(" ");
const PII_RAW = [PHONE_SAMPLE, RRN_SAMPLE, ACCOUNT_SAMPLE, ADDRESS_SAMPLE, "대표자명"];
const cleanupDirs: string[] = [];

let report: ReturnType<typeof generateRiskScoreReport>;
let high: RiskScoreResult;
let medium: RiskScoreResult;
let low: RiskScoreResult;

const bySubject = (key: string) => report.topScores.find((s) => s.subjectKey === key)!;

test("fixture 후보에서 100점 위험점수 결과를 생성한다", async () => {
  const candidates = createRiskScoreFixtures(1000).candidates;
  assert.equal(candidates.length, 1000);
  report = generateRiskScoreReport(candidates, { isFixtureBased: true });
  high = bySubject("subject:fixture-high");
  medium = bySubject("subject:fixture-medium");
  low = bySubject("subject:fixture-low");
  assert.ok(report.totalScoredSubjects >= 3);
  const out = path.join(os.tmpdir(), `risk-score-${Date.now()}`);
  cleanupDirs.push(out);
  await writeRiskScoreReport(out, report);
});

test("finalRiskScore는 항상 0~100 범위다", () => {
  assert.equal(clampRiskScore100(200), 100);
  assert.equal(clampRiskScore100(-2), 0);
  for (const result of report.topScores) assert.ok(result.finalRiskScore >= 0 && result.finalRiskScore <= 100);
});

test("A/B/C 등급이 자동 산출된다", () => {
  assert.equal(getRiskGrade(80), "A");
  assert.equal(getRiskGrade(60), "B");
  assert.equal(getRiskGrade(59), "C");
  assert.equal(high.riskGrade, "A");
  assert.equal(medium.riskGrade, "B");
  assert.equal(low.riskGrade, "C");
});

test("반복 수급 후보가 repetitionScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.repetitionScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "repetition"));
});

test("금액 관련 신호가 amountScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.amountScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "amount"));
});

test("증가감 또는 연도 반복 신호가 growthScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.growthScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "growth"));
});

test("결과물 부족 신호가 outputScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.outputScore > 0);
});

test("동일 주소 신호가 addressScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.addressScore > 0);
});

test("정산 확인 필요 신호가 settlementScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.settlementScore > 0);
});

test("계약업체 연관성 신호가 contractorScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.contractorScore > 0);
});

test("evidenceUrl/sourceUrl 존재가 evidenceScore에 반영된다", () => {
  assert.ok(high.scoreBreakdown.evidenceScore > 0);
});

test("동일 subjectKey 후보들이 하나의 점수 결과로 통합된다", () => {
  assert.ok(high.sourceCandidateIds.length >= 5);
  assert.equal(report.topScores.filter((s) => s.subjectKey === "subject:fixture-high").length, 1);
});

test("scoreBreakdown.totalBeforeClamp와 finalRiskScore가 일관된다", () => {
  for (const result of report.topScores) {
    const b = result.scoreBreakdown;
    const sum =
      b.repetitionScore +
      b.amountScore +
      b.growthScore +
      b.outputScore +
      b.addressScore +
      b.settlementScore +
      b.contractorScore +
      b.evidenceScore;
    assert.equal(Math.round(sum * 10) / 10, b.totalBeforeClamp);
    assert.equal(result.finalRiskScore, clampRiskScore100(b.totalBeforeClamp));
  }
});

test("topScores가 점수 내림차순으로 정렬된다", () => {
  for (let i = 1; i < report.topScores.length; i++) {
    assert.ok(report.topScores[i - 1].finalRiskScore >= report.topScores[i].finalRiskScore);
  }
});

test("reviewRequired는 항상 true다", () => {
  for (const result of report.topScores) assert.equal(result.reviewRequired, true);
});

test("reason에 단정 표현이 없다", () => {
  for (const result of report.topScores) {
    for (const banned of BANNED_ASSERTIVE) assert.ok(!result.reason.includes(banned), banned);
  }
});

test("evidenceSummary에 개인정보 원문이 없다", () => {
  const candidate = normalizeInputCandidate({
    candidateId: "pii-check",
    ruleType: "manual",
    riskScore: 20,
    subjectKey: "subject:pii",
    recordIds: [`rec-${PHONE_SAMPLE}`],
    evidence: { memo: `${RRN_SAMPLE} ${ACCOUNT_SAMPLE} ${ADDRESS_SAMPLE} 대표자명` }
  });
  const result = calculateFinalRiskScoreForSubject("subject:pii", [candidate], { runId: "t" });
  const blob = JSON.stringify(result.evidenceSummary) + result.reason;
  for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `PII found: ${raw}`);
});

test("risk-score-report.json 및 md가 생성된다", async () => {
  const json = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.equal(json.runId, report.runId);
  assert.ok(md.includes("100점 위험점수 모델 결과"));
  assert.ok(md.includes("위험 후보") || md.includes("우선 검토 후보"));
});

test("CLI가 --fixture 1000으로 실행된다", async () => {
  const out = path.join(os.tmpdir(), `risk-score-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-risk-score-model.ts"), "--fixture", "1000"],
    { cwd: ROOT, env: { ...process.env, RISK_OUTPUT_DIR: out } }
  );
  assert.ok(stdout.includes("RISK_SCORE_RUN_OK"));
  assert.ok(stdout.includes("totalInputCandidates"));
  assert.ok(stdout.includes("totalScoredSubjects"));
  assert.ok(stdout.includes("gradeSummary"));
  assert.ok(stdout.includes("fixture 기반 검증"));
});

test("A등급도 확정 판단으로 표현하지 않는다", () => {
  const blob = JSON.stringify(report);
  assert.ok(blob.includes("우선 검토 후보"));
  for (const banned of BANNED_ASSERTIVE) assert.ok(!blob.includes(banned), banned);
});

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  OK   ${t.name}`);
    } catch (error) {
      failed++;
      failures.push({ name: t.name, error });
      console.error(`  FAIL ${t.name}`);
      console.error(error);
    }
  }
  for (const d of cleanupDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
  console.log(`\nRiskScoreModel tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
