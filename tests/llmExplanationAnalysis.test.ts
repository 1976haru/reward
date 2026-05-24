import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  buildSafeLlmPrompt,
  containsForbiddenExplanationPhrase,
  createFallbackLlmExplanation,
  generateLlmExplanationReport,
  writeLlmExplanationReport
} from "../src/analysis/llmExplanationAnalysis.js";
import { LLM_EXPLANATION_FORBIDDEN_PHRASES } from "../src/types/llmExplanationAnalysis.js";
import { createLlmExplanationFixtures } from "./fixtures/createLlmExplanationFixtures.js";

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
const EMAIL_SAMPLE = ["test", "example.com"].join("@");
const ACCOUNT_SAMPLE = ["123", "456", "789012"].join("-");
const ADDRESS_SAMPLE = ["서울특별시", "테스트구", "상세로 123"].join(" ");
const PII_RAW = [PHONE_SAMPLE, RRN_SAMPLE, EMAIL_SAMPLE, ACCOUNT_SAMPLE, ADDRESS_SAMPLE, "대표자명"];
const cleanupDirs: string[] = [];

let report: ReturnType<typeof generateLlmExplanationReport>;
const byId = (id: string) => report.explanations.find((item) => item.candidateId === id)!;

function assertNoForbidden(value: unknown): void {
  const blob = JSON.stringify(value);
  for (const phrase of LLM_EXPLANATION_FORBIDDEN_PHRASES) {
    assert.ok(!blob.includes(phrase) || !containsForbiddenExplanationPhrase(blob), phrase);
  }
}

function assertNoPii(value: unknown): void {
  const blob = JSON.stringify(value);
  for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `PII found: ${raw}`);
}

test("1. fixture 후보에서 설명형 분석 결과를 생성한다", async () => {
  const candidates = createLlmExplanationFixtures(100).candidates;
  assert.equal(candidates.length, 100);
  report = generateLlmExplanationReport(candidates, { isFixtureBased: true, limit: 100 });
  assert.equal(report.totalInputCandidates, 100);
  assert.equal(report.totalExplanations, 100);
  const out = path.join(os.tmpdir(), `llm-explain-${Date.now()}`);
  cleanupDirs.push(out);
  await writeLlmExplanationReport(out, report);
});

test("2. summary가 생성된다", () => {
  assert.ok(byId("llm-fixture-high").summary.includes("검토 후보"));
});

test("3. whyFlagged가 생성된다", () => {
  assert.ok(byId("llm-fixture-high").whyFlagged.length >= 3);
});

test("4. keyEvidence가 생성된다", () => {
  assert.ok(byId("llm-fixture-high").keyEvidence.length > 0);
});

test("5. additionalChecks가 생성된다", () => {
  const checks = byId("llm-fixture-high").additionalChecks.join(" ");
  assert.ok(checks.includes("정산서"));
  assert.ok(checks.includes("기관 기준"));
});

test("6. limitations가 생성된다", () => {
  assert.ok(byId("llm-fixture-high").limitations.some((item) => item.includes("공개자료")));
});

test("7. safetyDisclaimers가 생성된다", () => {
  assert.ok(byId("llm-fixture-high").safetyDisclaimers.some((item) => item.includes("법률 자문")));
});

test("8. rewardPossibilityNote가 보장 표현 없이 생성된다", () => {
  const note = byId("llm-fixture-high").rewardPossibilityNote!;
  assert.ok(note.includes("보상/포상 가능성 검토"));
  assertNoForbidden(note);
});

test("9. fallback 분석기는 동일 입력에 대해 deterministic하다", () => {
  const input = createLlmExplanationFixtures(1).candidates[0];
  const a = createFallbackLlmExplanation(input, { isFixtureBased: true });
  const b = createFallbackLlmExplanation(input, { isFixtureBased: true });
  assert.deepEqual(a, b);
});

test("10. buildSafeLlmPrompt 결과에 단정 금지 지시가 포함된다", () => {
  const prompt = buildSafeLlmPrompt(createLlmExplanationFixtures(1).candidates[0]);
  assert.ok(prompt.safetyRules.includes("단정 금지"));
  assert.ok(prompt.deterministicFallbackOnly);
});

test("11. buildSafeLlmPrompt 결과에 개인정보 원문이 없다", () => {
  const prompt = buildSafeLlmPrompt({
    candidateId: "prompt-pii",
    evidenceSummary: [`${PHONE_SAMPLE} ${RRN_SAMPLE} ${EMAIL_SAMPLE} ${ACCOUNT_SAMPLE} ${ADDRESS_SAMPLE} 대표자명`]
  });
  assertNoPii(prompt);
});

test("12. 설명 결과에 주민번호/전화번호/이메일/계좌번호 원문이 없다", () => {
  const result = createFallbackLlmExplanation({
    candidateId: "result-pii",
    evidenceSummary: [`${PHONE_SAMPLE} ${RRN_SAMPLE} ${EMAIL_SAMPLE} ${ACCOUNT_SAMPLE} ${ADDRESS_SAMPLE} 대표자명`],
    signals: ["sourceUrlPresent"]
  });
  assertNoPii(result);
});

test("13. 설명 결과에 금지 표현이 없다", () => {
  assertNoForbidden(report);
});

test("14. reviewRequired는 항상 true다", () => {
  for (const explanation of report.explanations) assert.equal(explanation.reviewRequired, true);
});

test("15. fixture 기반 여부가 결과에 반영된다", () => {
  assert.ok(report.isFixtureBased);
  assert.ok(report.explanations.every((item) => item.isFixtureBased));
});

test("16~17. llm-explanation-report.json/md가 생성된다", async () => {
  const json = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.equal(json.runId, report.runId);
  assert.ok(md.includes("LLM 설명형 분석 요약"));
  assert.ok(md.includes("additionalChecks"));
});

test("18. CLI가 --fixture 100으로 실행된다", async () => {
  const out = path.join(os.tmpdir(), `llm-explain-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-llm-explanation-analysis.ts"), "--fixture", "100"],
    { cwd: ROOT, env: { ...process.env, ANALYSIS_OUTPUT_DIR: out } }
  );
  assert.ok(stdout.includes("LLM_EXPLANATION_ANALYSIS_RUN_OK"));
  assert.ok(stdout.includes("totalInputCandidates"));
  assert.ok(stdout.includes("totalExplanations"));
});

test("19. Markdown 제목이 LLM 설명형 분석 요약이다", async () => {
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.ok(md.startsWith("# LLM 설명형 분석 요약"));
});

test("20. 보상가능성 관련 문구가 가능성 검토 수준으로만 표현된다", () => {
  const note = byId("llm-fixture-high").rewardPossibilityNote ?? "";
  assert.ok(note.includes("가능성 검토"));
  assertNoForbidden(note);
});

test("21. 권장 표현이 포함된다", () => {
  const blob = JSON.stringify(byId("llm-fixture-high"));
  for (const phrase of ["공개자료 기준", "추가 확인 필요", "사람 검토 필요"]) {
    assert.ok(blob.includes(phrase), phrase);
  }
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
  console.log(`\nLlmExplanationAnalysis tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
