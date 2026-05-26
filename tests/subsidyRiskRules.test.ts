// 보조금 룰 5종 통합 실행 테스트 (체크리스트 60).
//
// 실행: `npm run test:subsidy-risk-rules` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 합성 데이터다. 결과는 "검토 후보"이며 부정수급/위법 확정이 아니다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createSubsidyRiskFixtures } from "./fixtures/createSubsidyRiskFixtures.js";
import {
  runSubsidyRiskRules,
  writeSubsidyRiskRun,
  buildTopCandidates
} from "../src/rules/subsidyRiskRules.js";
import { SUBSIDY_RISK_RULE_IDS } from "../src/types/subsidyRisk.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const PII_RAW = ["010-1234-5678", "test@example.com", "900101-1234567", "3층 302호"];
const cleanupDirs: string[] = [];

const fixtures = createSubsidyRiskFixtures(12);
const result = runSubsidyRiskRules(fixtures.records, { inputMode: "test-fixture" });
const hitIds = new Set(result.ruleResults.map((r) => r.ruleId));

// ---------- 룰별 적중 ----------

test("A. 반복수급 룰이 후보를 만든다", () => {
  assert.ok(hitIds.has("repeat_recipient"));
});
test("B. 동일주소 다단체 룰이 후보를 만든다", () => {
  assert.ok(hitIds.has("same_address"));
});
test("C. 결과물/정산 누락 룰이 후보를 만든다", () => {
  assert.ok(hitIds.has("missing_output_settlement"));
});
test("D. 예산집행 이상치 룰이 후보를 만든다", () => {
  assert.ok(hitIds.has("budget_anomaly"));
});
test("E. 사업명 유사 반복 룰이 후보를 만든다", () => {
  assert.ok(hitIds.has("similar_project_repeat"));
});

test("5종 룰 ID가 모두 ruleCounts 에 존재한다", () => {
  const counted = new Set(result.ruleCounts.map((c) => c.ruleId));
  for (const id of SUBSIDY_RISK_RULE_IDS) assert.ok(counted.has(id), `누락: ${id}`);
});

// ---------- 룰 결과 구조 ----------

test("모든 룰 결과가 필수 필드를 갖는다", () => {
  assert.ok(result.ruleResults.length >= 5);
  for (const rr of result.ruleResults) {
    assert.ok(rr.ruleId && rr.ruleName, "ruleId/ruleName");
    assert.ok(["low", "medium", "high"].includes(rr.severity), "severity");
    assert.ok(rr.candidateId.length > 0, "candidateId");
    assert.ok(Array.isArray(rr.involvedRecordIds) && rr.involvedRecordIds.length >= 1, "involvedRecordIds");
    assert.ok(Array.isArray(rr.evidenceRefs) && rr.evidenceRefs.length >= 1, "evidenceRefs");
    assert.ok(rr.reason.length > 0, "reason");
    assert.ok(rr.caution.length > 0, "caution");
    assert.equal(rr.reviewRequired, true, "reviewRequired");
    assert.equal(rr.notLegalConclusion, true, "notLegalConclusion");
    assert.ok(Array.isArray(rr.suggestedNextCheck) && rr.suggestedNextCheck.length >= 1, "suggestedNextCheck");
  }
});

// ---------- TOP N ----------

test("TOP 후보가 생성되고 topN(50) 이하다", () => {
  assert.ok(result.topCandidates.length >= 1);
  assert.ok(result.topCandidates.length <= 50);
  assert.equal(result.topN, 50);
});

test("TOP 후보는 룰 적중 종류 수 내림차순으로 정렬된다", () => {
  for (let i = 1; i < result.topCandidates.length; i++) {
    const prev = result.topCandidates[i - 1];
    const cur = result.topCandidates[i];
    assert.ok(
      prev.ruleHitCount > cur.ruleHitCount ||
        (prev.ruleHitCount === cur.ruleHitCount && prev.highSeverityCount >= cur.highSeverityCount) ||
        prev.ruleBasedScore >= cur.ruleBasedScore,
      "정렬 위반"
    );
  }
});

