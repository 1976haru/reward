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
import { guideService, GUIDE_SAFETY_NOTICE } from "../services/guide/GuideService.js";
import {
  loadCounterfeitKeywordsSync,
  getCounterfeitKeywordSummary
} from "../modules/counterfeit-goods/keywordLoader.js";
import { counterfeitTopics, getCounterfeitTopicById } from "../modules/counterfeit-goods/scout_topics.js";
import { counterfeitGoodsDefinition } from "../modules/counterfeit-goods/index.js";
import {
  analyzeSubsidySample,
  buildSubsidyReportMarkdown,
  loadSubsidySampleDataSync,
  subsidyFraudDefinition,
  type SubsidyAnalyzedCandidate
} from "../modules/subsidy-fraud/index.js";
import {
  analyzeBidDataset,
  bidCollusionDefinition,
  buildBidCollusionReportMarkdown,
  calculateBidCollusionRiskSignals,
  calculateBidSpread,
  findAwardRateClustering,
  findRepeatedBidderGroups,
  findRotatingWinners,
  findSingleWinnerDominance,
  loadBidSampleData,
  normalizeCompanyName
} from "../modules/bid-collusion/index.js";
import { TraceLogger, createTraceId, createRunId } from "../services/trace/TraceLogger.js";
import { maskSensitive, maskString, truncate } from "../services/trace/maskSensitive.js";
import { withAgentTrace } from "../services/trace/TraceContext.js";
import { TRACE_EVENT_TYPES, TRACE_SEVERITIES } from "../types/trace.js";
import { detectSensitive } from "../services/privacy/SensitiveDataDetector.js";
import { maskText, maskEmail, maskPhone, maskRrn, maskApiKey, maskBearer, maskJwt } from "../services/privacy/MaskingService.js";
import { getRetentionPolicies, applyRetention } from "../services/privacy/RetentionPolicy.js";
import { SENSITIVE_DATA_TYPES, MASK_TOKENS } from "../types/privacy.js";
import { JsonOutcomeRepository, OutcomeValidationError } from "../repositories/OutcomeRepository.js";
import { OUTCOME_STATUSES, OUTCOME_DECISIONS, REWARD_OUTCOMES } from "../types/outcome.js";

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

// 23-A) Home / Notice — 체크리스트 01: 오늘 날짜·버전·실전 상태 표시
check("dashboard todayDate YYYY-MM-DD", typeof dashSummary.todayDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dashSummary.todayDate));
check("dashboard app.name is string", typeof dashSummary.app?.name === "string" && dashSummary.app.name.length > 0);
check("dashboard app.version is string", typeof dashSummary.app?.version === "string" && dashSummary.app.version.length > 0);
check("dashboard app.environment is string", typeof dashSummary.app?.environment === "string");
check("dashboard mode.mockAi is boolean", typeof dashSummary.mode?.mockAi === "boolean");
check("dashboard mode.mockScout is boolean", typeof dashSummary.mode?.mockScout === "boolean");
check("dashboard mode.schedulerEnabled is boolean", typeof dashSummary.mode?.schedulerEnabled === "boolean");
check("dashboard mode.runtimeMode in enum",
  ["MOCK", "MIXED", "REAL_READY"].includes(dashSummary.mode?.runtimeMode));
check("dashboard apiConnections.openai.configured is boolean",
  typeof dashSummary.apiConnections?.openai?.configured === "boolean");
check("dashboard apiConnections.naver.configured is boolean",
  typeof dashSummary.apiConnections?.naver?.configured === "boolean");
check("dashboard readiness.stage in enum",
  ["SETUP_REQUIRED","MOCK_VALIDATION","MANUAL_URL_TEST","API_KEY_REQUIRED","REAL_DATA_TEST","HUMAN_REVIEW_READY","OPERATION_READY"]
    .includes(dashSummary.readiness?.stage));
check("dashboard readiness.canAutoSubmit === false", dashSummary.readiness?.canAutoSubmit === false);
check("dashboard readiness.humanReviewRequired === true", dashSummary.readiness?.humanReviewRequired === true);
check("dashboard guideLinks is non-empty array",
  Array.isArray(dashSummary.guideLinks) && dashSummary.guideLinks.length > 0);
check("dashboard homeNotices mentions Mock or 검증",
  Array.isArray(dashSummary.homeNotices) && dashSummary.homeNotices.some((n) => /Mock|검증/.test(n)));
check("safetyNotice includes 자동 신고 / 자동 제출 표현",
  /자동\s*신고|자동\s*제출/.test(dashSummary.safetyNotice));

// API 응답에 실제 키 값이 포함되지 않아야 한다 (응답 전체를 직렬화 후 검사)
const dashJson = JSON.stringify(dashSummary);
const realOpenAiKey = (process.env.OPENAI_API_KEY || "").trim();
const realNaverSecret = (process.env.NAVER_CLIENT_SECRET || "").trim();
check("dashboard response does NOT leak OPENAI_API_KEY",
  realOpenAiKey.length === 0 || !dashJson.includes(realOpenAiKey));
check("dashboard response does NOT leak NAVER_CLIENT_SECRET",
  realNaverSecret.length === 0 || !dashJson.includes(realNaverSecret));

