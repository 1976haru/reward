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
  EVIDENCE_COMPLETENESS_WEIGHTS,
  EVIDENCE_FILES,
  EvidenceService,
  isAllowedEvidenceFileName,
  isSafeCaseId
} from "../services/EvidenceService.js";
import { falseAdTopics, generateSeedKeywords, getTopicById } from "../modules/false-ad/topics.js";
import { SeedMockDiscovery } from "../services/discovery/SeedMockDiscovery.js";
import { scoreCandidate } from "../services/discovery/CandidateScorer.js";
import { CandidateRepository } from "../repositories/CandidateRepository.js";
import { CandidateDiscoveryService, InvalidTopicError } from "../services/CandidateDiscoveryService.js";
import { TextExtractor, maskPII, splitSentences, dedupe } from "../services/TextExtractor.js";
import { RuleAgent } from "../agents/RuleAgent.js";
import { AnalyzerAgent, validateAnalysisResult, loadAnalysisSchemaString } from "../agents/AnalyzerAgent.js";
import { stat as fsStat } from "node:fs/promises";
import { ScoringAgent as ScoringAgentNew } from "../agents/ScoringAgent.js";
import {
  COMPONENT_DEFS,
  PRIORITY_LEVELS,
  recommendedActionsFor
} from "../agents/scoring_rules.js";
import { ReportService, sanitizeReportText, isAllowedReportFileName, isSafeCaseId as isSafeCaseIdReport } from "../services/ReportService.js";
import { ALLOWED_REPORT_FILENAMES } from "../types/report.js";
import {
  approvalGatePolicy,
  canAutoSubmit,
  assertNoAutoSubmission,
  AutomaticSubmissionBlockedError,
  getOfficialReportingLinks,
  requireManualSubmissionConfirmation
} from "../policy/approvalGate.js";
import { searchSourceRegistry } from "../services/scout/SearchSourceRegistry.js";
import { MockSearchAdapter } from "../services/scout/MockSearchAdapter.js";
import { NaverSearchAdapter } from "../services/scout/NaverSearchAdapter.js";
import { scoutAgent } from "../services/scout/ScoutAgent.js";
import { SchedulerService, loadSchedulerConfig } from "../services/scheduler/SchedulerService.js";
import { canonicalizeUrl, removeTrackingParams, hostPathKey } from "../services/dedupe/UrlCanonicalizer.js";
import { similarity, jaccardSimilarity, tokenize } from "../services/dedupe/TextSimilarity.js";
import { hashText, hashHtml } from "../services/dedupe/ContentHasher.js";
import { DedupeEngine } from "../services/dedupe/DedupeEngine.js";
import {
  loadFalseAdKeywordsSync,
  validateKeywordConfig,
  getKeywordConfigSummary
} from "../modules/false-ad/keywordLoader.js";
import { JsonFeedbackRepository } from "../repositories/FeedbackRepository.js";
import {
  FEEDBACK_DECISIONS,
  FEEDBACK_REASON_CATEGORIES
} from "../types/feedback.js";
import { maskPiiForFeedback } from "../utils/piiMask.js";
import {
  buildMetrics,
  calculateAccuracy,
  calculateF1,
  calculatePrecision,
  calculateRecall,
  classifyOutcome,
  safeDivide
} from "../services/eval/EvalMetrics.js";
import { JsonEvalRepository, checkEvalSetForPii, isSafeRunId } from "../repositories/EvalRepository.js";
import { EvalRunner } from "../services/eval/EvalRunner.js";
import { EVAL_LABELS } from "../types/eval.js";
import { DashboardService, DASHBOARD_SAFETY_NOTICE } from "../services/dashboard/DashboardService.js";
import {
  loadCounterfeitKeywordsSync,
  getCounterfeitKeywordSummary
} from "../modules/counterfeit-goods/keywordLoader.js";
import { counterfeitTopics, getCounterfeitTopicById } from "../modules/counterfeit-goods/scout_topics.js";
import { counterfeitGoodsDefinition } from "../modules/counterfeit-goods/index.js";

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
check("ALLOWED_TRANSITIONS map size 8 (체크리스트 16 확장)", Object.keys(ALLOWED_TRANSITIONS).length === 8);
check("transition REVIEW→HOLD allowed", isAllowedTransition("REVIEW", "HOLD"));
check("transition HOLD→REVIEW allowed", isAllowedTransition("HOLD", "REVIEW"));
check("transition APPROVED→REPORT_DRAFT allowed", isAllowedTransition("APPROVED", "REPORT_DRAFT"));
check("transition REPORT_DRAFT→SUBMITTED allowed", isAllowedTransition("REPORT_DRAFT", "SUBMITTED"));
check("transition SUBMITTED→OUTCOME_CHECK allowed", isAllowedTransition("SUBMITTED", "OUTCOME_CHECK"));
check("transition OUTCOME_CHECK→REJECTED allowed", isAllowedTransition("OUTCOME_CHECK", "REJECTED"));
check("transition DRAFT→OUTCOME_CHECK denied", !isAllowedTransition("DRAFT", "OUTCOME_CHECK"));
check("transition REVIEW→SUBMITTED still denied", !isAllowedTransition("REVIEW", "SUBMITTED"));

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
check("ALLOWED_EVIDENCE_FILENAMES size 10 (6 표준 + 4 산출물 사본)", ALLOWED_EVIDENCE_FILENAMES.size === 10);

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

// 10) Discovery — topics / seed keywords / scorer / mock adapter / repo dedupe / planned-module guard / manual
check("falseAdTopics has 12 items", falseAdTopics.length === 12);
check("getTopicById by slug", getTopicById("blood-sugar")?.label === "혈당/당뇨");
check("getTopicById by label", getTopicById("관절/연골")?.id === "joint-cartilage");
const seeds = generateSeedKeywords(["blood-sugar", "joint-cartilage", "nope"]);
check("generateSeedKeywords merges and skips unknown", seeds.length >= 5 && !seeds.includes(""));
check("generateSeedKeywords dedupes (no obvious dupes)", new Set(seeds).size === seeds.length);

// Scorer
const high = scoreCandidate({
  title: "[광고] 당뇨 완치 영양제 - 100% 효과",
  snippet: "처방 없이 누구나 구매 가능, 후기 다수",
  url: "https://best-shop.example/product/diabetes-1"
});
check("scorer high score for treatment claim + commerce", high.score >= 60, `score=${high.score}`);
check("scorer reasons non-empty", high.reasons.length > 0);
const low = scoreCandidate({
  title: "건강기능식품 광고 가이드라인",
  snippet: "정부 안내",
  url: "https://www.mfds.go.kr/wpge/m_660/x.do"
});
check("scorer penalizes official .go.kr domain", low.score < high.score, `low=${low.score} high=${high.score}`);
check("scorer 0..100 bound (low)", low.score >= 0 && low.score <= 100);
check("scorer 0..100 bound (high)", high.score >= 0 && high.score <= 100);

// SeedMockDiscovery
const mock = new SeedMockDiscovery();
const generated = mock.generate({
  moduleId: "false_ad",
  topics: [falseAdTopics[0], falseAdTopics[1]],
  maxCandidates: 6
});
check("mock generates up to maxCandidates", generated.length > 0 && generated.length <= 6);
check("mock candidates have firstScore", generated.every((c) => typeof c.firstScore === "number" && c.firstScore >= 0 && c.firstScore <= 100));
check("mock candidates use reserved domain (.test/.example/.invalid)",
  generated.every((c) => /(\.test|\.example|\.invalid)(\/|$)/i.test(c.url)),
  generated[0]?.url
);
check("mock candidates status NEW", generated.every((c) => c.status === "NEW"));
check("mock candidates discoveryMethod seed", generated.every((c) => c.discoveryMethod === "seed"));

// Repository — temp file, dedupe + manual
const tempRepoDir = await mkdtemp(path.join(tmpdir(), "reward-candidates-"));
try {
  const tempFile = path.join(tempRepoDir, "candidates.json");
  const repo = new CandidateRepository(tempFile);
  const added1 = await repo.createMany(generated);
  check("repo.createMany added all initially", added1.length === generated.length);
  // 같은 후보 다시 넣어도 dedupe
  const added2 = await repo.createMany(generated);
  check("repo.createMany dedupes by (moduleId,url)", added2.length === 0);

  const listed = await repo.list({ moduleId: "false_ad" });
  check("repo.list returns persisted candidates", listed.length === generated.length);

  // 수동 후보 (분리된 repo 인스턴스는 사용하지 않고 서비스의 default repo는 별도 — 그래도 service.createManualCandidate는 default repo 사용. 여기서는 score만 검증)
  const manualScore = scoreCandidate({
    title: "위염 완치 보조제",
    snippet: "약 없이 위염 완치",
    url: "https://wellness-blog.example/post/x"
  });
  check("manual score > 0", manualScore.score > 0);

  const status = await repo.updateStatus(generated[0].id, "ANALYZED", { caseId: "case_xyz" });
  check("repo.updateStatus sets caseId", status.caseId === "case_xyz" && status.status === "ANALYZED");
} finally {
  await rm(tempRepoDir, { recursive: true, force: true });
}

// Service-level planned module guard + invalid topic
const svc = new CandidateDiscoveryService();
let invalidTopicCaught = false;
try {
  await svc.discover({ moduleId: "false_ad", topics: ["nonexistent-topic"], mode: "quick" });
} catch (e) {
  invalidTopicCaught = e instanceof InvalidTopicError;
}
check("service throws InvalidTopicError on unknown topic only", invalidTopicCaught);

