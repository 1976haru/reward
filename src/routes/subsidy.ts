import { Router } from "express";
import { ZodError, z } from "zod";
import { readJson } from "../utils/fs.js";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import {
  runSubsidyRiskRules,
  writeSubsidyRiskRun,
  SUBSIDY_RISK_RULES_NOTICE
} from "../rules/subsidyRiskRules.js";
import { buildSubsidyRiskDemoRecords } from "../rules/subsidyRiskDemoData.js";
import type { SubsidyRiskInputRecord } from "../types/subsidyRisk.js";
import {
  generateRiskScoreReport,
  writeRiskScoreReport,
  RISK_SCORE_MODEL_NOTICE
} from "../scoring/riskScoreModel.js";
import {
  generateRewardPossibilityScoreReport,
  writeRewardPossibilityScoreReport,
  REWARD_POSSIBILITY_SCORE_NOTICE
} from "../scoring/rewardPossibilityScore.js";
import {
  generateLlmExplanationReport,
  writeLlmExplanationReport,
  LLM_EXPLANATION_NOTICE
} from "../analysis/llmExplanationAnalysis.js";
import {
  runSubsidyPreReportFactCheck,
  generateSubsidyFactCheckReport,
  writeSubsidyFactCheckReport,
  SUBSIDY_FACT_CHECK_NOTICE
} from "../policy/subsidyPreReportChecklist.js";
import type { SubsidyFactCheckInput } from "../types/subsidyFactCheck.js";
import {
  generateSubsidyReportDraft,
  writeSubsidyReportDraft,
  SUBSIDY_REPORT_DRAFT_NOTICE
} from "../reports/subsidyReportDraft.js";
import type { SubsidyReportDraftInput } from "../types/subsidyReportDraft.js";
import {
  analyzeSubsidySample,
  buildSubsidyReportMarkdown,
  getSubsidyCandidate,
  loadSubsidySampleDataSync,
  SUBSIDY_FRAUD_SAFETY_NOTICE
} from "../modules/subsidy-fraud/index.js";
import { withAgentTrace } from "../services/trace/TraceContext.js";
import {
  buildSubsidyEngineDemo,
  getSubsidyEngineStatus,
  SUBSIDY_DEMO_SAFETY_NOTICE
} from "../services/subsidyEngineDemo.js";

export const subsidyRouter = Router();

