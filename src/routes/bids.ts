import { Router } from "express";
import path from "node:path";
import { ZodError, z } from "zod";
import { readJson } from "../utils/fs.js";
import {
  analyzeBidDataset,
  buildBidCollusionReportMarkdown,
  getRiskGroupById,
  loadBidSampleData,
  BID_COLLUSION_SAFETY_NOTICE
} from "../modules/bid-collusion/index.js";

export const bidsRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}
function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

// GET /api/bids/sources — 공식 + 시범 + 금지 소스
bidsRouter.get("/sources", async (_req, res) => {
  try {
    const sources = await readJson<unknown>(
      path.join(process.cwd(), "src/modules/bid-collusion/sources.json")
    );
    res.json({
      ok: true,
      sources,
      safetyNotice: BID_COLLUSION_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/bids/risk-signals — 리스크 신호 사전
bidsRouter.get("/risk-signals", async (_req, res) => {
  try {
    const signals = await readJson<unknown>(
      path.join(process.cwd(), "src/modules/bid-collusion/risk_signals.json")
    );
    res.json({ ok: true, ...(signals as object), safetyNotice: BID_COLLUSION_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/bids/agency-config — 신고처 후보
bidsRouter.get("/agency-config", async (_req, res) => {
  try {
    const cfg = await readJson<unknown>(
      path.join(process.cwd(), "src/modules/bid-collusion/agency_config.json")
    );
    res.json({ ok: true, agencyConfig: cfg, safetyNotice: BID_COLLUSION_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/bids/sample — 합성 sample 데이터
bidsRouter.get("/sample", (_req, res) => {
  try {
    const sample = loadBidSampleData();
    res.json({
      ok: true,
      isSyntheticSample: sample.isSyntheticSample,
      disclaimer: sample.disclaimer,
      categories: sample.categories ?? [],
      bidders: sample.bidders,
      bids: sample.bids,
      total: sample.bids.length,
      safetyNotice: BID_COLLUSION_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

const AnalyzeSchema = z.object({
  useSampleData: z.boolean().optional(),
  category: z.string().max(40).optional(),
  minGroupRepeats: z.number().int().min(1).max(20).optional()
});

// POST /api/bids/analyze — sample 기반 패턴 분석
bidsRouter.post("/analyze", (req, res) => {
  try {
    const body = AnalyzeSchema.parse(req.body ?? {});
    if (body.useSampleData === false) {
      return res.status(400).json(errorBody(
        "PROTOTYPE_ONLY_SAMPLE",
        "이번 단계에서는 useSampleData=true 만 지원합니다. 외부 API 호출은 수행하지 않습니다."
      ));
    }
    const result = analyzeBidDataset({
      useSampleData: true,
      category: body.category,
      minGroupRepeats: body.minGroupRepeats
    });
    res.json({
      ok: true,
      ...result,
      message: "프로토타입 sample 기반 패턴 분석 결과입니다. 담합 확정이 아니며, 관계기관 확인이 필요합니다.",
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

// POST /api/bids/groups/:groupId/report — 위험 업체군 리포트 초안 (마크다운)
bidsRouter.post("/groups/:groupId/report", (req, res) => {
  const groupId = req.params.groupId;
  if (!/^[A-Za-z0-9_\-|]{1,128}$/.test(groupId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid groupId: ${groupId}`));
  }
  try {
    const group = getRiskGroupById(groupId);
    if (!group) {
      return res.status(404).json(errorBody("RISK_GROUP_NOT_FOUND", `Risk group not found: ${groupId}`));
    }
    const markdown = buildBidCollusionReportMarkdown(group);
    res.json({
      ok: true,
      group,
      report: { markdown, format: "markdown" },
      message: "프로토타입 입찰담합 의심 패턴 리포트 초안입니다. 자동 신고서가 아니며 사람이 검토·수정 후 공식 신고 창구에 직접 제출해야 합니다.",
      safetyNotice: BID_COLLUSION_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET convenience
bidsRouter.get("/groups/:groupId/report", (req, res) => {
  const groupId = req.params.groupId;
  if (!/^[A-Za-z0-9_\-|]{1,128}$/.test(groupId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid groupId: ${groupId}`));
  }
  try {
    const group = getRiskGroupById(groupId);
    if (!group) {
      return res.status(404).json(errorBody("RISK_GROUP_NOT_FOUND", `Risk group not found: ${groupId}`));
    }
    const markdown = buildBidCollusionReportMarkdown(group);
    res.json({
      ok: true,
      group,
      report: { markdown, format: "markdown" },
      safetyNotice: BID_COLLUSION_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
