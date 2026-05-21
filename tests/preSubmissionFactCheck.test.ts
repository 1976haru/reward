// Pre-Submission Fact Check 게이트 테스트 (체크리스트 6).
//
// 실행: `npm run test:fact-check` (tsx 로 실행).
// node:assert/strict 만 사용.

import assert from "node:assert/strict";
import {
  approveForManualSubmission,
  ApprovalGateError
} from "../src/policy/approvalWorkflow.js";
import {
  createFactCheckResult,
  FactCheckGateError,
  FACT_CHECK_REQUIRED_FLAGS,
  requireFactCheckBeforeApproval,
  summarizeFactCheck,
  type FactCheckInput,
  type FactCheckResult
} from "../src/policy/factCheckGate.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function assertThrowsFactCheck(
  fn: () => unknown,
  expectedCode: string,
  label: string
): void {
  try {
    fn();
    assert.fail(`${label}: expected throw but did not throw`);
  } catch (err) {
    assert.ok(
      err instanceof FactCheckGateError,
      `${label}: expected FactCheckGateError, got ${(err as Error)?.name ?? typeof err}`
    );
    assert.equal(
      (err as FactCheckGateError).code,
      expectedCode,
      `${label}: expected code=${expectedCode}, got ${(err as FactCheckGateError).code}`
    );
  }
}

// 11개 플래그가 전부 true 인 기본 input 빌더
function buildAllConfirmedInput(overrides: Partial<FactCheckInput> = {}): FactCheckInput {
  const base: FactCheckInput = {
    caseId: "case-100",
    reviewerName: "검토자A",
    publicSourceConfirmed: true,
    originalUrlConfirmed: true,
    amountConfirmed: true,
    periodConfirmed: true,
    recipientConfirmed: true,
    projectNameConfirmed: true,
    suspicionBasisConfirmed: true,
    counterExplanationReviewed: true,
    privacyChecked: true,
    neutralLanguageChecked: true,
    evidencePackageConfirmed: true,
    reviewerComment: "공개자료/원문 URL/금액/기간/수급기관 모두 확인 완료. 신고 검토 초안으로 적절.",
    decision: "approved"
  };
  return { ...base, ...overrides };
}

// ---------- 1. 모든 필수 항목 확인 시 completed ----------

test("모든 필수 항목이 확인되면 status = completed", () => {
  const result = createFactCheckResult(buildAllConfirmedInput());
  assert.equal(result.status, "completed");
  assert.equal(result.missingFields.length, 0);
  assert.equal(result.decision, "approved");
  assert.ok(result.factCheckId.startsWith("fc_"));
  assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
});

// ---------- 2. 원문 URL 확인이 없으면 incomplete ----------

test("원문 URL 확인이 없으면 status = incomplete + missingFields 포함", () => {
  const result = createFactCheckResult(buildAllConfirmedInput({ originalUrlConfirmed: false }));
  assert.equal(result.status, "incomplete");
  assert.ok(result.missingFields.includes("originalUrlConfirmed"));
});

test("원문 URL 누락 시 requireFactCheckBeforeApproval 가 INCOMPLETE_FACT_CHECK throw", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ originalUrlConfirmed: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing originalUrlConfirmed"
  );
});

// ---------- 3. 금액 확인 없으면 승인 불가 ----------

test("금액 확인 누락 시 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ amountConfirmed: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing amountConfirmed"
  );
});

// ---------- 4. 기간 확인 없으면 승인 불가 ----------

test("기간 확인 누락 시 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ periodConfirmed: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing periodConfirmed"
  );
});

// ---------- 5. 수급기관 확인 없으면 승인 불가 ----------

test("수급기관 확인 누락 시 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ recipientConfirmed: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing recipientConfirmed"
  );
});

// ---------- 6. 의심근거 확인 없으면 승인 불가 ----------

test("의심근거 확인 누락 시 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ suspicionBasisConfirmed: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing suspicionBasisConfirmed"
  );
});

// ---------- 7. 검토자 의견 없으면 승인 불가 ----------

test("검토자 의견(reviewerComment) 누락 시 createFactCheckResult 가 즉시 throw", () => {
  assertThrowsFactCheck(
    () =>
      createFactCheckResult(
        buildAllConfirmedInput({ reviewerComment: "" } as Partial<FactCheckInput>)
      ),
    "REVIEWER_COMMENT_REQUIRED",
    "empty reviewerComment"
  );
});

test("reviewer 가 없으면 createFactCheckResult 가 REVIEWER_REQUIRED throw", () => {
  assertThrowsFactCheck(
    () =>
      createFactCheckResult({
        ...buildAllConfirmedInput(),
        reviewerName: undefined,
        reviewerId: undefined
      } as FactCheckInput),
    "REVIEWER_REQUIRED",
    "no reviewer"
  );
});

// ---------- 8. decision = needs_more_evidence 이면 승인 불가 ----------

test("decision = needs_more_evidence 면 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ decision: "needs_more_evidence" }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "FACT_CHECK_NOT_APPROVED",
    "decision needs_more_evidence"
  );
});

// ---------- 9. decision = rejected 이면 승인 불가 ----------

test("decision = rejected 면 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ decision: "rejected" }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "FACT_CHECK_NOT_APPROVED",
    "decision rejected"
  );
});

// ---------- 10. caseId 불일치 ----------

test("factCheckResult.caseId 와 reviewData.caseId 가 다르면 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ caseId: "case-100" }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-999", factCheckResult: fc }),
    "FACT_CHECK_CASE_MISMATCH",
    "caseId mismatch"
  );
});

// ---------- 11. summarizeFactCheck 는 단정 표현 없이 요약 ----------