// 11) TextExtractor — sample HTML
const extractor = new TextExtractor();
const sampleHtml = `
<!doctype html>
<html><head>
  <title>혈당 관리 건강기능식품 - 베스트 헬스 몰</title>
  <style>.x{color:red}</style>
  <script>alert("xss-should-be-stripped")</script>
  <meta property="og:title" content="프리미엄 혈당 케어">
</head>
<body>
  <header class="nav">메뉴 홈 상품 장바구니</header>
  <main>
    <h1>프리미엄 혈당 케어</h1>
    <div class="price">39,800원 · ₩39,800 · 1+1 59,900원</div>
    <div class="desc">
      당뇨 개선에 도움을 줄 수 있다고 광고됩니다. 약 대신 먹는 혈당 관리 영양제입니다.
      복용 후 혈당이 즉시 좋아진다는 후기가 있습니다. 처방 없이 누구나 섭취 가능합니다.
    </div>
    <div class="review">
      후기: 먹어보니 혈당이 좋아졌어요. 재구매 의사 있습니다. 별점 5점.
    </div>
    <div class="ingredient">
      주요 성분: 바나바잎 추출물, 여주분말. 함량 600mg.
    </div>
    <div class="usage">
      섭취 방법: 1일 1회 2캡슐, 식후 권장량 준수.
    </div>
    <div class="warning">
      섭취 시 주의사항: 임산부 및 수유부, 의약품 복용 중인 분은 전문가와 상담하세요.
    </div>
    <div class="seller">
      판매자: 베스트헬스(주) · 상호: BestHealth · 대표자: 홍길동
      문의: support@example.com, 010-1234-5678
    </div>
  </main>
  <footer class="footer">회사소개 배송 반품 환불 안내</footer>
</body></html>`;

const extracted = extractor.extract(sampleHtml, { url: "https://example.test/p" });
check("extract title", Boolean(extracted.title && extracted.title.includes("혈당")));
check("extract productName from h1", extracted.productName?.includes("프리미엄 혈당 케어") === true);
check("script tag removed (no xss alert text)", !extracted.mainText.includes("xss-should-be-stripped"));
check("style block removed", !extracted.mainText.includes(".x{color:red}"));
check("price candidates extracted", extracted.priceCandidates.length >= 2, `prices=${JSON.stringify(extracted.priceCandidates)}`);
check("claim contains disease+treatment context", extracted.claimCandidates.some((s) => /당뇨/.test(s) && /(개선|치료|즉시)/.test(s)), `claims=${extracted.claimCandidates.slice(0,3).join(" | ")}`);
check("review contains '먹어보니'", extracted.reviewCandidates.some((s) => /먹어보니/.test(s)));
check("ingredient contains '바나바'", extracted.ingredientCandidates.some((s) => /바나바|성분/.test(s)));
check("usage contains '1일'", extracted.usageCandidates.some((s) => /1일/.test(s)));
check("warning contains '주의사항'", extracted.warningCandidates.some((s) => /주의사항|전문가/.test(s)));
check("seller contains '판매자'", extracted.sellerCandidates.some((s) => /판매자|대표자/.test(s)));
check("PII email masked in mainText", extracted.mainText.includes("[email-masked]"));
check("PII phone masked in mainText", extracted.mainText.includes("[phone-masked]"));
check("textLength > 0", extracted.textLength > 0);
check("removedBoilerplateHints includes script", extracted.removedBoilerplateHints.some((h) => h.startsWith("tag:script")));
check("removedBoilerplateHints includes nav/footer", extracted.removedBoilerplateHints.some((h) => h.startsWith("tag:nav") || h.startsWith("tag:footer")));

// dedupe + splitSentences direct
check("dedupe removes duplicates", dedupe(["a", "a", "b"]).length === 2);
check("splitSentences yields sentences", splitSentences("첫 번째 문장입니다. 두 번째 문장입니다.").length === 2);
check("maskPII masks email", maskPII("contact me at foo@example.com please").includes("[email-masked]"));

// Empty/too-large guard
let emptyThrown = false;
try { extractor.extract("", {}); } catch { emptyThrown = true; }
check("extract throws on empty html", emptyThrown);

let tooLargeThrown = false;
try {
  extractor.extract("a".repeat(2_500_000), {});
} catch (e) {
  tooLargeThrown = /maximum size/i.test((e as Error).message);
}
check("extract throws on oversized html", tooLargeThrown);

// 12) Rule Agent (keywords.json) — 14건
const keywordCfg = loadFalseAdKeywordsSync();
const summary = getKeywordConfigSummary(keywordCfg);
check("keywords.json schemaVersion present", typeof keywordCfg.schemaVersion === "string");
check("keywords.json rules >= 50", keywordCfg.rules.length >= 50, `len=${keywordCfg.rules.length}`);
check("HIGH = 20 keyword rules", summary.counts.HIGH === 20, `H=${summary.counts.HIGH}`);
check("MEDIUM = 20 keyword rules", summary.counts.MEDIUM === 20, `M=${summary.counts.MEDIUM}`);
check("LOW = 10 keyword rules", summary.counts.LOW === 10, `L=${summary.counts.LOW}`);
check("combo/regex >= 4", summary.counts.combo >= 4, `C=${summary.counts.combo}`);
check("validateKeywordConfig accepts loaded config", validateKeywordConfig(keywordCfg) === keywordCfg);

const ra = new RuleAgent();
const dDiabetes = ra.detectDetailed({ text: "이 영양제는 당뇨 완치에 도움이 됩니다." });
check("당뇨 완치 → HIGH 매치", dDiabetes.matches.some((m) => m.keyword === "당뇨 완치" && m.riskLevel === "HIGH"), `matches=${dDiabetes.matches.map((m) => m.keyword).join(",")}`);

const dSubst = ra.detectDetailed({ text: "혈압약 대체 효과를 기대할 수 있습니다." });
check("혈압약 대체 → HIGH 또는 MEDIUM", dSubst.matches.some((m) => m.keyword === "혈압약 대체"));

const dMiracle = ra.detectDetailed({ text: "기적의 효과를 약속드립니다." });
check("기적의 효과 → MEDIUM 매치", dMiracle.matches.some((m) => m.keyword === "기적의 효과" && m.riskLevel === "MEDIUM"));

const dVitality = ra.detectDetailed({ text: "활력 개선을 도와드립니다." });
check("활력 개선 → LOW 매치", dVitality.matches.some((m) => m.keyword === "활력 개선" && m.riskLevel === "LOW"));

const dCombo = ra.detectDetailed({ text: "암을 예방하는 효과가 있다고 광고됩니다." });
check("disease+action combo regex 동작", dCombo.matches.some((m) => m.matchType === "regex"));

const big = ra.detectDetailed({
  text: "당뇨 완치에 도움. 혈압약 대체 가능. 기적의 효과. 약 대신 먹는 영양제. 부작용 없는 치료."
});
check("score <= 100 (cap)", big.riskScore <= 100, `score=${big.riskScore}`);
check("riskLevel computed", ["낮음", "검토 필요", "높음", "매우 높음"].includes(big.riskLevel));

const dEmpty = ra.detectDetailed({ text: "" });
check("empty text → score 0", dEmpty.riskScore === 0);
check("empty text → matches empty", dEmpty.matches.length === 0);

const dSection = ra.detectDetailed({
  claimCandidates: ["당뇨 완치에 도움을 줄 수 있습니다."],
  mainText: "일반 설명. 추가 문맥."
});
check("claimCandidates 우선 분석", dSection.matches.some((m) => m.sourceSection === "claim" && m.keyword === "당뇨 완치"));

check("matches array exposed", Array.isArray(big.matches));
check("highlightedSegments exposed", Array.isArray(big.highlightedSegments) && big.highlightedSegments.length > 0);

// 13) Analyzer Agent — 11 tests
const promptPath = path.join(process.cwd(), "src/modules/false-ad/analysis_prompt.md");
try {
  const st = await fsStat(promptPath);
  check("analysis_prompt.md 존재", st.size > 0);
} catch {
  check("analysis_prompt.md 존재", false);
}
const schemaStr = loadAnalysisSchemaString();
let schemaParsed: any = null;
try { schemaParsed = JSON.parse(schemaStr); check("analysis_schema.json 유효 JSON", true); }
catch { check("analysis_schema.json 유효 JSON", false); }
check("schema required has notLegalConclusion", Array.isArray(schemaParsed?.required) && schemaParsed.required.includes("notLegalConclusion"));
check("schema required has rewardGuaranteed", Array.isArray(schemaParsed?.required) && schemaParsed.required.includes("rewardGuaranteed"));

const az = new AnalyzerAgent();
check("MOCK 모드 동작 (OPENAI_API_KEY 없으면 mock)", az.isMockMode());

const highRiskInput = {
  moduleId: "false_ad" as const,
  title: "혈당 케어",
  url: "https://example.test/p",
  extractionResult: { productName: "혈당 케어", claimCandidates: ["당뇨 완치"], mainText: "당뇨 완치에 도움" },
  ruleDetectionResult: {
    riskScore: 90,
    riskLevel: "매우 높음",
    counts: { HIGH: 2, MEDIUM: 1 },
    matches: [
      { ruleId: "H004", keyword: "당뇨 완치", riskLevel: "HIGH", sentence: "당뇨 완치에 도움", reason: "...", sourceSection: "claim" },
      { ruleId: "H006", keyword: "혈압약 대체", riskLevel: "HIGH", sentence: "혈압약 대체", reason: "...", sourceSection: "main" }
    ]
  },
  evidenceSummary: { hasScreenshot: false, hasPdf: false }
};
const llmHigh = await az.analyzeWithContext(highRiskInput);
check("mock 결과: schema 핵심 필드", llmHigh.schemaVersion === "1.0.0" && llmHigh.moduleId === "false_ad");
check("rewardGuaranteed === false", llmHigh.rewardGuaranteed === false);
check("notLegalConclusion === true", llmHigh.notLegalConclusion === true);
check("score 80+ → VERY_HIGH 또는 HIGH 계열", llmHigh.overallRisk === "VERY_HIGH" || llmHigh.overallRisk === "HIGH", `overallRisk=${llmHigh.overallRisk}`);
check("missingEvidence가 evidenceSummary 따라 생성", llmHigh.missingEvidence.some((s) => /스크린샷|PDF/.test(s)));
check("safetyWarnings 3개 필수 안내 포함", llmHigh.safetyWarnings.some((s) => s.includes("법 위반 확정")));

