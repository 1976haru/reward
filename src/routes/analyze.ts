import { Router } from "express";
import { ZodError, z } from "zod";
import { analyzerAgent } from "../agents/AnalyzerAgent.js";

export const analyzeRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const FindingRiskLevel = z.enum(["LOW", "MEDIUM", "HIGH", "UNCERTAIN", "VERY_HIGH", "CRITICAL", "med"]).optional();

const ExtractionResultSchema = z
  .object({
    productName: z.string().optional(),
    claimCandidates: z.array(z.string()).optional(),
    reviewCandidates: z.array(z.string()).optional(),
    mainText: z.string().optional()
  })
  .optional();

const RuleMatchSchema = z.object({
  ruleId: z.string().optional(),
  keyword: z.string().optional(),
  riskLevel: z.string().optional(),
  reason: z.string().optional(),
  sentence: z.string().optional(),
  sourceSection: z.string().optional(),
  category: z.string().optional()
});

const RuleDetectionSchema = z
  .object({
    riskScore: z.number().optional(),
    score: z.number().optional(),
    riskLevel: z.string().optional(),
    counts: z
      .object({
        HIGH: z.number().optional(),
        MEDIUM: z.number().optional(),
        LOW: z.number().optional(),
        combo: z.number().optional(),
        total: z.number().optional()
      })
      .partial()
      .optional(),
    matches: z.array(RuleMatchSchema).max(100).optional()
  })
  .optional();

const EvidenceSummarySchema = z
  .object({
    productName: z.string().optional(),
    priceCandidates: z.array(z.string()).optional(),
    hasScreenshot: z.boolean().optional(),
    hasPdf: z.boolean().optional(),
    hasHtml: z.boolean().optional(),
    hasText: z.boolean().optional(),
    captureStatus: z.record(z.string(), z.string()).optional()
  })
  .optional();

const AnalyzeLlmBodySchema = z.object({
  moduleId: z.string().default("false_ad"),
  url: z.string().optional(),
  title: z.string().max(500).optional(),
  memo: z.string().max(3000).optional(),
  extractionResult: ExtractionResultSchema,
  ruleDetectionResult: RuleDetectionSchema,
  evidenceSummary: EvidenceSummarySchema
});

analyzeRouter.post("/llm", async (req, res) => {
  try {
    const input = AnalyzeLlmBodySchema.parse(req.body);
    if (input.moduleId !== "false_ad") {
      return res.status(404).json({
        ok: false,
        error: "MODULE_NOT_FOUND",
        message: `Analyzer not available for moduleId: ${input.moduleId}`
      });
    }
    const result = await analyzerAgent.analyzeWithContext({
      moduleId: input.moduleId,
      url: input.url,
      title: input.title,
      memo: input.memo,
      extractionResult: input.extractionResult,
      ruleDetectionResult: input.ruleDetectionResult,
      evidenceSummary: input.evidenceSummary
    });
    res.json({
      ok: true,
      moduleId: input.moduleId,
      result,
      mode: analyzerAgent.isMockMode() ? "mock" : "llm",
      safetyNotice:
        "AI 분석 결과는 법 위반 확정이 아니며, 신고 전 사람이 공식 기준과 증거를 검토해야 합니다.",
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        message: zodErrorMessage(error)
      });
    }
    res.status(500).json({
      ok: false,
      error: "ANALYZE_LLM_FAILED",
      message: (error as Error).message
    });
  }
});
