import { Router } from "express";
import { ZodError, z } from "zod";
import { readJson } from "../utils/fs.js";
import path from "node:path";
import {
  analyzeSubsidySample,
  buildSubsidyReportMarkdown,
  getSubsidyCandidate,
  loadSubsidySampleDataSync,
  SUBSIDY_FRAUD_SAFETY_NOTICE
} from "../modules/subsidy-fraud/index.js";
import { withAgentTrace } from "../services/trace/TraceContext.js";

export const subsidyRouter = Router();

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