// 금지 표현 sanitize
const dirty = validateAnalysisResult({
  summary: "이 광고는 불법 확정입니다. 포상금 무조건 지급 가능합니다.",
  findings: [],
  agencyCandidates: [],
  humanReviewChecklist: [],
  prohibitedPhrases: [],
  missingEvidence: [],
  safetyWarnings: [],
  overallRisk: "HIGH",
  violationLikelihood: "HIGH",
  confidence: 0.5,
  reportDraftSummary: "포상금 지급 확정"
}, "false_ad");
check("금지 표현 sanitize (불법 확정 → 치환)", !/불법\s*확정/.test(dirty.summary) && !/포상금\s*확정/.test(dirty.reportDraftSummary));
check("sanitize 시 safetyWarnings에 경고 추가", dirty.safetyWarnings.some((w) => /금지 표현/.test(w)));

// 결정성 (mock)
const r1 = await az.analyzeWithContext(highRiskInput);
const r2 = await az.analyzeWithContext(highRiskInput);
check("동일 입력 mock 결과 enum 동일", r1.overallRisk === r2.overallRisk && r1.violationLikelihood === r2.violationLikelihood);

// 14) Scoring Agent — 14 tests
const sa = new ScoringAgentNew();

// 4 등급 표 무결성
check("PRIORITY_LEVELS has 4 tiers", PRIORITY_LEVELS.length === 4);
check("components cover all 6 keys", Object.keys(COMPONENT_DEFS).length === 6);
const maxTotal = Object.values(COMPONENT_DEFS).reduce((a, b) => a + b.maxPoints, 0);
check("max points sum to 100", maxTotal === 100, `sum=${maxTotal}`);

// 빈 입력: 점수 0, level LOW, notLegalConclusion true, rewardGuaranteed false
const sEmpty = sa.computePriority({ moduleId: "false_ad" });
check("empty input → 0", sEmpty.priorityScore === 0, `score=${sEmpty.priorityScore}`);
check("empty input → LOW", sEmpty.priorityLevel === "LOW");
check("notLegalConclusion always true", sEmpty.notLegalConclusion === true);
check("rewardGuaranteed always false", sEmpty.rewardGuaranteed === false);
check("safetyWarnings include law/reward/human review", sEmpty.safetyWarnings.length >= 3 && sEmpty.safetyWarnings.some((w) => w.includes("법 위반")));

// 고위험 입력: 80+ → VERY_HIGH_PRIORITY 예상
const sHigh = sa.computePriority({
  moduleId: "false_ad",
  url: "https://shop.example.test/product/p-1",
  extractionResult: {
    productName: "혈당 케어",
    textLength: 1500,
    priceCandidates: ["39,800원"],
    claimCandidates: ["당뇨 완치", "혈압약 대체", "기적의 효과", "약 대신 먹는", "면역력 1000%"],
    reviewCandidates: ["먹어보니 완치되었어요", "효과 봤어요", "좋아졌어요"],
    sellerCandidates: ["판매자 ABC"],
    extractionWarnings: []
  },
  ruleDetectionResult: {
    riskScore: 100,
    riskLevel: "매우 높음",
    counts: { HIGH: 4, MEDIUM: 2, LOW: 0, combo: 2, total: 8 },
    matches: [
      { ruleId: "H004", keyword: "당뇨 완치", riskLevel: "HIGH", matchType: "keyword" },
      { ruleId: "H004", keyword: "당뇨 완치", riskLevel: "HIGH", matchType: "keyword" },
      { ruleId: "H006", keyword: "혈압약 대체", riskLevel: "HIGH", matchType: "keyword" },
      { ruleId: "M011", keyword: "기적의 효과", riskLevel: "MEDIUM", matchType: "keyword" },
      { ruleId: "C001", keyword: "...", riskLevel: "HIGH", matchType: "regex" }
    ]
  },
  llmAnalysis: { overallRisk: "VERY_HIGH", violationLikelihood: "HIGH", confidence: 0.85 },
  evidenceSummary: { hasUrl: true, hasHtml: true, hasText: true, hasScreenshot: true, hasPdf: true, hasMetadata: true, hasManifest: true, hasSha256: true }
});
check("high-risk → score >= 80", sHigh.priorityScore >= 80, `score=${sHigh.priorityScore}`);
check("high-risk → VERY_HIGH_PRIORITY", sHigh.priorityLevel === "VERY_HIGH_PRIORITY");
check("high-risk components covered", sHigh.components.length === 6);
check("score cap ≤ 100", sHigh.priorityScore <= 100);

// 컴포넌트별 검증
const ruleComp = sHigh.components.find((c) => c.key === "ruleSignal")!;
check("ruleSignal close to max for score=100", ruleComp.score >= 30, `ruleSignal=${ruleComp.score}`);
const evComp = sHigh.components.find((c) => c.key === "evidenceCompleteness")!;
check("evidenceCompleteness max with all true", evComp.score === 15, `ev=${evComp.score}`);
const repComp = sHigh.components.find((c) => c.key === "repetitionSignal")!;
check("repetitionSignal picks up repeated ruleId", repComp.score >= 3, `rep=${repComp.score}`);

// extractionWarnings 많을 때 extractionQuality 감점
const sBadExt = sa.computePriority({
  moduleId: "false_ad",
  extractionResult: { extractionWarnings: ["w1","w2","w3","w4","w5","w6"], textLength: 100, claimCandidates: [] }
});
const extQ = sBadExt.components.find((c) => c.key === "extractionQuality")!;
check("extractionQuality penalized when warnings many", extQ.score <= 1, `extQ=${extQ.score}`);

// 등급 매핑 일관성 — 중간 점수 입력
const sMid = sa.computePriority({
  moduleId: "false_ad",
  ruleDetectionResult: { riskScore: 50, counts: { HIGH: 1, MEDIUM: 1, LOW: 0, total: 2 }, matches: [{ ruleId: "H001", riskLevel: "HIGH" }] },
  llmAnalysis: { overallRisk: "MEDIUM", violationLikelihood: "MEDIUM", confidence: 0.4 },
  evidenceSummary: { hasHtml: true, hasText: true, hasUrl: true }
});
check("mid score → REVIEW_NEEDED or HIGH_PRIORITY", ["REVIEW_NEEDED", "HIGH_PRIORITY"].includes(sMid.priorityLevel), `level=${sMid.priorityLevel}, score=${sMid.priorityScore}`);

// recommendedNextActions 비공격적 표현 확인
const actions = recommendedActionsFor("VERY_HIGH_PRIORITY").join(" ");
check("recommended actions exclude '신고하세요'", !/신고하세요/.test(actions));
check("recommended actions exclude '포상금 가능성 높음'", !/포상금 가능성 높음/.test(actions));

// 15) Evidence Package — saveJsonFile, summarizePackage, completeness score
check("ALLOWED_EVIDENCE_FILENAMES includes new JSON files (10 total)", ALLOWED_EVIDENCE_FILENAMES.size === 10);
check("extraction.json allowed", isAllowedEvidenceFileName("extraction.json"));
check("rules.json allowed", isAllowedEvidenceFileName("rules.json"));
check("analysis.json allowed", isAllowedEvidenceFileName("analysis.json"));
check("scoring.json allowed", isAllowedEvidenceFileName("scoring.json"));
check("package keyword NOT in allowlist", !isAllowedEvidenceFileName("package"));
const weightSum =
  EVIDENCE_COMPLETENESS_WEIGHTS.html +
  EVIDENCE_COMPLETENESS_WEIGHTS.text +
  EVIDENCE_COMPLETENESS_WEIGHTS.screenshot +
  EVIDENCE_COMPLETENESS_WEIGHTS.pdf +
  EVIDENCE_COMPLETENESS_WEIGHTS.metadata +
  EVIDENCE_COMPLETENESS_WEIGHTS.manifest;
check("completeness weights sum to 100", weightSum === 100, `sum=${weightSum}`);

// 임시 디렉터리에 패키지 작성: HTML/TXT/metadata/manifest + extraction.json
const pkgService = new EvidenceService();
const pkgCaseId = "pkg_smoke_" + Math.random().toString(36).slice(2, 8);
try {
  // saveHtml/saveText/saveMetadata 직접 사용
  await pkgService.saveHtml(pkgCaseId, "<html><body>hello</body></html>");
  await pkgService.saveText(pkgCaseId, "hello");
  await pkgService.saveMetadata(pkgCaseId, { caseId: pkgCaseId, sourceUrl: "https://example.test/" });
  // manifest를 직접 한번 작성 (buildEvidence 없이 단순 테스트)
  const htmlEntry = await pkgService["describeFile"](pkgCaseId, EVIDENCE_FILES.html);
  const textEntry = await pkgService["describeFile"](pkgCaseId, EVIDENCE_FILES.text);
  const metaEntry = await pkgService["describeFile"](pkgCaseId, EVIDENCE_FILES.metadata);
  await pkgService.writeManifest(pkgCaseId, {
    schemaVersion: "1.0.0",
    caseId: pkgCaseId,
    sourceUrl: "https://example.test/",
    pageTitle: "smoke",
    fetchedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    captureStatus: { html: "ok", text: "ok", screenshot: "skipped", pdf: "skipped" },
    files: [htmlEntry, textEntry, metaEntry],
    safety: {
      automaticReportSubmission: false,
      publicSourceOnly: true,
      humanReviewRequired: true,
      note: "smoke"
    }
  });

  // 산출물 JSON 첨부
  const extractionFile = await pkgService.saveJsonFile(pkgCaseId, "extraction.json", { productName: "x" });
  check("saveJsonFile writes extraction.json", extractionFile.name === "extraction.json" && extractionFile.size > 0);

  // saveJsonFile은 .json 외 거부
  let nonJsonCaught = false;
  try { await pkgService.saveJsonFile(pkgCaseId, "page.html" as any, { x: 1 }); } catch { nonJsonCaught = true; }
  check("saveJsonFile rejects non-json filename", nonJsonCaught);

  const summary = await pkgService.summarizePackage(pkgCaseId);
  check("summarizePackage exists=true", summary.exists);
  check("hasHtml/hasText/hasMetadata", summary.hasHtml && summary.hasText && summary.hasMetadata);
  check("hasManifest", summary.hasManifest);
  check("hasScreenshot/hasPdf false", !summary.hasScreenshot && !summary.hasPdf);
  // 점수: html 15 + text 15 + metadata 10 + manifest 10 = 50
  check("completenessScore == 50", summary.completenessScore === 50, `score=${summary.completenessScore}`);
  check("0 <= completenessScore <= 100", summary.completenessScore >= 0 && summary.completenessScore <= 100);
  check("autoReport=false / humanReviewRequired=true", summary.autoReport === false && summary.humanReviewRequired === true);
  check("safetyNotice includes 자동 신고", /자동\s*신고/.test(summary.safetyNotice));
} finally {
  const { rm: rmFn } = await import("node:fs/promises");
  try { await rmFn(pkgService.getCaseDir(pkgCaseId), { recursive: true, force: true }); } catch { /* ignore */ }
}

