import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  calculateRewardScoreForSubject,
  clampRewardScore100,
  generateRewardPossibilityScoreReport,
  getRewardPossibilityLevel,
  normalizeRewardInputCandidate,
  writeRewardPossibilityScoreReport
} from "../src/scoring/rewardPossibilityScore.js";
import { REWARD_FORBIDDEN_CLAIM_PHRASES, RewardPossibilityScoreResult } from "../src/types/rewardPossibilityScore.js";
import { createRewardPossibilityScoreFixtures } from "./fixtures/createRewardPossibilityScoreFixtures.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PHONE_SAMPLE = ["010", "1234", "5678"].join("-");
const RRN_SAMPLE = ["900101", "1234567"].join("-");
const ACCOUNT_SAMPLE = ["123", "456", "789012"].join("-");
const ADDRESS_SAMPLE = ["서울특별시", "테스트구", "상세로 123"].join(" ");
const PII_RAW = [PHONE_SAMPLE, RRN_SAMPLE, ACCOUNT_SAMPLE, ADDRESS_SAMPLE, "대표자명"];
const cleanupDirs: string[] = [];

let report: ReturnType<typeof generateRewardPossibilityScoreReport>;
let high: RewardPossibilityScoreResult;
let medium: RewardPossibilityScoreResult;
let low: RewardPossibilityScoreResult;

const bySubject = (key: string) => report.topScores.find((s) => s.subjectKey === key)!;
const blobWithoutForbidden = (value: unknown) => {
  const blob = JSON.stringify(value);
  for (const phrase of REWARD_FORBIDDEN_CLAIM_PHRASES) assert.ok(!blob.includes(phrase), phrase);
};

test("1. fixture 후보에서 보상가능성 점수 결과를 생성한다", async () => {
  const candidates = createRewardPossibilityScoreFixtures(1000).candidates;
  assert.equal(candidates.length, 1000);
  report = generateRewardPossibilityScoreReport(candidates, { isFixtureBased: true, limit: 1000 });
  high = bySubject("subject:reward-high");
  medium = bySubject("subject:reward-medium");
  low = bySubject("subject:reward-low");
  assert.ok(report.totalScoredSubjects >= 3);
  const out = path.join(os.tmpdir(), `reward-score-${Date.now()}`);
  cleanupDirs.push(out);
  await writeRewardPossibilityScoreReport(out, report);
});

test("2. rewardPossibilityScore는 항상 0~100 범위다", () => {
  assert.equal(clampRewardScore100(200), 100);
  assert.equal(clampRewardScore100(-5), 0);
  for (const result of report.topScores) assert.ok(result.rewardPossibilityScore >= 0 && result.rewardPossibilityScore <= 100);
});

test("3~5. High/Medium/Low가 자동 산출된다", () => {
  assert.equal(getRewardPossibilityLevel(75), "High");
  assert.equal(getRewardPossibilityLevel(50), "Medium");
  assert.equal(getRewardPossibilityLevel(49), "Low");
  assert.equal(high.rewardPossibilityLevel, "High");
  assert.equal(medium.rewardPossibilityLevel, "Medium");
  assert.equal(low.rewardPossibilityLevel, "Low");
});

test("6. 환수 가능성 점수가 계산된다", () => {
  assert.ok(high.scoreBreakdown.recoveryPossibilityScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "recovery_possibility"));
});

test("7. 공공기관 손실방지 가능성 점수가 계산된다", () => {
  assert.ok(high.scoreBreakdown.lossPreventionScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "loss_prevention"));
});

test("8. 증거 명확성 점수가 계산된다", () => {
  assert.ok(high.scoreBreakdown.evidenceClarityScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "evidence_clarity"));
});

test("9. legalFitScore가 계산된다", () => {
  assert.ok(high.scoreBreakdown.legalFitScore > 0);
  assert.ok(high.contributingSignals.some((s) => s.component === "legal_fit"));
});

test("10. risk_score 후보를 참고 신호로 처리할 수 있다", () => {
  assert.ok(high.sourceCandidateIds.includes("reward-high-risk-score"));
  assert.ok(high.contributingSignals.some((s) => s.signal === "highRiskScoreReference"));
});

test("11. output_settlement 후보가 recovery/evidence 점수에 반영된다", () => {
  assert.ok(high.sourceCandidateIds.includes("reward-high-output"));
  assert.ok(high.contributingSignals.some((s) => s.sourceType === "output_settlement" && s.component === "recovery_possibility"));
  assert.ok(high.contributingSignals.some((s) => s.sourceType === "output_settlement" && s.component === "evidence_clarity"));
});

