// 보조금 신고서 초안 생성 테스트 (체크리스트 66).
//
// 실행: `npm run test:subsidy-report-draft` (tsx). node:assert/strict 만 사용.
// fact check PASS 후보만 초안 생성되고, strict/privacy/review 차단 후보는 draftCreated=false 다.

import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createSubsidyFactCheckFixtures } from "./fixtures/createSubsidyFactCheckFixtures.js";
import {
  generateSubsidyReportDraft,
  writeSubsidyReportDraft,
  buildSubsidyReportDraftMarkdown
} from "../src/reports/subsidyReportDraft.js";
import { runSubsidyPreReportFactCheck } from "../src/policy/subsidyPreReportChecklist.js";
import { REPORT_DRAFT_BLOCKED_CODE } from "../src/types/subsidyReportDraft.js";
import type { SubsidyReportDraftInput } from "../src/types/subsidyReportDraft.js";

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
const cases = createSubsidyFactCheckFixtures().cases as SubsidyReportDraftInput[];
const byId = (id: string) => cases.find((c) => c.candidateId === id)!;

test("fact check PASS 후보는 draftCreated=true + reportFiles 4종", () => {
  const r = generateSubsidyReportDraft(byId("fx-pass-001"));
  assert.equal(r.draftCreated, true);
  assert.equal(r.blockedReason, null);
  assert.ok(r.markdown && r.markdown.length > 0);
  const formats = new Set(r.reportFiles.map((f) => f.format));
  for (const fmt of ["markdown", "text", "docx", "metadata"]) assert.ok(formats.has(fmt as never), `누락 파일: ${fmt}`);
});

test("strict citation fail 후보는 draftCreated=false + 차단 코드", () => {
  const r = generateSubsidyReportDraft(byId("fx-cite-fail-003"));
  assert.equal(r.draftCreated, false);
  assert.equal(r.blockedCode, REPORT_DRAFT_BLOCKED_CODE);
  assert.ok(r.blockedReason && r.blockedReason.length > 0);
  assert.equal(r.reportFiles.length, 0);
});

test("privacy scan fail 후보는 draftCreated=false", () => {
  const r = generateSubsidyReportDraft(byId("fx-privacy-fail-004"));
  assert.equal(r.draftCreated, false);
  assert.equal(r.canGenerateReportDraft, false);
});

test("human review 없음 후보는 draftCreated=false", () => {
  const r = generateSubsidyReportDraft(byId("fx-noreview-005"));
  assert.equal(r.draftCreated, false);
});

test("WARNING 후보(차단 없음)는 draftCreated=true", () => {
  const r = generateSubsidyReportDraft(byId("fx-warn-002"));
  assert.equal(r.draftCreated, true);
});

test("안전 플래그가 고정값으로 반환된다", () => {
  const r = generateSubsidyReportDraft(byId("fx-pass-001"));
  assert.equal(r.isDraft, true);
  assert.equal(r.autoSubmitted, false);
  assert.equal(r.rewardGuaranteed, false);
  assert.equal(r.notLegalConclusion, true);
  assert.equal(r.humanReviewRequired, true);
});

test("초안 본문에 필수 안내/중립 문구 포함, 단정/PII 없음", () => {
  const fc = runSubsidyPreReportFactCheck(byId("fx-pass-001"));
  const md = buildSubsidyReportDraftMarkdown(byId("fx-pass-001"), fc);
  assert.ok(md.includes("신고서 초안") && md.includes("실제 신고 제출"));
  assert.ok(md.includes("부정수급으로 단정하지 않음"), "부정수급 단정 아님 안내");
  assert.ok(md.includes("포상금 지급을 보장하지"), "포상금 보장 아님 안내");
  for (const banned of ["부정수급 확정", "위법 확정", "신고 성공 보장", "포상금 수령 확정"]) {
    assert.ok(!md.includes(banned), `단정 표현: ${banned}`);
  }
  for (const raw of ["010-1234-5678", "900101-1234567", "123-456-789012", "3층 302호"]) {
    assert.ok(!md.includes(raw), `PII: ${raw}`);
  }
});

test("초안 파일(report.md/txt/docx/report_metadata.json)이 저장된다", async () => {
  const out = path.join(os.tmpdir(), `report-draft-${Date.now()}`);
  cleanupDirs.push(out);
  const r = generateSubsidyReportDraft(byId("fx-pass-001"));
  const { outDir, written } = await writeSubsidyReportDraft(out, r);
  assert.ok(outDir && written.length >= 3);
  const meta = JSON.parse(await readFile(path.join(outDir!, "report_metadata.json"), "utf8"));
  assert.equal(meta.moduleId, "subsidy_fraud");
  assert.equal(meta.isDraft, true);
  assert.equal(meta.autoSubmitted, false);
  assert.equal(meta.rewardGuaranteed, false);
  const md = await readFile(path.join(outDir!, "report.md"), "utf8");
  assert.ok(md.includes("보조금 의심 후보 신고서 초안"));
  await stat(path.join(outDir!, "report.txt"));
});

test("차단 후보는 파일을 생성하지 않는다", async () => {
  const out = path.join(os.tmpdir(), `report-draft-blocked-${Date.now()}`);
  cleanupDirs.push(out);
  const r = generateSubsidyReportDraft(byId("fx-noreview-005"));
  const { written } = await writeSubsidyReportDraft(out, r);
  assert.equal(written.length, 0);
});

test("CLI가 --fixture로 실행되고 SUBSIDY_REPORT_DRAFT_RUN_OK를 출력한다", async () => {
  const out = path.join(os.tmpdir(), `report-draft-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "run-subsidy-report-draft.ts"), "--fixture"],
    { env: { ...process.env, REPORTS_OUTPUT_DIR: out }, cwd: ROOT }
  );
  assert.ok(stdout.includes("SUBSIDY_REPORT_DRAFT_RUN_OK"), "RUN_OK 누락");
  assert.ok(stdout.includes("draftCreated(true):"));
  assert.ok(stdout.includes("autoSubmitted: false"));
  assert.ok(stdout.includes("[차단]"), "차단 케이스 표시 누락");
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
  console.log(`\nSubsidyReportDraft tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