// 미존재 case는 exists=false
const missing = await pkgService.summarizePackage("nope_does_not_exist_" + Math.random().toString(36).slice(2, 6));
check("missing package → exists=false, score 0", missing.exists === false && missing.completenessScore === 0);

// 16) Report Draft — 17 tests
check("ALLOWED_REPORT_FILENAMES size 4", ALLOWED_REPORT_FILENAMES.size === 4);
check("report.md / report.txt / report.docx / report_metadata.json 통과", ["report.md","report.txt","report.docx","report_metadata.json"].every((n) => isAllowedReportFileName(n)));
check("../.env 차단", !isAllowedReportFileName("../.env"));
check("report.html 차단", !isAllowedReportFileName("report.html"));
check("isSafeCaseId('..') 차단", !isSafeCaseIdReport(".."));

// sanitize
const warnings1: string[] = [];
const cleaned = sanitizeReportText("이 광고는 불법 확정이며 사기입니다. 포상금 보장.", warnings1);
check("sanitize 불법 확정 치환", !/불법\s*확정/.test(cleaned), `out=${cleaned}`);
check("sanitize 사기 치환", !/\b사기\b/.test(cleaned));
check("sanitize 포상금 보장 치환", !/포상금\s*보장/.test(cleaned));
check("sanitize warnings 기록", warnings1.length >= 2);

// 임시 디렉터리에 generateDraft
const tempReportDir = await mkdtemp(path.join(tmpdir(), "reward-reports-"));
// config.reportsDir override — process.env로 설정
const originalReportsDir = process.env.REPORTS_DIR;
process.env.REPORTS_DIR = tempReportDir;
// config 모듈은 dotenv load 시점에 evaluated되어 있어 process.env 변경이 영향을 주지 않음.
// 따라서 ReportService를 임시 reportsDir로 지시할 수 없으니, 실제 config.reportsDir 안에 임시 caseId 폴더만 쓰고 끝나면 정리.
process.env.REPORTS_DIR = originalReportsDir ?? "./data/reports";

const reportSvc = new ReportService();
const rptCaseId = "rpt_smoke_" + Math.random().toString(36).slice(2, 8);
try {
  const result = await reportSvc.generateDraft({
    caseId: rptCaseId,
    moduleId: "false_ad",
    title: "혈당 케어 광고 검토 요청",
    url: "https://example.test/p",
    productName: "프리미엄 혈당 케어",
    status: "REVIEW",
    agencyCandidate: "식품의약품안전처 (후보)",
    priorityScore: 75,
    priorityLabel: "우선 검토",
    capturedAt: new Date().toISOString(),
    ruleMatches: [
      { ruleId: "H004", keyword: "당뇨 완치", riskLevel: "HIGH", weight: 25, category: "disease_cure_claim", reason: "질병 완치 오인 가능성", matchType: "keyword", sentence: "당뇨 완치에 도움", excerpt: "당뇨 완치에 도움", sourceSection: "claim" }
    ],
    llmAnalysis: {
      schemaVersion: "1.0.0", moduleId: "false_ad", notLegalConclusion: true, rewardGuaranteed: false,
      overallRisk: "HIGH", violationLikelihood: "HIGH", confidence: 0.75,
      summary: "혈당 케어 광고에서 의심 표현이 다수 탐지되었습니다.",
      findings: [], missingEvidence: ["스크린샷 재캡처 필요"],
      recommendedAgency: "식품의약품안전처 (후보)", agencyCandidates: ["식약처 (후보)"],
      reportDraftSummary: "검토 요청드립니다.", prohibitedPhrases: [],
      humanReviewChecklist: ["URL 접속 확인"],
      safetyWarnings: ["본 결과는 법 위반 확정이 아닙니다."]
    },
    scoringResult: {
      schemaVersion: "1.0.0", moduleId: "false_ad",
      priorityScore: 75, priorityLabel: "우선 검토", priorityLevel: "HIGH_PRIORITY",
      components: [{ key: "ruleSignal", label: "Rule", maxPoints: 40, score: 30, reasons: ["..."] }],
      recommendedNextActions: ["사람 검토 권장"],
      notLegalConclusion: true, rewardGuaranteed: false,
      disclaimer: "참고 점수입니다.", safetyWarnings: ["법 위반 확정 아님"]
    },
    evidence: {
      hasHtml: true, hasText: true, hasScreenshot: true, hasPdf: true,
      hasMetadata: true, hasManifest: true,
      capturedAt: new Date().toISOString(),
      files: [
        { name: "page.html", size: 1234, sha256: "a".repeat(64), mimeType: "text/html; charset=utf-8" }
      ]
    },
    sellerCandidates: ["판매자 ABC"]
  });
  check("generateDraft returns markdown", typeof result.markdown === "string" && result.markdown.length > 200);
  check("markdown contains URL", result.markdown.includes("https://example.test/p"));
  check("markdown contains 육하원칙", result.markdown.includes("## 3. 육하원칙"));
  check("markdown contains 위반 의심 문구", result.markdown.includes("## 4. 위반 의심 문구"));
  check("markdown contains 증거 자료 목록", result.markdown.includes("## 6. 증거 자료 목록"));
  check("markdown contains 자동 신고서가 아닙니다", result.markdown.includes("자동 신고서가 아닙니다"));
  check("markdown does NOT contain 불법 확정", !/불법\s*확정/.test(result.markdown));
  check("markdown does NOT contain 포상금 보장", !/포상금\s*보장/.test(result.markdown));
  check("markdown does NOT contain 사기꾼", !/사기꾼/.test(result.markdown));
  check("text is non-empty", typeof result.text === "string" && result.text.length > 100);
  check("files.markdownPath ends with report.md", result.files.markdownPath.endsWith("report.md"));
  check("files.textPath ends with report.txt", result.files.textPath.endsWith("report.txt"));
  check("files.metadataPath ends with report_metadata.json", result.files.metadataPath.endsWith("report_metadata.json"));
  check("docxPath may exist or undefined", result.files.docxPath === undefined || result.files.docxPath.endsWith("report.docx"));
  check("notSubmittedAutomatically=true", result.notSubmittedAutomatically === true);
  check("humanReviewRequired=true", result.humanReviewRequired === true);

  // summarize
  const sum = await reportSvc.summarizeReport(rptCaseId);
  check("summarizeReport exists", sum.exists);
  check("hasMarkdown / hasText / hasMetadata", sum.hasMarkdown && sum.hasText && sum.hasMetadata);
  check("autoReport=false, humanReviewRequired=true", sum.autoReport === false && sum.humanReviewRequired === true);

  // path traversal via getReportFilePath
  let thrown = false;
  try { reportSvc.getReportFilePath(rptCaseId, "../.env"); } catch { thrown = true; }
  check("getReportFilePath rejects ../.env", thrown);

  let badCaseId = false;
  try { reportSvc.getReportDir("../etc"); } catch { badCaseId = true; }
  check("getReportDir rejects bad caseId", badCaseId);
} finally {
  // 임시 산출물 정리
  const { rm: rmFn } = await import("node:fs/promises");
  try { await rmFn(reportSvc.getReportDir(rptCaseId), { recursive: true, force: true }); } catch { /* ignore */ }
}

// 17) Approval Gate — 13 tests
check("policy.automaticSubmissionAllowed === false", approvalGatePolicy.automaticSubmissionAllowed === false);
check("canAutoSubmit() === false", canAutoSubmit() === false);
check("prohibitedActions includes auto_submit_report", approvalGatePolicy.prohibitedActions.includes("auto_submit_report"));
check("allowedActions includes copy_report_draft", approvalGatePolicy.allowedActions.includes("copy_report_draft"));
check("allowedActions includes open_official_reporting_link", approvalGatePolicy.allowedActions.includes("open_official_reporting_link"));
check("requiredSubmittedConfirmation === true", approvalGatePolicy.requiredSubmittedConfirmation === true);

const links = getOfficialReportingLinks("false_ad");
check("officialLinks(false_ad) has 식약처", links.some((l) => l.agencyId === "mfds"));
check("officialLinks(false_ad) has 국민신문고", links.some((l) => l.agencyId === "epeople"));

// assertNoAutoSubmission은 항상 throw
let blocked = false;
try { assertNoAutoSubmission("test_attempt"); } catch (e) {
  blocked = e instanceof AutomaticSubmissionBlockedError;
}
check("assertNoAutoSubmission always throws", blocked);

// SUBMITTED 가드: confirm 없으면 실패
const g1 = requireManualSubmissionConfirmation({ status: "SUBMITTED" });
check("requireManualSubmissionConfirmation rejects without confirm", g1.ok === false && (g1 as any).code === "CONFIRMATION_REQUIRED");

// confirm 있어도 reviewerName 없으면 실패
const g2 = requireManualSubmissionConfirmation({ status: "SUBMITTED", confirmManualSubmission: true });
check("requireManualSubmissionConfirmation rejects without reviewerName", g2.ok === false && (g2 as any).code === "REVIEWER_REQUIRED");

