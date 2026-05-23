// 예산 집행 이상 패턴 탐지 룰 테스트 (체크리스트 20 — 필수 작업 7).
//
// 실행: `npm run test:risk-spending` (tsx). node:assert/strict 만 사용.
// 모든 fixture 는 가짜 데이터다. 결과는 "예산 집행 이상 패턴 후보 / 정산 확인 필요 후보"이며 위법 여부 판단이 아니다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createSpendingAnomalyRiskFixtures } from "./fixtures/createSpendingAnomalyRiskFixtures.js";
import {
  clampSpendingAnomalyRiskScore,
  createSpendingAnomalyRiskCandidate,
  generateSpendingAnomalyRiskReport,
  getSpendingAnomalyRiskLevel,
  normalizeSpendingCategory,
  writeSpendingAnomalyRiskReport
} from "../src/rules/spendingAnomalyRiskRule.js";
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

const PII_RAW = ["010-1234-5678", "test@example.com", "900101-1234567"];
const cleanupDirs: string[] = [];

let report: ReturnType<typeof generateSpendingAnomalyRiskReport>;
let allRecords: BaselineRecord[];

const sigCodesOf = (recId: string): string[] => {
  const c = report.topCandidates.find((x) => x.recordId === recId);
  return c ? c.spendingSignals.map((s) => s.code) : [];
};

// ---------- 단위 ----------

test("getSpendingAnomalyRiskLevel / clamp", () => {
  assert.equal(getSpendingAnomalyRiskLevel(90), "high");
  assert.equal(getSpendingAnomalyRiskLevel(65), "medium");
  assert.equal(getSpendingAnomalyRiskLevel(45), "low");
  assert.equal(getSpendingAnomalyRiskLevel(10), "minimal");
  assert.equal(clampSpendingAnomalyRiskScore(150), 100);
  assert.equal(clampSpendingAnomalyRiskScore(-3), 0);
});

test("normalizeSpendingCategory: 한글 라벨 → 카테고리", () => {
  assert.equal(normalizeSpendingCategory("인건비"), "labor");
  assert.equal(normalizeSpendingCategory("광고비"), "promotion");
  assert.equal(normalizeSpendingCategory("외주 용역"), "service");
  assert.equal(normalizeSpendingCategory("장비구입비"), "equipment");
  assert.equal(normalizeSpendingCategory("임차료"), "rent");
  assert.equal(normalizeSpendingCategory("기타잡비"), "other");
});

// ---------- 리포트 ----------

test("[setup] fixture 1,000건에서 예산 집행 이상 패턴 후보 + 리포트 생성", async () => {
  allRecords = createSpendingAnomalyRiskFixtures(1000).records;
  assert.equal(allRecords.length, 1000);
  report = generateSpendingAnomalyRiskReport(allRecords, { isRealData: false });
  const out = path.join(os.tmpdir(), `sp-test-${Date.now()}`);
  cleanupDirs.push(out);
  await writeSpendingAnomalyRiskReport(out, report);
});

test("1. 후보를 생성한다 / 2. TOP 목록 / 3. <= 50", () => {
  assert.ok(report.totalCandidates >= 1);
  assert.ok(report.topCandidates.length >= 1);
  assert.ok(report.topCandidates.length <= 50);
});

test("4. 인건비 비중 과다 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("labor_0").includes("highLaborCostRatio"));
});

test("5. 홍보비 비중 과다 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("promo_0").includes("highPromotionCostRatio"));
});

test("6. 용역비 비중 과다 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("svc_0").includes("highServiceCostRatio"));
});

test("7. 장비구입비 비중 과다 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("equip_0").includes("highEquipmentCostRatio"));
});

test("8. 동일 항목 반복 지출 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("repeat_0").includes("repeatedSameCategory"));
});

test("9. 유사 금액 반복 지출 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("repeat_0").includes("repeatedSimilarAmount"));
});

test("10. 특정 지급처 반복 지급 신호가 점수에 반영된다", () => {
  assert.ok(sigCodesOf("repeat_0").includes("repeatedVendor"));
});

test("11. missingBreakdown 또는 missingReceiptEvidence 가 점수에 반영된다", () => {
  // missingReceiptEvidence: ratio 그룹(증빙 없음)에서 반영
  assert.ok(sigCodesOf("labor_0").includes("missingReceiptEvidence"));
  // missingBreakdown: 세부내역 없는 레코드를 직접 평가
  const nobreak = allRecords.find((r) => r.id === "nobreak_1")!;
  const cand = createSpendingAnomalyRiskCandidate(nobreak, { runId: "t" });
  assert.ok(cand.spendingSignals.some((s) => s.code === "missingBreakdown"));
});