test("TOP 후보는 reviewRequired/notLegalConclusion 가 항상 true 다", () => {
  for (const c of result.topCandidates) {
    assert.equal(c.reviewRequired, true);
    assert.equal(c.notLegalConclusion, true);
  }
});

test("buildTopCandidates 가 여러 룰이 겹친 레코드를 한 후보로 합친다", () => {
  // 인위적으로 동일 involvedRecordIds 를 가진 두 룰 결과를 합쳐본다
  const merged = buildTopCandidates(
    [
      result.ruleResults[0],
      { ...result.ruleResults[0], ruleId: "budget_anomaly", candidateId: "x", severity: "high" }
    ],
    50
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].ruleHitCount, 2);
});

// ---------- 안전/언어 ----------

test("룰 결과 reason/caution 에 부정수급 확정 단정 표현이 없다(부정 문맥은 허용)", () => {
  const banned = ["부정수급 확정", "위법 확정", "포상금 보장", "신고 성공 보장", "범죄 확정"];
  // "...확정이 아니다/아니며/않습니다" 같은 부정 문맥은 허용. 단정형만 잡는다.
  const negatedNearby = (text: string, idx: number, len: number) =>
    /아니|않|없|금지/.test(text.slice(idx + len, idx + len + 12));
  const texts = result.ruleResults.flatMap((r) => [
    r.reason,
    r.caution,
    ...r.suggestedNextCheck
  ]);
  for (const text of texts) {
    for (const b of banned) {
      let i = text.indexOf(b);
      while (i !== -1) {
        assert.ok(negatedNearby(text, i, b.length), `단정 표현: "${b}" in "${text}"`);
        i = text.indexOf(b, i + b.length);
      }
    }
  }
});

test("결과 전체에 개인정보 원문이 남지 않는다", () => {
  const blob = JSON.stringify(result);
  for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `PII: ${raw}`);
});

test("정렬 점수는 100점 위험점수가 아님을 안내한다", () => {
  assert.ok(result.safetyNotice.includes("100점 위험점수가 아니"));
});

// ---------- 산출물 ----------

test("4개 산출물 파일(rule-results/top50/summary/metadata)이 생성된다", async () => {
  const out = path.join(os.tmpdir(), `subsidy-risk-${Date.now()}`);
  cleanupDirs.push(out);
  const w = await writeSubsidyRiskRun(out, result);
  const rr = JSON.parse(await readFile(w.ruleResultsFile, "utf8"));
  assert.equal(rr.runId, result.runId);
  const t50 = JSON.parse(await readFile(w.top50File, "utf8"));
  assert.ok(Array.isArray(t50.topCandidates));
  const md = await readFile(w.summaryMdFile, "utf8");
  assert.ok(md.includes("보조금 룰 5종 실행 요약"));
  assert.ok(md.includes("100점 위험점수가 아닙니다"));
  const meta = JSON.parse(await readFile(w.metadataFile, "utf8"));
  assert.equal(meta.runId, result.runId);
  assert.equal(meta.ruleCounts.length, 5);
});

// ---------- CLI ----------

test("CLI 가 --fixture 12 로 실행되고 SUBSIDY_RISK_RULES_RUN_OK 를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `subsidy-risk-cli-${Date.now()}`);
  cleanupDirs.push(cliOut);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-subsidy-risk-rules.ts"), "--fixture", "12"],
    { env: { ...process.env, RISK_RULES_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("SUBSIDY_RISK_RULES_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("totalRuleResults"));
  assert.ok(stdout.includes("topCandidates"));
  assert.ok(stdout.includes("사람 검토 필요"), "사람 검토 안내 누락");
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
  console.log(`\nSubsidyRiskRules tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