// 정상 통과
const g3 = requireManualSubmissionConfirmation({ status: "SUBMITTED", confirmManualSubmission: true, reviewerName: "tester" });
check("requireManualSubmissionConfirmation accepts full input", g3.ok === true);

// SUBMITTED 외 상태는 통과
const g4 = requireManualSubmissionConfirmation({ status: "REVIEW" });
check("requireManualSubmissionConfirmation passes non-SUBMITTED", g4.ok === true);

// 18) Scout Agent — 9 tests
const sources = searchSourceRegistry.listSources();
check("scout sources count == 4", sources.length === 4);
const mockSrc = sources.find((s) => s.sourceType === "mock");
check("mock source active", mockSrc?.status === "active");
const naverSrc = sources.find((s) => s.sourceType === "naver");
check("naver source disabled without keys", naverSrc?.status === "disabled");
const openAiSrc = sources.find((s) => s.sourceType === "openai_web_search");
check("openai_web_search source planned", openAiSrc?.status === "planned");
const rssSrc = sources.find((s) => s.sourceType === "rss");
check("rss source planned", rssSrc?.status === "planned");

const mockAdapter = new MockSearchAdapter();
check("MockSearchAdapter isEnabled", mockAdapter.isEnabled());
const mockResults = await mockAdapter.search("당뇨 완치", { limit: 5, moduleId: "false_ad", topicId: "blood-sugar" });
check("MockSearchAdapter returns candidates", mockResults.length > 0);
check("Mock results use reserved domains", mockResults.every((c) => /(\.test|\.example|\.invalid)/.test(c.url)));

const naverAdapter = new NaverSearchAdapter();
check("NaverSearchAdapter disabled without keys", !naverAdapter.isEnabled());

check("scoutAgent.listTopics returns 12", scoutAgent.listTopics("false_ad").length === 12);

// 19) Scheduler — 10 tests
const cfg = loadSchedulerConfig();
check("scheduler default disabled", cfg.enabled === false);
check("scheduler cron has 5 fields", cfg.cron.split(/\s+/).length === 5);
check("scheduler topics not empty", cfg.topics.length > 0);
check("scheduler sources not empty", cfg.sources.length > 0);

const schedSvc = new SchedulerService({ enabled: false, cron: "0 9 * * *", retryAttempts: 0, maxCandidates: 3, topics: ["blood-sugar"], sources: ["mock"] });
check("isCronValid true", schedSvc.isCronValid());
const schedStatus = await schedSvc.getStatus();
check("status.enabled=false", schedStatus.enabled === false);
check("safetyNotice mentions 자동 신고 아님", /외부\s*신고기관에\s*자동\s*제출하지\s*않/.test(schedStatus.safetyNotice));

// runOnce mock 실행
const schedRec = await schedSvc.runOnce("smoke", { topics: ["blood-sugar"], sources: ["mock"], maxCandidates: 3, mode: "quick" });
check("runOnce status=SUCCESS", schedRec.status === "SUCCESS", `status=${schedRec.status}, err=${schedRec.error}`);
check("runOnce result.totalFound >= 0", typeof schedRec.result?.totalFound === "number");
check("runOnce attempts >= 1", schedRec.attempts.length >= 1);
check("runOnce safetyNotice present", schedRec.safetyNotice.length > 0);

// invalid cron 검출
const badSched = new SchedulerService({ cron: "not a cron" });
check("invalid cron detected", !badSched.isCronValid());

// listRuns
const schedRuns = await schedSvc.listRuns(5);
check("listRuns returns array", Array.isArray(schedRuns));

// 20) Dedupe Engine — 15 tests
const c1 = canonicalizeUrl("https://Example.com:443/Product/?utm_source=naver&productNo=123#sec");
check("canonicalize lowercases host", c1.canonicalUrl.includes("example.com"));
check("canonicalize removes default port 443", !c1.canonicalUrl.includes(":443"));
check("canonicalize removes utm_source", c1.removedTrackingParams.includes("utm_source"));
check("canonicalize keeps productNo", c1.canonicalUrl.includes("productNo=123"));
check("canonicalize strips fragment", !c1.canonicalUrl.includes("#sec"));

const c2 = canonicalizeUrl("HTTPS://EXAMPLE.COM/product?productNo=123&utm_medium=email&fbclid=abc");
check("canonical url hash matches across variants",
  c1.urlHash === c2.urlHash || c1.canonicalUrl.toLowerCase() === c2.canonicalUrl.toLowerCase());

// hostPathKey
const hp = hostPathKey("https://example.com/p?x=1");
check("hostPathKey ignores query", hp === "example.com/p");

// Similarity
const simA = similarity("프리미엄 혈당 케어 30정", "프리미엄 혈당 케어 60정");
check("similarity high for same product", simA >= 0.6, `sim=${simA.toFixed(2)}`);
const simB = similarity("프리미엄 혈당 케어", "관절 영양제 60정");
check("similarity low for different products", simB < 0.4, `sim=${simB.toFixed(2)}`);
const jac = jaccardSimilarity("apple banana cherry date", "apple banana cherry elder");
check("jaccard 3/5 = 0.6", Math.abs(jac - 0.6) < 0.01);
const toks = tokenize("프리미엄 혈당 케어 a 30정");
check("tokenize drops length-1 token 'a'", toks.includes("프리미엄") && !toks.includes("a"));

// Content hash
const h1 = hashText("같은 본문입니다.\n공백 차이만 있음.");
const h2 = hashText("같은 본문입니다. 공백 차이만 있음.");
check("hashText normalizes whitespace", h1 === h2);
const hh = hashHtml("<html><body><script>alert(1)</script>본문 텍스트</body></html>");
const hh2 = hashHtml("<html><body>본문 텍스트</body></html>");
check("hashHtml strips script", hh === hh2);

// DedupeEngine
const eng = new DedupeEngine();
const result1 = eng.dedupeCandidate(
  { url: "https://example.com/product?productNo=1&utm_source=naver", title: "혈당 케어 30정" },
  [{ id: "existing-1", url: "https://example.com/product?productNo=1" }]
);
check("DUPLICATE when canonical matches", result1.status === "DUPLICATE", `status=${result1.status}`);

const result2 = eng.dedupeCandidate(
  { url: "https://other.test/p", title: "프리미엄 혈당 케어 영양제 30정 후기" },
  [{ id: "e2", url: "https://different.test/q", title: "프리미엄 혈당 케어 영양제 60정 후기" }]
);
check("DUPLICATE/POSSIBLE when title similarity high", ["DUPLICATE", "POSSIBLE_DUPLICATE"].includes(result2.status), `status=${result2.status}`);

const batch = eng.dedupeBatch([
  { id: "a", url: "https://example.com/product?productNo=1", title: "혈당 케어" },
  { id: "b", url: "https://example.com/product?productNo=1&utm_source=naver", title: "혈당 케어" }, // dup of a
  { id: "c", url: "https://example.com/product/2?ref=mall", title: "관절 영양제" }
]);
check("batch dedupe rate > 0", batch.summary.duplicateRate > 0, `rate=${batch.summary.duplicateRate}`);
check("batch kept < total", batch.summary.kept < batch.summary.total);

// 21) Feedback DB — types, repository, PII masking, stats, improvements
check("FEEDBACK_DECISIONS has 7 codes", FEEDBACK_DECISIONS.length === 7);
check("FEEDBACK_REASON_CATEGORIES has 15 codes", FEEDBACK_REASON_CATEGORIES.length === 15);
check("FEEDBACK_DECISIONS includes FALSE_POSITIVE", (FEEDBACK_DECISIONS as readonly string[]).includes("FALSE_POSITIVE"));
check("FEEDBACK_REASON_CATEGORIES includes RULE_FALSE_POSITIVE", (FEEDBACK_REASON_CATEGORIES as readonly string[]).includes("RULE_FALSE_POSITIVE"));

// PII 마스킹
const pii1 = maskPiiForFeedback("contact foo@bar.com or 010-1234-5678 please");
check("piiMask masks email", pii1.masked.includes("[masked-email]"));
check("piiMask masks phone", pii1.masked.includes("[masked-phone]"));
check("piiMask changed=true", pii1.changed === true);
const pii2 = maskPiiForFeedback("그냥 일반 메모입니다.");
check("piiMask leaves clean text unchanged", pii2.changed === false && pii2.masked === "그냥 일반 메모입니다.");
const pii3 = maskPiiForFeedback("주민번호 901231-1234567");
check("piiMask masks rrn", pii3.masked.includes("[masked-id]"));

