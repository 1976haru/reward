import { Router } from "express";
import { ZodError, z } from "zod";
import { scoringAgent } from "../agents/ScoringAgent.js";
import { ruleAgent } from "../agents/RuleAgent.js";
import { buildScoreExplanation } from "../agents/scoreExplanation.js";

export const scoreRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const RuleMatchSchema = z.object({
  ruleId: z.string().optional(),
  keyword: z.string().optional(),
  riskLevel: z.string().optional(),
  matchType: z.string().optional(),
  category: z.string().optional(),
  sourceSection: z.string().optional(),
  sentence: z.string().optional()
}).passthrough();

const ScoreBodySchema = z.object({
  moduleId: z.string().default("false_ad"),
  url: z.string().optional(),
  title: z.string().max(500).optional(),
  // text 만 주면 서버가 룰 탐지를 먼저 실행해 점수를 산출한다(초보자/검증용).
  text: z.string().max(200_000).optional(),
  candidate: z.object({
    id: z.string().optional(),
    url: z.string().optional(),
    topic: z.string().optional(),
    keyword: z.string().optional(),
    source: z.string().optional(),
    discoveryMethod: z.string().optional(),
    firstScore: z.number().optional(),
    sameDomainCount: z.number().int().min(0).optional()
  }).passthrough().optional(),
  extractionResult: z.object({
    productName: z.string().optional(),
    textLength: z.number().optional(),
    priceCandidates: z.array(z.string()).optional(),
    claimCandidates: z.array(z.string()).optional(),
    reviewCandidates: z.array(z.string()).optional(),
    ingredientCandidates: z.array(z.string()).optional(),
    warningCandidates: z.array(z.string()).optional(),
    sellerCandidates: z.array(z.string()).optional(),
    extractionWarnings: z.array(z.string()).optional()
  }).passthrough().optional(),
  ruleDetectionResult: z.object({
    riskScore: z.number().optional(),
    riskLevel: z.string().optional(),
    counts: z.object({
      HIGH: z.number().optional(),
      MEDIUM: z.number().optional(),
      LOW: z.number().optional(),
      combo: z.number().optional(),
      total: z.number().optional()
    }).partial().optional(),
    matches: z.array(RuleMatchSchema).max(200).optional()
  }).passthrough().optional(),
  llmAnalysis: z.object({
    overallRisk: z.string().optional(),
    violationLikelihood: z.string().optional(),
    confidence: z.number().optional(),
    notLegalConclusion: z.boolean().optional(),
    rewardGuaranteed: z.boolean().optional()
  }).passthrough().optional(),
  evidenceSummary: z.object({
    hasUrl: z.boolean().optional(),
    hasHtml: z.boolean().optional(),
    hasText: z.boolean().optional(),
    hasScreenshot: z.boolean().optional(),
    hasPdf: z.boolean().optional(),
    hasMetadata: z.boolean().optional(),
    hasManifest: z.boolean().optional(),
    hasSha256: z.boolean().optional(),
    capturedAt: z.string().optional(),
    productName: z.string().optional(),
    priceCandidates: z.array(z.string()).optional()
  }).passthrough().optional(),
  collectorSummary: z.object({
    warnings: z.array(z.string()).optional(),
    fetchedAt: z.string().optional(),
    sourceType: z.string().optional()
  }).passthrough().optional()
});

scoreRouter.post("/", (req, res) => {
  try {
    const input = ScoreBodySchema.parse(req.body);
    if (input.moduleId !== "false_ad") {
      return res.status(404).json({
        ok: false,
        error: "MODULE_NOT_FOUND",
        message: `Scoring not available for moduleId: ${input.moduleId}`
      });
    }
    // text 만 들어오고 ruleDetectionResult 가 없으면 룰 탐지를 먼저 실행해 점수 입력을 만든다.
    let detection = undefined;
    const scoreInput = { ...input };
    if (input.text && !input.ruleDetectionResult) {
      detection = ruleAgent.detectDetailed({ text: input.text }, "false_ad");
      scoreInput.ruleDetectionResult = {
        riskScore: detection.riskScore,
        riskLevel: detection.riskLevel,
        counts: detection.counts,
        matches: detection.matches.map((m) => ({
          ruleId: m.ruleId,
          keyword: m.keyword,
          riskLevel: m.riskLevel,
          matchType: m.matchType,
          category: m.category,
          sourceSection: m.sourceSection,
          sentence: m.sentence
        }))
      };
    }

    const result = scoringAgent.computePriority(scoreInput);
    // 사람이 점수를 이해할 수 있도록 설명을 함께 제공한다(텍스트 입력 시 룰 탐지 기반 설명 포함).
    const explanation = detection ? buildScoreExplanation(detection, result) : undefined;
    res.json({
      ok: true,
      moduleId: input.moduleId,
      result,
      explanation,
      ruleDetection: detection
        ? {
            riskScore: detection.riskScore,
            riskLevel: detection.riskLevel,
            counts: detection.counts,
            repeatedPhrases: detection.repeatedPhrases,
            cooccurrence: detection.cooccurrence,
            matches: detection.matches.slice(0, 50)
          }
        : undefined,
      safetyNotice:
        "이 점수는 법 위반 확정이나 포상금 지급 가능성을 의미하지 않습니다. 사람이 먼저 검토할 후보의 우선순위를 정하기 위한 참고 점수입니다.",
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
      error: "SCORING_FAILED",
      message: (error as Error).message
    });
  }
});
