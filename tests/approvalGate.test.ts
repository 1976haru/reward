// Approval Gate 워크플로우 테스트 (체크리스트 3).
//
// 실행: `npm run test:approval` (tsx 로 실행).
// node:assert/strict 만 사용 — 추가 의존성 없음.

import assert from "node:assert/strict";
import {
  ApprovalGateError,
  approveForManualSubmission,
  blockAutoSubmission,
  confirmManualSubmission,
  createReviewRequest,
  isAllowedGateStatus,
  isForbiddenGateStatus,
  rejectCase,
  requestMoreEvidence
} from "../src/policy/approvalWorkflow.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

function assertThrowsApprovalGateError(
  fn: () => unknown,
  expectedCode: string,
  label: string
): void {
  try {
    fn();
    assert.fail(`${label}: expected throw but did not throw`);
  } catch (err) {
    assert.ok(
      err instanceof ApprovalGateError,
      `${label}: expected ApprovalGateError, got ${(err as Error)?.name ?? typeof err}`
    );
    assert.equal(
      (err as ApprovalGateError).code,
      expectedCode,
      `${label}: expected code=${expectedCode}, got ${(err as ApprovalGateError).code}`
    );
  }
}

// ---------- 1. createReviewRequest → human_review_required ----------

test("createReviewRequest 는 human_review_required 상태를 만든다", () => {
  const req = createReviewRequest({
    caseId: "case-001",
    evidencePackageId: "evi-001",
    draftReportId: "drf-001"
  });
  assert.equal(req.status, "human_review_required");
  assert.equal(req.caseId, "case-001");
  assert.equal(req.evidencePackageId, "evi-001");
  assert.equal(req.draftReportId, "drf-001");
  assert.match(req.requestedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(isAllowedGateStatus(req.status));
  assert.equal(isForbiddenGateStatus(req.status), false);
});

test("createReviewRequest 는 caseId 누락 시 실패한다", () => {
  assertThrowsApprovalGateError(
    () => createReviewRequest({ caseId: "" }),
    "INVALID_CASE_DATA",
    "createReviewRequest empty caseId"
  );
});

// ---------- 2. approveForManualSubmission — reviewer + reason 필수 ----------

test("approveForManualSubmission 은 reviewer 없으면 실패한다", () => {
  assertThrowsApprovalGateError(
    () =>
      approveForManualSubmission({
        caseId: "case-002",
        reason: "검토 통과",
        evidencePackageId: "evi",
        draftReportId: "drf"
      }),
    "REVIEWER_REQUIRED",
    "approve without reviewer"
  );
});

test("approveForManualSubmission 은 reason 없으면 실패한다", () => {
  assertThrowsApprovalGateError(
    () =>
      approveForManualSubmission({
        caseId: "case-002",
        reviewerName: "검토자A",
        reason: "",
        evidencePackageId: "evi",
        draftReportId: "drf"
      }),
    "REASON_REQUIRED",
    "approve without reason"
  );
});

test("approveForManualSubmission 은 evidence/draft 누락 시 실패한다", () => {
  assertThrowsApprovalGateError(
    () =>
      approveForManualSubmission({
        caseId: "case-002",
        reviewerName: "검토자A",
        reason: "검토 통과",
        draftReportId: "drf"
      }),
    "EVIDENCE_PACKAGE_REQUIRED",
    "approve without evidencePackageId"
  );
  assertThrowsApprovalGateError(
    () =>
      approveForManualSubmission({
        caseId: "case-002",
        reviewerName: "검토자A",
        reason: "검토 통과",
        evidencePackageId: "evi"
      }),
    "DRAFT_REPORT_REQUIRED",
    "approve without draftReportId"
  );
});

test("approveForManualSubmission 정상 케이스는 human_approved 로 기록된다", () => {
  const entry = approveForManualSubmission({
    caseId: "case-002",
    reviewerName: "검토자A",
    reason: "증거 충분, 신고처 적절",
    evidencePackageId: "evi-002",
    draftReportId: "drf-002"
  });
  assert.equal(entry.decision, "approved");
  assert.equal(entry.resultingStatus, "human_approved");
  assert.equal(entry.reviewerName, "검토자A");
  assert.equal(entry.evidencePackageId, "evi-002");
  assert.equal(entry.draftReportId, "drf-002");
  assert.equal(entry.manualSubmissionConfirmed, undefined);
});

// ---------- 3. rejectCase / 4. requestMoreEvidence ----------

test("rejectCase 는 reason 없으면 실패한다", () => {
  assertThrowsApprovalGateError(
    () => rejectCase({ caseId: "c", reviewerName: "r", reason: "" }),
    "REASON_REQUIRED",
    "reject without reason"
  );
});

test("requestMoreEvidence 는 needs_more_evidence 상태를 만든다", () => {
  const entry = requestMoreEvidence({
    caseId: "c",
    reviewerName: "검토자B",
    reason: "스크린샷 누락"
  });
  assert.equal(entry.decision, "needs_more_evidence");
  assert.equal(entry.resultingStatus, "needs_more_evidence");
});

// ---------- 5. confirmManualSubmission — priorStatus / externalReceiptNo ----------

test("confirmManualSubmission 은 human_approved 상태가 아니면 실패한다", () => {
  assertThrowsApprovalGateError(
    () =>
      confirmManualSubmission({
        caseId: "case-003",
        priorStatus: "human_review_required",
        reviewerName: "검토자A",
        externalReceiptNo: "ABC-123",
        submittedByHuman: true
      }),
    "PRIOR_APPROVAL_REQUIRED",
    "confirm without human_approved"
  );
});

test("confirmManualSubmission 은 externalReceiptNo 가 없으면 실패한다", () => {
  assertThrowsApprovalGateError(
    () =>
      confirmManualSubmission({
        caseId: "case-003",
        priorStatus: "human_approved",
        reviewerName: "검토자A",
        externalReceiptNo: "",
        submittedByHuman: true
      }),
    "EXTERNAL_RECEIPT_REQUIRED",
    "confirm without externalReceiptNo"
  );
});

test("confirmManualSubmission 은 submittedByHuman 이 true 가 아니면 실패한다", () => {
  assertThrowsApprovalGateError(
    () =>
      confirmManualSubmission({
        caseId: "case-003",
        priorStatus: "human_approved",
        reviewerName: "검토자A",
        externalReceiptNo: "ABC-123",
        submittedByHuman: false
      }),
    "MANUAL_SUBMISSION_REQUIRED",
    "confirm without submittedByHuman"
  );
});

test("confirmManualSubmission 정상 케이스는 manually_submitted 로 기록된다", () => {
  const entry = confirmManualSubmission({
    caseId: "case-003",
    priorStatus: "human_approved",
    reviewerName: "검토자A",
    externalReceiptNo: "ABC-2026-0001",
    submittedByHuman: true,
    evidencePackageId: "evi-003",
    draftReportId: "drf-003"
  });
  assert.equal(entry.decision, "manually_submitted_confirmed");
  assert.equal(entry.resultingStatus, "manually_submitted");
  assert.equal(entry.manualSubmissionConfirmed, true);
  assert.equal(entry.externalReceiptNo, "ABC-2026-0001");
});

// ---------- 6. blockAutoSubmission ----------

test("blockAutoSubmission 은 autoSubmitted true 일 때 실패한다", () => {
  assertThrowsApprovalGateError(
    () => blockAutoSubmission({ autoSubmitted: true }),
    "AUTO_SUBMISSION_FLAG_DETECTED",
    "blockAutoSubmission autoSubmitted"
  );
});

test("blockAutoSubmission 은 aiSubmitted true 일 때 실패한다", () => {
  assertThrowsApprovalGateError(
    () => blockAutoSubmission({ aiSubmitted: true }),
    "AUTO_SUBMISSION_FLAG_DETECTED",
    "blockAutoSubmission aiSubmitted"
  );
});

test("blockAutoSubmission 은 submittedWithoutReview true 일 때 실패한다", () => {
  assertThrowsApprovalGateError(
    () => blockAutoSubmission({ submittedWithoutReview: true }),
    "AUTO_SUBMISSION_FLAG_DETECTED",
    "blockAutoSubmission submittedWithoutReview"
  );
});

test("blockAutoSubmission 은 rewardClaimAutoSubmitted true 일 때 실패한다", () => {
  assertThrowsApprovalGateError(
    () => blockAutoSubmission({ rewardClaimAutoSubmitted: true }),
    "AUTO_SUBMISSION_FLAG_DETECTED",
    "blockAutoSubmission rewardClaimAutoSubmitted"
  );
});

test("blockAutoSubmission 은 ai_submitted 상태일 때 실패한다", () => {
  assertThrowsApprovalGateError(
    () => blockAutoSubmission({ status: "ai_submitted" }),
    "FORBIDDEN_STATUS",
    "blockAutoSubmission status ai_submitted"
  );
});

test("blockAutoSubmission 은 auto_submitted 상태일 때 실패한다", () => {
  assertThrowsApprovalGateError(
    () => blockAutoSubmission({ status: "auto_submitted" }),
    "FORBIDDEN_STATUS",
    "blockAutoSubmission status auto_submitted"
  );
});

test("blockAutoSubmission 은 정상 상태는 통과한다", () => {
  assert.doesNotThrow(() => blockAutoSubmission({ status: "human_review_required" }));
  assert.doesNotThrow(() => blockAutoSubmission({}));
  assert.doesNotThrow(() => blockAutoSubmission(null));
});

// ---------- 7. 통합 흐름: 자동 제출 플래그가 함께 오면 confirm 도 실패해야 한다 ----------

test("confirmManualSubmission 은 자동 제출 플래그가 함께 오면 즉시 거부한다", () => {
  assertThrowsApprovalGateError(
    () =>
      confirmManualSubmission({
        caseId: "case-004",
        priorStatus: "human_approved",
        reviewerName: "검토자A",
        externalReceiptNo: "X",
        submittedByHuman: true,
        autoSubmitted: true
      }),
    "AUTO_SUBMISSION_FLAG_DETECTED",
    "confirm with autoSubmitted flag"
  );
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

console.log(`\nApprovalGate tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
  }
  process.exit(1);
}
