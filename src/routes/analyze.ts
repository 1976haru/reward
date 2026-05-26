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

    // 분석 경로 메타 — 실제 API 호출 여부를 응답에 명시한다 (체크리스트 16).
    const analysisMode = result.analysisMode ?? (analyzerAgent.isMockMode() ? "mock" : "real");
    const usedExternalApi = result.usedExternalApi ?? false;

    // 초보자용 한국어 안내 (체크리스트 26 — fallback 메시지)
    const analysisModeMessage =
      analysisMode === "mock"
        ? "현재 Mock 모드로 동작했습니다. 실제 OpenAI API 를 호출하지 않았으며 비용이 발생하지 않습니다. (MOCK_AI=false + OPENAI_API_KEY 설정 시 실제 호출)"
        : analysisMode === "fallback"
          ? "외부 API 호출에 실패했지만 서버는 계속 동작합니다. 안전한 fallback 분석 결과를 반환했습니다. 결과는 법 위반 확정이 아니며 사람 검토가 필요합니다."
          : "실제 OpenAI API 분석 결과입니다. 결과는 법 위반 확정이 아니며 신고 전 사람이 공식 기준과 증거를 검토해야 합니다.";

    // 중립 표현 기반 요약 필드 — "의심 후보 / 검토 필요" 관점으로만 노출한다.
    const suspectedClaims = result.findings.map((f) => ({
      claim: f.issue,
      evidence: f.evidence,
      reason: f.reason,
      riskLevel: f.riskLevel, // 의심 후보 위험도(중립). 법 위반 확정 아님.
      sourceSection: f.sourceSection,
      status: "검토 필요"
    }));

    const contextReview = {
      overallRisk: result.overallRisk,
      violationLikelihood: result.violationLikelihood, // "위반 가능성(후보)" — 확정 아님
      confidence: result.confidence,
      recommendedAgency: result.recommendedAgency,
      agencyCandidates: result.agencyCandidates,
      humanReviewChecklist: result.humanReviewChecklist
    };

    // 한계/주의사항 — 누락 증거 + 안전 경고를 모아 사람 검토 판단을 돕는다.
    const limitations = [...new Set<string>([...result.missingEvidence, ...result.safetyWarnings])];

    res.json({
      ok: true,
      moduleId: input.moduleId,
      analysisMode,
      usedExternalApi,
      analysisModeMessage,
      analysisSummary: result.summary,
      summary: result.summary,
      suspectedClaims,
      contextReview,
      limitations,
      notLegalConclusion: true,
      rewardGuaranteed: false,
      humanReviewRequired: true,
      result,
      // 하위 호환: 기존 클라이언트가 참조하던 mode 필드 유지
      mode: analysisMode === "mock" ? "mock" : "llm",
      safetyNotice:
        "AI 분석 결과는 법 위반 확정이 아니며, 신고 전 사람이 공식 기준과 증거를 검토해야 합니다. 포상금 지급은 보장되지 않습니다.",
      autoReport: false
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