test("summarizeFactCheck 는 단정 표현 없이 요약을 만든다", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput());
  const summary = summarizeFactCheck(fc);
  assert.equal(summary.status, "completed");
  assert.equal(summary.confirmedCount, FACT_CHECK_REQUIRED_FLAGS.length);
  assert.equal(summary.totalCount, FACT_CHECK_REQUIRED_FLAGS.length);
  // 중립 표현 검증 — 단정 표현이 등장하지 않아야 함
  for (const phrase of ["확정", "범죄", "사기", "불법", "무조건 신고", "반드시 신고"]) {
    assert.ok(
      !summary.message.includes(phrase),
      `summary.message should not include "${phrase}", got: ${summary.message}`
    );
  }
  // "확인 완료" 또는 "보완 필요" 중 하나는 포함되어야 함
  assert.ok(
    /확인 완료|보완 필요|폐기 결정/.test(summary.message),
    `expected 중립 요약 표현, got: ${summary.message}`
  );
});

test("summarizeFactCheck 는 incomplete 케이스도 단정 표현 없이 요약한다", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ amountConfirmed: false, periodConfirmed: false }));
  const summary = summarizeFactCheck(fc);
  assert.equal(summary.status, "incomplete");
  assert.ok(summary.message.includes("보완 필요"));
  for (const phrase of ["확정", "범죄", "사기", "불법"]) {
    assert.ok(!summary.message.includes(phrase));
  }
});

// ---------- 12. 개인정보·중립 문구 점검이 false 면 승인 불가 ----------

test("privacyChecked = false 면 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ privacyChecked: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing privacyChecked"
  );
});

test("neutralLanguageChecked = false 면 승인 게이트 차단", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ neutralLanguageChecked: false }));
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100", factCheckResult: fc }),
    "INCOMPLETE_FACT_CHECK",
    "missing neutralLanguageChecked"
  );
});

// ---------- 통합: approveForManualSubmission 이 factCheckResult 를 받으면 게이트를 강제한다 ----------

test("approveForManualSubmission: factCheckResult 가 completed+approved 이면 통과하고 로그에 factCheckId/Summary 포함", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ caseId: "case-200" }));
  const log = approveForManualSubmission({
    caseId: "case-200",
    reviewerName: "검토자A",
    reason: "사실관계 점검 완료, 신고 검토 초안으로 적절",
    evidencePackageId: "evi-200",
    draftReportId: "drf-200",
    factCheckResult: fc
  });
  assert.equal(log.decision, "approved");
  assert.equal(log.resultingStatus, "human_approved");
  assert.equal(log.factCheckId, fc.factCheckId);
  assert.ok(log.factCheckSummary && log.factCheckSummary.includes("확인 완료"));
});

test("approveForManualSubmission: 미완 factCheckResult 면 FactCheckGateError throw", () => {
  const fc = createFactCheckResult(buildAllConfirmedInput({ caseId: "case-201", amountConfirmed: false }));
  let caught: unknown = null;
  try {
    approveForManualSubmission({
      caseId: "case-201",
      reviewerName: "검토자A",
      reason: "검토 통과",
      evidencePackageId: "evi-201",
      draftReportId: "drf-201",
      factCheckResult: fc
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof FactCheckGateError);
  assert.equal((caught as FactCheckGateError).code, "INCOMPLETE_FACT_CHECK");
});

test("approveForManualSubmission: factCheckResult 미첨부 시 기존 호환 동작 (게이트 비활성)", () => {
  // 기존 호출자 호환 — factCheckResult 가 없으면 기존 동작 유지 (체크리스트 3 테스트가 깨지지 않도록)
  const log = approveForManualSubmission({
    caseId: "case-202",
    reviewerName: "검토자A",
    reason: "검토 통과",
    evidencePackageId: "evi-202",
    draftReportId: "drf-202"
  });
  assert.equal(log.decision, "approved");
  assert.equal(log.resultingStatus, "human_approved");
  assert.equal(log.factCheckId, undefined);
});

// ---------- 추가 가드 시나리오 ----------

test("createFactCheckResult: caseId 누락 시 INVALID_CASE_DATA throw", () => {
  assertThrowsFactCheck(
    () => createFactCheckResult({ ...buildAllConfirmedInput(), caseId: "" } as FactCheckInput),
    "INVALID_CASE_DATA",
    "empty caseId"
  );
});

test("createFactCheckResult: decision 누락 시 DECISION_REQUIRED throw", () => {
  assertThrowsFactCheck(
    () =>
      createFactCheckResult({
        ...buildAllConfirmedInput(),
        decision: undefined
      } as FactCheckInput),
    "DECISION_REQUIRED",
    "no decision"
  );
});

test("requireFactCheckBeforeApproval: factCheckResult 미첨부 시 INCOMPLETE_FACT_CHECK throw", () => {
  assertThrowsFactCheck(
    () => requireFactCheckBeforeApproval({ caseId: "case-100" }),
    "INCOMPLETE_FACT_CHECK",
    "missing factCheckResult"
  );
});

test("ApprovalGateError vs FactCheckGateError — 둘은 별개 에러 클래스다", () => {
  // approveForManualSubmission 의 기존 가드(EVIDENCE_PACKAGE_REQUIRED) 는 ApprovalGateError
  let caught: unknown = null;
  try {
    approveForManualSubmission({
      caseId: "case-300",
      reviewerName: "검토자A",
      reason: "검토 통과"
    });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ApprovalGateError);
});

// ---------- 러너 ----------

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; error: unknown }> = [];

for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`  OK   ${t.name}`);
  } catch (err) {
    failed++;
    failures.push({ name: t.name, error: err });
    console.error(`  FAIL ${t.name}`);
    console.error(err);
  }
}

console.log(`\nFactCheck tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
  }
  process.exit(1);
}
