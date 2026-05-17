import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectFalseAdRules } from "../modules/false-ad/config.js";
import { ScoringAgent } from "../agents/ScoringAgent.js";
import { moduleRegistry } from "../modules/index.js";
import {
  ALLOWED_TRANSITIONS,
  CreateCaseSchema,
  clampRiskScore,
  isAllowedTransition,
  isHttpUrl,
  normalizeStatus,
  riskLevelFromScore
} from "../utils/validation.js";
import { JsonCaseRepository, CaseTransitionError, CaseNotFoundError } from "../repositories/CaseRepository.js";
import {
  ALLOWED_EVIDENCE_FILENAMES,
  EVIDENCE_FILES,
  EvidenceService,
  isAllowedEvidenceFileName,
  isSafeCaseId
} from "../services/EvidenceService.js";

const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (!cond) failures.push(`${name}${detail ? ` (${detail})` : ""}`);
}

// 1) 규칙 탐지 — 의심 표현이 들어간 문장에서 최소 2건 이상 탐지
const sample = "이 제품은 당뇨 완치에 도움을 주고 지방 분해 효과가 100% 있습니다.";
const hits = detectFalseAdRules(sample);
check("rule detection >= 2 hits", hits.length >= 2, `hits=${hits.length}`);

// 2) 점수 — 0~100 범위
const score = new ScoringAgent().score(hits);
check("score is finite", Number.isFinite(score), `score=${score}`);
check("score >= 0", score >= 0, `score=${score}`);
check("score <= 100", score <= 100, `score=${score}`);
check("score > 0 for matched sample", score > 0, `score=${score}`);

// 3) 의심 표현이 없는 깨끗한 문장은 0점
const cleanScore = new ScoringAgent().score(detectFalseAdRules("일반적인 상품 설명입니다."));
check("clean text scores 0", cleanScore === 0, `cleanScore=${cleanScore}`);

// 4) agency_config.json — 존재하면 JSON parse 가능 + 핵심 필드 검사
const configPath = path.join(process.cwd(), "src/modules/false-ad/agency_config.json");
try {
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  check("agency_config has moduleId", parsed.moduleId === "false_ad");
  check("agency_config has schemaVersion", typeof parsed.schemaVersion === "string");
  check("agency_config primaryAgencies >= 4", Array.isArray(parsed.primaryAgencies) && parsed.primaryAgencies.length >= 4);
  check("agency_config rewardGuaranteed === false", parsed?.rewardPolicySummary?.rewardGuaranteed === false);
} catch (error) {
  failures.push(`agency_config.json parse failed: ${(error as Error).message}`);
}

// 5) Module Registry — false_ad active + getDefault + planned 차단
const moduleList = moduleRegistry.list();
check("registry list is array", Array.isArray(moduleList), `len=${moduleList.length}`);
check("registry has false_ad", moduleRegistry.has("false_ad"));
const falseAd = moduleRegistry.get("false_ad");
check("false_ad status is active", falseAd?.status === "active", `status=${falseAd?.status}`);
const defaultModule = moduleRegistry.getDefault();
check("default module is false_ad", defaultModule?.id === "false_ad", `default=${defaultModule?.id}`);
const planned = moduleRegistry.get("counterfeit_goods");
check("counterfeit_goods registered", Boolean(planned));
check("counterfeit_goods is not active", planned?.status !== "active", `status=${planned?.status}`);
check("false_ad has reportTemplatePath", typeof falseAd?.reportTemplatePath === "string");
check("false_ad has agencyConfigPath", typeof falseAd?.agencyConfigPath === "string");

// 6) Validators
check("isHttpUrl http", isHttpUrl("http://example.com"));
check("isHttpUrl https", isHttpUrl("https://example.com/path"));
check("isHttpUrl reject ftp", !isHttpUrl("ftp://example.com"));
check("isHttpUrl reject javascript", !isHttpUrl("javascript:alert(1)"));
check("clampRiskScore 150 → 100", clampRiskScore(150) === 100);
check("clampRiskScore -5 → 0", clampRiskScore(-5) === 0);
check("clampRiskScore NaN → 0", clampRiskScore(Number.NaN) === 0);
check("riskLevel 90 매우 높음", riskLevelFromScore(90) === "매우 높음");
check("riskLevel 10 낮음", riskLevelFromScore(10) === "낮음");
check("normalizeStatus draft → DRAFT", normalizeStatus("draft") === "DRAFT");
check("normalizeStatus needs_review → REVIEW", normalizeStatus("needs_review") === "REVIEW");
check("normalizeStatus APPROVED → APPROVED", normalizeStatus("APPROVED") === "APPROVED");
check("transition DRAFT→REVIEW allowed", isAllowedTransition("DRAFT", "REVIEW"));
check("transition DRAFT→SUBMITTED denied", !isAllowedTransition("DRAFT", "SUBMITTED"));
check("transition REVIEW→SUBMITTED denied", !isAllowedTransition("REVIEW", "SUBMITTED"));
check("transition APPROVED→SUBMITTED allowed", isAllowedTransition("APPROVED", "SUBMITTED"));
check("transition SUBMITTED→REVIEW allowed", isAllowedTransition("SUBMITTED", "REVIEW"));
check("transition SUBMITTED→DRAFT denied", !isAllowedTransition("SUBMITTED", "DRAFT"));
check("ALLOWED_TRANSITIONS map size 5", Object.keys(ALLOWED_TRANSITIONS).length === 5);

