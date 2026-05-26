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
