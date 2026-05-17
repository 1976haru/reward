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

extractRouter.post("/", (req, res) => {
  try {
    const input = ExtractBodySchema.parse(req.body);
    const result = textExtractor.extract(input.html, {
      url: input.url,
      title: input.title,
      moduleId: input.moduleId
    });
    res.json({
      ok: true,
      moduleId: input.moduleId,
      result,
      safetyNotice:
        "추출 결과는 신고 후보 검토용이며, 법 위반 판단을 확정하지 않습니다. 외부 신고는 사람이 직접 수행합니다.",
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    const message = (error as Error).message;
    if (/exceeds maximum size/i.test(message)) {
      return res.status(413).json({ ok: false, error: "PAYLOAD_TOO_LARGE", message });
    }
    res.status(500).json({ ok: false, error: "EXTRACT_FAILED", message });
  }
});
