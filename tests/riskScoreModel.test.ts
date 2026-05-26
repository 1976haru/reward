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

// ---------- 체크리스트 61: 보조금 룰 5종 결과(rule-results.json) 입력 ----------

const subsidyRuleResults = [
  {
    ruleId: "repeat_recipient",
    ruleName: "반복수급 검토 후보",
    severity: "high",
    candidateId: "repeat_recipient:abc",
    involvedRecordIds: ["rec-1", "rec-2", "rec-3"],
    evidenceRefs: ["공시URL:https://example.org/1"],
    reason: "동일 수급기관 후보가 3건 반복 등장 — 금액 30000000",
    reviewRequired: true,
    notLegalConclusion: true
  },
  {
    ruleId: "same_address",
    ruleName: "동일주소 다단체 검토 후보",
    severity: "medium",
    candidateId: "same_address:def",
    involvedRecordIds: ["rec-1", "rec-2"],
    evidenceRefs: ["공시URL:https://example.org/2"],
    reason: "동일 주소에 단체 3곳",
    reviewRequired: true,
    notLegalConclusion: true
  },
  {
    ruleId: "missing_output_settlement",
    ruleName: "결과물·정산 증빙 누락 검토 후보",
    severity: "medium",
    candidateId: "missing_output_settlement:ghi",
    involvedRecordIds: ["rec-9"],
    evidenceRefs: ["출처파일:fixture.csv#rec-9"],
    reason: "정산/결과물 미확인",
    reviewRequired: true,
    notLegalConclusion: true
  },
  {
    ruleId: "budget_anomaly",
    ruleName: "예산집행 이상치 검토 후보",
    severity: "high",
    candidateId: "budget_anomaly:jkl",
    involvedRecordIds: ["rec-9"],
    evidenceRefs: ["공시URL:https://example.org/3"],
    reason: "교부금액 절대 임계값 초과, 금액 800000000",
    reviewRequired: true,
    notLegalConclusion: true
  },
  {
    ruleId: "similar_project_repeat",
    ruleName: "사업명 유사 반복 검토 후보",
    severity: "high",
    candidateId: "similar_project_repeat:mno",
    involvedRecordIds: ["rec-20", "rec-21"],
    evidenceRefs: ["공시URL:https://example.org/4"],
    reason: "핵심 사업명 유사도 0.95 — 결과물 비교 필요",
    reviewRequired: true,
    notLegalConclusion: true
  }
];

let subsidyReport: ReturnType<typeof generateRiskScoreReport>;

test("[CL61] 보조금 룰 5종 결과를 입력으로 위험점수를 산출한다", () => {
  subsidyReport = generateRiskScoreReport(subsidyRuleResults, { sourceNote: "subsidy-rule-results" });
  assert.ok(subsidyReport.totalScoredSubjects >= 1);
  for (const r of subsidyReport.topScores) {
    assert.ok(r.finalRiskScore >= 0 && r.finalRiskScore <= 100);
    assert.ok(["A", "B", "C"].includes(r.riskGrade));
  }
});

test("[CL61] 결과에 candidateId / cautionNotes / notLegalConclusion 이 포함된다", () => {
  for (const r of subsidyReport.topScores) {
    assert.ok(typeof r.candidateId === "string" && r.candidateId.length > 0, "candidateId");
    assert.ok(Array.isArray(r.cautionNotes) && r.cautionNotes.length >= 1, "cautionNotes");
    assert.equal(r.notLegalConclusion, true);
    assert.equal(r.reviewRequired, true);
  }
});

test("[CL61] similar_project_repeat(룰 E)가 repetition 점수에 반영된다", () => {
  const all = subsidyReport.topScores.flatMap((r) => r.contributingSignals);
  assert.ok(all.some((s) => s.ruleType === "similar_project"), "similar_project 룰타입 매핑");
  assert.ok(all.some((s) => s.signal === "similar_project_name"));
});

test("[CL61] risk-score-summary.md 와 metadata.json 이 생성된다", async () => {
  const out = path.join(os.tmpdir(), `cl61-risk-${Date.now()}`);
  cleanupDirs.push(out);
  const r = generateRiskScoreReport(subsidyRuleResults, { isFixtureBased: true });
  const w = await writeRiskScoreReport(out, r);
  const summary = await readFile(path.join(out, "runs", r.runId, "risk-score-summary.md"), "utf8");
  assert.ok(summary.includes("100점 위험점수 모델 결과"));
  const meta = JSON.parse(await readFile(path.join(out, "runs", r.runId, "metadata.json"), "utf8"));
  assert.equal(meta.runId, r.runId);
  assert.ok(typeof w.summaryMdFile === "string" && typeof w.metadataFile === "string");
});

test("[CL61] 점수가 우선 검토 참고 점수로 표시되고 단정 표현이 없다", () => {
  const blob = JSON.stringify(subsidyReport);
  for (const banned of BANNED_ASSERTIVE) assert.ok(!blob.includes(banned), banned);
  assert.ok(subsidyReport.notes.join(" ").includes("보조 점수"));
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
