// 보조금 신고 전 사실점검 11항목 테스트 (체크리스트 65).
//
// 실행: `npm run test:subsidy-fact-check` (tsx). node:assert/strict 만 사용.
// 합성 fixture로 PASS/WARNING/FAIL/BLOCKED 케이스를 검증한다. 부정수급 확정 판단이 아니다.

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createSubsidyFactCheckFixtures } from "./fixtures/createSubsidyFactCheckFixtures.js";
import {
  runSubsidyPreReportFactCheck,
  generateSubsidyFactCheckReport,
  writeSubsidyFactCheckReport
} from "../src/policy/subsidyPreReportChecklist.js";
import { SUBSIDY_FACT_CHECK_ITEM_IDS } from "../src/types/subsidyFactCheck.js";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const cleanupDirs: string[] = [];
const fx = createSubsidyFactCheckFixtures();
const byId = (id: string) => fx.cases.find((c) => c.candidateId === id)!;

test("11항목이 모두 반환된다", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-pass-001"));
  assert.equal(r.checklistItems.length, 11);
  const ids = new Set(r.checklistItems.map((i) => i.itemId));
  for (const id of SUBSIDY_FACT_CHECK_ITEM_IDS) assert.ok(ids.has(id), `누락 항목: ${id}`);
});

test("각 항목에 PASS/WARNING/FAIL/NOT_APPLICABLE 상태가 표시된다", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-pass-001"));
  for (const i of r.checklistItems) {
    assert.ok(["PASS", "WARNING", "FAIL", "NOT_APPLICABLE"].includes(i.status), i.status);
    assert.ok(i.reason.length > 0 && i.requiredAction.length > 0);
  }
});

test("완전 충족 Case는 PASS/PASS_WITH_WARNINGS + canGenerateReportDraft=true", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-pass-001"));
  assert.ok(["PASS", "PASS_WITH_WARNINGS"].includes(r.overallStatus));
  assert.equal(r.canGenerateReportDraft, true);
  assert.equal(r.checklistItems.filter((i) => i.status === "FAIL").length, 0);
});

test("WARNING만 있는 Case도 canGenerateReportDraft=true (FAIL 없음)", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-warn-002"));
  assert.equal(r.overallStatus, "PASS_WITH_WARNINGS");
  assert.equal(r.canGenerateReportDraft, true);
  assert.ok(r.checklistItems.some((i) => i.status === "WARNING"));
});

test("strict citation fail이면 canGenerateReportDraft=false + BLOCKED", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-cite-fail-003"));
  const cite = r.checklistItems.find((i) => i.itemId === "citation_strict")!;
  assert.equal(cite.status, "FAIL");
  assert.equal(r.canGenerateReportDraft, false);
  assert.equal(r.overallStatus, "BLOCKED");
});

test("개인정보/API 키 스캔 fail이면 canGenerateReportDraft=false + BLOCKED", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-privacy-fail-004"));
  const priv = r.checklistItems.find((i) => i.itemId === "privacy_api_scan")!;
  assert.equal(priv.status, "FAIL");
  assert.equal(r.canGenerateReportDraft, false);
  assert.equal(r.overallStatus, "BLOCKED");
});

test("사람 검토 없음이면 canGenerateReportDraft=false (human_review FAIL)", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-noreview-005"));
  const review = r.checklistItems.find((i) => i.itemId === "human_review")!;
  assert.equal(review.status, "FAIL");
  assert.equal(r.canGenerateReportDraft, false);
  assert.equal(r.overallStatus, "BLOCKED");
});

test("위험룰 hit가 없으면 오류가 아니라 WARNING(보강 필요)", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-warn-002"));
  const rule = r.checklistItems.find((i) => i.itemId === "risk_rule_hits")!;
  assert.equal(rule.status, "WARNING");
});

test("안전 플래그가 고정값으로 반환된다", () => {
  const r = runSubsidyPreReportFactCheck(byId("fx-pass-001"));
  assert.equal(r.reviewRequired, true);
  assert.equal(r.notLegalConclusion, true);
  assert.equal(r.autoSubmitAvailable, false);
  assert.equal(r.rewardGuaranteed, false);
});

test("결과에 개인정보 원문/단정 표현이 없다", () => {
  const report = generateSubsidyFactCheckReport(fx.cases, { isFixtureBased: true });
  const blob = JSON.stringify(report);
  for (const raw of ["010-1234-5678", "900101-1234567", "123-456-789012", "3층 302호"]) {
    assert.ok(!blob.includes(raw), `PII: ${raw}`);
  }
  for (const banned of ["부정수급 확정", "위법 확정", "포상금 보장", "신고 성공 보장"]) {
    assert.ok(!blob.includes(banned), `단정 표현: ${banned}`);
  }
});

test("리포트 산출물 3종(json/summary.md/metadata.json)이 생성된다", async () => {
  const out = path.join(os.tmpdir(), `fact-check-${Date.now()}`);
  cleanupDirs.push(out);
  const report = generateSubsidyFactCheckReport(fx.cases, { isFixtureBased: true });
  const w = await writeSubsidyFactCheckReport(out, report);
  const json = JSON.parse(await readFile(w.reportJsonFile, "utf8"));
  assert.equal(json.runId, report.runId);
  assert.equal(json.results.length, 5);
  const md = await readFile(w.summaryMdFile, "utf8");
  assert.ok(md.includes("보조금 신고 전 사실점검 11항목 요약"));
  const meta = JSON.parse(await readFile(w.metadataFile, "utf8"));
  assert.equal(meta.autoSubmitAvailable, false);
  assert.equal(meta.rewardGuaranteed, false);
});

test("CLI가 --fixture로 실행되고 SUBSIDY_FACT_CHECK_RUN_OK를 출력한다", async () => {
  const out = path.join(os.tmpdir(), `fact-check-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-subsidy-fact-check.ts"), "--fixture"],
    { env: { ...process.env, FACT_CHECK_OUTPUT_DIR: out }, cwd: ROOT }
  );
  assert.ok(stdout.includes("SUBSIDY_FACT_CHECK_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("canGenerateReportDraft"));
  assert.ok(stdout.includes("autoSubmitAvailable: false"));
  assert.ok(stdout.includes("BLOCKED="));
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
  console.log(`\nSubsidyPreReportFactCheck tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