// 7) zod schema
const validCreate = CreateCaseSchema.safeParse({
  moduleId: "false_ad",
  title: "테스트 광고",
  url: "https://example.com/p",
  riskScore: 250
});
check("CreateCase valid input parses", validCreate.success);
if (validCreate.success) {
  check("CreateCase clamps riskScore to 100", validCreate.data.riskScore === 100, `got=${validCreate.data.riskScore}`);
}
const invalidUrl = CreateCaseSchema.safeParse({
  title: "x",
  url: "ftp://nope.example.com"
});
check("CreateCase rejects non-http URL", !invalidUrl.success);
const missingTitle = CreateCaseSchema.safeParse({
  url: "https://example.com/p"
});
check("CreateCase rejects missing title", !missingTitle.success);

// 8) JsonCaseRepository in temp dir — create / list / patch / transition / addReview
const tempCasesDir = await mkdtemp(path.join(tmpdir(), "reward-cases-"));
try {
  const repo = new JsonCaseRepository(tempCasesDir);
  const created = await repo.create({
    moduleId: "false_ad",
    title: "스모크 테스트 케이스",
    url: "https://example.com/p",
    riskScore: 72,
    agencyCandidate: "식품의약품안전처",
    memo: "스모크"
  });
  check("repo.create → status DRAFT", created.status === "DRAFT", `got=${created.status}`);
  check("repo.create assigns riskLevel", typeof created.riskLevel === "string");
  check("repo.create statusHistory has 1 entry", (created.statusHistory ?? []).length === 1);

  const listed = await repo.list({});
  check("repo.list returns the case", listed.total >= 1 && listed.cases.some((c) => c.id === created.id));

  const patched = await repo.patch(created.id, { memo: "수정됨", riskScore: 88 });
  check("repo.patch memo updates", patched.memo === "수정됨");
  check("repo.patch riskScore clamped to 88", patched.riskScore === 88);

  const reviewed = await repo.transition(created.id, { status: "REVIEW", note: "검토 시작" });
  check("repo.transition DRAFT→REVIEW", reviewed.status === "REVIEW");
  check("statusHistory grew to 2", (reviewed.statusHistory ?? []).length === 2);

  let badTransitionCaught = false;
  try {
    await repo.transition(created.id, { status: "SUBMITTED" });
  } catch (e) {
    badTransitionCaught = e instanceof CaseTransitionError;
  }
  check("repo.transition REVIEW→SUBMITTED throws CaseTransitionError", badTransitionCaught);

  const approved = await repo.transition(created.id, { status: "APPROVED" });
  check("repo.transition REVIEW→APPROVED", approved.status === "APPROVED");

  const submitted = await repo.transition(created.id, { status: "SUBMITTED", note: "수동 제출 후 기록" });
  check("repo.transition APPROVED→SUBMITTED", submitted.status === "SUBMITTED");

  const revertReview = await repo.transition(created.id, { status: "REVIEW", note: "잘못 기록 복원" });
  check("repo.transition SUBMITTED→REVIEW (recovery)", revertReview.status === "REVIEW");

  const reviewResult = await repo.addReview(created.id, {
    reviewerName: "tester",
    decision: "APPROVED_TO_REPORT",
    notes: "근거 충분"
  });
  check("repo.addReview returns review record", typeof reviewResult.review.id === "string");
  check("repo.addReview appends to case.reviews", (reviewResult.case.reviews ?? []).length === 1);

  let notFoundCaught = false;
  try {
    await repo.get("nonexistent-id");
  } catch (e) {
    notFoundCaught = e instanceof CaseNotFoundError;
  }
  check("repo.get throws CaseNotFoundError for missing", notFoundCaught);
} finally {
  await rm(tempCasesDir, { recursive: true, force: true });
}