// FeedbackRepository — 임시 디렉터리에서 동작 검증
const tmpFbDir = await mkdtemp(path.join(tmpdir(), "reward-feedback-"));
try {
  const fbRepo = new JsonFeedbackRepository(tmpFbDir);

  // 빈 상태
  const emptyList = await fbRepo.list();
  check("feedback empty list total=0", emptyList.total === 0);
  const emptyStats = await fbRepo.stats();
  check("feedback empty stats total=0", emptyStats.total === 0);
  check("feedback empty stats has byDecision keys", typeof emptyStats.byDecision === "object");

  // 생성 — RULE_FALSE_POSITIVE 다수
  const c1 = await fbRepo.create({
    caseId: "smoke_case_1",
    decision: "REJECT",
    reasonCategories: ["RULE_FALSE_POSITIVE", "NO_PROHIBITED_CLAIM"],
    reviewerName: "tester",
    memo: "일반 건강관리 표현으로 보임. 연락처 010-1234-5678",
    relatedRuleIds: ["H004"],
    relatedKeywords: ["당뇨 완치"],
    suggestedRuleChanges: ["문맥 예외 보강"],
    moduleId: "false_ad"
  });
  check("feedback created id format", /^fb_/.test(c1.feedback.id));
  check("feedback PII masked memo", typeof c1.feedback.memo === "string" && c1.feedback.memo.includes("[masked-phone]"));
  check("feedback piiMasked=true", c1.piiMasked === true && c1.feedback.piiMasked === true);
  check("feedback decision saved", c1.feedback.decision === "REJECT");
  check("feedback reasonCategories saved", c1.feedback.reasonCategories.length === 2);
  check("feedback safetyNotice present", typeof c1.feedback.safetyNotice === "string" && c1.feedback.safetyNotice.length > 0);

  // 추가로 5건의 RULE_FALSE_POSITIVE H004 — topRule 검증
  for (let i = 0; i < 5; i++) {
    await fbRepo.create({
      caseId: `smoke_case_${i + 2}`,
      decision: "FALSE_POSITIVE",
      reasonCategories: ["RULE_FALSE_POSITIVE"],
      relatedRuleIds: ["H004"],
      relatedKeywords: ["당뇨 완치"]
    });
  }
  // LLM_OVERSTATED 2건
  for (let i = 0; i < 2; i++) {
    await fbRepo.create({
      caseId: `smoke_llm_${i}`,
      decision: "REJECT",
      reasonCategories: ["LLM_OVERSTATED"],
      llmIssueNotes: "과장된 해석"
    });
  }
  // SCORE_TOO_HIGH 1건
  await fbRepo.create({
    caseId: "smoke_score_1",
    decision: "REJECT",
    reasonCategories: ["SCORE_TOO_HIGH"],
    scoringIssueNotes: "rule 1건만 매치"
  });
  // EVIDENCE_INSUFFICIENT 1건
  await fbRepo.create({
    caseId: "smoke_ev_1",
    decision: "NEEDS_MORE_EVIDENCE",
    reasonCategories: ["EVIDENCE_INSUFFICIENT"]
  });

  const stats = await fbRepo.stats();
  check("feedback total = 10", stats.total === 10, `total=${stats.total}`);
  check("feedback byDecision REJECT >= 4", (stats.byDecision["REJECT"] ?? 0) >= 4);
  check("feedback byReasonCategory RULE_FALSE_POSITIVE >= 6", (stats.byReasonCategory["RULE_FALSE_POSITIVE"] ?? 0) >= 6);
  const topRule = stats.topRuleFalsePositiveIds[0];
  check("feedback topRuleFalsePositiveIds[0] is H004", topRule && topRule.ruleId === "H004", `top=${JSON.stringify(topRule)}`);
  check("feedback topRule count >= 6", topRule && topRule.count >= 6, `top=${JSON.stringify(topRule)}`);
  const topKw = stats.topKeywordFalsePositives[0];
  check("feedback topKeyword '당뇨 완치'", topKw && topKw.keyword === "당뇨 완치", `top=${JSON.stringify(topKw)}`);
  check("feedback evidenceIssueCounts.EVIDENCE_INSUFFICIENT >= 1", stats.evidenceIssueCounts.EVIDENCE_INSUFFICIENT >= 1);

  // listByCaseId
  const byCase = await fbRepo.listByCaseId("smoke_case_1");
  check("listByCaseId returns 1 for smoke_case_1", byCase.length === 1);

  // 필터 검증
  const filtered = await fbRepo.list({ reasonCategory: "LLM_OVERSTATED" });
  check("filter reasonCategory LLM_OVERSTATED returns 2", filtered.total === 2, `total=${filtered.total}`);
  const filteredRule = await fbRepo.list({ ruleId: "H004" });
  check("filter ruleId H004 returns >= 6", filteredRule.total >= 6, `total=${filteredRule.total}`);
  const filteredDec = await fbRepo.list({ decision: "FALSE_POSITIVE" });
  check("filter decision FALSE_POSITIVE returns 5", filteredDec.total === 5, `total=${filteredDec.total}`);

  // improvements 리포트
  const imp = await fbRepo.improvements();
  check("improvements ruleImprovements non-empty", imp.ruleImprovements.length >= 1);
  check("improvements ruleId is H004", imp.ruleImprovements[0]?.ruleId === "H004");
  check("improvements promptImprovements has LLM_OVERSTATED", imp.promptImprovements.some((p) => p.issue === "LLM_OVERSTATED"));
  check("improvements scoringImprovements has SCORE_TOO_HIGH", imp.scoringImprovements.some((p) => p.issue === "SCORE_TOO_HIGH"));
  check("improvements evidenceImprovements has EVIDENCE_INSUFFICIENT", imp.evidenceImprovements.some((p) => p.issue === "EVIDENCE_INSUFFICIENT"));

  // 잘못된 decision 거부
  let badDecisionThrown = false;
  try {
    // @ts-expect-error intentional bad decision
    await fbRepo.create({ caseId: "x", decision: "INVALID" });
  } catch {
    badDecisionThrown = true;
  }
  check("feedback rejects invalid decision", badDecisionThrown);

  // caseId 누락 거부
  let noCaseIdThrown = false;
  try {
    // @ts-expect-error intentional missing caseId
    await fbRepo.create({ decision: "REJECT" });
  } catch {
    noCaseIdThrown = true;
  }
  check("feedback rejects missing caseId", noCaseIdThrown);
} finally {
  await rm(tmpFbDir, { recursive: true, force: true });
}

// 22) Eval Set — metrics, generator output, runner, repository
check("EVAL_LABELS == VIOLATION_CANDIDATE/NORMAL", EVAL_LABELS.length === 2 && EVAL_LABELS.includes("VIOLATION_CANDIDATE") && EVAL_LABELS.includes("NORMAL"));

// safeDivide
check("safeDivide(6,3) == 2", safeDivide(6, 3) === 2);
check("safeDivide(5,0) == 0", safeDivide(5, 0) === 0);
check("safeDivide(NaN,3) == 0", safeDivide(Number.NaN, 3) === 0);

// metric formulas
check("precision(8,2) == 0.8", Math.abs(calculatePrecision(8, 2) - 0.8) < 1e-9);
check("recall(8,2) == 0.8", Math.abs(calculateRecall(8, 2) - 0.8) < 1e-9);
check("f1(1,1) == 1", calculateF1(1, 1) === 1);
check("f1(0,0) == 0", calculateF1(0, 0) === 0);
check("accuracy(8,8,20) == 0.8", Math.abs(calculateAccuracy(8, 8, 20) - 0.8) < 1e-9);

// classifyOutcome
check("classifyOutcome VIOLATION+POSITIVE = TP", classifyOutcome("VIOLATION_CANDIDATE", "POSITIVE") === "TP");
check("classifyOutcome VIOLATION+NEGATIVE = FN", classifyOutcome("VIOLATION_CANDIDATE", "NEGATIVE") === "FN");
check("classifyOutcome NORMAL+POSITIVE = FP", classifyOutcome("NORMAL", "POSITIVE") === "FP");
check("classifyOutcome NORMAL+NEGATIVE = TN", classifyOutcome("NORMAL", "NEGATIVE") === "TN");

// buildMetrics with hand-crafted results
const fakeResults = [
  { sampleId: "a", label: "VIOLATION_CANDIDATE", category: "x", productName: "p", text: "", priorityScore: 80, ruleRiskScore: 70, matchedKeywords: [], matchedRuleIds: [], matchCount: 0, threshold: 60, prediction: "POSITIVE", predictedAsPositive: true, outcome: "TP" },
  { sampleId: "b", label: "VIOLATION_CANDIDATE", category: "x", productName: "p", text: "", priorityScore: 30, ruleRiskScore: 10, matchedKeywords: [], matchedRuleIds: [], matchCount: 0, threshold: 60, prediction: "NEGATIVE", predictedAsPositive: false, outcome: "FN" },
  { sampleId: "c", label: "NORMAL", category: "x", productName: "p", text: "", priorityScore: 80, ruleRiskScore: 50, matchedKeywords: [], matchedRuleIds: [], matchCount: 0, threshold: 60, prediction: "POSITIVE", predictedAsPositive: true, outcome: "FP" },
  { sampleId: "d", label: "NORMAL", category: "x", productName: "p", text: "", priorityScore: 20, ruleRiskScore: 0, matchedKeywords: [], matchedRuleIds: [], matchCount: 0, threshold: 60, prediction: "NEGATIVE", predictedAsPositive: false, outcome: "TN" }
] as Parameters<typeof buildMetrics>[0];
const sampleMetrics = buildMetrics(fakeResults, 60);
check("buildMetrics confusion TP/FP/TN/FN", sampleMetrics.confusion.TP === 1 && sampleMetrics.confusion.FP === 1 && sampleMetrics.confusion.TN === 1 && sampleMetrics.confusion.FN === 1);
check("buildMetrics precision 0.5", Math.abs(sampleMetrics.precision - 0.5) < 1e-3);
check("buildMetrics recall 0.5", Math.abs(sampleMetrics.recall - 0.5) < 1e-3);
check("buildMetrics f1 0.5", Math.abs(sampleMetrics.f1 - 0.5) < 1e-3);
check("buildMetrics accuracy 0.5", Math.abs(sampleMetrics.accuracy - 0.5) < 1e-3);
check("buildMetrics notLegalConclusion true", sampleMetrics.notLegalConclusion === true);

// Eval set file 검증 — eval:generate가 만든 결과를 직접 검사
const evalSetPath = path.join(process.cwd(), "src", "modules", "false-ad", "eval", "health_false_ad_synthetic_v1.json");
const evalSetRaw = await readFile(evalSetPath, "utf8");
const evalSet = JSON.parse(evalSetRaw);
check("eval set schemaVersion 1.0.0", evalSet.schemaVersion === "1.0.0");
check("eval set evalSetId matches", evalSet.evalSetId === "health_false_ad_synthetic_v1");
check("eval set moduleId false_ad", evalSet.moduleId === "false_ad");
check("eval set synthetic=true", evalSet.synthetic === true);
check("eval set total samples == 200", Array.isArray(evalSet.samples) && evalSet.samples.length === 200);
const violations = evalSet.samples.filter((s: { label: string }) => s.label === "VIOLATION_CANDIDATE");
const normals = evalSet.samples.filter((s: { label: string }) => s.label === "NORMAL");
check("eval set VIOLATION_CANDIDATE == 100", violations.length === 100, `v=${violations.length}`);
check("eval set NORMAL == 100", normals.length === 100, `n=${normals.length}`);
const idSet = new Set<string>(evalSet.samples.map((s: { id: string }) => s.id));
check("eval set sample ids unique", idSet.size === 200, `unique=${idSet.size}`);

