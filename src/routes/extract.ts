import { Router } from "express";
import { ZodError, z } from "zod";
import { EXTRACTION_LIMITS, textExtractor } from "../services/TextExtractor.js";

export const extractRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const ExtractBodySchema = z.object({
  html: z
    .string()
    .min(1, { message: "html must be non-empty" })
    .max(EXTRACTION_LIMITS.maxHtmlBytes, {
      message: `html exceeds ${EXTRACTION_LIMITS.maxHtmlBytes} chars (approx)`
    }),
  url: z.string().optional(),
  title: z.string().max(500).optional(),
  moduleId: z.string().default("false_ad")
});

const SAFETY_NOTICE =
  "추출 결과는 신고 후보 검토용이며, 법 위반 판단을 확정하지 않습니다. 외부 신고는 사람이 직접 수행합니다.";

extractRouter.post("/", (req, res) => {
  let input: z.infer<typeof ExtractBodySchema>;
  try {
    input = ExtractBodySchema.parse(req.body);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    return res.status(400).json({ ok: false, error: "BAD_REQUEST", message: (error as Error).message });
  }

  try {
    const result = textExtractor.extract(input.html, {
      url: input.url,
      title: input.title,
      moduleId: input.moduleId
    });
    res.json({
      ok: true,
      moduleId: input.moduleId,
      // 정규화 별칭 — 카테고리별 추출 결과를 사람이 바로 읽을 수 있게 top-level 로 노출한다.
      url: input.url ?? null,
      sourceUrl: input.url ?? null,
      pageTitle: result.title ?? null,
      productNameCandidates: result.productName ? [result.productName] : [],
      claimCandidates: result.claimCandidates,
      reviewCandidates: result.reviewCandidates,
      ingredientCandidates: result.ingredientCandidates,
      usageCandidates: result.usageCandidates,
      warningCandidates: result.warningCandidates,
      sellerInfoCandidates: result.sellerCandidates,
      mainText: result.mainText,
      textLength: result.textLength,
      warnings: result.extractionWarnings,
      result,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    const message = (error as Error).message;
    if (/exceeds maximum size/i.test(message)) {
      return res.status(413).json({ ok: false, error: "PAYLOAD_TOO_LARGE", message });
    }
    // 본문 추출 실패 시 서버가 죽지 않고 실패 사유 + fallback text 를 반환한다(흐름 유지).
    const fallbackText = "[추출 안내] 본문 구조화 추출에 실패해 빈 결과로 진행합니다. 사람이 원문을 직접 확인해야 합니다.";
    res.json({
      ok: true,
      degraded: true,
      moduleId: input.moduleId,
      url: input.url ?? null,
      sourceUrl: input.url ?? null,
      pageTitle: input.title ?? null,
      productNameCandidates: [],
      claimCandidates: [],
      reviewCandidates: [],
      ingredientCandidates: [],
      usageCandidates: [],
      warningCandidates: [],
      sellerInfoCandidates: [],
      mainText: "",
      fallbackText,
      textLength: 0,
      warnings: [`extract_failed: ${message}`],
      result: null,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false
    });
  }
});
