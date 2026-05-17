import { Router } from "express";
import { ZodError, z } from "zod";
import { ruleAgent } from "../agents/RuleAgent.js";
import { getKeywordConfigSummary } from "../modules/false-ad/keywordLoader.js";

export const rulesRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

// GET /api/rules/false_ad — 룰셋 메타(설정+요약) 공개. rules는 keyword/regex 표시 정보만.
rulesRouter.get("/:moduleId", (req, res) => {
  const { moduleId } = req.params;
  if (moduleId !== "false_ad") {
    return res.status(404).json({
      ok: false,
      error: "MODULE_NOT_FOUND",
      message: `Rule set not available for moduleId: ${moduleId}`
    });
  }
  const config = ruleAgent.getConfig();
  res.json({
    ok: true,
    moduleId,
    summary: getKeywordConfigSummary(config),
    config: {
      schemaVersion: config.schemaVersion,
      moduleId: config.moduleId,
      category: config.category,
      lastReviewedAt: config.lastReviewedAt,
      disclaimer: config.disclaimer,
      riskWeights: config.riskWeights,
      diseaseTerms: config.diseaseTerms,
      actionTerms: config.actionTerms,
      exaggerationTerms: config.exaggerationTerms,
      productTerms: config.productTerms,
      rules: config.rules.map((r) => ({
        id: r.id,
        keyword: r.keyword,
        riskLevel: r.riskLevel,
        weight: r.weight,
        category: r.category,
        reason: r.reason,
        examples: r.examples ?? [],
        matchType: r.matchType,
        pattern: r.pattern
      }))
    },
    safetyNotice:
      "이 룰셋은 의심 후보 탐지용 보조 자료이며, 법 위반 여부를 확정하지 않습니다."
  });
});

export { rulesRouter as default };

// ===========================================================
// POST /api/detect/rules — 텍스트(또는 sections) 입력에 대한 탐지 실행
// ===========================================================

export const detectRouter = Router();

const DetectBodySchema = z
  .object({
    moduleId: z.string().default("false_ad"),
    text: z.string().max(200_000).optional(),
    claimCandidates: z.array(z.string()).max(200).optional(),
    reviewCandidates: z.array(z.string()).max(200).optional(),
    mainText: z.string().max(200_000).optional()
  })
  .refine(
    (v) =>
      (v.text && v.text.length > 0) ||
      (v.claimCandidates && v.claimCandidates.length > 0) ||
      (v.reviewCandidates && v.reviewCandidates.length > 0) ||
      (v.mainText && v.mainText.length > 0),
    { message: "text 또는 claimCandidates/reviewCandidates/mainText 중 하나는 비어 있지 않아야 합니다." }
  );

detectRouter.post("/rules", (req, res) => {
  try {
    const input = DetectBodySchema.parse(req.body);
    if (input.moduleId !== "false_ad") {
      return res.status(404).json({
        ok: false,
        error: "MODULE_NOT_FOUND",
        message: `Rule set not available for moduleId: ${input.moduleId}`
      });
    }
    const result = ruleAgent.detectDetailed({
      text: input.text,
      claimCandidates: input.claimCandidates,
      reviewCandidates: input.reviewCandidates,
      mainText: input.mainText
    });
    res.json({
      ok: true,
      moduleId: input.moduleId,
      ruleDetection: result,
      matches: result.matches,
      highlightedSegments: result.highlightedSegments,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      counts: result.counts,
      safetyNotice: result.safetyNotice,
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
      error: "DETECT_FAILED",
      message: (error as Error).message
    });
  }
});