// PII 검사 — 합성 데이터에 PII 패턴이 들어가지 않았는지
const piiCheck = checkEvalSetForPii(evalSet);
check("eval set has no PII patterns", piiCheck.ok === true, `violations=${JSON.stringify(piiCheck.violations.slice(0, 3))}`);

// 일부러 PII 패턴이 섞인 가짜 set으로 negative case 검증
const piiCheckNeg = checkEvalSetForPii({
  ...evalSet,
  samples: [{ id: "x", label: "NORMAL", category: "GENERAL_HEALTH", productName: "X", text: "문의 010-1234-5678" }]
});
check("checkEvalSetForPii detects phone", piiCheckNeg.ok === false && piiCheckNeg.violations.length >= 1);

// EvalRepository (임시 디렉터리)
const tmpEvalRunDir = await mkdtemp(path.join(tmpdir(), "reward-eval-"));
try {
  const evalRepoLocal = new JsonEvalRepository(tmpEvalRunDir);

  // listSets — 실제 모듈 eval 디렉터리에서 읽음
  const sets = await evalRepoLocal.listSets("false_ad");
  check("listSets includes health_false_ad_synthetic_v1", sets.some((s) => s.evalSetId === "health_false_ad_synthetic_v1"));
  check("listSets set total=200", sets.find((s) => s.evalSetId === "health_false_ad_synthetic_v1")?.total === 200);
  check("listSets positives=100", sets.find((s) => s.evalSetId === "health_false_ad_synthetic_v1")?.positives === 100);
  check("listSets negatives=100", sets.find((s) => s.evalSetId === "health_false_ad_synthetic_v1")?.negatives === 100);

  const set = await evalRepoLocal.getSet("health_false_ad_synthetic_v1");
  check("getSet returns 200 samples", set.samples.length === 200);

  // Runner 동작 — 작은 subset
  const runner = new EvalRunner();
  const small = { ...set, samples: set.samples.slice(0, 10) };
  const runSmall = await runner.run(small, { threshold: 60, useLlm: false, maxSamples: 10 });
  check("runner returns runId", typeof runSmall.runId === "string" && /^run_/.test(runSmall.runId));
  check("runner runId is safe", isSafeRunId(runSmall.runId));
  check("runner results length matches maxSamples", runSmall.results.length === 10);
  check("runner llmCallCount = 0", runSmall.llmCallCount === 0);
  check("runner useLlm=false even when requested true", runSmall.useLlm === false);
  const sumCM = runSmall.metrics.confusion.TP + runSmall.metrics.confusion.FP + runSmall.metrics.confusion.TN + runSmall.metrics.confusion.FN;
  check("runner confusion sums to total", sumCM === 10, `sum=${sumCM}`);

  // 전체 평가 — RuleAgent가 위반 샘플을 잘 탐지하는지
  const runFull = await runner.run(set, { threshold: 60, useLlm: false, maxSamples: 200 });
  check("full eval total=200", runFull.metrics.total === 200);
  check("full eval positive=100", runFull.metrics.positive === 100);
  check("full eval negative=100", runFull.metrics.negative === 100);
  // baseline — 합성셋의 일부 키워드는 keywords.json에 아직 등록되지 않아 의도적으로 FN으로 분류된다.
  // 이 FN은 룰 개선 후보로 활용되어야 한다 (eval의 진단 가치).
  check("full eval recall >= 0.4", runFull.metrics.recall >= 0.4, `recall=${runFull.metrics.recall}`);
  check("full eval precision >= 0.8", runFull.metrics.precision >= 0.8, `precision=${runFull.metrics.precision}`);
  check("full eval f1 > 0", runFull.metrics.f1 > 0);
  check("full eval accuracy >= 0.6", runFull.metrics.accuracy >= 0.6, `accuracy=${runFull.metrics.accuracy}`);
  check("full eval has FN (rule 개선 후보)", runFull.falseNegatives.length > 0);
  check("full eval feedbackCandidates is array", Array.isArray(runFull.feedbackCandidates));
  check("full eval feedbackCandidates non-empty when FN exists", runFull.feedbackCandidates.length > 0);

  // FP/FN 분류
  for (const r of runFull.results) {
    if (r.label === "VIOLATION_CANDIDATE" && r.prediction === "POSITIVE") {
      check("TP classification consistent", r.outcome === "TP");
      break;
    }
  }

  // 저장/조회/latest
  await evalRepoLocal.saveRun(runFull);
  const fetched = await evalRepoLocal.getRun(runFull.runId);
  check("getRun returns same id", fetched.runId === runFull.runId);
  const latest = await evalRepoLocal.getLatest();
  check("getLatest returns the saved run", latest?.runId === runFull.runId);
  const list = await evalRepoLocal.listRuns(5);
  check("listRuns contains saved run", list.some((r) => r.runId === runFull.runId));

  // 잘못된 runId 거부
  check("isSafeRunId rejects ../etc/passwd", !isSafeRunId("../etc/passwd"));
  check("isSafeRunId accepts run_2026-05-18T00-00-00_abc", isSafeRunId("run_2026-05-18T00-00-00_abc"));
} finally {
  await rm(tmpEvalRunDir, { recursive: true, force: true });
}