test("12. repeat/address/contractor 후보가 lossPrevention 점수에 반영된다", () => {
  for (const sourceType of ["repeat_subsidy", "address_cluster", "contractor_network"] as const) {
    assert.ok(high.contributingSignals.some((s) => s.sourceType === sourceType && s.component === "loss_prevention"));
  }
});

test("13. evidenceUrl/sourceUrl/attachment 존재가 evidenceClarityScore에 반영된다", () => {
  assert.ok(high.contributingSignals.some((s) => ["sourceUrlPresent", "evidenceUrlPresent", "attachmentPresent"].includes(s.signal)));
});

test("14. 동일 subjectKey 후보들이 하나의 reward score 결과로 통합된다", () => {
  assert.ok(high.sourceCandidateIds.length >= 5);
  assert.equal(report.topScores.filter((s) => s.subjectKey === "subject:reward-high").length, 1);
});

test("15. scoreBreakdown.totalBeforeClamp와 rewardPossibilityScore가 일관된다", () => {
  for (const result of report.topScores) {
    const b = result.scoreBreakdown;
    const sum = b.recoveryPossibilityScore + b.lossPreventionScore + b.evidenceClarityScore + b.legalFitScore;
    assert.equal(Math.round(sum * 10) / 10, b.totalBeforeClamp);
    assert.equal(result.rewardPossibilityScore, clampRewardScore100(b.totalBeforeClamp));
  }
});

test("16. topScores가 점수 내림차순으로 정렬된다", () => {
  for (let i = 1; i < report.topScores.length; i++) {
    assert.ok(report.topScores[i - 1].rewardPossibilityScore >= report.topScores[i].rewardPossibilityScore);
  }
});

test("17. reviewRequired는 항상 true다", () => {
  for (const result of report.topScores) assert.equal(result.reviewRequired, true);
});

test("18. reason에 보상포상 보장 표현이 없다", () => {
  for (const result of report.topScores) blobWithoutForbidden(result.reason);
});

test("19. disclaimers에 지급 보장 표현이 없다", () => {
  for (const result of report.topScores) blobWithoutForbidden(result.disclaimers);
});

test("20. evidenceSummary에 개인정보 원문이 없다", () => {
  const candidate = normalizeRewardInputCandidate({
    candidateId: "pii-check",
    sourceType: "manual",
    riskScore: 20,
    subjectKey: "subject:pii",
    recordIds: [`rec-${PHONE_SAMPLE}`],
    evidence: { memo: `${RRN_SAMPLE} ${ACCOUNT_SAMPLE} ${ADDRESS_SAMPLE} 대표자명` }
  });
  const result = calculateRewardScoreForSubject("subject:pii", [candidate], { runId: "t" });
  const blob = JSON.stringify(result.evidenceSummary) + result.reason + JSON.stringify(result.disclaimers);
  for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `PII found: ${raw}`);
});

test("21~22. reward-possibility-score-report.json/md가 생성된다", async () => {
  const json = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.equal(json.runId, report.runId);
  assert.ok(md.includes("보상/포상 가능성 검토 점수"));
  assert.ok(md.includes("rewardPossibilityScore"));
});

test("23. CLI가 --fixture 1000으로 실행된다", async () => {
  const out = path.join(os.tmpdir(), `reward-score-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-reward-possibility-score.ts"), "--fixture", "1000"],
    { cwd: ROOT, env: { ...process.env, REWARD_OUTPUT_DIR: out } }
  );
  assert.ok(stdout.includes("REWARD_SCORE_RUN_OK"));
  assert.ok(stdout.includes("totalInputCandidates"));
  assert.ok(stdout.includes("totalScoredSubjects"));
  assert.ok(stdout.includes("levelSummary"));
  assert.ok(stdout.includes("fixture 기반 검증"));
});

test("24. 결과 제목 또는 문구가 보상/포상 가능성 검토로 되어 있다", () => {
  const blob = JSON.stringify(report);
  assert.ok(blob.includes("보상/포상 가능성 검토"));
});

test("25. High도 지급 확정으로 표현하지 않는다", () => {
  assert.equal(high.rewardPossibilityLevel, "High");
  blobWithoutForbidden(high);
  assert.ok(high.reason.includes("검토 우선순위 High"));
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
  console.log(`\nRewardPossibilityScore tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
