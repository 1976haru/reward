import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  attachDefaultCitations,
  extractClaimsFromLlmExplanationResult,
  extractClaimsFromRewardScoreResult,
  extractClaimsFromRiskScoreResult,
  validateClaim,
  validateReportCitations,
  writeCitationValidationReport
} from "../src/analysis/citationValidator.js";
import {
  createFallbackLlmExplanation,
  generateLlmExplanationReport,
  writeLlmExplanationReport
} from "../src/analysis/llmExplanationAnalysis.js";
import { CitationReference, ReportClaim } from "../src/types/citationValidation.js";
import { createCitationValidationFixtures } from "./fixtures/createCitationValidationFixtures.js";

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
const fx = createCitationValidationFixtures();
const byId = (id: string): ReportClaim => fx.claims.find((c) => c.claimId === id)!;

test("1. 근거 있는 core claim은 pass 처리된다", () => {
  assert.equal(validateClaim(byId("fx-core-source-url"), "strict").status, "pass");
});

test("2. 근거 없는 core claim은 strict 모드에서 fail 처리된다", () => {
  const r = validateClaim(byId("fx-core-missing"), "strict");
  assert.equal(r.status, "fail");
  assert.ok(r.issues.some((i) => i.code === "core_missing_strong_citation"));
});

test("3. warning 모드에서는 근거 없는 supporting claim이 warning 처리된다", () => {
  assert.equal(validateClaim(byId("fx-supporting-missing"), "warning").status, "warning");
});

test("4. computed claim은 computed_model citation으로 통과할 수 있다", () => {
  assert.equal(validateClaim(byId("fx-computed-model"), "strict").status, "pass");
});

test("5. sourceUrl citation이 인정된다", () => {
  const r = validateClaim(byId("fx-core-source-url"), "strict");
  assert.ok(r.acceptedCitationTypes.includes("source_url"));
});

test("6. evidenceUrl citation이 인정된다", () => {
  const r = validateClaim(byId("fx-core-evidence-url"), "strict");
  assert.ok(r.acceptedCitationTypes.includes("evidence_url"));
});

test("7. sourceFileName+sourceRowNumber citation이 인정된다", () => {
  const r = validateClaim(byId("fx-core-source-file"), "strict");
  assert.ok(r.acceptedCitationTypes.includes("source_file"));
  assert.equal(r.status, "pass");
});

test("8. recordId/evidenceId citation이 보조/강한 근거로 인정된다", () => {
  // evidenceId는 강한 근거 → core 단독 pass
  assert.equal(validateClaim(byId("fx-core-evidence-id"), "strict").status, "pass");
  // recordId는 보조 근거 → core 단독으로는 strict fail, supporting에는 pass
  assert.equal(validateClaim(byId("fx-core-recordid-only"), "strict").status, "fail");
  assert.equal(validateClaim(byId("fx-supporting-cited"), "warning").status, "pass");
});

test("9. fixture citation은 fixture 기반으로 표시된다", () => {
  const r = validateClaim(byId("fx-fixture-citation"), "strict");
  assert.equal(r.isFixtureBased, true);
  assert.equal(r.status, "pass");
});

test("10. 로그인 필요/private URL은 차단된다", () => {
  const login = validateClaim(byId("fx-login-url"), "warning");
  const priv = validateClaim(byId("fx-private-url"), "warning");
  assert.ok(login.rejectedCitations.some((c) => c.code === "private_url" || c.code === "login_required_url"));
  assert.ok(priv.rejectedCitations.some((c) => c.code === "private_url"));
  assert.equal(login.hasAcceptedCitation, false);
});

test("11. 개인정보가 포함된 citation은 차단된다", () => {
  const r = validateClaim(byId("fx-personal-info"), "warning");
  assert.equal(r.status, "fail");
  assert.ok(r.rejectedCitations.some((c) => c.code === "personal_info"));
});

test("12. LLM explanation result에서 claims가 추출된다", () => {
  const claims = extractClaimsFromLlmExplanationResult(fx.llmResult);
  assert.ok(claims.length > 0);
  assert.ok(claims.some((c) => c.section === "keyEvidence" && c.kind === "core"));
  // keyEvidence에 URL이 있으면 source_url citation이 자동 연결된다.
  const cited = validateReportCitations(claims, { mode: "warning" });
  assert.ok(cited.citedClaims > 0);
});

test("13. risk score result에서 claims가 추출된다", () => {
  const claims = extractClaimsFromRiskScoreResult(fx.riskResult);
  assert.ok(claims.some((c) => c.section === "riskGrade" && c.kind === "computed"));
  assert.ok(claims.some((c) => c.section === "reason"));
});

test("14. reward score result에서 claims가 추출된다", () => {
  const claims = extractClaimsFromRewardScoreResult(fx.rewardResult);
  assert.ok(claims.some((c) => c.section === "rewardLevel" && c.kind === "computed"));
  assert.ok(claims.some((c) => c.kind === "disclaimer"));
});

test("15. attachDefaultCitations가 claim에 근거를 연결한다", () => {
  const base: ReportClaim = { claimId: "t15", text: "핵심 주장", kind: "core", section: "keyEvidence", citations: [] };
  const def: CitationReference = { type: "source_url", sourceUrl: fx.publicUrl };
  const attached = attachDefaultCitations([base], [def]);
  assert.equal(attached[0].citations.length, 1);
  assert.equal(validateClaim(attached[0], "strict").status, "pass");
});

