import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSubsidyEngineDemo, getSubsidyEngineStatus } from "../src/services/subsidyEngineDemo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const indexHtml = readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const appJs = readFileSync(path.join(ROOT, "public/app.js"), "utf8");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

// 단정 표현(근거가 있어도 쓰지 않는 확정 표현) — 화면 표시 문구에 없어야 한다.
const FORBIDDEN = ["부정수급 확정", "보상금 지급 확정", "포상금 지급 확정", "신고 가능 확정", "불법 확정", "사기 확정", "위법 확정"];
// 개인정보 원문 패턴.
const PII_PATTERNS = [/01[016789]-\d{3,4}-\d{4}/, /\d{6}-\d{7}/, /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/];

const demo = buildSubsidyEngineDemo();
const blob = JSON.stringify(demo);

test("1. demo 데이터 생성 함수가 존재한다", () => {
  assert.equal(typeof buildSubsidyEngineDemo, "function");
  assert.equal(typeof getSubsidyEngineStatus, "function");
  assert.ok(demo && typeof demo === "object");
});

test("2. demo 데이터에 baseline/rules/riskScore/rewardScore/llmExplanation/citationValidation이 포함된다", () => {
  assert.ok(demo.baseline && demo.baseline.totalRecords === 1000);
  assert.ok(Array.isArray(demo.rules) && demo.rules.length === 5);
  assert.ok(demo.riskScore && typeof demo.riskScore.finalRiskScore === "number");
  assert.ok(demo.rewardScore && typeof demo.rewardScore.rewardPossibilityScore === "number");
  assert.ok(demo.llmExplanation && typeof demo.llmExplanation.summary === "string");
  assert.ok(demo.citationValidation && typeof demo.citationValidation.status === "string");
});

test("2-1. 5개 룰이 모두 표시되고 후보/예시 구조를 가진다", () => {
  const ruleTypes = demo.rules.map((r) => r.ruleType).sort();
  assert.deepEqual(ruleTypes, [
    "address_cluster",
    "contractor_network",
    "output_settlement",
    "repeat_subsidy",
    "spending_anomaly"
  ]);
  for (const r of demo.rules) {
    assert.ok(typeof r.totalCandidates === "number");
    assert.ok(Array.isArray(r.examples));
  }
});

test("2-2. 위험점수에 등급(A/B/C)과 scoreBreakdown이 있다", () => {
  assert.ok(["A", "B", "C"].includes(demo.riskScore.riskGrade));
  assert.ok(demo.riskScore.scoreBreakdown && typeof demo.riskScore.scoreBreakdown === "object");
});

test("2-3. 보상가능성에 우선순위(High/Medium/Low)와 disclaimer가 있다", () => {
  assert.ok(["High", "Medium", "Low"].includes(demo.rewardScore.rewardPossibilityLevel));
  assert.ok(Array.isArray(demo.rewardScore.disclaimers));
});

test("2-4. citation validation에 핵심 주장/근거 보유/차단 카운트가 있다", () => {
  const cv = demo.citationValidation;
  assert.ok(typeof cv.coreClaims === "number");
  assert.ok(typeof cv.citedClaims === "number");
  assert.ok(typeof cv.blockedPersonalInfoCount === "number");
  assert.ok(Array.isArray(cv.acceptedCitationTypes));
});

test("3. 화면 표시용 문구에 단정 표현이 없다", () => {
  for (const phrase of FORBIDDEN) assert.ok(!blob.includes(phrase), `forbidden: ${phrase}`);
});

test("4. 개인정보 원문이 없다", () => {
  for (const re of PII_PATTERNS) assert.ok(!re.test(blob), `PII pattern matched: ${re}`);
});

test("5. fixture 기반 안내가 포함된다", () => {
  assert.equal(demo.isFixtureBased, true);
  assert.ok(demo.fixtureNotice.includes("fixture 기반 검증 결과"));
  assert.ok(demo.safetyNotice.includes("보장하지 않습니다"));
});

test("6. 실제 LLM/외부 API 미호출 안내(엔진 현황)가 포함된다", () => {
  const status = getSubsidyEngineStatus();
  const aiBlob = JSON.stringify(status.aiAnalysis);
  assert.ok(aiBlob.includes("실제 LLM API 미호출"));
});

// ----- 화면(첫 화면 고정 패널) 가시성 검증 -----

test("7. index.html에 subsidyEngineDemoPanel이 존재한다 (첫 화면 분야 뷰)", () => {
  assert.ok(indexHtml.includes('id="subsidyEngineDemoPanel"'));
  // 기본 활성 뷰(field) 안에 위치하는지 확인 (ops 뷰가 아니라 첫 화면)
  const fieldIdx = indexHtml.indexOf('data-view="field"');
  const panelIdx = indexHtml.indexOf('id="subsidyEngineDemoPanel"');
  const homeIdx = indexHtml.indexOf('data-view="home"');
  assert.ok(fieldIdx !== -1 && panelIdx > fieldIdx && panelIdx < homeIdx, "panel must be inside the default-active field view");
});

test("8. index.html에 runSubsidyEngineDemoButton이 존재한다", () => {
  assert.ok(indexHtml.includes('id="runSubsidyEngineDemoButton"'));
});

test("9. index.html에 loadSubsidyEngineStatusButton이 존재한다", () => {
  assert.ok(indexHtml.includes('id="loadSubsidyEngineStatusButton"'));
});

test("10. app.js에 /api/subsidy/demo-status 호출이 존재한다", () => {
  assert.ok(appJs.includes("/api/subsidy/demo-status"));
});

test("11. app.js에 /api/subsidy/run-demo 호출이 존재한다", () => {
  assert.ok(appJs.includes("/api/subsidy/run-demo"));
});

test("12. app.js에 [subsidy-ui-demo] mounted 로그 문자열이 존재한다", () => {
  assert.ok(appJs.includes("[subsidy-ui-demo] mounted"));
});

test("13. app.js가 mountSubsidyEngineDemo를 init에서 호출한다", () => {
  assert.ok(appJs.includes("function mountSubsidyEngineDemo"));
  assert.ok(appJs.includes("mountSubsidyEngineDemo();"));
});

test("14. 화면 표시 문구(index.html 패널)에 단정 표현이 없다", () => {
  const start = indexHtml.indexOf('id="subsidyEngineDemoPanel"');
  const section = indexHtml.slice(start, start + 1200);
  for (const phrase of FORBIDDEN) assert.ok(!section.includes(phrase), `forbidden: ${phrase}`);
});

test("15. index.html 패널에 fixture 기반 안내가 있다", () => {
  assert.ok(indexHtml.includes("fixture 기반 검증"));
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
  console.log(`\nSubsidyUiDemo tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