// GET /api/subsidy/demo-status — 보조금 탐지 엔진 현황 패널 (계산 없이 현황만)
subsidyRouter.get("/demo-status", (_req, res) => {
  try {
    res.json({
      ok: true,
      engineStatus: getSubsidyEngineStatus(),
      isFixtureBased: true,
      autoReport: false,
      humanReviewRequired: true,
      safetyNotice: SUBSIDY_DEMO_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});

// GET /api/subsidy/run-demo — fixture 기반으로 룰/점수/AI분석/근거검증 결과를 묶어 반환
// 실제 외부 API / 실제 LLM API 미호출. 자동 신고 없음.
subsidyRouter.get("/run-demo", (_req, res) => {
  try {
    const result = buildSubsidyEngineDemo();
    res.json({
      ok: true,
      ...result,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}
function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

// GET /api/subsidy/sources — 공식 소스 + 금지 소스 안내
subsidyRouter.get("/sources", async (_req, res) => {
  try {
    const sources = await readJson<unknown>(
      path.join(process.cwd(), "src/modules/subsidy-fraud/sources.json")
    );
    res.json({
      ok: true,
      sources,
      safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/risk-signals — 리스크 신호 사전
subsidyRouter.get("/risk-signals", async (_req, res) => {
  try {
    const signals = await readJson<unknown>(
      path.join(process.cwd(), "src/modules/subsidy-fraud/risk_signals.json")
    );
    res.json({ ok: true, ...(signals as object), safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/agency-config — 신고처 후보
subsidyRouter.get("/agency-config", async (_req, res) => {
  try {
    const cfg = await readJson<unknown>(
      path.join(process.cwd(), "src/modules/subsidy-fraud/agency_config.json")
    );
    res.json({ ok: true, agencyConfig: cfg, safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/sample — 합성 sample 데이터 (개인정보 단정 위험 없음 안내)
subsidyRouter.get("/sample", (_req, res) => {
  try {
    const sample = loadSubsidySampleDataSync();
    res.json({
      ok: true,
      pilotRegion: sample.pilotRegion,
      pilotRegionId: sample.pilotRegionId,
      synthetic: sample.synthetic,
      disclaimer: sample.disclaimer,
      publicDataPortalNotes: sample.publicDataPortalNotes ?? [],
      records: sample.records,
      total: sample.records.length,
      safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

const AnalyzeRequestSchema = z.object({
  region: z.string().max(40).optional(),
  regionId: z.string().max(40).optional(),
  useSampleData: z.boolean().optional()
});

// POST /api/subsidy/analyze — sample 기반 분석 실행
subsidyRouter.post("/analyze", async (req, res) => {
  try {
    const body = AnalyzeRequestSchema.parse(req.body ?? {});
    const regionId = body.regionId ?? body.region ?? "dangjin";
    // 프로토타입 단계에서는 useSampleData 가 false 이면 명시적으로 거부 (외부 API 호출 금지)
    if (body.useSampleData === false) {
      return res.status(400).json(errorBody(
        "PROTOTYPE_ONLY_SAMPLE",
        "이번 단계에서는 useSampleData=true 만 지원합니다. 외부 API 호출은 수행하지 않습니다."
      ));
    }
    const traced = await withAgentTrace(
      {
        agentName: "SubsidyAnalyzer",
        moduleId: "subsidy_fraud",
        traceId: req.traceContext?.traceId,
        inputSummary: { regionId, useSampleData: true }
      },
      () => analyzeSubsidySample({ regionId, useSampleData: true })
    );
    const result = traced.result;
    res.json({
      ok: true,
      ...result,
      message: "프로토타입 sample 기반 분석 결과입니다. 부정수급 확정이 아니며, 공식기관 확인이 필요합니다.",
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/subsidy/candidates/:recordId/report — 후보 리포트 초안 생성
subsidyRouter.post("/candidates/:recordId/report", (req, res) => {
  const recordId = req.params.recordId;
  if (!/^[A-Za-z0-9_\-]{1,64}$/.test(recordId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid recordId: ${recordId}`));
  }
  try {
    const candidate = getSubsidyCandidate(recordId);
    if (!candidate) {
      return res.status(404).json(errorBody("CANDIDATE_NOT_FOUND", `Subsidy candidate not found: ${recordId}`));
    }
    const markdown = buildSubsidyReportMarkdown(candidate);
    res.json({
      ok: true,
      candidate,
      report: {
        markdown,
        format: "markdown"
      },
      message: "프로토타입 보조금 후보 리포트 초안입니다. 자동 신고서가 아니며 사람이 검토·수정 후 공식 신고 창구에 직접 제출해야 합니다.",
      safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/candidates/:recordId/report — convenience (GET 도 지원)
subsidyRouter.get("/candidates/:recordId/report", (req, res) => {
  const recordId = req.params.recordId;
  if (!/^[A-Za-z0-9_\-]{1,64}$/.test(recordId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid recordId: ${recordId}`));
  }
  try {
    const candidate = getSubsidyCandidate(recordId);
    if (!candidate) {
      return res.status(404).json(errorBody("CANDIDATE_NOT_FOUND", `Subsidy candidate not found: ${recordId}`));
    }
    const markdown = buildSubsidyReportMarkdown(candidate);
    res.json({
      ok: true,
      candidate,
      report: { markdown, format: "markdown" },
      safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ---------- 보조금 룰 5종 통합 실행 (체크리스트 60) ----------

const RISK_RULES_OUTPUT_DIR = process.env.RISK_RULES_OUTPUT_DIR ?? "data/risk";

const RiskInputRecordSchema = z.object({
  recordId: z.string().min(1).max(128),
  fiscalYear: z.number().int().optional(),
  projectName: z.string().max(300).optional(),
  projectNameCompactKey: z.string().max(300).optional(),
  recipientName: z.string().max(200).optional(),
  normalizedRecipientName: z.string().max(200).optional(),
  addressRegionKey: z.string().max(200).optional(),
  normalizedAddressKey: z.string().max(200).optional(),
  subsidyAmount: z.number().optional(),
  executionAmount: z.number().optional(),
  settlementAmount: z.number().optional(),
  hasResultReport: z.boolean().optional(),
  resultEvidenceUrl: z.string().max(500).optional(),
  publicListingUrl: z.string().max(500).optional(),
  sourceFileName: z.string().max(200).optional(),
  localGovName: z.string().max(120).optional()
});
const RiskRulesRunSchema = z.object({
  // records 미지정 시 합성 데모 레코드(fixture)로 실행한다. 외부 API/실데이터 호출 없음.
  records: z.array(RiskInputRecordSchema).max(5000).optional()
});

function topCandidateSummary(result: ReturnType<typeof runSubsidyRiskRules>) {
  return result.topCandidates.slice(0, result.topN).map((c, i) => ({
    rank: i + 1,
    candidateKey: c.candidateKey,
    ruleHits: c.ruleHits,
    ruleHitCount: c.ruleHitCount,
    highSeverityCount: c.highSeverityCount,
    ruleBasedScore: c.ruleBasedScore,
    reasonSummary: c.reasonSummary,
    involvedRecordCount: c.involvedRecordIds.length,
    reviewRequired: c.reviewRequired,
    notLegalConclusion: c.notLegalConclusion
  }));
}

// POST /api/subsidy/risk/rules/run — 보조금 룰 5종 실행 + TOP 50 후보 요약 반환
// records 미지정 시 합성 데모로 실행. 외부 API/실데이터 호출·자동 신고 없음. 결과는 사람 검토 필요 후보.
subsidyRouter.post("/risk/rules/run", async (req, res) => {
  try {
    const body = RiskRulesRunSchema.parse(req.body ?? {});
    const usingDemo = !body.records || body.records.length === 0;
    const records: SubsidyRiskInputRecord[] = usingDemo
      ? buildSubsidyRiskDemoRecords()
      : (body.records as SubsidyRiskInputRecord[]);
    const inputMode = usingDemo ? "api-demo-synthetic" : `api-input:${records.length}`;

    const result = runSubsidyRiskRules(records, { inputMode, isRealData: false });
    const written = await writeSubsidyRiskRun(RISK_RULES_OUTPUT_DIR, result);

    res.json({
      ok: true,
      runId: result.runId,
      ranAt: result.ranAt,
      inputMode: result.inputMode,
      isRealData: result.isRealData,
      totalRecords: result.totalRecords,
      totalRuleResults: result.totalRuleResults,
      ruleCounts: result.ruleCounts,
      topN: result.topN,
      topCandidates: topCandidateSummary(result),
      outputDir: written.runDir,
      humanReviewNotice: "본 결과는 사람 검토가 필요한 후보입니다. 부정수급/위법 확정이 아니며 자동 신고는 없습니다.",
      safetyNotice: SUBSIDY_RISK_RULES_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/risk/runs/latest — 가장 최근 실행의 TOP 50 후보 요약 반환
subsidyRouter.get("/risk/runs/latest", async (_req, res) => {
  try {
    const runsRoot = path.join(process.cwd(), RISK_RULES_OUTPUT_DIR, "runs");
    let entries: string[] = [];
    try {
      entries = (await readdir(runsRoot, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      entries = [];
    }
    if (entries.length === 0) {
      return res.status(404).json(
        errorBody(
          "NO_RUN_FOUND",
          "실행 기록이 없습니다. 먼저 `npm run risk:rules` 또는 POST /api/subsidy/risk/rules/run 으로 실행하세요."
        )
      );
    }
    const latest = entries[entries.length - 1];
    const runDir = path.join(runsRoot, latest);
    const metadata = JSON.parse(await readFile(path.join(runDir, "metadata.json"), "utf8"));
    const top50 = JSON.parse(await readFile(path.join(runDir, "top50-candidates.json"), "utf8"));
    res.json({
      ok: true,
      runId: metadata.runId,
      ranAt: metadata.ranAt,
      inputMode: metadata.inputMode,
      isRealData: metadata.isRealData,
      totalRecords: metadata.totalRecords,
      totalRuleResults: metadata.totalRuleResults,
      ruleCounts: metadata.ruleCounts,
      topN: top50.topN,
      topCandidates: top50.topCandidates,
      humanReviewNotice: "본 결과는 사람 검토가 필요한 후보입니다. 부정수급/위법 확정이 아니며 자동 신고는 없습니다.",
      safetyNotice: metadata.safetyNotice ?? SUBSIDY_RISK_RULES_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ---------- 100점 위험점수 / 보상가능성 점수 (체크리스트 61~62) ----------

const RISK_SCORE_OUTPUT_DIR = process.env.RISK_SCORE_OUTPUT_DIR ?? "data/risk/score";
const REWARD_SCORE_OUTPUT_DIR = process.env.REWARD_SCORE_OUTPUT_DIR ?? "data/reward-score";

// 모든 점수 API 응답에 공통으로 들어가는 안내 문구.
const SCORE_DISCLAIMER = {
  notFraudConclusion: "부정수급으로 단정하지 않음(확정 아님)",
  rewardNotGuaranteed: "포상금 지급을 보장하지 않음",
  humanReviewRequired: "사람 검토 필요"
};

const ScoreRunSchema = z.object({
  inputMode: z.enum(["fixture"]).optional(), // 현재는 fixture(합성 데모)만 지원 — 외부 호출 없음
  topN: z.number().int().min(1).max(200).optional()
});

/** 합성 데모 레코드 → 룰 5종 결과(SubsidyRiskRuleResult[])를 점수 모델 입력으로 만든다. */
function demoRuleResults() {
  return runSubsidyRiskRules(buildSubsidyRiskDemoRecords(), {
    inputMode: "api-demo-synthetic",
    isRealData: false
  }).ruleResults;
}

async function findLatestRunDir(baseDir: string): Promise<string | undefined> {
  const runsRoot = path.join(process.cwd(), baseDir, "runs");
  try {
    const entries = (await readdir(runsRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (entries.length === 0) return undefined;
    return path.join(runsRoot, entries[entries.length - 1]);
  } catch {
    return undefined;
  }
}

// POST /api/subsidy/risk/score/run — 룰 5종 결과(합성 데모) → 100점 위험점수 TOP N
subsidyRouter.post("/risk/score/run", async (req, res) => {
  try {
    const body = ScoreRunSchema.parse(req.body ?? {});
    const topN = body.topN ?? 50;
    const report = generateRiskScoreReport(demoRuleResults(), {
      isFixtureBased: true,
      sourceNote: "api-demo-subsidy-rules",
      limit: topN
    });
    await writeRiskScoreReport(RISK_SCORE_OUTPUT_DIR, report);
    res.json({
      ok: true,
      runId: report.runId,
      inputMode: "fixture",
      totalInputCandidates: report.totalInputCandidates,
      totalScoredSubjects: report.totalScoredSubjects,
      gradeSummary: report.gradeSummary,
      topN,
      topScores: report.topScores,
      reviewRequired: true,
      notLegalConclusion: true,
      disclaimer: SCORE_DISCLAIMER,
      humanReviewNotice: "부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다 — 우선 검토 후보 정렬용 참고 점수입니다.",
      safetyNotice: RISK_SCORE_MODEL_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/risk/score/latest — 최근 위험점수 실행 결과
subsidyRouter.get("/risk/score/latest", async (_req, res) => {
  try {
    const runDir = await findLatestRunDir(RISK_SCORE_OUTPUT_DIR);
    if (!runDir) {
      return res.status(404).json(
        errorBody("NO_RUN_FOUND", "위험점수 실행 기록이 없습니다. 먼저 POST /api/subsidy/risk/score/run 또는 `npm run risk:score -- --fixture 1000` 을 실행하세요.")
      );
    }
    const report = JSON.parse(await readFile(path.join(runDir, "risk-score-report.json"), "utf8"));
    res.json({
      ok: true,
      runId: report.runId,
      createdAt: report.createdAt,
      gradeSummary: report.gradeSummary,
      topScores: report.topScores,
      reviewRequired: true,
      notLegalConclusion: true,
      disclaimer: SCORE_DISCLAIMER,
      humanReviewNotice: "부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다.",
      safetyNotice: RISK_SCORE_MODEL_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/subsidy/reward-score/run — 룰 5종 결과(합성 데모) → 보상가능성 점수 TOP N
subsidyRouter.post("/reward-score/run", async (req, res) => {
  try {
    const body = ScoreRunSchema.parse(req.body ?? {});
    const topN = body.topN ?? 50;
    const report = generateRewardPossibilityScoreReport(demoRuleResults(), {
      isFixtureBased: true,
      sourceNote: "api-demo-subsidy-rules",
      limit: topN
    });
    await writeRewardPossibilityScoreReport(REWARD_SCORE_OUTPUT_DIR, report);
    res.json({
      ok: true,
      runId: report.runId,
      inputMode: "fixture",
      totalInputCandidates: report.totalInputCandidates,
      totalScoredSubjects: report.totalScoredSubjects,
      levelSummary: report.levelSummary,
      topN,
      topScores: report.topScores,
      rewardGuaranteed: false,
      reviewRequired: true,
      notLegalConclusion: true,
      disclaimer: SCORE_DISCLAIMER,
      humanReviewNotice: "부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다 — 보상/포상 가능성 검토 우선순위 참고 점수입니다.",
      safetyNotice: REWARD_POSSIBILITY_SCORE_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/reward-score/latest — 최근 보상가능성 점수 실행 결과
subsidyRouter.get("/reward-score/latest", async (_req, res) => {
  try {
    const runDir = await findLatestRunDir(REWARD_SCORE_OUTPUT_DIR);
    if (!runDir) {
      return res.status(404).json(
        errorBody("NO_RUN_FOUND", "보상가능성 점수 실행 기록이 없습니다. 먼저 POST /api/subsidy/reward-score/run 또는 `npm run reward:score -- --fixture 1000` 을 실행하세요.")
      );
    }
    const report = JSON.parse(await readFile(path.join(runDir, "reward-possibility-score-report.json"), "utf8"));
    res.json({
      ok: true,
      runId: report.runId,
      createdAt: report.createdAt,
      levelSummary: report.levelSummary,
      topScores: report.topScores,
      rewardGuaranteed: false,
      reviewRequired: true,
      notLegalConclusion: true,
      disclaimer: SCORE_DISCLAIMER,
      humanReviewNotice: "부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다.",
      safetyNotice: REWARD_POSSIBILITY_SCORE_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ---------- LLM 설명형 분석 (체크리스트 63) ----------

const EXPLAIN_OUTPUT_DIR = process.env.ANALYSIS_OUTPUT_DIR ?? "data/analysis/llm-explanation";

// POST /api/subsidy/analysis/explain/run — 합성 데모(룰 5종 → 위험점수) → 설명형 분석
// deterministic fallback 분석기만 사용하며 실제 LLM API를 호출하지 않는다.
subsidyRouter.post("/analysis/explain/run", async (req, res) => {
  try {
    const body = ScoreRunSchema.parse(req.body ?? {});
    const topN = body.topN ?? 50;
    // 룰 5종 결과 → 위험점수 결과 → 설명형 분석 입력으로 사용.
    const risk = generateRiskScoreReport(demoRuleResults(), { isFixtureBased: true, limit: topN });
    const report = generateLlmExplanationReport(risk.topScores, {
      isFixtureBased: true,
      sourceNote: "api-demo-risk-score",
      limit: topN
    });
    const written = await writeLlmExplanationReport(EXPLAIN_OUTPUT_DIR, report);
    res.json({
      ok: true,
      runId: report.runId,
      inputMode: "fixture",
      deterministicFallbackOnly: true,
      llmApiCalled: false,
      totalInputCandidates: report.totalInputCandidates,
      totalExplanations: report.totalExplanations,
      explanations: report.explanations,
      reviewRequired: true,
      notLegalConclusion: true,
      rewardGuaranteed: false,
      citationValidation: {
        status: written.citationValidation.status,
        strictPassed: written.citationValidation.strictPassed,
        unsupportedClaims: written.citationValidation.unsupportedClaims
      },
      disclaimer: SCORE_DISCLAIMER,
      humanReviewNotice: "설명형 분석은 공개자료 기준 검토 보조 의견입니다. 부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다.",
      safetyNotice: LLM_EXPLANATION_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/analysis/explain/latest — 최근 설명형 분석 결과
subsidyRouter.get("/analysis/explain/latest", async (_req, res) => {
  try {
    const runDir = await findLatestRunDir(EXPLAIN_OUTPUT_DIR);
    if (!runDir) {
      return res.status(404).json(
        errorBody("NO_RUN_FOUND", "설명형 분석 실행 기록이 없습니다. 먼저 POST /api/subsidy/analysis/explain/run 또는 `npm run analysis:llm-explain -- --fixture 100` 을 실행하세요.")
      );
    }
    const report = JSON.parse(await readFile(path.join(runDir, "llm-explanation-report.json"), "utf8"));
    res.json({
      ok: true,
      runId: report.runId,
      createdAt: report.createdAt,
      deterministicFallbackOnly: true,
      llmApiCalled: false,
      totalExplanations: report.totalExplanations,
      explanations: report.explanations,
      reviewRequired: true,
      notLegalConclusion: true,
      rewardGuaranteed: false,
      disclaimer: SCORE_DISCLAIMER,
      humanReviewNotice: "설명형 분석은 공개자료 기준 검토 보조 의견입니다. 부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다.",
      safetyNotice: LLM_EXPLANATION_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ---------- 신고 전 사실점검 11항목 (체크리스트 65) ----------

const FACT_CHECK_OUTPUT_DIR = process.env.FACT_CHECK_OUTPUT_DIR ?? "data/fact-check";

/** API 데모용 합성 Case (개인정보 원문 없음). 초안 가능 1건 + 차단 1건. */
function buildDemoFactCheckCases(): SubsidyFactCheckInput[] {
  return [
    {
      candidateId: "demo-ready-001",
      evidenceIsPublic: true,
      sourceUrl: "https://example.org/notice/1",
      sourceFileName: "subsidy_2024.csv",
      sourceRowNumber: 12,
      collectedAt: "2026-05-01T00:00:00.000Z",
      normalizedRecipientName: "정상검토대상협회",
      normalizedProjectName: "청년지원사업",
      amount: 30_000_000,
      fiscalYear: 2024,
      agencyName: "가상시청",
      ruleHits: ["repeat_recipient", "similar_project_repeat"],
      finalRiskScore: 72,
      rewardPossibilityScore: 55,
      explanation: {
        summary: "공개자료 기준 검토 후보 설명.",
        whyFlagged: ["반복수급 검토 후보"],
        keyEvidence: ["공시URL:https://example.org/notice/1"],
        additionalChecks: ["동일 기관 여부 확인"]
      },
      citationStrictPassed: true,
      privacyScanPassed: true,
      reviewerName: "검토자A",
      reviewStatus: "approved",
      reviewMemo: "공개자료 근거 확인 후 승인",
      isFixtureBased: true
    },
    {
      candidateId: "demo-blocked-002",
      hasLoginRequiredSource: true,
      normalizedProjectName: "사업명만 있음",
      citationStrictPassed: false,
      privacyScanPassed: false,
      isFixtureBased: true
    }
  ];
}

const FactCheckRunSchema = z.object({
  cases: z.array(z.any()).max(500).optional()
});

const FACT_CHECK_HUMAN_REVIEW_NOTICE =
  "이 점검은 신고서 초안 생성 전 안전 확인 단계입니다. 부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다.";

// POST /api/subsidy/fact-check/run — 11항목 점검 (cases 미지정 시 합성 데모)
subsidyRouter.post("/fact-check/run", async (req, res) => {
  try {
    const body = FactCheckRunSchema.parse(req.body ?? {});
    const usingDemo = !body.cases || body.cases.length === 0;
    const cases = usingDemo ? buildDemoFactCheckCases() : (body.cases as SubsidyFactCheckInput[]);
    const report = generateSubsidyFactCheckReport(cases, {
      isFixtureBased: usingDemo,
      sourceNote: usingDemo ? "api-demo-synthetic" : "api-input"
    });
    await writeSubsidyFactCheckReport(FACT_CHECK_OUTPUT_DIR, report);
    res.json({
      ok: true,
      runId: report.runId,
      totalCases: report.totalCases,
      canGenerateCount: report.canGenerateCount,
      overallSummary: report.overallSummary,
      results: report.results,
      reviewRequired: true,
      notLegalConclusion: true,
      autoSubmitAvailable: false,
      rewardGuaranteed: false,
      humanReviewNotice: FACT_CHECK_HUMAN_REVIEW_NOTICE,
      safetyNotice: SUBSIDY_FACT_CHECK_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/fact-check/latest — 최근 사실점검 결과
subsidyRouter.get("/fact-check/latest", async (_req, res) => {
  try {
    const runDir = await findLatestRunDir(FACT_CHECK_OUTPUT_DIR);
    if (!runDir) {
      return res.status(404).json(
        errorBody("NO_RUN_FOUND", "사실점검 실행 기록이 없습니다. 먼저 POST /api/subsidy/fact-check/run 또는 `npm run subsidy:fact-check -- --fixture` 을 실행하세요.")
      );
    }
    const report = JSON.parse(await readFile(path.join(runDir, "fact-check-report.json"), "utf8"));
    res.json({
      ok: true,
      runId: report.runId,
      createdAt: report.createdAt,
      totalCases: report.totalCases,
      canGenerateCount: report.canGenerateCount,
      overallSummary: report.overallSummary,
      results: report.results,
      reviewRequired: true,
      notLegalConclusion: true,
      autoSubmitAvailable: false,
      rewardGuaranteed: false,
      humanReviewNotice: FACT_CHECK_HUMAN_REVIEW_NOTICE,
      safetyNotice: SUBSIDY_FACT_CHECK_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/candidates/:id/fact-check — 후보 데모 11항목 점검(합성)
subsidyRouter.get("/candidates/:id/fact-check", (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9_\-:]{1,64}$/.test(id)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid id: ${id}`));
  }
  try {
    const demo = buildDemoFactCheckCases()[0];
    const result = runSubsidyPreReportFactCheck({ ...demo, candidateId: id });
    res.json({
      ok: true,
      result,
      humanReviewNotice: FACT_CHECK_HUMAN_REVIEW_NOTICE,
      safetyNotice: SUBSIDY_FACT_CHECK_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ---------- 보조금 신고서 초안 생성 (체크리스트 66) ----------

const REPORTS_OUTPUT_DIR = process.env.REPORTS_OUTPUT_DIR ?? "data/reports";

/** 초안 결과를 API 응답 형태(파일 경로 비노출)로 변환. */
function toReportDraftApi(result: ReturnType<typeof generateSubsidyReportDraft>) {
  return {
    candidateId: result.candidateId,
    caseId: result.caseId,
    moduleId: result.moduleId,
    draftCreated: result.draftCreated,
    blockedReason: result.blockedReason,
    blockedCode: result.blockedCode,
    factCheckOverallStatus: result.factCheckOverallStatus,
    canGenerateReportDraft: result.canGenerateReportDraft,
    reportFiles: result.reportFiles.map((f) => ({ name: f.name, format: f.format, mime: f.mime })),
    metadata: result.metadata,
    warnings: result.warnings,
    isDraft: true,
    humanReviewRequired: true,
    autoSubmitted: false,
    rewardGuaranteed: false,
    notLegalConclusion: true,
    humanReviewNotice:
      "신고서 초안은 실제 신고 제출이 아닙니다. 부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람이 근거와 개인정보를 다시 확인하고 공식 창구에서 직접 제출해야 합니다.",
    safetyNotice: SUBSIDY_REPORT_DRAFT_NOTICE,
    autoReport: false
  };
}

const ReportDraftRunSchema = z.object({
  cases: z.array(z.any()).max(200).optional()
});

// POST /api/subsidy/report-draft/run — 사실점검 게이트 후 신고서 초안 생성(cases 미지정 시 합성 데모)
subsidyRouter.post("/report-draft/run", async (req, res) => {
  try {
    const body = ReportDraftRunSchema.parse(req.body ?? {});
    const usingDemo = !body.cases || body.cases.length === 0;
    const cases = (usingDemo ? buildDemoFactCheckCases() : body.cases) as SubsidyReportDraftInput[];
    const drafts = [];
    for (const input of cases) {
      const result = generateSubsidyReportDraft(input);
      if (result.draftCreated) await writeSubsidyReportDraft(REPORTS_OUTPUT_DIR, result);
      drafts.push(toReportDraftApi(result));
    }
    res.json({
      ok: true,
      totalCases: cases.length,
      draftCreatedCount: drafts.filter((d) => d.draftCreated).length,
      blockedCount: drafts.filter((d) => !d.draftCreated).length,
      drafts,
      reviewRequired: true,
      autoSubmitted: false,
      rewardGuaranteed: false,
      notLegalConclusion: true,
      safetyNotice: SUBSIDY_REPORT_DRAFT_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/subsidy/candidates/:id/report-draft — 후보 데모 초안 생성 상태(게이트 적용)
subsidyRouter.get("/candidates/:id/report-draft", async (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9_\-:]{1,64}$/.test(id)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid id: ${id}`));
  }
  try {
    const demo = buildDemoFactCheckCases()[0] as SubsidyReportDraftInput;
    const result = generateSubsidyReportDraft({ ...demo, candidateId: id });
    if (result.draftCreated) await writeSubsidyReportDraft(REPORTS_OUTPUT_DIR, result);
    res.json({ ok: true, ...toReportDraftApi(result) });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