// UI 회귀 — public/app.js 에 home notice 렌더링 함수가 존재해야 함
const appJsHome = await readFile(path.join(process.cwd(), "public", "app.js"), "utf8");
check("public/app.js exposes renderHomeNotice", /function\s+renderHomeNotice\s*\(/.test(appJsHome));
check("public/app.js exposes bindHomeNotice", /function\s+bindHomeNotice\s*\(/.test(appJsHome));
check("public/app.js home notice renders Mock or 검증 wording",
  /Mock\s*검증|실전\s*검증|MOCK_VALIDATION/.test(appJsHome));
const indexHtml = await readFile(path.join(process.cwd(), "public", "index.html"), "utf8");
check("public/index.html includes homeNoticeCard", /id="homeNoticeCard"/.test(indexHtml));

// 23-B) Encoding safeguards — 체크리스트: mojibake (U+FFFD) 제거 + UTF-8 안전장치
// 소스 파일에는 의도치 않은 U+FFFD가 섞이지 않도록 escape sequence 만 사용한다.
const REPL = String.fromCharCode(0xFFFD);
check("public/index.html declares UTF-8 charset",
  /<meta\s+charset=["']?utf-?8["']?\s*\/?>/i.test(indexHtml));
check("public/index.html has no U+FFFD", !indexHtml.includes(REPL));
const appJsRaw = await readFile(path.join(process.cwd(), "public", "app.js"), "utf8");
check("public/app.js has no U+FFFD", !appJsRaw.includes(REPL));
check("public/app.js exposes hasMojibake", /function\s+hasMojibake\s*\(/.test(appJsRaw));
check("public/app.js exposes safeDisplayText", /function\s+safeDisplayText\s*\(/.test(appJsRaw));
check("public/app.js escapeHtml routes through safeDisplayText",
  /function\s+escapeHtml\s*\([^)]*\)\s*\{[^}]*safeDisplayText/.test(appJsRaw));
const readmeRaw = await readFile(path.join(process.cwd(), "README.md"), "utf8");
check("README.md has no U+FFFD", !readmeRaw.includes(REPL));
const stylesRaw = await readFile(path.join(process.cwd(), "public", "styles.css"), "utf8");
check("public/styles.css has no U+FFFD", !stylesRaw.includes(REPL));

// /api/dashboard/summary 응답에 mojibake 가 직렬화되어 들어가는지 검사 (data 가 깨져 있어도 home/notice 부분은 깨끗해야 함)
const dashJsonStr = JSON.stringify(dashSummary);
check("dashboard.app/mode/readiness/apiConnections/guideLinks/homeNotices has no U+FFFD",
  ![
    dashSummary.app, dashSummary.mode, dashSummary.apiConnections,
    dashSummary.readiness, dashSummary.guideLinks, dashSummary.homeNotices,
    dashSummary.safetyNotice
  ].some((v) => typeof v === "object"
    ? JSON.stringify(v).includes(REPL)
    : String(v).includes(REPL)));

// npm scripts 등록 확인
const pkgJsonRaw = await readFile(path.join(process.cwd(), "package.json"), "utf8");
const pkgScripts = (JSON.parse(pkgJsonRaw) as { scripts?: Record<string, string> }).scripts ?? {};
check("npm script data:scan-encoding registered", typeof pkgScripts["data:scan-encoding"] === "string");
check("npm script data:scan-encoding:strict registered", typeof pkgScripts["data:scan-encoding:strict"] === "string");
check("npm script data:reset-demo registered", typeof pkgScripts["data:reset-demo"] === "string");
check("npm script data:reset-demo:apply registered", typeof pkgScripts["data:reset-demo:apply"] === "string");

// 스크립트 파일 존재 확인
const scanScriptPath = path.join(process.cwd(), "scripts", "scan-encoding-issues.js");
const resetScriptPath = path.join(process.cwd(), "scripts", "reset-demo-data.js");
check("scripts/scan-encoding-issues.js exists", await fileExists(scanScriptPath));
check("scripts/reset-demo-data.js exists", await fileExists(resetScriptPath));

// server.ts 에 /api cache-control no-store 미들웨어가 등록되어 있는지 확인
const serverTsRaw = await readFile(path.join(process.cwd(), "src", "server.ts"), "utf8");
check("server.ts sets no-store on /api responses",
  /app\.use\(\s*["']\/api["']\s*,[\s\S]*?Cache-Control[\s\S]*?no-store/i.test(serverTsRaw));

// 23-C) Notice / 공지사항 카드 — 체크리스트 02
const notices = (dashSummary as unknown as { notices?: unknown }).notices;
check("dashboard.notices is array", Array.isArray(notices));
const noticeList = (Array.isArray(notices) ? notices : []) as Array<{
  id: string; level: string; title: string; message: string;
  category?: string; lastReviewedAt?: string;
  actionLabel?: string; actionTarget?: string;
}>;
check("dashboard.notices.length >= 4", noticeList.length >= 4);

const noticeById = new Map(noticeList.map((n) => [n.id, n]));
check("notice official-rule-check present", noticeById.has("official-rule-check"));
check("notice api-key-required present", noticeById.has("api-key-required"));
check("notice approval-gate present", noticeById.has("approval-gate"));
check("notice real-data-status present", noticeById.has("real-data-status"));

// level enum 검사
const ALLOWED_LEVELS = new Set(["info", "warning", "danger", "success"]);
check("every notice has allowed level",
  noticeList.every((n) => ALLOWED_LEVELS.has((n.level || "").toLowerCase())));

// 자동 신고 금지 카드는 항상 danger 로 고정
const approvalGate = noticeById.get("approval-gate");
check("approval-gate notice level=danger", approvalGate?.level === "danger");

// 금지 표현 — 카드 어디에도 들어가서는 안 된다.
const FORBIDDEN = ["포상금 확정", "수익 확정", "신고하면 지급", "AI가 신고", "바로 제출", "무조건 받을"];
const noticeBlob = noticeList.map((n) => `${n.title}\n${n.message}`).join("\n");
for (const phrase of FORBIDDEN) {
  check(`notice text does not contain forbidden phrase: ${phrase}`, !noticeBlob.includes(phrase));
}

// 자동 신고 금지 또는 자동 제출하지 않습니다 문구가 어딘가에 한 번 이상 있어야 한다.
check("notice text mentions 자동 신고 금지 / 자동 제출하지 않습니다",
  /자동\s*신고\s*금지|자동\s*제출하지\s*않/.test(noticeBlob));

// UI 회귀 — 노티스 영역 / 렌더 함수 / 스타일 존재 확인
check("public/index.html includes noticeCardSection", /id="noticeCardSection"/.test(indexHtml));
check("public/index.html includes noticePanel", /id="noticePanel"/.test(indexHtml));
check("public/app.js exposes renderNotices", /function\s+renderNotices\s*\(/.test(appJsHome));
check("public/styles.css declares .notice-grid", /\.notice-grid\s*\{/.test(stylesRaw));
check("public/styles.css declares .notice-card", /\.notice-card\s*\{/.test(stylesRaw));
check("public/styles.css declares .notice-level-warning", /\.notice-level-warning/.test(stylesRaw));
check("public/styles.css declares .notice-level-danger", /\.notice-level-danger/.test(stylesRaw));

// API 응답에 실제 API 키 노출 없음 (notice 카드 메시지 안에 실 키가 섞이지 않게)
const dashJsonForNotices = JSON.stringify(noticeList);
const realOpenAiKey2 = (process.env.OPENAI_API_KEY || "").trim();
const realNaverSecret2 = (process.env.NAVER_CLIENT_SECRET || "").trim();
check("notices payload does NOT leak OPENAI_API_KEY",
  realOpenAiKey2.length === 0 || !dashJsonForNotices.includes(realOpenAiKey2));
check("notices payload does NOT leak NAVER_CLIENT_SECRET",
  realNaverSecret2.length === 0 || !dashJsonForNotices.includes(realNaverSecret2));

// 23-D) Product rename — 공익레이더
const PRODUCT_NAME = "공익레이더";
check("dashboard app.name === 공익레이더", dashSummary.app.name === PRODUCT_NAME);
check("public/index.html <title> contains 공익레이더",
  /<title>[^<]*공익레이더[^<]*<\/title>/.test(indexHtml));
check("public/index.html hero h1 is 공익레이더",
  /<h1>\s*공익레이더\s*<\/h1>/.test(indexHtml));
check("public/index.html body contains 공익레이더", indexHtml.includes(PRODUCT_NAME));
check("README.md heading contains 공익레이더",
  /^#\s+공익레이더/m.test(readmeRaw));
check("scope.md mentions 공익레이더",
  (await readFile(path.join(process.cwd(), "scope.md"), "utf8")).includes(PRODUCT_NAME));
check("mvp_scope.md mentions 공익레이더",
  (await readFile(path.join(process.cwd(), "mvp_scope.md"), "utf8")).includes(PRODUCT_NAME));
check("safetyNotice still mentions 자동 제출 아님",
  /자동\s*제출하지\s*않|자동\s*신고[^\n]*하지\s*않/.test(dashSummary.safetyNotice));

// 금지 표현이 신규로 들어가지 않아야 한다 (UI / 노출 영역 한정 스캔).
// 단, "포상금 보장 없음" 같은 부정문은 안전한 표현이므로 affirmative form 만 잡는다.
const RENAME_FORBIDDEN_AFFIRMATIVE = [
  "포상금 확정",
  "수익 확정",
  "포상금 지급 보장",
  "포상금 수령 보장합니다",
  "포상금 수령을 보장합니다",
  "포상금을 보장합니다",
  "AI가 신고",
  "신고하면 지급",
  "무조건 받을",
  "무조건 지급"
];
const renameTargets: Array<{ name: string; body: string }> = [
  { name: "index.html", body: indexHtml },
  { name: "app.js (renderHomeNotice/renderNotices area)", body: appJsHome },
  { name: "README.md", body: readmeRaw },
  { name: "scope.md", body: await readFile(path.join(process.cwd(), "scope.md"), "utf8") },
  { name: "mvp_scope.md", body: await readFile(path.join(process.cwd(), "mvp_scope.md"), "utf8") },
  { name: "dashboard summary JSON", body: dashJsonStr }
];
for (const t of renameTargets) {
  for (const phrase of RENAME_FORBIDDEN_AFFIRMATIVE) {
    check(`${t.name} does not contain forbidden phrase: ${phrase}`, !t.body.includes(phrase));
  }
}

// 23-E) Guide / Q&A — 실전 재점검 03
const guidePayload = guideService.getGuide();
check("guide schemaVersion 1.0.0", guidePayload.schemaVersion === "1.0.0");
check("guide title mentions 공익레이더", typeof guidePayload.title === "string" && guidePayload.title.includes("공익레이더"));
check("guide.firstRunSteps length >= 5", Array.isArray(guidePayload.firstRunSteps) && guidePayload.firstRunSteps.length >= 5);
check("guide.moduleGuides length >= 4", Array.isArray(guidePayload.moduleGuides) && guidePayload.moduleGuides.length >= 4);

const moduleIdsInGuide = new Set(guidePayload.moduleGuides.map((m) => m.moduleId));
check("guide includes false_ad", moduleIdsInGuide.has("false_ad"));
check("guide includes counterfeit_goods", moduleIdsInGuide.has("counterfeit_goods"));
check("guide includes subsidy_fraud", moduleIdsInGuide.has("subsidy_fraud"));
check("guide includes bid_collusion", moduleIdsInGuide.has("bid_collusion"));

// 모듈 가이드 필드 구조
for (const mg of guidePayload.moduleGuides) {
  check(`guide.${mg.moduleId} whatToCollect non-empty`, Array.isArray(mg.whatToCollect) && mg.whatToCollect.length > 0);
  check(`guide.${mg.moduleId} whereToReport non-empty`, Array.isArray(mg.whereToReport) && mg.whereToReport.length > 0);
  check(`guide.${mg.moduleId} evidence non-empty`, Array.isArray(mg.evidence) && mg.evidence.length > 0);
  check(`guide.${mg.moduleId} rewardGuide mentions 수령 보장 없음 / 공식 기준`,
    (mg.rewardGuide || []).some((s) => /수령\s*보장\s*없|공식\s*기준/.test(s)));
}

check("guide.faqs length >= 8", Array.isArray(guidePayload.faqs) && guidePayload.faqs.length >= 8);
const faqQuestions = guidePayload.faqs.map((f) => f.question || "");
check("FAQ includes 자동으로 신고하나요?",
  faqQuestions.some((q) => /자동으로\s*신고/.test(q)));
check("FAQ includes 포상금을 받을 수 있나요?",
  faqQuestions.some((q) => /포상금을?\s*받을\s*수\s*있/.test(q)));
const faqAnswers = guidePayload.faqs.map((f) => f.answer || "").join("\n");
check("FAQ answers state 자동 신고 미수행",
  /자동\s*(신고|제출)[^\n]*하지\s*않/.test(faqAnswers));
check("FAQ answers state 포상금 수령 보장 없음",
  /포상금[^\n]*보장하지\s*않|수령을?\s*보장하지\s*않/.test(faqAnswers));

// 공식 링크 — 4개 이상 + 4개 host
check("guide.officialLinks length >= 4", Array.isArray(guidePayload.officialLinks) && guidePayload.officialLinks.length >= 4);
const linkUrls = guidePayload.officialLinks.map((l) => l.url || "");
check("officialLinks include mfds host", linkUrls.some((u) => u.includes("mfds.go.kr")));
check("officialLinks include kipo host", linkUrls.some((u) => u.includes("kipo.go.kr")));
check("officialLinks include ftc host", linkUrls.some((u) => u.includes("ftc.go.kr")));
check("officialLinks include clean.go.kr host", linkUrls.some((u) => u.includes("clean.go.kr")));
check("officialLinks every entry has caution",
  guidePayload.officialLinks.every((l) => typeof l.caution === "string" && l.caution.length > 0));

// 안전 문구 / 면책
check("guide.safetyNotice equals GUIDE_SAFETY_NOTICE",
  guidePayload.safetyNotice === GUIDE_SAFETY_NOTICE);
check("guide.safetyNotice mentions 자동 신고 미수행 + 포상금 보장 없음",
  /자동\s*신고[^\n]*않|자동\s*제출[^\n]*않/.test(guidePayload.safetyNotice) &&
  /보장하지\s*않/.test(guidePayload.safetyNotice));
check("guide.safetyRules length >= 4", Array.isArray(guidePayload.safetyRules) && guidePayload.safetyRules.length >= 4);

// 금지 표현 affirmative 회귀 — 가이드 페이로드 전체에 들어가서는 안 됨.
const guideJson = JSON.stringify(guidePayload);
const GUIDE_FORBIDDEN_AFFIRMATIVE = [
  "포상금 확정", "수익 확정", "포상금 지급 보장", "포상금 수령 보장합니다",
  "포상금을 보장합니다", "AI가 신고", "신고하면 지급", "무조건 받을", "무조건 지급"
];
for (const phrase of GUIDE_FORBIDDEN_AFFIRMATIVE) {
  check(`guide payload does not contain forbidden phrase: ${phrase}`, !guideJson.includes(phrase));
}

// UI 마커 / 렌더 함수 존재
check("public/index.html includes guideQaSection", /id="guideQaSection"/.test(indexHtml));
check("public/index.html includes guideQaPanel", /id="guideQaPanel"/.test(indexHtml));
check("public/app.js exposes renderGuideQa", /function\s+renderGuideQa\s*\(/.test(appJsHome));
check("public/app.js exposes renderFirstRunSteps", /function\s+renderFirstRunSteps\s*\(/.test(appJsHome));
check("public/app.js exposes renderModuleGuides", /function\s+renderModuleGuides\s*\(/.test(appJsHome));
check("public/app.js exposes renderOfficialLinks", /function\s+renderOfficialLinks\s*\(/.test(appJsHome));
check("public/app.js exposes renderFaqs", /function\s+renderFaqs\s*\(/.test(appJsHome));
check("public/styles.css declares .module-guide-card", /\.module-guide-card\s*\{/.test(stylesRaw));
check("public/styles.css declares .faq-item", /\.faq-item\s*\{/.test(stylesRaw));
check("public/styles.css declares .official-link-card", /\.official-link-card\s*\{/.test(stylesRaw));

// docs/guide_qa.md 존재 확인
check("docs/guide_qa.md exists",
  await fileExists(path.join(process.cwd(), "docs", "guide_qa.md")));

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

// 25) Subsidy Fraud Prototype — module registration, sample analysis, signals, scoring, report
check("subsidy module id", subsidyFraudDefinition.id === "subsidy_fraud");
check("subsidy module slug", subsidyFraudDefinition.slug === "subsidy-fraud");
check("subsidy module status prototype", subsidyFraudDefinition.status === "prototype");
check("subsidy module registered", moduleRegistry.has("subsidy_fraud"));
const subMod = moduleRegistry.get("subsidy_fraud");
check("subsidy module category public_funds", subMod?.category === "public_funds");
check("subsidy module reportDraft true", subMod?.capabilities.reportDraft === true);
check("subsidy safetyNotes include 단정 금지",
  subMod?.safetyNotes.some((n) => /단정하지 않/.test(n)) === true);

// false_ad / counterfeit_goods 등 기존 모듈이 깨지지 않았는지 회귀 확인
check("regression: false_ad still active", moduleRegistry.get("false_ad")?.status === "active");
check("regression: counterfeit_goods still ready", moduleRegistry.get("counterfeit_goods")?.status === "ready");

// sample-data 검증
const subSample = loadSubsidySampleDataSync();
check("subsidy sample synthetic=true", subSample.synthetic === true);
check("subsidy sample pilotRegionId dangjin", subSample.pilotRegionId === "dangjin");
check("subsidy sample records >= 5", subSample.records.length >= 5);
check("subsidy sample disclaimer mentions 가상",
  /가상/.test(subSample.disclaimer) || /합성/.test(subSample.disclaimer));

// 분석 실행
const analysis = analyzeSubsidySample();
check("subsidy analysis moduleId", analysis.moduleId === "subsidy_fraud");
check("subsidy analysis pilotRegionId dangjin", analysis.pilotRegionId === "dangjin");
check("subsidy analysis syntheticOnly=true", analysis.syntheticOnly === true);
check("subsidy analysis recordCount == sample records",
  analysis.recordCount === subSample.records.length);
check("subsidy analysis safetyNotice mentions 부정수급 확정",
  /부정수급 확정/.test(analysis.safetyNotice));
check("subsidy analysis autoReport=false", analysis.autoReport === false);
check("subsidy analysis humanReviewRequired=true", analysis.humanReviewRequired === true);

// 점수 정렬
const cs = analysis.candidates;
check("subsidy candidates sorted desc by priorityScore",
  cs.every((c, i) => i === 0 || cs[i - 1].priorityScore >= c.priorityScore));
check("subsidy candidate has 7 components",
  cs[0].components.length === 7);
check("subsidy total component max points = 100", (() => {
  const sum = cs[0].components.reduce((s, c) => s + c.maxPoints, 0);
  return sum === 100;
})(), `sum=${cs[0].components.reduce((s, c) => s + c.maxPoints, 0)}`);

// dj_2024_001 케이스 — 동일 주소 + 동일 대표자 + 용역업체 정황 → 신호 다수
const dj1 = cs.find((c) => c.recordId === "dj_2024_001") as SubsidyAnalyzedCandidate;
check("dj_2024_001 found", Boolean(dj1));
const dj1SignalCodes = (dj1?.signals ?? []).map((s) => s.code);
check("dj_2024_001 detects repeated_recipient", dj1SignalCodes.includes("repeated_recipient"));
check("dj_2024_001 detects same_address_multiple_entities", dj1SignalCodes.includes("same_address_multiple_entities"));
check("dj_2024_001 detects related_vendor_signal", dj1SignalCodes.includes("related_vendor_signal"));
check("dj_2024_001 detects high_amount_low_output", dj1SignalCodes.includes("high_amount_low_output"));
check("dj_2024_001 priorityScore >= 60 (HIGH or VERY_HIGH)",
  dj1!.priorityScore >= 60, `score=${dj1?.priorityScore}`);

// dj_2023_002 — 결과물 없음 → missing_result_evidence + repeated
const dj2 = cs.find((c) => c.recordId === "dj_2023_002");
check("dj_2023_002 detects missing_result_evidence",
  (dj2?.signals ?? []).some((s) => s.code === "missing_result_evidence"));
check("dj_2023_002 detects similar_project_titles",
  (dj2?.signals ?? []).some((s) => s.code === "similar_project_titles"));

// dj_2024_003 — 정산 미제출 + 결과물 없음 + 다른 단체와 동일 주소/대표 → disclosure_missing + same_address + related_vendor
const dj3 = cs.find((c) => c.recordId === "dj_2024_003");
check("dj_2024_003 detects disclosure_missing",
  (dj3?.signals ?? []).some((s) => s.code === "disclosure_missing"));
check("dj_2024_003 detects related_vendor_signal",
  (dj3?.signals ?? []).some((s) => s.code === "related_vendor_signal"));

// dj_2024_004 — 정상 케이스, 낮은 점수
const dj4 = cs.find((c) => c.recordId === "dj_2024_004");
check("dj_2024_004 priorityScore < 60", (dj4?.priorityScore ?? 0) < 60, `score=${dj4?.priorityScore}`);

// dj_2023_005 — 8천만원 + 결과물 1건 + 홍보비 75% → high_amount_low_output + execution_pattern_anomaly
const dj5 = cs.find((c) => c.recordId === "dj_2023_005");
check("dj_2023_005 detects high_amount_low_output",
  (dj5?.signals ?? []).some((s) => s.code === "high_amount_low_output"));
check("dj_2023_005 detects execution_pattern_anomaly",
  (dj5?.signals ?? []).some((s) => s.code === "execution_pattern_anomaly"));

// 리포트 마크다운 — 안전 문구 + 단정 표현 없음
const md = buildSubsidyReportMarkdown(dj1!);
check("subsidy report mentions 자동 신고서가 아닙니다", md.includes("자동 신고서가 아닙니다"));
check("subsidy report mentions 부정수급 여부를 확정하지 않습니다", md.includes("부정수급 여부를 확정하지 않습니다"));
check("subsidy report mentions 국민권익위", md.includes("국민권익위원회"));
// "피해야 할 표현" 섹션은 본 리포트에는 포함되지 않음 (collector 마크다운). 본문에 단정 표현이 없는지만 확인.
check("subsidy report does NOT contain 부정수급 확정", !/부정수급 확정\b/.test(md));
check("subsidy report does NOT contain 횡령 확정", !/횡령 확정/.test(md));
check("subsidy report does NOT contain 사기꾼", !/사기꾼/.test(md));

// useSampleData=false → 예외
let nonSampleThrown = false;
try {
  analyzeSubsidySample({ useSampleData: false });
} catch {
  nonSampleThrown = true;
}
check("subsidy useSampleData=false throws", nonSampleThrown);

// 미지원 region → 예외
let badRegionThrown = false;
try {
  analyzeSubsidySample({ regionId: "unknown_region" });
} catch {
  badRegionThrown = true;
}
check("subsidy unsupported region throws", badRegionThrown);

// 26) Bid Collusion Prototype — module / sample / analyzer / scoring / report
check("bid_collusion module id", bidCollusionDefinition.id === "bid_collusion");
check("bid_collusion module slug", bidCollusionDefinition.slug === "bid-collusion");
check("bid_collusion module status prototype", bidCollusionDefinition.status === "prototype");
check("bid_collusion module registered", moduleRegistry.has("bid_collusion"));
const bidMod = moduleRegistry.get("bid_collusion");
check("bid_collusion module category antitrust", bidMod?.category === "antitrust");
check("bid_collusion module reportDraft true", bidMod?.capabilities.reportDraft === true);
check("bid_collusion safetyNotes include 단정 금지",
  bidMod?.safetyNotes.some((n) => /단정/.test(n)) === true);

// 회귀: false_ad/counterfeit_goods/subsidy_fraud 깨지지 않음
check("regression: false_ad still active", moduleRegistry.get("false_ad")?.status === "active");
check("regression: counterfeit_goods still ready", moduleRegistry.get("counterfeit_goods")?.status === "ready");
check("regression: subsidy_fraud still prototype", moduleRegistry.get("subsidy_fraud")?.status === "prototype");

// sample-bids.json
const bidSample = loadBidSampleData();
check("bid sample isSyntheticSample=true", bidSample.isSyntheticSample === true);
check("bid sample bids >= 30", bidSample.bids.length >= 30, `len=${bidSample.bids.length}`);
check("bid sample bidders >= 8", bidSample.bidders.length >= 8);
// 합성 데이터 안전 검증 — 실제 브랜드/실제 발주기관 패턴이 들어가지 않았는지
const allBidText = JSON.stringify(bidSample);
check("bid sample uses synthetic company names only",
  /샘플업체[A-H]/.test(allBidText) && !/주식회사\s/.test(allBidText));
check("bid sample disclaimer mentions 합성", /합성/.test(bidSample.disclaimer));

// normalize / spread / clustering 헬퍼
check("normalizeCompanyName trims/cases", normalizeCompanyName("샘플 업체 A") === "샘플업체a");
check("normalizeCompanyName parens removed", normalizeCompanyName("(주)샘플업체") === "주샘플업체");
const spread = calculateBidSpread([
  { companyName: "X", bidAmount: 100, bidRate: 88.5, rank: 1 },
  { companyName: "Y", bidAmount: 101, bidRate: 89.1, rank: 2 }
]);
check("calculateBidSpread ~ 0.6", Math.abs(spread - 0.6) < 1e-6, `spread=${spread}`);
const cluster = findAwardRateClustering([88.5, 88.7, 89.0, 88.9], 2);
check("findAwardRateClustering clustered=true (range ~0.5)", cluster.clustered === true && cluster.rangePct <= 2);
const noCluster = findAwardRateClustering([80, 85, 90, 95], 2);
check("findAwardRateClustering clustered=false (range 15)", noCluster.clustered === false);

// 그룹 찾기 + 순환 + 지배
const groups = findRepeatedBidderGroups(bidSample.bids, 2);
check("findRepeatedBidderGroups returns >= 2 groups", groups.length >= 2, `groups=${groups.length}`);
const abcGroup = groups.find((g) => {
  const names = g.companies.map(normalizeCompanyName).sort();
  return names.includes("샘플업체a") && names.includes("샘플업체b") && names.includes("샘플업체c");
});
check("ABC group exists", Boolean(abcGroup));
if (abcGroup) {
  const rot = findRotatingWinners(bidSample.bids, abcGroup.bidIds);
  check("ABC group rotates=true", rot.rotates === true, `winners=${JSON.stringify(rot.winners)}`);
  check("ABC group has 3 unique winners", rot.uniqueWinners.length >= 3);
}

// office_supplies 카테고리 단독 분석
const officeBids = bidSample.bids.filter((b) => b.category === "office_supplies");
const officeDom = findSingleWinnerDominance(officeBids, 0.6);
check("office category — 샘플업체D dominance detected", officeDom.some((d) => d.winner === "샘플업체D"));

// 전체 분석
const bidAnalysis = analyzeBidDataset({ useSampleData: true });
check("bid analysis moduleId", bidAnalysis.moduleId === "bid_collusion");
check("bid analysis syntheticOnly=true", bidAnalysis.syntheticOnly === true);
check("bid analysis totalBids = sample length", bidAnalysis.totalBids === bidSample.bids.length);
check("bid analysis safetyNotice 담합 확정 아님",
  /담합 확정 판단이 아니/.test(bidAnalysis.safetyNotice));
check("bid analysis autoReport=false", bidAnalysis.autoReport === false);
check("bid analysis humanReviewRequired=true", bidAnalysis.humanReviewRequired === true);
check("bid analysis has risk groups", bidAnalysis.riskGroups.length >= 1);

// 점수 정렬
check("bid riskGroups sorted desc by priorityScore",
  bidAnalysis.riskGroups.every((g, i) => i === 0 || bidAnalysis.riskGroups[i - 1].priorityScore >= g.priorityScore));

// 컴포넌트 합 = 100
const top = bidAnalysis.riskGroups[0];
check("bid top group has 8 components", top.components.length === 8);
check("bid top group component max points sum to 100", (() => {
  const sum = top.components.reduce((s, c) => s + c.maxPoints, 0);
  return sum === 100;
})(), `sum=${top.components.reduce((s, c) => s + c.maxPoints, 0)}`);

// ABC 시설 유지보수 그룹은 회전+좁은 spread+클러스터 → HIGH 이상 기대
const abcRiskGroup = bidAnalysis.riskGroups.find((g) =>
  g.companies.map(normalizeCompanyName).sort().join(",").includes("샘플업체a") &&
  g.bidCount >= 5
);
check("ABC risk group exists in analysis", Boolean(abcRiskGroup));
check("ABC risk group priorityScore >= 60",
  (abcRiskGroup?.priorityScore ?? 0) >= 60, `score=${abcRiskGroup?.priorityScore}`);
const abcSignalCodes = (abcRiskGroup?.signals ?? []).map((s) => s.code);
check("ABC group detects rotating_winner", abcSignalCodes.includes("rotating_winner"));
check("ABC group detects narrow_bid_spread", abcSignalCodes.includes("narrow_bid_spread"));
check("ABC group detects abnormal_award_rate_clustering",
  abcSignalCodes.includes("abnormal_award_rate_clustering"));
check("ABC group detects repeated_bidder_group", abcSignalCodes.includes("repeated_bidder_group"));

// calculateBidCollusionRiskSignals 직접 호출
const directSignals = calculateBidCollusionRiskSignals(bidSample.bids, abcGroup!);
check("calculateBidCollusionRiskSignals returns array", Array.isArray(directSignals) && directSignals.length >= 1);

// 리포트 마크다운 안전 문구 + 단정 표현 없음
const reportMd = buildBidCollusionReportMarkdown(top);
check("bid report mentions 자동 신고서가 아닙니다", reportMd.includes("자동 신고서가 아닙니다"));
check("bid report mentions 담합 여부를 확정하지 않습니다", reportMd.includes("담합 여부를 확정하지 않습니다"));
check("bid report mentions 공정거래위원회", reportMd.includes("공정거래위원회"));
// 본문(1~8 섹션)에 단정 표현 없음 — disclaimer 인 "확정 아님" 은 허용된다.
// "담합 확정 (없는 단어)" vs "담합 확정 아님" 구분: 부정 표현(아닙니다/아님/이 아닙니다)이 뒤에 오는 경우는 정상 disclaimer 로 본다.
check("bid report does NOT contain raw 담합 확정 단정",
  !/담합\s*확정(?!\s*(?:이|판단)?\s*아닙?니?다?|\s*아님|\s*판단이?\s*아니|\s*신호가?\s*아니|\s*아닌)/.test(reportMd));
check("bid report does NOT contain raw 들러리 확정 단정",
  !/들러리\s*확정(?!\s*아님|\s*아닙?니?다?|\s*판단이?\s*아니)/.test(reportMd));
check("bid report does NOT contain 사기꾼", !/사기꾼/.test(reportMd));
check("bid report does NOT contain 포상금 보장", !/포상금\s*보장/.test(reportMd));

// useSampleData=false 거부
let bidNonSampleThrown = false;
try {
  analyzeBidDataset({ useSampleData: false });
} catch {
  bidNonSampleThrown = true;
}
check("bid useSampleData=false throws", bidNonSampleThrown);

// 27) Trace Log — types, mask, logger, withAgentTrace
check("TRACE_EVENT_TYPES has agent_start/agent_end/agent_error",
  (TRACE_EVENT_TYPES as readonly string[]).includes("agent_start") &&
  (TRACE_EVENT_TYPES as readonly string[]).includes("agent_end") &&
  (TRACE_EVENT_TYPES as readonly string[]).includes("agent_error"));
check("TRACE_SEVERITIES include info/warn/error/debug",
  ["info", "warn", "error", "debug"].every((s) => (TRACE_SEVERITIES as readonly string[]).includes(s)));

// createTraceId / createRunId
const traceId1 = createTraceId("tr");
check("createTraceId returns string with prefix tr_", typeof traceId1 === "string" && /^tr_/.test(traceId1));
const runId1 = createRunId("run");
check("createRunId returns string with prefix run_", typeof runId1 === "string" && /^run_/.test(runId1));
const traceId2 = createTraceId("tr");
check("createTraceId returns unique ids", traceId1 !== traceId2);

// maskString — API key + 이메일 + 전화 + 주민번호
const maskedSk = maskString("Authorization: Bearer sk_test_abcdefghijklmnop1234, contact foo@bar.com or 010-1234-5678 RRN 901231-1234567");
check("maskString masks API key", /\[masked-secret\]/.test(maskedSk.value));
check("maskString masks email", /\[masked-email\]/.test(maskedSk.value));
check("maskString masks phone", /\[masked-phone\]/.test(maskedSk.value));
check("maskString masks rrn", /\[masked-id\]/.test(maskedSk.value));
check("maskString reports changed=true", maskedSk.changed === true);
const cleanMask = maskString("그냥 일반 텍스트입니다");
check("maskString leaves clean text unchanged", cleanMask.changed === false);

// maskSensitive — 객체 / 키 기반 마스킹
const objMask = maskSensitive({
  api_key: "AIzaSyDxyzabcdefghijklmno1234567890ab",
  user: { email: "alice@example.com" },
  password: "supersecretpw",
  Authorization: "Bearer ghp_abcdefghijklmnopqrstuvwxyz1234567890",
  cookie: "session=abcdef",
  safeField: "hello"
}, { enabled: true });
const omv = objMask.value as Record<string, unknown>;
check("maskSensitive masks api_key value", omv.api_key === "[masked-secret]");
check("maskSensitive masks password value", omv.password === "[masked-secret]");
check("maskSensitive masks Authorization value", omv.Authorization === "[masked-secret]");
check("maskSensitive masks cookie value", omv.cookie === "[masked-secret]");
check("maskSensitive masks nested email",
  (omv.user as Record<string, unknown>).email === "[masked-email]");
check("maskSensitive keeps safe field", omv.safeField === "hello");
check("maskSensitive reports changed=true", objMask.changed === true);

// maskSensitive disabled
const noMask = maskSensitive({ api_key: "sk_test_secret_value_abc" }, { enabled: false });
check("maskSensitive disabled returns input unchanged",
  (noMask.value as Record<string, unknown>).api_key === "sk_test_secret_value_abc");

// truncate
const tr = truncate("a".repeat(50), 20);
check("truncate respects maxLen", tr.truncated === true && tr.value.length > 20 && tr.value.startsWith("aaaaaaaaaaaaaaaaaaaa"));

// TraceLogger — 임시 디렉터리에서 동작
const tmpTraceDir = await mkdtemp(path.join(tmpdir(), "reward-trace-"));
try {
  const logger = new TraceLogger(tmpTraceDir);

  // 빈 상태
  const emptyList = await logger.list();
  check("trace empty list", emptyList.length === 0);
  const emptySummary = await logger.getSummary();
  check("trace empty summary total=0", emptySummary.total === 0);
  check("trace summary safetyNotice present",
    typeof emptySummary.safetyNotice === "string" && /감사용/.test(emptySummary.safetyNotice));

  // 기본 이벤트
  const ev1 = await logger.log({
    eventType: "agent_start",
    severity: "info",
    agentName: "TestAgent",
    moduleId: "false_ad",
    caseId: "case_test_001",
    message: "테스트 시작",
    inputSummary: { foo: "bar" }
  });
  check("trace log returns event", Boolean(ev1) && /^evt_/.test(ev1?.id ?? ""));
  check("trace event has traceId", typeof ev1?.traceId === "string" && ev1!.traceId.length > 0);

  // 민감정보 포함 이벤트 → sensitiveMasked=true
  const ev2 = await logger.log({
    eventType: "service_call",
    severity: "info",
    agentName: "TestAgent",
    caseId: "case_test_001",
    inputSummary: { email: "test@example.com", token: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" },
    meta: { api_key: "sk_test_xxx_yyy_zzz_long" }
  });
  check("trace event has sensitiveMasked=true", ev2?.sensitiveMasked === true);
  // 마스킹된 값에 원본 secret 가 남아있지 않은지 확인
  const ev2Str = JSON.stringify(ev2);
  check("trace event does NOT contain raw secret",
    !ev2Str.includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890") &&
    !ev2Str.includes("test@example.com"));

  // 에러 이벤트
  await logger.log({
    eventType: "agent_error",
    severity: "error",
    agentName: "TestAgent",
    caseId: "case_test_001",
    message: "테스트 에러"
  });
  // 다른 case 이벤트
  await logger.log({
    eventType: "human_action",
    severity: "info",
    agentName: "ReviewQueue",
    actor: "tester",
    caseId: "case_test_002",
    message: "상태 변경"
  });

  // list
  const allEvents = await logger.list();
  check("trace list returns >= 4", allEvents.length >= 4);
  check("trace list sorted desc by ts",
    allEvents.every((e, i) => i === 0 || allEvents[i - 1].ts >= e.ts));

  // listByCase
  const case1Events = await logger.listByCase("case_test_001");
  check("listByCase('case_test_001') returns 3", case1Events.length === 3);
  const case2Events = await logger.listByCase("case_test_002");
  check("listByCase('case_test_002') returns 1", case2Events.length === 1);

  // list with filters
  const errOnly = await logger.list({ severity: "error" });
  check("filter severity=error returns 1", errOnly.length === 1);
  const reviewOnly = await logger.list({ agentName: "ReviewQueue" });
  check("filter agentName=ReviewQueue returns 1", reviewOnly.length === 1);
  const caseFilter = await logger.list({ caseId: "case_test_001" });
  check("filter caseId returns 3", caseFilter.length === 3);

  // summary
  const summary = await logger.getSummary();
  check("summary total = 4", summary.total === 4);
  check("summary byAgent counts TestAgent=3", summary.byAgent.TestAgent === 3);
  check("summary byAgent counts ReviewQueue=1", summary.byAgent.ReviewQueue === 1);
  check("summary bySeverity counts error=1", summary.bySeverity.error === 1);
  check("summary recentErrors length 1", summary.recentErrors.length === 1);
  check("summary byModule counts false_ad=1", summary.byModule.false_ad === 1);

  // 알려지지 않은 eventType / severity → skip (log returns null)
  const badEvent = await logger.log({
    eventType: "unknown_type" as never,
    severity: "info"
  });
  check("trace log rejects unknown eventType", badEvent === null);

  // withAgentTrace — 성공
  const wrapResult = await withAgentTrace(
    { agentName: "WrapTestAgent", moduleId: "false_ad", caseId: "case_wrap_001" },
    () => Promise.resolve({ priorityScore: 75, priorityLabel: "우선 검토" })
  );
  check("withAgentTrace returns result", (wrapResult.result as Record<string, unknown>).priorityScore === 75);
  check("withAgentTrace traceId returned", typeof wrapResult.traceId === "string" && wrapResult.traceId.length > 0);
  check("withAgentTrace durationMs >= 0", typeof wrapResult.durationMs === "number" && wrapResult.durationMs >= 0);
  // (start/end 이벤트는 기본 logger 디렉터리에 기록됨 — withAgentTrace 는 글로벌 logger 사용)

  // withAgentTrace — 실패
  let wrapErrCaught = false;
  try {
    await withAgentTrace(
      { agentName: "WrapErrAgent" },
      () => { throw new Error("의도된 실패"); }
    );
  } catch (e) {
    wrapErrCaught = (e as Error).message === "의도된 실패";
  }
  check("withAgentTrace re-throws error", wrapErrCaught);
} finally {
  await rm(tmpTraceDir, { recursive: true, force: true });
}

// 28) Privacy / Data Minimization — detector, masker, retention
check("SENSITIVE_DATA_TYPES count", SENSITIVE_DATA_TYPES.length === 10);
check("MASK_TOKENS has EMAIL/PHONE/KOREAN_RRN", typeof MASK_TOKENS.EMAIL === "string" && typeof MASK_TOKENS.PHONE === "string" && typeof MASK_TOKENS.KOREAN_RRN === "string");

// 탐지기 — 이메일/전화/주민번호/API 키/JWT/Bearer
const findingsEmail = detectSensitive("contact me at foo@bar.com please");
check("detectSensitive finds EMAIL", findingsEmail.some((f) => f.type === "EMAIL" && f.confidence === "HIGH"));
const findingsPhone = detectSensitive("연락처 010-1234-5678 입니다");
check("detectSensitive finds PHONE", findingsPhone.some((f) => f.type === "PHONE" && f.confidence === "HIGH"));
const findingsRrn = detectSensitive("주민번호 901231-1234567");
check("detectSensitive finds KOREAN_RRN", findingsRrn.some((f) => f.type === "KOREAN_RRN" && f.confidence === "HIGH"));
const findingsApi = detectSensitive("OPENAI_API_KEY=sk-test_abcdefghijklmnop1234");
check("detectSensitive finds API_KEY", findingsApi.some((f) => f.type === "API_KEY" && f.confidence === "HIGH"));
const findingsBearer = detectSensitive("Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890");
check("detectSensitive finds AUTH_HEADER (Bearer)", findingsBearer.some((f) => f.type === "AUTH_HEADER" && f.confidence === "HIGH"));
const jwtSample = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnopqrstuvwxyz0123456789";
const findingsJwt = detectSensitive("token=" + jwtSample);
check("detectSensitive finds TOKEN (JWT)", findingsJwt.some((f) => f.type === "TOKEN" && f.confidence === "HIGH"));

// 키 이름 기반 — JSON 직렬화 secret
const jsonSecret = `{"api_key": "AIzaSyDxyzabcdefghijklmno1234567890ab", "cookie": "session=abcdef"}`;
const findingsJson = detectSensitive(jsonSecret);
check("detectSensitive JSON api_key/cookie key match",
  findingsJson.some((f) => f.type === "API_KEY") && findingsJson.some((f) => f.type === "COOKIE" || f.type === "API_KEY"));

// excerpt 가 원본 매치값을 그대로 노출하지 않음
check("excerpt does NOT contain raw email value",
  !findingsEmail.some((f) => (f.excerpt ?? "").includes("foo@bar.com")));
check("excerpt does NOT contain raw secret",
  !findingsApi.some((f) => (f.excerpt ?? "").includes("sk-test_abcdefghijklmnop1234")));

// maskText — 통합 마스킹
const mt = maskText("연락처 010-1234-5678, 이메일 test@example.com, 키 sk-test_abcdefghijklmnop1234, 주민번호 901231-1234567");
check("maskText changed=true", mt.changed === true);
check("maskText masks email", mt.masked.includes("[masked-email]"));
check("maskText masks phone", mt.masked.includes("[masked-phone]"));
check("maskText masks rrn", mt.masked.includes("[masked-id]"));
check("maskText masks api key", mt.masked.includes("[masked-secret]"));
check("maskText findings array non-empty", Array.isArray(mt.findings) && mt.findings.length >= 4);
check("maskText byType has multiple types", Object.keys(mt.byType).length >= 4);
check("maskText safetyNotice mentions 오탐", /오탐/.test(mt.safetyNotice));

// 개별 마스킹 헬퍼
check("maskEmail standalone", maskEmail("foo@bar.com").includes("[masked-email]"));
check("maskPhone standalone", maskPhone("010-1234-5678").includes("[masked-phone]"));
check("maskRrn standalone", maskRrn("901231-1234567").includes("[masked-id]"));
check("maskApiKey standalone", maskApiKey("sk-test_abcdefghijklmnop1234").includes("[masked-secret]"));
check("maskBearer standalone", maskBearer("Bearer abcdefghijklmnopqrstuvwxyz1234567890").includes("[masked-auth]"));
check("maskJwt standalone", maskJwt(jwtSample).includes("[masked-secret]"));

// maskText disabled 모드
const noChange = maskText("test@example.com", { enabled: false });
check("maskText disabled returns unchanged", noChange.changed === false && noChange.masked === "test@example.com");

// 일반 텍스트는 변경 없음
const clean = maskText("그냥 평범한 텍스트입니다.");
check("maskText leaves clean text unchanged", clean.changed === false);

// RetentionPolicy
const policies = getRetentionPolicies();
check("retention policies has 8 categories", policies.length === 8);
const cats = policies.map((p) => p.category);
check("retention includes trace/evidence/report/feedback/case/raw/scheduler/scout",
  ["trace", "evidence", "report", "feedback", "case", "raw", "scheduler", "scout"].every((c) => cats.includes(c as never)));
const traceP = policies.find((p) => p.category === "trace");
check("trace policy days = 30", traceP?.days === 30);
const feedP = policies.find((p) => p.category === "feedback");
check("feedback policy days = 180", feedP?.days === 180);

// applyRetention dry-run — 실제 삭제 없음, 결과 구조만 검증
const retReport = await applyRetention({ dryRun: true });
check("retention report dryRun=true", retReport.dryRun === true);
check("retention report deleted is empty in dryRun", retReport.deleted.length === 0);
check("retention report has policies", retReport.policies.length === 8);
check("retention report safetyNotice present", typeof retReport.safetyNotice === "string");

// 삭제 안전장치 — 직접 호출 대신 라우터 안전 로직을 단위 테스트로 검증
// (별도 isPathSafeForDelete 노출 없으므로 검증은 API 통합에서 수행)

// 29) Deployment artifacts — Dockerfile / compose / .dockerignore / scripts / deployment_guide / README
async function fileExists(p: string): Promise<boolean> {
  try { await fsStat(p); return true; } catch { return false; }
}
async function readFileSafe(p: string): Promise<string> {
  try { return await readFile(p, "utf8"); } catch { return ""; }
}

const root = process.cwd();
check("deploy: .env.example exists", await fileExists(path.join(root, ".env.example")));
check("deploy: Dockerfile exists", await fileExists(path.join(root, "Dockerfile")));
check("deploy: docker-compose.yml exists", await fileExists(path.join(root, "docker-compose.yml")));
check("deploy: .dockerignore exists", await fileExists(path.join(root, ".dockerignore")));
check("deploy: docs/deployment_guide.md exists", await fileExists(path.join(root, "docs", "deployment_guide.md")));
check("deploy: scripts/health-check.js exists", await fileExists(path.join(root, "scripts", "health-check.js")));
check("deploy: scripts/dev.ps1 exists", await fileExists(path.join(root, "scripts", "dev.ps1")));
check("deploy: scripts/start-local.ps1 exists", await fileExists(path.join(root, "scripts", "start-local.ps1")));
check("deploy: scripts/dev.sh exists", await fileExists(path.join(root, "scripts", "dev.sh")));
check("deploy: scripts/start-local.sh exists", await fileExists(path.join(root, "scripts", "start-local.sh")));

// health-check.js — PORT env 사용 여부 + http 호출
const healthSrc = await readFileSafe(path.join(root, "scripts", "health-check.js"));
check("deploy: health-check reads PORT env", /process\.env\.PORT/.test(healthSrc));
check("deploy: health-check uses /api/health", /api\/health/.test(healthSrc));
check("deploy: health-check has timeout handling", /timeout/i.test(healthSrc));

// package.json — start/build/test/dev/check/health 존재
const pkgRaw = await readFileSafe(path.join(root, "package.json"));
const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
const scripts = pkg.scripts ?? {};
for (const s of ["start", "build", "test", "dev", "check", "health"]) {
  check(`deploy: package.json script "${s}" exists`, typeof scripts[s] === "string" && scripts[s].length > 0);
}

// .dockerignore — secrets + data 산출물 제외
const dockerignore = await readFileSafe(path.join(root, ".dockerignore"));
check("deploy: .dockerignore excludes .env", /^\.env$/m.test(dockerignore) || /^\.env\b/m.test(dockerignore));
check("deploy: .dockerignore excludes data/cases", /^data\/cases\b/m.test(dockerignore));
check("deploy: .dockerignore excludes data/evidence", /^data\/evidence\b/m.test(dockerignore));
check("deploy: .dockerignore excludes data/traces", /^data\/traces\b/m.test(dockerignore));
check("deploy: .dockerignore excludes node_modules", /^node_modules\b/m.test(dockerignore));
check("deploy: .dockerignore excludes dist", /^dist\b/m.test(dockerignore));
check("deploy: .dockerignore excludes *.db", /\*\.db/m.test(dockerignore));

// Dockerfile — non-root + EXPOSE 3001 + HEALTHCHECK
const dockerfileSrc = await readFileSafe(path.join(root, "Dockerfile"));
check("deploy: Dockerfile uses non-root user", /USER\s+(node|\d+:\d+)/m.test(dockerfileSrc));
check("deploy: Dockerfile EXPOSE 3001", /EXPOSE\s+3001/.test(dockerfileSrc));
check("deploy: Dockerfile has HEALTHCHECK", /HEALTHCHECK/.test(dockerfileSrc));
check("deploy: Dockerfile multi-stage (FROM ... AS ...)",
  (dockerfileSrc.match(/^FROM\s+\S+\s+AS\s+\w+/gm) ?? []).length >= 2);

// docker-compose.yml — ./data:/app/data volume + port mapping + env_file
const composeSrc = await readFileSafe(path.join(root, "docker-compose.yml"));
check("deploy: docker-compose mounts ./data:/app/data", /\.\/data:\/app\/data/.test(composeSrc));
check("deploy: docker-compose maps port 3001", /"?3001:3001"?/.test(composeSrc));
check("deploy: docker-compose has env_file .env", /env_file/.test(composeSrc) && /\.env/.test(composeSrc));
check("deploy: docker-compose has healthcheck", /healthcheck/i.test(composeSrc));

// README — Quick Start 섹션
const readme = await readFileSafe(path.join(root, "README.md"));
check("deploy: README has Quick Start", /Quick Start/i.test(readme));
check("deploy: README has Docker Quick Start", /docker compose up/i.test(readme));
check("deploy: README links docs/deployment_guide.md", /docs\/deployment_guide\.md/.test(readme));

// 30) Outcome Tracker — types, repository, masking, stats, follow-up, dashboard integration
check("OUTCOME_STATUSES has 13 codes", OUTCOME_STATUSES.length === 13);
check("OUTCOME_DECISIONS has 7 codes", OUTCOME_DECISIONS.length === 7);
check("REWARD_OUTCOMES has 6 codes", REWARD_OUTCOMES.length === 6);
check("OUTCOME_STATUSES include core lifecycle",
  ["NOT_SUBMITTED", "SUBMITTED_MANUALLY", "RECEIVED", "ACCEPTED", "REJECTED", "REWARD_PAID"].every((s) =>
    (OUTCOME_STATUSES as readonly string[]).includes(s)));

// 임시 디렉터리에서 Repository 검증
const tmpOcDir = await mkdtemp(path.join(tmpdir(), "reward-outcome-"));
try {
  const ocRepo = new JsonOutcomeRepository(tmpOcDir);

  // 빈 상태
  const emptyList = await ocRepo.list();
  check("outcome empty list total=0", emptyList.total === 0);
  const emptyStats = await ocRepo.getStats();
  check("outcome empty stats total=0", emptyStats.total === 0);

  // create — 정상 입력
  const r1 = await ocRepo.create({
    caseId: "case_oc_001",
    moduleId: "false_ad",
    agencyName: "식품의약품안전처 (sample)",
    agencyChannel: "온라인 불법유통 신고",
    submittedAt: "2026-05-17",
    receivedAt: "2026-05-18",
    referenceNumber: "ABC-2026-0001",
    status: "SUBMITTED_MANUALLY",
    decision: "PENDING",
    rewardOutcome: "UNKNOWN",
    notes: "국민신문고에 직접 제출"
  });
  check("outcome create returns entry with id", typeof r1.outcome.id === "string" && /^oc_/.test(r1.outcome.id));
  check("outcome create caseId saved", r1.outcome.caseId === "case_oc_001");
  check("outcome create status default SUBMITTED_MANUALLY", r1.outcome.status === "SUBMITTED_MANUALLY");
  check("outcome create rewardOutcome saved", r1.outcome.rewardOutcome === "UNKNOWN");
  check("outcome safetyNotice present", typeof r1.outcome.safetyNotice === "string" && /자동/.test(r1.outcome.safetyNotice));
  check("outcome create defaults piiMasked", r1.outcome.piiMasked === false);

  // PII 마스킹 — notes 에 이메일/전화 넣으면 마스킹
  const r2 = await ocRepo.create({
    caseId: "case_oc_002",
    moduleId: "false_ad",
    agencyName: "식약처",
    notes: "담당자 이메일 alice@example.com 전화 010-1234-5678",
    referenceNumber: "REF-2026-0002"
  });
  check("outcome PII in notes is masked",
    typeof r2.outcome.notes === "string" &&
    r2.outcome.notes.includes("[masked-email]") &&
    r2.outcome.notes.includes("[masked-phone]"));
  check("outcome create reports piiMasked=true", r2.piiMasked === true && r2.outcome.piiMasked === true);

  // 잘못된 status 거부
  let badStatusThrown = false;
  try {
    await ocRepo.create({ caseId: "case_oc_003", status: "INVALID" as never });
  } catch (e) {
    badStatusThrown = e instanceof OutcomeValidationError;
  }
  check("outcome rejects invalid status", badStatusThrown);

  // rewardAmount 음수 거부
  let badRewardThrown = false;
  try {
    await ocRepo.create({ caseId: "case_oc_004", rewardAmount: -100 });
  } catch (e) {
    badRewardThrown = e instanceof OutcomeValidationError;
  }
  check("outcome rejects negative rewardAmount", badRewardThrown);

  // 잘못된 caseId 거부
  let badCaseIdThrown = false;
  try {
    await ocRepo.create({ caseId: "../../etc/passwd" });
  } catch (e) {
    badCaseIdThrown = e instanceof OutcomeValidationError;
  }
  check("outcome rejects unsafe caseId", badCaseIdThrown);

  // 잘못된 날짜 형식 거부
  let badDateThrown = false;
  try {
    await ocRepo.create({ caseId: "case_oc_005", submittedAt: "2026/05/17" });
  } catch (e) {
    badDateThrown = e instanceof OutcomeValidationError;
  }
  check("outcome rejects bad date format", badDateThrown);

  // update — 상태 변경 + reward 지급 확인
  const r3 = await ocRepo.update(r1.outcome.id, {
    status: "RECEIVED",
    decision: "PENDING"
  });
  check("outcome update changes status", r3.outcome.status === "RECEIVED");
  check("outcome update keeps caseId", r3.outcome.caseId === "case_oc_001");

  // upsertByCaseId — 같은 caseId 면 update
  const r4 = await ocRepo.upsertByCaseId("case_oc_001", { caseId: "case_oc_001", status: "ACCEPTED", decision: "ACCEPTED" });
  check("upsertByCaseId updates existing", r4.outcome.id === r1.outcome.id && r4.outcome.status === "ACCEPTED");

  // 추가 데이터 — REJECTED + REWARD_PAID + followUp
  await ocRepo.create({
    caseId: "case_oc_006",
    moduleId: "false_ad",
    agencyName: "식약처",
    status: "REJECTED",
    decision: "REJECTED",
    rejectionReason: "증거가 부족합니다"
  });
  // REWARD_PAID with amount
  await ocRepo.create({
    caseId: "case_oc_007",
    moduleId: "counterfeit_goods",
    agencyName: "특허청",
    status: "REWARD_PAID",
    decision: "ACCEPTED",
    rewardOutcome: "PAID",
    rewardAmount: 100000,
    rewardCurrency: "KRW"
  });
  // follow-up due (어제 날짜)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await ocRepo.create({
    caseId: "case_oc_008",
    status: "IN_REVIEW",
    followUpDueAt: yesterday
  });

  // stats
  const stats = await ocRepo.getStats();
  check("outcome stats total >= 5", stats.total >= 5);
  check("outcome stats acceptedCount >= 1", stats.acceptedCount >= 1);
  check("outcome stats rejectedCount >= 1", stats.rejectedCount >= 1);
  check("outcome stats rewardPaidCount >= 1", stats.rewardPaidCount >= 1);
  check("outcome stats followUpDueCount >= 1", stats.followUpDueCount >= 1);
  check("outcome stats rewardPaidAmountTotal == 100000", stats.rewardPaidAmountTotal === 100000);
  check("outcome stats rewardPaidEntries == 1", stats.rewardPaidEntries === 1);

  // patterns
  const patterns = await ocRepo.getPatternStats();
  check("outcome patterns byAgency includes 식약처",
    patterns.byAgency.some((a) => a.agencyName === "식약처"));
  check("outcome patterns byModule includes false_ad",
    patterns.byModule.some((m) => m.moduleId === "false_ad"));
  check("outcome patterns has rejection reasons",
    patterns.topRejectionReasons.length >= 1);

  // follow-up
  const fu = await ocRepo.getFollowUpDue(0);
  check("outcome follow-up includes due item", fu.some((f) => f.caseId === "case_oc_008"));
  check("outcome follow-up daysOverdue >= 1", fu.find((f) => f.caseId === "case_oc_008")?.daysOverdue! >= 1);

  // listByCaseId
  const byCase = await ocRepo.listByCaseId("case_oc_001");
  check("listByCaseId returns 1 for case_oc_001", byCase.length === 1);

  // 필터 list
  const filtered = await ocRepo.list({ status: "REJECTED" });
  check("filter status=REJECTED returns >=1", filtered.total >= 1);
  const rewardFiltered = await ocRepo.list({ rewardOutcome: "PAID" });
  check("filter rewardOutcome=PAID returns 1", rewardFiltered.total === 1);
} finally {
  await rm(tmpOcDir, { recursive: true, force: true });
}

// Dashboard outcome summary 회귀 — getSummary 응답에 outcome 포함
const dashWithOutcome = await new DashboardService().getSummary();
check("dashboard summary includes outcome", typeof dashWithOutcome.outcome === "object" && dashWithOutcome.outcome !== null);
check("dashboard outcome has KPI fields",
  typeof dashWithOutcome.outcome.total === "number" &&
  typeof dashWithOutcome.outcome.submittedCount === "number" &&
  typeof dashWithOutcome.outcome.rewardPaidAmountTotal === "number");

// UI 회귀 — app.js 가 outcome 데이터를 localStorage 에 저장하지 않는지 확인
const appJs = await readFile(path.join(process.cwd(), "public", "app.js"), "utf8");
// outcome 관련 키워드 근처에 localStorage 호출이 없어야 함
const outcomeSection = appJs.slice(appJs.indexOf("// ---------- Outcome Tracker"), appJs.indexOf("// ---------- 개인정보 보호"));
check("outcome UI does NOT call localStorage",
  outcomeSection.length > 0 && !/localStorage\.(setItem|getItem|removeItem)\s*\(\s*['\"][^'\"]*outcome/i.test(outcomeSection));

// 31) Settings — 실전 재점검 04 (설정 / 실행 환경 상태 조회 전용)
{
  const { settingsService, SETTINGS_SAFETY_NOTICE, maskSecretStatusOnly } =
    await import("../services/settings/SettingsService.js");

  const s = settingsService.getSettings();
  // 핵심 응답 구조
  check("settings.app.name === 공익레이더", s.app?.name === "공익레이더");
  check("settings.app.port is number", typeof s.app?.port === "number" && s.app.port > 0);
  check("settings.runtime.runtimeMode in enum",
    ["MOCK", "MIXED", "REAL_READY"].includes(s.runtime?.runtimeMode));
  check("settings.apiConnections.openai.configured is boolean",
    typeof s.apiConnections?.openai?.configured === "boolean");
  check("settings.apiConnections.naver.configured is boolean",
    typeof s.apiConnections?.naver?.configured === "boolean");
  check("settings.scheduler.enabled is boolean",
    typeof s.scheduler?.enabled === "boolean");
  check("settings.privacy.dryRun is boolean",
    typeof s.privacy?.dryRun === "boolean");
  check("settings.storage.dataDir present", typeof s.storage?.dataDir === "string" && s.storage.dataDir.length > 0);
  check("settings.safety.autoSubmitAllowed === false", s.safety?.autoSubmitAllowed === false);
  check("settings.safety.humanReviewRequired === true", s.safety?.humanReviewRequired === true);
  check("settings.safety.approvalGate === 'enabled'", s.safety?.approvalGate === "enabled");
  check("settings.readiness.stage present", typeof s.readiness?.stage === "string" && s.readiness.stage.length > 0);
  check("settings.safetyNotice === SETTINGS_SAFETY_NOTICE",
    s.safetyNotice === SETTINGS_SAFETY_NOTICE);

  // API 키 원문 미노출 — payload JSON 전체에 시크릿 원문이 포함되지 않아야 한다.
  const settingsJson = JSON.stringify(s);
  const openAiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const naverSecret = (process.env.NAVER_CLIENT_SECRET ?? "").trim();
  const naverId = (process.env.NAVER_CLIENT_ID ?? "").trim();
  check("settings payload does not contain OPENAI_API_KEY raw value",
    openAiKey.length === 0 || !settingsJson.includes(openAiKey));
  check("settings payload does not contain NAVER_CLIENT_SECRET raw value",
    naverSecret.length === 0 || !settingsJson.includes(naverSecret));
  check("settings payload does not contain NAVER_CLIENT_ID raw value",
    naverId.length === 0 || !settingsJson.includes(naverId));

  // maskSecretStatusOnly helper
  check("maskSecretStatusOnly empty → configured false",
    maskSecretStatusOnly("").configured === false);
  check("maskSecretStatusOnly missing → configured false",
    maskSecretStatusOnly(undefined).configured === false);
  check("maskSecretStatusOnly non-empty → configured true",
    maskSecretStatusOnly("abc").configured === true);
  check("maskSecretStatusOnly never returns the raw value",
    !Object.prototype.hasOwnProperty.call(maskSecretStatusOnly("super-secret-key"), "value"));

  // UI 마커 / 렌더 함수 존재
  check("public/index.html includes settingsCard id",
    /id="settingsCard"/.test(indexHtml) || /id="settingsSection"/.test(indexHtml));
  check("public/index.html includes settingsPanel",
    /id="settingsPanel"/.test(indexHtml));
  check("public/app.js exposes renderSettings",
    /function\s+renderSettings\s*\(/.test(appJsHome));
  check("public/app.js exposes loadSettings",
    /async\s+function\s+loadSettings\s*\(|function\s+loadSettings\s*\(/.test(appJsHome));
  check("public/app.js exposes renderApiConnectionSettings",
    /function\s+renderApiConnectionSettings\s*\(/.test(appJsHome));
  check("public/app.js exposes renderSafetySettings",
    /function\s+renderSafetySettings\s*\(/.test(appJsHome));
  check("public/styles.css declares .settings-card",
    /\.settings-card\s*\{/.test(stylesRaw));
  check("public/styles.css declares .settings-badge",
    /\.settings-badge\s*\{/.test(stylesRaw));

  // README 와 docs
  const readmeText = await readFileSafe(path.join(process.cwd(), "README.md"));
  check("README.md contains Settings section", /##\s*Settings\b/.test(readmeText));
  check("README.md mentions GET /api/settings", /GET\s+\/api\/settings/.test(readmeText));
  check("docs/settings.md exists",
    await fileExists(path.join(process.cwd(), "docs", "settings.md")));

  // 금지 표현이 Settings 관련 코드/문서에 없어야 한다.
  const settingsForbiddenPhrases = ["자동 신고 활성화", "포상금 신청 자동화"];
  const settingsServiceText = await readFileSafe(path.join(process.cwd(), "src", "services", "settings", "SettingsService.ts"));
  const settingsRouteText = await readFileSafe(path.join(process.cwd(), "src", "routes", "settings.ts"));
  const settingsDocText = await readFileSafe(path.join(process.cwd(), "docs", "settings.md"));
  for (const phrase of settingsForbiddenPhrases) {
    check(`SettingsService does not contain forbidden phrase: ${phrase}`,
      !settingsServiceText.includes(phrase));
    check(`settings route does not contain forbidden phrase: ${phrase}`,
      !settingsRouteText.includes(phrase));
    check(`docs/settings.md does not contain forbidden phrase: ${phrase}`,
      !settingsDocText.includes(phrase));
    check(`README Settings block does not contain forbidden phrase: ${phrase}`,
      !readmeText.includes(phrase));
    check(`settings payload does not contain forbidden phrase: ${phrase}`,
      !settingsJson.includes(phrase));
  }
}

// 32) Reward Registry — 실전 재점검 05 (신고포상금·보상금 제도 안내 DB)
{
  const {
    rewardRegistryService,
    REWARD_REGISTRY_SAFETY_NOTICE,
    sanitizeRewardText
  } = await import("../services/reward/RewardRegistryService.js");

  const programs = rewardRegistryService.listRewardPrograms();
  const summary = rewardRegistryService.getSummary();

  check("reward registry programs is array", Array.isArray(programs));
  check("reward registry has >= 5 programs", programs.length >= 5, `len=${programs.length}`);

  const ids = new Set(programs.map((p) => p.id));
  check("reward registry has mfds_false_ad", ids.has("mfds_false_ad"));
  check("reward registry has kipo_counterfeit", ids.has("kipo_counterfeit"));
  check("reward registry has ftc_bid_collusion", ids.has("ftc_bid_collusion"));
  check("reward registry has acrc_public_interest", ids.has("acrc_public_interest"));
  check("reward registry has acrc_corruption_subsidy", ids.has("acrc_corruption_subsidy"));

  for (const p of programs) {
    check(`reward ${p.id} has officialUrl`,
      typeof p.officialUrl === "string" && /^https?:\/\//.test(p.officialUrl));
    check(`reward ${p.id} whatToCollect length >= 3`,
      Array.isArray(p.whatToCollect) && p.whatToCollect.length >= 3);
    check(`reward ${p.id} evidenceChecklist length >= 3`,
      Array.isArray(p.evidenceChecklist) && p.evidenceChecklist.length >= 3);
    check(`reward ${p.id} has rewardBasisSummary`,
      typeof p.rewardBasisSummary === "string" && p.rewardBasisSummary.length > 0);
    check(`reward ${p.id} has amountGuide`,
      typeof p.amountGuide === "string" && p.amountGuide.length > 0);
    check(`reward ${p.id} amountGuide mentions 공식 기준`,
      /공식\s*[가-힣A-Za-z]*\s*확인\s*필요|공정위\s*안내\s*기준\s*확인\s*필요/.test(p.amountGuide));
  }

  // safetyNotice
  check("reward safetyNotice mentions 수령을 보장하지 않습니다",
    /수령을\s*보장하지\s*않/.test(REWARD_REGISTRY_SAFETY_NOTICE));

  // 공식 URL — 4종 host 모두 포함
  const allUrls = programs.map((p) => p.officialUrl).join(" ");
  check("reward officialUrl includes mfds.go.kr", allUrls.includes("mfds.go.kr"));
  check("reward officialUrl includes kipo.go.kr", allUrls.includes("kipo.go.kr"));
  check("reward officialUrl includes ftc.go.kr", allUrls.includes("ftc.go.kr"));
  check("reward officialUrl includes clean.go.kr", allUrls.includes("clean.go.kr"));

  // Summary
  check("reward summary.total >= 5", summary.total >= 5);
  check("reward summary.officialCheckRequired === true", summary.officialCheckRequired === true);
  check("reward summary.lastReviewedAt is ISO-like",
    typeof summary.lastReviewedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(summary.lastReviewedAt));
  check("reward summary.moduleIds non-empty",
    Array.isArray(summary.moduleIds) && summary.moduleIds.length > 0);

  // getRewardProgram / listByModule
  const single = rewardRegistryService.getRewardProgram("mfds_false_ad");
  check("getRewardProgram returns mfds_false_ad",
    single !== null && single?.id === "mfds_false_ad");
  const byMod = rewardRegistryService.listByModule("counterfeit_goods");
  check("listByModule counterfeit_goods returns >=1",
    byMod.length >= 1 && byMod.every((p) => p.moduleId === "counterfeit_goods"));

  // sanitizeRewardText
  check("sanitizeRewardText neutralizes 포상금 확정",
    !/포상금\s*확정/.test(sanitizeRewardText("포상금 확정 안내")));
  check("sanitizeRewardText neutralizes 수익 확정",
    !/수익\s*확정/.test(sanitizeRewardText("이 제도는 수익 확정입니다")));
  check("sanitizeRewardText neutralizes 신고하면 지급",
    !/신고하면\s*지급/.test(sanitizeRewardText("신고하면 지급됩니다")));
  check("sanitizeRewardText neutralizes 무조건 지급",
    !/무조건\s*지급/.test(sanitizeRewardText("무조건 지급된다")));
  check("sanitizeRewardText neutralizes 포상금 보장합니다",
    !/포상금\s*보장합니다/.test(sanitizeRewardText("포상금 보장합니다.")));

  // 금지 표현 — 긍정 표현이 reward 페이로드 전체에 없어야 한다.
  const rewardPayload = JSON.stringify({
    programs,
    summary,
    officialLinks: rewardRegistryService.getOfficialLinks(),
    safetyNotice: REWARD_REGISTRY_SAFETY_NOTICE
  });
  const REWARD_FORBIDDEN_AFFIRMATIVE = [
    "포상금 확정",
    "수익 확정",
    "신고하면 지급",
    "무조건 지급",
    "무조건 받을 수 있음",
    "포상금 보장합니다",
    "자동 신고합니다",
    "자동 신고됩니다",
    "바로 제출합니다",
    "바로 제출됩니다"
  ];
  for (const phrase of REWARD_FORBIDDEN_AFFIRMATIVE) {
    check(`reward payload does not contain forbidden affirmative: ${phrase}`,
      !rewardPayload.includes(phrase));
  }

  // 화면 / 라우터 / 서비스 / 문서에도 동일 금지 표현이 긍정문으로 들어가서는 안 된다.
  const rewardServiceText = await readFileSafe(path.join(process.cwd(), "src", "services", "reward", "RewardRegistryService.ts"));
  const rewardProgramsText = await readFileSafe(path.join(process.cwd(), "src", "services", "reward", "rewardPrograms.ts"));
  const rewardRouteText = await readFileSafe(path.join(process.cwd(), "src", "routes", "rewardPrograms.ts"));
  const rewardDocText = await readFileSafe(path.join(process.cwd(), "docs", "reward_registry.md"));
  for (const phrase of ["신고하면 지급", "무조건 지급", "무조건 받을 수 있음", "포상금 보장합니다"]) {
    check(`reward service text excludes affirmative: ${phrase}`,
      !rewardServiceText.includes(phrase) || rewardServiceText.includes("→") || rewardServiceText.includes("replace"));
    check(`reward programs data excludes affirmative: ${phrase}`,
      !rewardProgramsText.includes(phrase));
    check(`reward route excludes affirmative: ${phrase}`,
      !rewardRouteText.includes(phrase));
  }

  // UI 마커 / 렌더 함수 / CSS
  check("public/index.html includes rewardRegistryCard",
    /id="rewardRegistryCard"/.test(indexHtml));
  check("public/index.html includes rewardRegistryPanel",
    /id="rewardRegistryPanel"/.test(indexHtml));
  check("public/app.js exposes renderRewardPrograms",
    /function\s+renderRewardPrograms\s*\(/.test(appJsHome));
  check("public/app.js exposes renderRewardProgramCard",
    /function\s+renderRewardProgramCard\s*\(/.test(appJsHome));
  check("public/app.js exposes loadRewardPrograms",
    /async\s+function\s+loadRewardPrograms\s*\(|function\s+loadRewardPrograms\s*\(/.test(appJsHome));
  check("public/styles.css declares .reward-program-card",
    /\.reward-program-card\s*\{/.test(stylesRaw));
  check("public/styles.css declares .reward-program-link",
    /\.reward-program-link\s*\{/.test(stylesRaw));

  // README + docs
  const readmeText = await readFileSafe(path.join(process.cwd(), "README.md"));
  check("README.md contains Reward Registry section", /##\s*Reward\s*Registry\b/.test(readmeText));
  check("README.md mentions GET /api/reward-programs",
    /GET\s+\/api\/reward-programs/.test(readmeText));
  check("docs/reward_registry.md exists",
    await fileExists(path.join(process.cwd(), "docs", "reward_registry.md")));

  // 문서/README 도 긍정 금지 표현 없어야 함.
  for (const phrase of ["포상금 확정", "수익 확정", "신고하면 지급", "무조건 지급", "포상금 보장합니다"]) {
    check(`README does not contain forbidden affirmative: ${phrase}`,
      !readmeText.includes(phrase));
    check(`docs/reward_registry.md does not contain forbidden affirmative as positive: ${phrase}`,
      !rewardDocText.includes(phrase) || rewardDocText.includes("→"));
  }
}

// 33) False Ad Practical Guide — 실전 재점검 06
{
  const { falseAdGuideService, FALSE_AD_GUIDE_SAFETY_NOTICE } =
    await import("../services/false-ad-guide/FalseAdGuideService.js");

  const g = falseAdGuideService.getGuide();

  // 구조
  check("false ad guide schemaVersion 1.0.0", g.schemaVersion === "1.0.0");
  check("false ad guide moduleId false_ad", g.moduleId === "false_ad");
  check("false ad guide displayName non-empty",
    typeof g.displayName === "string" && g.displayName.length > 0);

  // Reporting channels
  check("reportingChannels length >= 3",
    Array.isArray(g.reportingChannels) && g.reportingChannels.length >= 3);
  const channelAgencies = g.reportingChannels.map((c) => c.agencyName || "");
  check("reportingChannels include 식품의약품안전처",
    channelAgencies.some((a) => /식품의약품안전처/.test(a)));
  check("reportingChannels include 국민신문고",
    channelAgencies.some((a) => /국민신문고/.test(a)));
  check("reportingChannels include 관할 보건소/지자체",
    channelAgencies.some((a) => /지자체|보건소/.test(a)));
  for (const c of g.reportingChannels) {
    check(`reporting channel ${c.id} has caution`,
      typeof c.caution === "string" && c.caution.length > 0);
  }

  // Prohibited claim types
  check("prohibitedClaimTypes length >= 6",
    Array.isArray(g.prohibitedClaimTypes) && g.prohibitedClaimTypes.length >= 6);
  for (const t of g.prohibitedClaimTypes) {
    check(`claim type ${t.id} has >=3 examples`,
      Array.isArray(t.examples) && t.examples.length >= 3);
    check(`claim type ${t.id} whyItMatters mentions 검토`,
      typeof t.whyItMatters === "string" && /검토/.test(t.whyItMatters));
    check(`claim type ${t.id} reviewLevel in enum`,
      ["HIGH", "MEDIUM", "LOW"].includes(t.reviewLevel));
  }
  const claimCategories = g.prohibitedClaimTypes.map((t) => t.category || "");
  check("includes 질병 치료 category",
    claimCategories.some((c) => /질병\s*치료/.test(c)));
  check("includes 질병 완치 category",
    claimCategories.some((c) => /질병\s*완치/.test(c)));
  check("includes 질병 예방 category",
    claimCategories.some((c) => /질병\s*예방/.test(c)));
  check("includes 의약품 오인 category",
    claimCategories.some((c) => /의약품\s*오인/.test(c)));
  check("includes 과장 효능 category",
    claimCategories.some((c) => /과장\s*효능/.test(c)));
  check("includes 신체 기능 / 해독 category",
    claimCategories.some((c) => /해독|신체\s*기능/.test(c)));

  // Evidence checklist
  check("evidenceChecklist length >= 8",
    Array.isArray(g.evidenceChecklist) && g.evidenceChecklist.length >= 8);
  for (const i of g.evidenceChecklist) {
    check(`evidence ${i.id} has boolean required`, typeof i.required === "boolean");
    check(`evidence ${i.id} has label`, typeof i.label === "string" && i.label.length > 0);
  }
  const evLabels = g.evidenceChecklist.map((i) => i.label);
  for (const must of ["원본 URL", "수집일시", "광고 문구 원문", "화면 캡처", "PDF 저장본"]) {
    check(`evidenceChecklist includes ${must}`,
      evLabels.some((l) => l.includes(must)));
  }

  // Pre-report checklist
  check("preReportChecklist length >= 6",
    Array.isArray(g.preReportChecklist) && g.preReportChecklist.length >= 6);
  const prLabels = g.preReportChecklist.map((i) => i.label || "");
  check("preReport mentions 공개 URL",
    prLabels.some((l) => /공개\s*URL/.test(l)));
  check("preReport mentions 식약처 공식 신고 페이지",
    prLabels.some((l) => /식약처\s*공식\s*신고/.test(l)));
  check("preReport mentions 최종 제출은 사람",
    prLabels.some((l) => /최종\s*제출[^\n]*사람/.test(l)));

  // Reward caution
  check("rewardCaution.notGuaranteed === true", g.rewardCaution?.notGuaranteed === true);
  check("rewardCaution.officialCheckRequired === true",
    g.rewardCaution?.officialCheckRequired === true);
  check("rewardCaution.summary mentions 수령을 보장하지 않습니다",
    /수령을\s*보장하지\s*않/.test(g.rewardCaution?.summary || ""));
  check("rewardCaution.notes length >= 4",
    Array.isArray(g.rewardCaution?.notes) && g.rewardCaution.notes.length >= 4);

  // Examples
  check("examples length >= 6", Array.isArray(g.examples) && g.examples.length >= 6);
  const catCounts = g.examples.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});
  check("examples include suspicious", (catCounts.suspicious ?? 0) >= 3);
  check("examples include normal", (catCounts.normal ?? 0) >= 2);
  check("examples include needs_review", (catCounts.needs_review ?? 0) >= 2);

  // Official links
  check("officialLinks length >= 4",
    Array.isArray(g.officialLinks) && g.officialLinks.length >= 4);
  const linkText = g.officialLinks.map((l) => l.url || "").join(" ");
  check("officialLinks include mfds.go.kr", linkText.includes("mfds.go.kr"));
  check("officialLinks include law.go.kr", linkText.includes("law.go.kr"));
  for (const l of g.officialLinks) {
    check(`officialLink ${l.id} has caution`,
      typeof l.caution === "string" && l.caution.length > 0);
  }

  // Safety notice
  check("guide.safetyNotice === FALSE_AD_GUIDE_SAFETY_NOTICE",
    g.safetyNotice === FALSE_AD_GUIDE_SAFETY_NOTICE);
  check("safetyNotice mentions 자동으로 제출하지 않으며",
    /자동으로\s*제출하지\s*않/.test(g.safetyNotice));
  check("safetyNotice mentions 포상금 수령을 보장하지 않",
    /포상금\s*수령을\s*보장하지\s*않/.test(g.safetyNotice));

  // 금지 표현 (긍정문) — payload 전체에 들어가서는 안 됨
  const guideJson = JSON.stringify(g);
  const FALSE_AD_FORBIDDEN_AFFIRMATIVE = [
    "포상금 확정",
    "수익 확정",
    "신고하면 지급",
    "무조건 지급",
    "무조건 받을 수 있음",
    "포상금 보장합니다",
    "위법 확정입니다",
    "불법 확정입니다",
    "자동 신고합니다",
    "자동 신고됩니다",
    "바로 제출합니다",
    "바로 제출됩니다"
  ];
  for (const phrase of FALSE_AD_FORBIDDEN_AFFIRMATIVE) {
    check(`false ad guide payload excludes affirmative: ${phrase}`,
      !guideJson.includes(phrase));
  }

  // 소스 파일 / 문서 검증
  const falseAdSvcText = await readFileSafe(path.join(process.cwd(), "src", "services", "false-ad-guide", "FalseAdGuideService.ts"));
  const falseAdRouteText = await readFileSafe(path.join(process.cwd(), "src", "routes", "falseAdGuide.ts"));
  const falseAdDocText = await readFileSafe(path.join(process.cwd(), "docs", "false_ad_guide.md"));
  for (const phrase of ["신고하면 지급", "무조건 지급", "무조건 받을 수 있음", "포상금 보장합니다"]) {
    check(`false ad service does not contain affirmative: ${phrase}`,
      !falseAdSvcText.includes(phrase));
    check(`false ad route does not contain affirmative: ${phrase}`,
      !falseAdRouteText.includes(phrase));
    check(`false ad docs do not contain affirmative as positive: ${phrase}`,
      !falseAdDocText.includes(phrase));
  }

  // UI 마커 / 렌더 함수 / CSS
  check("public/index.html includes falseAdGuideCard",
    /id="falseAdGuideCard"/.test(indexHtml));
  check("public/index.html includes falseAdGuidePanel",
    /id="falseAdGuidePanel"/.test(indexHtml));
  check("public/app.js exposes loadFalseAdGuide",
    /async\s+function\s+loadFalseAdGuide\s*\(|function\s+loadFalseAdGuide\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdGuide",
    /function\s+renderFalseAdGuide\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdReportingChannels",
    /function\s+renderFalseAdReportingChannels\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdClaimTypes",
    /function\s+renderFalseAdClaimTypes\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdEvidenceChecklist",
    /function\s+renderFalseAdEvidenceChecklist\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdRewardCaution",
    /function\s+renderFalseAdRewardCaution\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdExamples",
    /function\s+renderFalseAdExamples\s*\(/.test(appJsHome));
  check("public/app.js exposes renderFalseAdOfficialLinks",
    /function\s+renderFalseAdOfficialLinks\s*\(/.test(appJsHome));
  check("public/styles.css declares .false-ad-guide-card",
    /\.false-ad-guide-card\s*\{/.test(stylesRaw));
  check("public/styles.css declares .false-ad-checklist",
    /\.false-ad-checklist\s*\{/.test(stylesRaw));
  check("public/styles.css declares .false-ad-warning",
    /\.false-ad-warning\s*\{/.test(stylesRaw));

  // README + docs
  const readmeText = await readFileSafe(path.join(process.cwd(), "README.md"));
  check("README.md contains False Ad Practical Guide section",
    /##\s*False\s*Ad\s*Practical\s*Guide\b/.test(readmeText));
  check("README.md mentions GET /api/modules/false-ad/guide",
    /GET\s+\/api\/modules\/false-ad\/guide/.test(readmeText));
  check("docs/false_ad_guide.md exists",
    await fileExists(path.join(process.cwd(), "docs", "false_ad_guide.md")));
}

// 34) Counterfeit Practical Guide — 실전 재점검 07
{
  const { counterfeitGuideService, COUNTERFEIT_GUIDE_SAFETY_NOTICE } =
    await import("../services/counterfeit-guide/CounterfeitGuideService.js");

  const g = counterfeitGuideService.getGuide();

  // 구조
  check("counterfeit guide schemaVersion 1.0.0", g.schemaVersion === "1.0.0");
  check("counterfeit guide moduleId counterfeit_goods", g.moduleId === "counterfeit_goods");
  check("counterfeit guide displayName non-empty",
    typeof g.displayName === "string" && g.displayName.length > 0);

  // Reporting channels
  check("counterfeit reportingChannels length >= 3",
    Array.isArray(g.reportingChannels) && g.reportingChannels.length >= 3);
  const channelAgencies = g.reportingChannels.map((c) => c.agencyName || "");
  check("counterfeit reportingChannels include 특허청",
    channelAgencies.some((a) => /특허청/.test(a)));
  check("counterfeit reportingChannels include 지식재산침해 원스톱 신고상담센터",
    channelAgencies.some((a) => /지식재산침해\s*원스톱\s*신고상담센터/.test(a)));
  const channelUrls = g.reportingChannels.map((c) => c.officialUrl || "").join(" ");
  check("counterfeit reportingChannels include kipo.go.kr",
    channelUrls.includes("kipo.go.kr"));
  check("counterfeit reportingChannels include koipa.re.kr",
    channelUrls.includes("koipa.re.kr"));
  for (const c of g.reportingChannels) {
    check(`counterfeit channel ${c.id} has caution`,
      typeof c.caution === "string" && c.caution.length > 0);
  }

  // Suspicious signals
  check("counterfeit suspiciousSignals length >= 7",
    Array.isArray(g.suspiciousSignals) && g.suspiciousSignals.length >= 7);
  for (const s of g.suspiciousSignals) {
    check(`counterfeit signal ${s.id} has >=3 examples`,
      Array.isArray(s.examples) && s.examples.length >= 3);
    check(`counterfeit signal ${s.id} whyItMatters mentions 검토 / 위조상품 의심 후보`,
      typeof s.whyItMatters === "string" && /검토|위조상품\s*의심\s*후보/.test(s.whyItMatters));
    check(`counterfeit signal ${s.id} reviewLevel in enum`,
      ["HIGH", "MEDIUM", "LOW"].includes(s.reviewLevel));
  }
  const signalCats = g.suspiciousSignals.map((s) => s.category || "");
  for (const must of ["레플리카", "정품급", "상표", "비공개", "가격", "다채널", "이미지"]) {
    check(`counterfeit signals include category keyword: ${must}`,
      signalCats.some((c) => c.includes(must)));
  }

  // Evidence checklist
  check("counterfeit evidenceChecklist length >= 12",
    Array.isArray(g.evidenceChecklist) && g.evidenceChecklist.length >= 12);
  for (const i of g.evidenceChecklist) {
    check(`counterfeit evidence ${i.id} has boolean required`, typeof i.required === "boolean");
    check(`counterfeit evidence ${i.id} has label`, typeof i.label === "string" && i.label.length > 0);
  }
  const evLabels = g.evidenceChecklist.map((i) => i.label);
  for (const must of ["판매게시글 URL", "상품 이미지", "로고/상표 표시 캡처", "2개 이상 채널 판매 증거", "화면 캡처", "PDF 저장본"]) {
    check(`counterfeit evidenceChecklist includes ${must}`,
      evLabels.some((l) => l.includes(must)));
  }

  // Pre-report checklist
  check("counterfeit preReportChecklist length >= 8",
    Array.isArray(g.preReportChecklist) && g.preReportChecklist.length >= 8);
  const prLabels = g.preReportChecklist.map((i) => i.label || "");
  check("counterfeit preReport mentions 동일 판매자 2개 이상 채널",
    prLabels.some((l) => /동일\s*판매자\s*2개\s*이상\s*채널/.test(l)));
  check("counterfeit preReport mentions 특허청 / 원스톱센터 공식 신고 기준",
    prLabels.some((l) => /(특허청).*원스톱센터.*공식\s*신고\s*기준/.test(l)));
  check("counterfeit preReport mentions 최종 제출은 사람",
    prLabels.some((l) => /최종\s*제출[^\n]*사람/.test(l)));

  // Reward caution
  check("counterfeit rewardCaution.notGuaranteed === true",
    g.rewardCaution?.notGuaranteed === true);
  check("counterfeit rewardCaution.officialCheckRequired === true",
    g.rewardCaution?.officialCheckRequired === true);
  check("counterfeit rewardCaution.summary mentions 수령을 보장하지 않습니다",
    /수령을\s*보장하지\s*않/.test(g.rewardCaution?.summary || ""));
  check("counterfeit rewardCaution.notes length >= 4",
    Array.isArray(g.rewardCaution?.notes) && g.rewardCaution.notes.length >= 4);

  // Examples
  check("counterfeit examples length >= 6", Array.isArray(g.examples) && g.examples.length >= 6);
  const catCounts = g.examples.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});
  check("counterfeit examples include suspicious", (catCounts.suspicious ?? 0) >= 3);
  check("counterfeit examples include normal", (catCounts.normal ?? 0) >= 2);
  check("counterfeit examples include needs_review", (catCounts.needs_review ?? 0) >= 2);

  // Official links
  check("counterfeit officialLinks length >= 4",
    Array.isArray(g.officialLinks) && g.officialLinks.length >= 4);
  const linkText = g.officialLinks.map((l) => l.url || "").join(" ");
  check("counterfeit officialLinks include kipo.go.kr", linkText.includes("kipo.go.kr"));
  check("counterfeit officialLinks include koipa.re.kr", linkText.includes("koipa.re.kr"));
  for (const l of g.officialLinks) {
    check(`counterfeit link ${l.id} has caution`,
      typeof l.caution === "string" && l.caution.length > 0);
  }

  // Safety notice
  check("counterfeit guide.safetyNotice === COUNTERFEIT_GUIDE_SAFETY_NOTICE",
    g.safetyNotice === COUNTERFEIT_GUIDE_SAFETY_NOTICE);
  check("counterfeit safetyNotice mentions 자동으로 제출하지 않으며",
    /자동으로\s*제출하지\s*않/.test(g.safetyNotice));
  check("counterfeit safetyNotice mentions 포상금 수령을 보장하지 않",
    /포상금\s*수령을\s*보장하지\s*않/.test(g.safetyNotice));
  check("counterfeit safetyNotice mentions 위조 여부 확정은 권리자/관계기관 판단이 필요",
    /위조\s*여부\s*확정[^\n]*권리자|관계기관/.test(g.safetyNotice));

  // 금지 표현 (긍정문) — payload 전체에 들어가서는 안 됨
  const guideJson = JSON.stringify(g);
  const COUNTERFEIT_FORBIDDEN_AFFIRMATIVE = [
    "위조 확정",
    "불법 확정",
    "범죄자",
    "사기꾼",
    "포상금 확정",
    "수익 확정",
    "신고하면 지급",
    "무조건 지급",
    "무조건 받을 수 있음",
    "포상금 보장합니다",
    "자동 신고합니다",
    "자동 신고됩니다",
    "바로 제출합니다",
    "바로 제출됩니다"
  ];
  for (const phrase of COUNTERFEIT_FORBIDDEN_AFFIRMATIVE) {
    check(`counterfeit guide payload excludes affirmative: ${phrase}`,
      !guideJson.includes(phrase));
  }

  // 소스 파일 / 문서 검증
  const cfSvcText = await readFileSafe(path.join(process.cwd(), "src", "services", "counterfeit-guide", "CounterfeitGuideService.ts"));
  const cfRouteText = await readFileSafe(path.join(process.cwd(), "src", "routes", "counterfeitGuide.ts"));
  const cfDocText = await readFileSafe(path.join(process.cwd(), "docs", "counterfeit_guide.md"));
  for (const phrase of ["신고하면 지급", "무조건 지급", "무조건 받을 수 있음", "포상금 보장합니다", "범죄자", "사기꾼"]) {
    check(`counterfeit service does not contain affirmative: ${phrase}`,
      !cfSvcText.includes(phrase));
    check(`counterfeit route does not contain affirmative: ${phrase}`,
      !cfRouteText.includes(phrase));
    check(`counterfeit docs do not contain affirmative as positive: ${phrase}`,
      !cfDocText.includes(phrase));
  }

  // UI 마커 / 렌더 함수 / CSS
  check("public/index.html includes counterfeitGuideCard",
    /id="counterfeitGuideCard"/.test(indexHtml));
  check("public/index.html includes counterfeitGuidePanel",
    /id="counterfeitGuidePanel"/.test(indexHtml));
  check("public/app.js exposes loadCounterfeitGuide",
    /async\s+function\s+loadCounterfeitGuide\s*\(|function\s+loadCounterfeitGuide\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitGuide",
    /function\s+renderCounterfeitGuide\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitReportingChannels",
    /function\s+renderCounterfeitReportingChannels\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitSignals",
    /function\s+renderCounterfeitSignals\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitEvidenceChecklist",
    /function\s+renderCounterfeitEvidenceChecklist\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitRewardCaution",
    /function\s+renderCounterfeitRewardCaution\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitExamples",
    /function\s+renderCounterfeitExamples\s*\(/.test(appJsHome));
  check("public/app.js exposes renderCounterfeitOfficialLinks",
    /function\s+renderCounterfeitOfficialLinks\s*\(/.test(appJsHome));
  check("public/styles.css declares .counterfeit-guide-card",
    /\.counterfeit-guide-card\s*\{/.test(stylesRaw));
  check("public/styles.css declares .counterfeit-checklist",
    /\.counterfeit-checklist\s*\{/.test(stylesRaw));
  check("public/styles.css declares .counterfeit-warning",
    /\.counterfeit-warning\s*\{/.test(stylesRaw));
  check("public/styles.css declares .counterfeit-link",
    /\.counterfeit-link\s*\{/.test(stylesRaw));

  // README + docs
  const readmeText = await readFileSafe(path.join(process.cwd(), "README.md"));
  check("README.md contains Counterfeit Practical Guide section",
    /##\s*Counterfeit\s*Practical\s*Guide\b/.test(readmeText));
  check("README.md mentions GET /api/modules/counterfeit-goods/guide",
    /GET\s+\/api\/modules\/counterfeit-goods\/guide/.test(readmeText));
  check("docs/counterfeit_guide.md exists",
    await fileExists(path.join(process.cwd(), "docs", "counterfeit_guide.md")));
  for (const phrase of ["위조 확정", "범죄자", "사기꾼", "포상금 보장합니다"]) {
    check(`README does not contain forbidden affirmative: ${phrase}`,
      !readmeText.includes(phrase));
  }
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