// 9) Evidence — sanitize / allowlist / hash / manifest
check("isSafeCaseId allows alnum-dash", isSafeCaseId("abc-123_XYZ"));
check("isSafeCaseId rejects path traversal", !isSafeCaseId("../../etc/passwd"));
check("isSafeCaseId rejects slash", !isSafeCaseId("a/b"));
check("isSafeCaseId rejects empty", !isSafeCaseId(""));
check("isSafeCaseId rejects korean", !isSafeCaseId("케이스01"));
check("isAllowedEvidenceFileName ok page.html", isAllowedEvidenceFileName("page.html"));
check("isAllowedEvidenceFileName ok manifest.json", isAllowedEvidenceFileName("manifest.json"));
check("isAllowedEvidenceFileName rejects ../.env", !isAllowedEvidenceFileName("../.env"));
check("isAllowedEvidenceFileName rejects unknown.xyz", !isAllowedEvidenceFileName("unknown.xyz"));
check("ALLOWED_EVIDENCE_FILENAMES size 6", ALLOWED_EVIDENCE_FILENAMES.size === 6);

// Hash / save / read in temp evidence dir
const tempEvidRoot = await mkdtemp(path.join(tmpdir(), "reward-evidence-"));
try {
  // override config.evidenceDir via reading evidence service with custom dir
  // EvidenceService reads config at runtime — for an isolated test we override env then re-import? Simpler: instantiate with custom dir by monkey-patching path.
  // We'll use the real service against process.cwd evidence dir, but in a unique caseId folder we control.
  const ev = new EvidenceService();
  const cid = "smoke-" + Math.random().toString(36).slice(2, 10);

  // saveHtml + saveText
  const htmlEntry = await ev.saveHtml(cid, "<html><body>hello</body></html>");
  const textEntry = await ev.saveText(cid, "hello world");
  check("saveHtml writes page.html", htmlEntry.name === EVIDENCE_FILES.html && htmlEntry.size > 0);
  check("saveText writes page.txt", textEntry.name === EVIDENCE_FILES.text && textEntry.size > 0);
  check("hash is hex sha256 (64 chars)", /^[0-9a-f]{64}$/.test(htmlEntry.sha256));

  // computeSha256 deterministic
  const h1 = await ev.computeSha256(htmlEntry.path);
  const h2 = await ev.computeSha256(htmlEntry.path);
  check("computeSha256 deterministic", h1 === h2 && h1 === htmlEntry.sha256);

  // Write + read manifest
  const sampleManifest = {
    schemaVersion: "1.0.0" as const,
    caseId: cid,
    sourceUrl: "https://example.com/p",
    pageTitle: "demo",
    fetchedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    captureStatus: { html: "ok" as const, text: "ok" as const, screenshot: "skipped" as const, pdf: "skipped" as const },
    files: [htmlEntry, textEntry],
    safety: {
      automaticReportSubmission: false as const,
      publicSourceOnly: true as const,
      humanReviewRequired: true as const,
      note: "smoke test"
    }
  };
  await ev.writeManifest(cid, sampleManifest);
  const roundtrip = await ev.readManifest(cid);
  check("manifest round-trip preserves caseId", roundtrip.caseId === cid);
  check("manifest files length matches", roundtrip.files.length === 2);

  // listEvidence returns manifest
  const listed = await ev.listEvidence(cid);
  check("listEvidence returns manifest", listed?.caseId === cid);

  // Path traversal blocked
  let traversalCaught = false;
  try {
    ev.getFilePath(cid, "../../etc/passwd");
  } catch {
    traversalCaught = true;
  }
  check("getFilePath rejects bad fileName", traversalCaught);

  let badCidCaught = false;
  try {
    ev.getCaseDir("../etc");
  } catch {
    badCidCaught = true;
  }
  check("getCaseDir rejects bad caseId", badCidCaught);

  // Cleanup
  const { rm: rmFn } = await import("node:fs/promises");
  await rmFn(ev.getCaseDir(cid), { recursive: true, force: true });
} finally {
  await rm(tempEvidRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("SMOKE_TEST_FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("SMOKE_TEST_OK", {
  hits: hits.length,
  score,
  cleanScore,
  agencyConfig: "ok",
  registry: { total: moduleList.length, active: moduleRegistry.getActive().length, default: defaultModule.id },
  caseRepo: "ok",
  validators: "ok",
  evidence: "ok"
});