// 23) Dashboard service — 통합 요약이 graceful degrade로 동작하는지 확인
const dash = new DashboardService();
const dashSummary = await dash.getSummary();
check("dashboard schemaVersion 1.0.0", dashSummary.schemaVersion === "1.0.0");
check("dashboard has today.date YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(dashSummary.today.date), `date=${dashSummary.today.date}`);
check("dashboard kpis length 8", dashSummary.kpis.length === 8, `len=${dashSummary.kpis.length}`);
const kpiKeys = dashSummary.kpis.map((k) => k.key);
check("dashboard kpis include submitted_records", kpiKeys.includes("submitted_records"));
check("dashboard kpis include eval_f1", kpiKeys.includes("eval_f1"));
check("dashboard kpis include dedupe_rate", kpiKeys.includes("dedupe_rate"));
check("dashboard kpis include candidates_today", kpiKeys.includes("candidates_today"));
check("dashboard queue has 8 status counts", Object.keys(dashSummary.queue.counts).length === 8);
check("dashboard queue total >= 0", dashSummary.queue.total >= 0);
check("dashboard modules contain false_ad", dashSummary.modules.some((m) => m.moduleId === "false_ad"));
check("dashboard false_ad active=true", dashSummary.modules.find((m) => m.moduleId === "false_ad")?.active === true);
check("dashboard safetyNotice mentions 자동 제출", /자동\s*제출하지\s*않/.test(dashSummary.safetyNotice));
check("dashboard autoReport === false", dashSummary.autoReport === false);
check("dashboard humanReviewRequired === true", dashSummary.humanReviewRequired === true);
check("dashboard topCandidates is array", Array.isArray(dashSummary.topCandidates));
check("dashboard evalMetrics has exists field", typeof dashSummary.evalMetrics.exists === "boolean");
check("dashboard scheduler has enabled field", typeof dashSummary.scheduler.enabled === "boolean");
check("dashboard dedupe.duplicateRate in 0..1", dashSummary.dedupe.duplicateRate >= 0 && dashSummary.dedupe.duplicateRate <= 1);
check("dashboard feedback.total is number", typeof dashSummary.feedback.total === "number");

// 제출 기록 카드 hint에 '자동 제출이 아닙니다' 문구 포함 — 안전 문구 회귀 방지
const submitKpi = dashSummary.kpis.find((k) => k.key === "submitted_records");
check("submitted_records hint mentions 자동 제출 아님", typeof submitKpi?.hint === "string" && /자동\s*제출이\s*아닙니다/.test(submitKpi.hint));

// getTopCandidates / getModulePerformance / getQuality 단독 동작
const top5 = await dash.getTopCandidates(5);
check("getTopCandidates(5) returns <= 5", Array.isArray(top5) && top5.length <= 5);
const perf = await dash.getModulePerformance();
check("getModulePerformance includes active false_ad", perf.some((m) => m.moduleId === "false_ad" && m.active === true));
const quality = await dash.getQuality();
check("getQuality returns eval + feedback + safetyNotice", typeof quality.safetyNotice === "string" && quality.safetyNotice.length > 0);
check("DASHBOARD_SAFETY_NOTICE matches getSummary().safetyNotice", DASHBOARD_SAFETY_NOTICE === dashSummary.safetyNotice);

// 24) Counterfeit Goods Module — 모듈 등록, 룰셋, 스카웃 주제, RuleAgent/ScoringAgent/ReportService 확장
check("counterfeit module id", counterfeitGoodsDefinition.id === "counterfeit_goods");
check("counterfeit module status ready", counterfeitGoodsDefinition.status === "ready");
check("counterfeit module slug", counterfeitGoodsDefinition.slug === "counterfeit-goods");
check("counterfeit registered in registry", moduleRegistry.has("counterfeit_goods"));
const cfMod = moduleRegistry.get("counterfeit_goods");
check("counterfeit category intellectual_property", cfMod?.category === "intellectual_property");
check("counterfeit ruleBasedDetection true", cfMod?.capabilities.ruleBasedDetection === true);
check("counterfeit reportDraft true", cfMod?.capabilities.reportDraft === true);

// false_ad still active + counterfeit ready (기존 동작 깨지지 않음)
check("false_ad still active", moduleRegistry.get("false_ad")?.status === "active");

// keywords.json — 룰 수 검증
const cfKw = loadCounterfeitKeywordsSync();
check("counterfeit keywords schemaVersion", cfKw.schemaVersion === "1.0.0");
check("counterfeit keywords moduleId", cfKw.moduleId === "counterfeit_goods");
const cfSummary = getCounterfeitKeywordSummary(cfKw);
check("counterfeit rules >= 50", cfKw.rules.length >= 50, `len=${cfKw.rules.length}`);
check("counterfeit HIGH = 20", cfSummary.counts.HIGH === 20, `H=${cfSummary.counts.HIGH}`);
check("counterfeit MEDIUM = 20", cfSummary.counts.MEDIUM === 20, `M=${cfSummary.counts.MEDIUM}`);
check("counterfeit LOW = 10", cfSummary.counts.LOW === 10, `L=${cfSummary.counts.LOW}`);
check("counterfeit combo >= 4", cfSummary.counts.combo >= 4, `C=${cfSummary.counts.combo}`);
check("counterfeit brandTerms >= 5", cfKw.brandTerms.length >= 5);

// disclaimer must contain "확정하지" or similar
check("counterfeit disclaimer mentions 확정하지", /확정하지/.test(cfKw.disclaimer));

// RuleAgent 확장 — counterfeit 텍스트 탐지
const ruleA = new RuleAgent();
const cfText1 = ruleA.detectDetailed({ claimCandidates: ["미러급 시계 풀박스 구성"], mainText: "미러급 시계 풀박스 구성" }, "counterfeit_goods");
check("RuleAgent matches 미러급 시계", cfText1.matches.some((m) => m.keyword === "미러급"), `matches=${cfText1.matches.map((m) => m.keyword).join(",")}`);

const cfText2 = ruleA.detectDetailed({ claimCandidates: ["1:1 가방 구성품 완비"], mainText: "1:1 가방 구성품 완비" }, "counterfeit_goods");
check("RuleAgent matches 1:1", cfText2.matches.some((m) => m.keyword === "1:1"));

const cfText3 = ruleA.detectDetailed({ claimCandidates: ["정품급 운동화 단속 피해서 비밀배송"] }, "counterfeit_goods");
check("RuleAgent matches 정품급", cfText3.matches.some((m) => m.keyword === "정품급"));
check("RuleAgent matches 단속 피해서", cfText3.matches.some((m) => m.keyword === "단속 피해서"));
check("RuleAgent matches 비밀배송", cfText3.matches.some((m) => m.keyword === "비밀배송"));

// Combo regex — 브랜드 + 위조표현
const cfCombo = ruleA.detectDetailed({ claimCandidates: ["롤렉스 미러급 시계 1:1"] }, "counterfeit_goods");
check("RuleAgent combo brand+replica regex matches", cfCombo.matches.some((m) => m.matchType === "combo" || m.matchType === "regex"));

// false_ad still works unchanged after counterfeit branch
const faText = ruleA.detectDetailed({ text: "당뇨 완치에 도움" });
check("false_ad RuleAgent still works", faText.matches.some((m) => m.keyword === "당뇨 완치"));

// 미지원 모듈은 예외
let badModuleCaught = false;
try {
  ruleA.detectDetailed({ text: "test" }, "unknown_module");
} catch {
  badModuleCaught = true;
}
check("RuleAgent throws for unknown moduleId", badModuleCaught);

// ScoringAgent.computeCounterfeitPriority — 동작 확인
const sAgent = new ScoringAgent();
const cfScore = sAgent.computeCounterfeitPriority({
  moduleId: "counterfeit_goods",
  url: "https://example.test/product/p-1",
  extractionResult: {
    productName: "샤넬급 가방",
    textLength: 800,
    priceCandidates: ["99,000원"],
    claimCandidates: ["샤넬급 가방 미러급 1:1 풀박스 구성"]
  },
  ruleDetectionResult: {
    riskScore: 75,
    riskLevel: "높음",
    counts: { HIGH: 3, MEDIUM: 1, LOW: 0, combo: 1, total: 5 },
    matches: [
      { ruleId: "CF_H013", keyword: "샤넬급", riskLevel: "HIGH", matchType: "keyword", category: "brand_lookalike" },
      { ruleId: "CF_H002", keyword: "미러급", riskLevel: "HIGH", matchType: "keyword", category: "counterfeit_expression" },
      { ruleId: "CF_H006", keyword: "1:1", riskLevel: "HIGH", matchType: "keyword", category: "counterfeit_expression" },
      { ruleId: "CF_M004", keyword: "카톡문의", riskLevel: "MEDIUM", matchType: "keyword", category: "private_contact" },
      { ruleId: "CF_C001", keyword: "...", riskLevel: "HIGH", matchType: "combo", category: "brand_replica_combo" }
    ]
  },
  evidenceSummary: { hasUrl: true, hasHtml: true, hasText: true, hasScreenshot: true, hasPdf: true, hasMetadata: true, hasManifest: true }
});
check("counterfeit score is 0..100", cfScore.priorityScore >= 0 && cfScore.priorityScore <= 100, `score=${cfScore.priorityScore}`);
check("counterfeit score has 6 components", cfScore.components.length === 6);
check("counterfeit score notLegalConclusion=true", cfScore.notLegalConclusion === true);
check("counterfeit score rewardGuaranteed=false", cfScore.rewardGuaranteed === false);
check("counterfeit moduleId", cfScore.moduleId === "counterfeit_goods");
check("counterfeit safetyWarnings 위조 확정 아님 포함", cfScore.safetyWarnings.some((w) => /위조\s*확정이\s*아닙니다/.test(w)));
// 위조상품 컴포넌트는 false_ad ComponentKey 와 다르므로 string 비교
const cfComps = cfScore.components as unknown as Array<{ key: string; maxPoints: number }>;
const exprComp = cfComps.find((c) => c.key === "counterfeitExpressionSignal");
check("counterfeitExpressionSignal max 35", exprComp?.maxPoints === 35);
const brandComp = cfComps.find((c) => c.key === "brandSignal");
check("brandSignal max 15", brandComp?.maxPoints === 15);
const sellerComp = cfComps.find((c) => c.key === "sellerPatternSignal");
check("sellerPatternSignal max 10", sellerComp?.maxPoints === 10);

// computePriorityForModule routes correctly
const cfRoute = sAgent.computePriorityForModule({ moduleId: "counterfeit_goods" }, "counterfeit_goods");
check("computePriorityForModule routes to counterfeit", cfRoute.moduleId === "counterfeit_goods");

// scout topics
check("counterfeit topics has 8", counterfeitTopics.length === 8, `len=${counterfeitTopics.length}`);
check("getCounterfeitTopicById luxury_bag works", getCounterfeitTopicById("luxury_bag")?.label === "명품 가방");
check("getCounterfeitTopicById luxury_watch works", getCounterfeitTopicById("luxury_watch")?.label === "명품 시계");

// ScoutAgent.listTopics(counterfeit_goods) returns 8
const cfScoutTopics = scoutAgent.listTopics("counterfeit_goods");
check("scoutAgent.listTopics counterfeit = 8", cfScoutTopics.length === 8);

// ReportService — counterfeit 템플릿이 호출되는지 (markdown에 키워드 검증)
const rpt = new ReportService();
const cfRptCaseId = "rpt_cf_smoke_" + Math.random().toString(36).slice(2, 8);
try {
  const out = await rpt.generateDraft({
    caseId: cfRptCaseId,
    moduleId: "counterfeit_goods",
    title: "위조 의심 후보",
    url: "https://example.test/p",
    productName: "샤넬급 가방",
    status: "REVIEW",
    agencyCandidate: "특허청 / 지식재산침해 원스톱 신고상담센터",
    priorityScore: cfScore.priorityScore,
    priorityLabel: cfScore.priorityLabel,
    capturedAt: new Date().toISOString(),
    ruleMatches: [
      { ruleId: "CF_H013", keyword: "샤넬급", riskLevel: "HIGH", weight: 25, category: "brand_lookalike", reason: "유명 브랜드 모방 등급 표현", matchType: "keyword", sentence: "샤넬급 가방 미러급", excerpt: "샤넬급", sourceSection: "claim" } as any
    ],
    evidence: { hasHtml: true, hasText: true, capturedAt: new Date().toISOString(), files: [] },
    sellerCandidates: []
  });
  check("counterfeit report title", /위조상품 온라인 판매 의심/.test(out.markdown));
  check("counterfeit report mentions 특허청", out.markdown.includes("특허청"));
  check("counterfeit report mentions 원스톱", out.markdown.includes("원스톱 신고상담센터"));
  check("counterfeit report mentions 자동 신고서가 아닙니다", out.markdown.includes("자동 신고서가 아닙니다"));
  check("counterfeit report mentions 위조 여부를 확정하지 않습니다", out.markdown.includes("위조 여부를 확정하지 않습니다"));
  // 신고서 본문(주장 영역)에는 위반 단정 표현이 절대 들어가서는 안 된다.
  // ("피해야 할 표현" 안내 섹션에서는 단어가 인용되므로 제외하고, 1~7 섹션만 검사한다)
  const claimSection = out.markdown.split("## 9. 피해야 할 표현")[0];
  check("counterfeit report claim section does NOT contain 불법 확정", !/불법\s*확정/.test(claimSection));
  check("counterfeit report claim section does NOT contain 사기꾼", !/사기꾼/.test(claimSection));
  check("counterfeit report claim section does NOT contain 포상금 보장", !/포상금\s*보장/.test(claimSection));
} finally {
  const { rm: rmFn } = await import("node:fs/promises");
  try { await rmFn(rpt.getReportDir(cfRptCaseId), { recursive: true, force: true }); } catch { /* ignore */ }
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
  evidence: "ok",
  discovery: { topics: falseAdTopics.length, mockCandidates: generated.length },
  extractor: {
    productName: extracted.productName,
    prices: extracted.priceCandidates.length,
    claims: extracted.claimCandidates.length,
    reviews: extracted.reviewCandidates.length,
    ingredients: extracted.ingredientCandidates.length,
    warnings: extracted.warningCandidates.length
  },
  ruleAgent: {
    totalRules: keywordCfg.rules.length,
    counts: summary.counts,
    bigSampleScore: big.riskScore,
    bigSampleLevel: big.riskLevel
  },
  analyzer: {
    mockMode: az.isMockMode(),
    highInputRisk: llmHigh.overallRisk,
    confidence: llmHigh.confidence
  },
  scoring: {
    emptyScore: sEmpty.priorityScore,
    highScore: sHigh.priorityScore,
    highLevel: sHigh.priorityLevel
  }
});
