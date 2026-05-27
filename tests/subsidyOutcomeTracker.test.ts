// 보조금 수동 신고 연결 + 결과·보상 기록 테스트 (체크리스트 67~68).
//
// 실행: `npm run test:subsidy-outcome` (tsx). node:assert/strict 만 사용.
// 합성 데이터로 confirmManualSubmission 가드, 상태 전이, reward 규칙, 마스킹을 검증한다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  buildSubsidyReportingLinks,
  reportingLinkHasNoIdentifiers
} from "../src/services/subsidyReportingLinks.js";
import {
  recordSubsidyOutcome,
  updateSubsidyOutcome,
  getSubsidyOutcome,
  listSubsidyOutcomes,
  isManualSubmissionConfirmed
} from "../src/services/subsidyOutcomeTracker.js";

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const cleanupDirs: string[] = [];
function tmpDir(): string {
  const d = path.join(os.tmpdir(), `subsidy-outcome-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  cleanupDirs.push(d);
  return d;
}

const PHONE = ["010", "1234", "5678"].join("-");
const RRN = ["900101", "1234567"].join("-");
const ACCOUNT = ["123", "456", "789012"].join("-");

// ---------- 67. 공식 신고처 링크 ----------

test("[CL67] 신고처 링크가 필수 필드를 갖고 manual-only/auto-submit=false", () => {
  const links = buildSubsidyReportingLinks();
  assert.ok(links.length >= 3);
  for (const l of links) {
    assert.ok(l.agencyId && l.agencyName, "agencyId/agencyName");
    assert.equal(l.category, "subsidy");
    assert.ok(Array.isArray(l.requiredEvidence));
    assert.ok(Array.isArray(l.cautions));
    assert.equal(l.manualSubmissionOnly, true);
    assert.equal(l.autoSubmitAvailable, false);
  }
});

test("[CL67] 신고처 URL에 식별자/query parameter가 없다", () => {
  for (const l of buildSubsidyReportingLinks()) {
    assert.ok(reportingLinkHasNoIdentifiers(l), `URL에 식별자 포함: ${l.officialUrl}`);
  }
});

test("[CL67] 국민신문고 등 공식 채널이 포함된다", () => {
  const names = buildSubsidyReportingLinks().map((l) => l.agencyName).join(" ");
  assert.ok(names.includes("국민신문고") || names.includes("국민권익위원회"));
});

// ---------- 68. 결과·보상 기록 ----------

test("[CL68] confirmManualSubmission 없으면 제출 기록을 만들지 않는다", async () => {
  const dir = tmpDir();
  const r = await recordSubsidyOutcome(
    { candidateId: "c-1", submittedManually: true, confirmManualSubmission: false, agencyName: "국민신문고", externalReceiptNo: "RC-1", recorderName: "기록자", manualSubmissionNote: "직접 제출함" },
    dir
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "MANUAL_SUBMISSION_NOT_CONFIRMED");
});

test("[CL68] 접수번호 없으면 submitted_manually로 전환하지 않는다", async () => {
  const dir = tmpDir();
  const r = await recordSubsidyOutcome(
    { candidateId: "c-2", submittedManually: true, confirmManualSubmission: true, agencyName: "국민신문고", recorderName: "기록자", manualSubmissionNote: "메모" },
    dir
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "MANUAL_SUBMISSION_NOT_CONFIRMED");
});

test("[CL68] 가드 충족 시 submitted_manually 기록 생성 + 안전 플래그", async () => {
  const dir = tmpDir();
  const r = await recordSubsidyOutcome(
    {
      candidateId: "c-3",
      caseId: "case-3",
      submittedManually: true,
      confirmManualSubmission: true,
      recorderName: "기록자",
      agencyName: "국민신문고",
      officialUrl: "https://www.epeople.go.kr/",
      externalReceiptNo: "RC-2026-001",
      manualSubmissionNote: "사용자가 국민신문고에 직접 제출함",
      submittedAt: "2026-05-20"
    },
    dir
  );
  assert.equal(r.ok, true);
  assert.equal(r.record!.status, "submitted_manually");
  assert.equal(r.record!.submittedManually, true);
  assert.equal(r.record!.autoSubmitted, false);
  assert.equal(r.record!.rewardGuaranteed, false);
  assert.equal(r.record!.notLegalConclusion, true);
  assert.equal(r.record!.moduleId, "subsidy_fraud");
  assert.ok(r.record!.stateLog.length >= 1);
});

test("[CL68] 초안 사전 기록(직접 제출 미요청)은 draft로 저장된다", async () => {
  const dir = tmpDir();
  const r = await recordSubsidyOutcome({ candidateId: "c-4", memo: "사전 메모" }, dir);
  assert.equal(r.ok, true);
  assert.equal(r.record!.status, "draft");
  assert.equal(r.record!.submittedManually, false);
});

test("[CL68] rewardAmount는 rewardConfirmedAt 없으면 저장하지 않는다", async () => {
  const dir = tmpDir();
  const r = await recordSubsidyOutcome(
    {
      candidateId: "c-5",
      submittedManually: true,
      confirmManualSubmission: true,
      recorderName: "기록자",
      agencyName: "국민신문고",
      referenceNumber: "REF-1",
      manualSubmissionNote: "직접 제출",
      rewardRelated: true,
      rewardAmount: 1000000 // rewardConfirmedAt 없음 → 저장 안 함
    },
    dir
  );
  assert.equal(r.ok, true);
  assert.equal(r.record!.rewardAmount, undefined);
  assert.ok(r.warnings.some((w) => w.includes("rewardConfirmedAt")));
});

test("[CL68] rewardAmount는 rewardConfirmedAt 있으면 저장된다", async () => {
  const dir = tmpDir();
  await recordSubsidyOutcome(
    { candidateId: "c-6", submittedManually: true, confirmManualSubmission: true, recorderName: "기록자", agencyName: "국민신문고", externalReceiptNo: "RC-6", manualSubmissionNote: "제출" },
    dir
  );
  const r = await updateSubsidyOutcome("c-6", { status: "completed", rewardRelated: true, rewardAmount: 500000, rewardConfirmedAt: "2026-06-01", changedBy: "기록자" }, dir);
  assert.equal(r.ok, true);
  assert.equal(r.record!.rewardAmount, 500000);
  assert.equal(r.record!.status, "completed");
});

test("[CL68] 허용되지 않은 상태 전이는 거부된다", async () => {
  const dir = tmpDir();
  await recordSubsidyOutcome({ candidateId: "c-7", memo: "draft" }, dir); // draft
  const r = await updateSubsidyOutcome("c-7", { status: "completed", changedBy: "x" }, dir); // draft→completed 불가
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_STATE_TRANSITION");
});

test("[CL68] PATCH submitted_manually 전환도 가드를 요구한다", async () => {
  const dir = tmpDir();
  await recordSubsidyOutcome({ candidateId: "c-8", memo: "draft" }, dir);
  const r = await updateSubsidyOutcome("c-8", { status: "submitted_manually", changedBy: "x" }, dir);
  assert.equal(r.ok, false);
  assert.equal(r.code, "MANUAL_SUBMISSION_NOT_CONFIRMED");
});

test("[CL68] 개인정보 원문이 기록/로그/파일에 저장되지 않는다(마스킹)", async () => {
  const dir = tmpDir();
  const r = await recordSubsidyOutcome(
    {
      candidateId: "c-9",
      submittedManually: true,
      confirmManualSubmission: true,
      recorderName: `기록자 ${PHONE}`,
      agencyName: "국민신문고",
      externalReceiptNo: "RC-9",
      manualSubmissionNote: `연락처 ${PHONE} 주민 ${RRN} 계좌 ${ACCOUNT}`,
      memo: `메모 ${PHONE}`
    },
    dir
  );
  assert.equal(r.ok, true);
  const file = path.join(dir, "c-9", "outcome.json");
  const raw = await readFile(file, "utf8");
  for (const pii of [PHONE, RRN, ACCOUNT]) assert.ok(!raw.includes(pii), `PII 저장됨: ${pii}`);
  const blob = JSON.stringify(r.record);
  for (const pii of [PHONE, RRN, ACCOUNT]) assert.ok(!blob.includes(pii), `PII 응답: ${pii}`);
});

test("[CL68] get/list 조회가 동작한다", async () => {
  const dir = tmpDir();
  await recordSubsidyOutcome({ candidateId: "c-10", submittedManually: true, confirmManualSubmission: true, recorderName: "r", agencyName: "국민신문고", externalReceiptNo: "RC-10", manualSubmissionNote: "제출" }, dir);
  const one = await getSubsidyOutcome("c-10", dir);
  assert.ok(one && one.candidateId === "c-10");
  const all = await listSubsidyOutcomes(dir);
  assert.ok(all.length >= 1);
});

test("[CL68] isManualSubmissionConfirmed 가드 함수", () => {
  assert.equal(isManualSubmissionConfirmed({ candidateId: "x" }), false);
  assert.equal(
    isManualSubmissionConfirmed({ candidateId: "x", submittedManually: true, confirmManualSubmission: true, recorderName: "r", agencyName: "a", externalReceiptNo: "n", manualSubmissionNote: "m" }),
    true
  );
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
  console.log(`\nSubsidyOutcomeTracker tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
