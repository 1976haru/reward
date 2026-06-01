// AdSafe (애드세이프) 광고 사전점검 테스트 (용도 전환 검증 E-3).
//
// 실행: `npm run test:adsafe` (tsx). node:assert/strict 만 사용.
// 검증 항목:
//  1) 광고 문구 입력 → 점검 리포트(위험도 + 위반표현 + 근거) 출력 e2e
//  2) 단정 금지: 리포트에 "합법/위반 아님 보장" 류 단정이 없음
//  3) 면책 푸터가 모든 리포트에 포함됨
//  4) 배치 점검 비용 가드 동작
//  5) 변경 이력/재점검 비교(위험 표현 감소)

import assert from "node:assert/strict";
import {
  runComplianceCheck,
  runBatchComplianceCheck,
  compareReports,
  sanitizeNoAssertion,
  DISCLAIMER_FOOTER,
  type ComplianceCheckReport
} from "../src/adsafe/complianceCheck.js";

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

// 단정 금지 검증용 — 리포트 전체 텍스트에 단정 표현이 없어야 한다.
const ASSERTION_PATTERNS = [/합법입니다/, /적법합니다/, /위반\s*(이)?\s*아닙니다/, /통과\s*보장/, /문제\s*없습니다/];
function assertNoLegalityAssertion(report: ComplianceCheckReport): void {
  const blob = JSON.stringify(report);
  for (const re of ASSERTION_PATTERNS) {
    assert.ok(!re.test(blob), `리포트에 단정 표현이 포함됨: ${re}`);
  }
}

// ---------- 1. 위반 의심 광고 → 점검 리포트 e2e ----------

test("위반 의심 광고 문구는 위험/주의 등급 + 위반표현 + 근거를 출력한다", () => {
  const report = runComplianceCheck({
    text: "이 건강기능식품으로 암 완치 가능합니다. 당뇨 완치 효과도 확인되었습니다.",
    moduleId: "false_ad"
  });
  assert.ok(["risk", "caution"].includes(report.rating), "위반 의심 광고는 안전 등급이 아니어야 한다");
  assert.ok(report.findings.length >= 1, "위반 의심 표현이 1건 이상 탐지되어야 한다");
  const f = report.findings[0];
  assert.ok(f.quotedText.length > 0, "인용된 원문 구절이 있어야 한다");
  assert.ok(f.categoryLabel.length > 0, "한글 카테고리 라벨이 있어야 한다");
  assert.ok(f.reason.length > 0, "왜 문제인지 근거가 있어야 한다");
  assert.ok(f.suggestion.length > 0, "수정 제안이 있어야 한다");
  assert.equal(report.notLegalConclusion, true);
  assert.equal(report.legalityGuaranteed, false);
  assert.equal(report.humanReviewRequired, true);
});

test("위반 표현이 없는 일반 광고 문구는 안전 등급이 될 수 있다", () => {
  const report = runComplianceCheck({
    text: "신선한 재료로 정성껏 만든 제품입니다. 매일 가볍게 즐겨보세요.",
    moduleId: "false_ad"
  });
  // 안전 등급이거나, 모호 표현이 잡혀도 위험 등급은 아님
  assert.ok(report.rating === "safe" || report.rating === "caution");
  assert.equal(report.notLegalConclusion, true);
});

// ---------- 2. 단정 금지 ----------

test("리포트에 적법성 단정/통과 보장 표현이 없다", () => {
  const r1 = runComplianceCheck({ text: "암 완치 보장 의약품 대신 드세요", moduleId: "false_ad" });
  const r2 = runComplianceCheck({ text: "건강하게 즐기세요", moduleId: "false_ad" });
  assertNoLegalityAssertion(r1);
  assertNoLegalityAssertion(r2);
});

test("sanitizeNoAssertion 은 단정 표현을 중립화한다", () => {
  const warnings: string[] = [];
  const out = sanitizeNoAssertion("이 광고는 합법입니다. 통과 보장.", warnings);
  assert.ok(!/합법입니다/.test(out));
  assert.ok(!/통과\s*보장/.test(out));
  assert.ok(warnings.length >= 1);
});

// ---------- 3. 면책 푸터 ----------

test("모든 리포트에 면책 푸터가 포함된다", () => {
  const report = runComplianceCheck({ text: "암 완치", moduleId: "false_ad" });
  assert.equal(report.disclaimerFooter, DISCLAIMER_FOOTER);
  assert.ok(report.disclaimerFooter.includes("참고용"));
  assert.ok(report.disclaimerFooter.includes("최종 판단은 사람"));
  assert.ok(report.formalReviewNotice.includes("16.5만원"));
});

// ---------- 4. 배치 점검 비용 가드 ----------

test("배치 점검은 maxChecks 상한을 초과하지 않는다 (비용 가드)", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ text: `암 완치 광고 ${i}` }));
  const result = runBatchComplianceCheck(items, { moduleId: "false_ad", maxChecks: 3 });
  assert.equal(result.requested, 10);
  assert.equal(result.processed, 3);
  assert.equal(result.skipped, 7);
  assert.equal(result.guardApplied, true);
  assert.equal(result.results.length, 3);
  assert.ok(result.disclaimerFooter === DISCLAIMER_FOOTER);
  for (const entry of result.results) {
    assert.equal(entry.report.disclaimerFooter, DISCLAIMER_FOOTER);
  }
});

test("배치 점검은 상한 이내면 모두 처리한다", () => {
  const items = [{ text: "암 완치" }, { text: "건강 식품" }];
  const result = runBatchComplianceCheck(items, { moduleId: "false_ad", maxChecks: 20 });
  assert.equal(result.processed, 2);
  assert.equal(result.guardApplied, false);
});

// ---------- 5. 변경 이력/재점검 비교 ----------

test("수정 후 재점검하면 위험 표현 감소를 비교한다", () => {
  const before = runComplianceCheck({ text: "암 완치, 당뇨 완치, 의약품 대신", moduleId: "false_ad" });
  const after = runComplianceCheck({ text: "건강 관리에 도움을 줄 수 있는 제품", moduleId: "false_ad" });
  const cmp = compareReports(before, after);
  assert.ok(cmp.currentFindings <= cmp.previousFindings);
  assert.ok(cmp.findingsReduced >= 0);
  assert.equal(cmp.improved, true);
  assert.equal(cmp.disclaimerFooter, DISCLAIMER_FOOTER);
});

// ---------- runner ----------

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${t.name}`);
    console.error(`    ${(err as Error).message}`);
  }
}
if (failed > 0) {
  console.error(`\nADSAFE_TEST_FAIL — ${failed}/${tests.length} 실패`);
  process.exit(1);
}
console.log(`\nADSAFE_TEST_OK — ${tests.length}/${tests.length} 통과`);