test("12. 정상 지출 패턴(base)은 낮은 점수 또는 후보 제외된다", () => {
  const baseCand = report.topCandidates.filter((c) => c.recordId.startsWith("base_"));
  assert.equal(baseCand.length, 0, "정상 base 레코드가 후보로 산출됨");
});

test("13. riskScore 0~100 / 14. riskLevel 기준에 맞다", () => {
  for (const c of report.topCandidates) {
    assert.ok(c.riskScore >= 0 && c.riskScore <= 100);
    assert.equal(c.riskLevel, getSpendingAnomalyRiskLevel(c.riskScore));
  }
});

test("반복 지출 그룹이 medium 이상으로 탐지된다", () => {
  const r = report.topCandidates.find((c) => c.recordId === "repeat_0");
  assert.ok(r, "repeat 후보 없음");
  assert.ok(r!.riskLevel === "medium" || r!.riskLevel === "high", `등급 낮음: ${r!.riskLevel}`);
});

test("15. evidence 에 개인정보 원문이 들어가지 않는다", () => {
  for (const c of report.topCandidates) {
    const blob = JSON.stringify(c.evidence) + c.groupKey + JSON.stringify(c.spendingBreakdownSummary);
    for (const raw of PII_RAW) assert.ok(!blob.includes(raw), `evidence PII: ${raw}`);
  }
});

test("지급처는 vendorNameMasked(마스킹) 값만 노출된다", () => {
  for (const c of report.topCandidates) {
    for (const v of c.evidence.topVendorsMasked) {
      assert.ok(/\*\*\*/.test(v) || /\(\d+\)$/.test(v), `마스킹되지 않은 지급처: ${v}`);
    }
  }
});

test("16. reason 에 단정 표현이 없다", () => {
  const banned = ["부정집행 확정", "횡령 확정", "부정수급 확정", "불법", "사기"];
  for (const c of report.topCandidates) {
    for (const b of banned) assert.ok(!c.reason.includes(b), `reason 단정 표현: ${b}`);
  }
});

test("17. reviewRequired 는 항상 true 다", () => {
  for (const c of report.topCandidates) assert.equal(c.reviewRequired, true);
});

test("18. report.json / 19. report.md 가 생성되고 제목이 '예산 집행 이상 패턴 후보'", async () => {
  const j = JSON.parse(await readFile(report.reportJsonFile!, "utf8"));
  assert.equal(j.runId, report.runId);
  const md = await readFile(report.reportMdFile!, "utf8");
  assert.ok(md.includes("예산 집행 이상 패턴 후보") || md.includes("정산 확인 필요"));
});

test("개인정보 원문이 리포트(json/md)에 남지 않는다", async () => {
  const j = await readFile(report.reportJsonFile!, "utf8");
  const md = await readFile(report.reportMdFile!, "utf8");
  for (const raw of PII_RAW) {
    assert.ok(!j.includes(raw), `report.json PII: ${raw}`);
    assert.ok(!md.includes(raw), `report.md PII: ${raw}`);
  }
});

test("22. 특정 항목 비중이 높다는 이유만으로 부정집행 확정처럼 표현하지 않는다(notes/caution 중립)", () => {
  const joined = report.notes.join(" ");
  assert.ok(joined.includes("단정하지 않습니다"));
  // 후보에 합리적 사유 가능성 cautionNotes 가 포함된다
  const withCaution = report.topCandidates.filter((c) => c.cautionNotes.length > 0);
  assert.ok(withCaution.length >= 1, "cautionNotes 없음");
});

// ---------- 20. CLI ----------

test("20. CLI 가 --fixture 1000 으로 실행되고 SPENDING_ANOMALY_RISK_RUN_OK 를 출력한다", async () => {
  const cliOut = path.join(os.tmpdir(), `sp-cli-${Date.now()}`);
  cleanupDirs.push(cliOut);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-spending-anomaly-risk-rule.ts"), "--fixture", "1000"],
    { env: { ...process.env, RISK_OUTPUT_DIR: cliOut }, cwd: ROOT }
  );
  assert.ok(stdout.includes("SPENDING_ANOMALY_RISK_RUN_OK"), "RUN_OK 누락");
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
  console.log(`\nSpendingAnomalyRiskRule tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