test("16~17. citation-validation-report.json/md가 생성된다", async () => {
  const report = validateReportCitations(fx.claims, { mode: "warning", isFixtureBased: true });
  const out = path.join(os.tmpdir(), `citation-val-${Date.now()}`);
  cleanupDirs.push(out);
  const { reportJsonFile, reportMdFile } = await writeCitationValidationReport(out, report);
  const json = JSON.parse(await readFile(reportJsonFile, "utf8"));
  const md = await readFile(reportMdFile, "utf8");
  assert.equal(json.reportId, report.reportId);
  assert.equal(json.title, "AI 리포트 근거 검증 결과");
  assert.ok(md.startsWith("# AI 리포트 근거 검증 결과"));
  assert.ok(md.includes("근거 보유 claims"));
});

test("18. CLI가 --fixture로 실행된다 (warning)", async () => {
  const out = path.join(os.tmpdir(), `citation-cli-${Date.now()}`);
  cleanupDirs.push(out);
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts", "validate-report-citations.ts"), "--fixture"],
    { cwd: ROOT, env: { ...process.env, CITATION_OUTPUT_DIR: out } }
  );
  assert.ok(stdout.includes("CITATION_VALIDATION_RUN_OK"));
  assert.ok(stdout.includes("totalClaims"));
  assert.ok(stdout.includes("blockedPersonalInfoCount"));
});

test("19. CLI strict 모드에서 근거 없는 claim이 있으면 실패한다", async () => {
  const out = path.join(os.tmpdir(), `citation-cli-strict-${Date.now()}`);
  cleanupDirs.push(out);
  let failed = false;
  try {
    await execFileAsync(
      process.execPath,
      ["--import", "tsx", path.join(ROOT, "scripts", "validate-report-citations.ts"), "--fixture", "--strict"],
      { cwd: ROOT, env: { ...process.env, CITATION_OUTPUT_DIR: out } }
    );
  } catch (error) {
    failed = true;
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    assert.ok(stderr.includes("CITATION_VALIDATION_STRICT_FAIL"));
  }
  assert.ok(failed, "strict CLI should exit non-zero");
});

test("20. LLM 설명형 분석 strictCitationValidation 옵션이 동작한다", async () => {
  // keyEvidence에 공개 URL이 없는 후보 → strict 검증 실패로 리포트 생성 중단
  const noUrl = generateLlmExplanationReport(
    [{ candidateId: "no-url", riskScore: 80, riskGrade: "A", evidenceSummary: ["정산 자료 공개 여부 추가 확인 필요"] }],
    { isFixtureBased: true }
  );
  const out1 = path.join(os.tmpdir(), `llm-strict-fail-${Date.now()}`);
  cleanupDirs.push(out1);
  await assert.rejects(() => writeLlmExplanationReport(out1, noUrl, { strictCitationValidation: true }));

  // non-strict(기본)에서는 생성된다
  const out2 = path.join(os.tmpdir(), `llm-nonstrict-${Date.now()}`);
  cleanupDirs.push(out2);
  const res = await writeLlmExplanationReport(out2, noUrl);
  assert.ok(res.reportJsonFile);
  assert.ok(["warning", "pass"].includes(res.citationValidation.status));

  // keyEvidence에 공개 URL이 있으면 strict에서도 통과
  const withUrl = generateLlmExplanationReport(
    [
      {
        candidateId: "with-url",
        riskScore: 80,
        riskGrade: "A",
        evidenceSummary: [`공개자료 기준 근거 URL: ${fx.publicUrl}`]
      }
    ],
    { isFixtureBased: true }
  );
  const out3 = path.join(os.tmpdir(), `llm-strict-pass-${Date.now()}`);
  cleanupDirs.push(out3);
  const okRes = await writeLlmExplanationReport(out3, withUrl, { strictCitationValidation: true });
  assert.notEqual(okRes.citationValidation.status, "fail");
});

test("21. 리포트에 개인정보 원문이 남지 않는다", async () => {
  const report = validateReportCitations(fx.claims, { mode: "warning", isFixtureBased: true });
  const out = path.join(os.tmpdir(), `citation-pii-${Date.now()}`);
  cleanupDirs.push(out);
  const { reportJsonFile, reportMdFile } = await writeCitationValidationReport(out, report);
  const jsonRaw = await readFile(reportJsonFile, "utf8");
  const mdRaw = await readFile(reportMdFile, "utf8");
  assert.ok(!jsonRaw.includes(fx.phoneSample), "phone leaked in json");
  assert.ok(!jsonRaw.includes(fx.emailSample), "email leaked in json");
  assert.ok(!mdRaw.includes(fx.phoneSample), "phone leaked in md");
  assert.ok(report.blockedPersonalInfoCount >= 1);
});

test("22. 근거 없는 문장에 근거 보강 필요 경고가 생성된다", () => {
  const report = validateReportCitations(fx.claims, { mode: "warning" });
  assert.ok(report.missingClaimIds.length > 0);
  const blob = JSON.stringify(report.issues);
  assert.ok(blob.includes("근거 보강 필요"));
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
  console.log(`\nCitationValidator tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
