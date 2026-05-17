import { Router } from "express";
import { ZodError, z } from "zod";
import { canonicalizeUrl } from "../services/dedupe/UrlCanonicalizer.js";
import { dedupeEngine, DEDUPE_SAFETY_NOTICE } from "../services/dedupe/DedupeEngine.js";
import { candidateRepository } from "../repositories/CandidateRepository.js";

export const dedupeRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const errorBody = (error: string, message: string) => ({ ok: false, error, message });

// GET /api/dedupe/canonicalize?url=
dedupeRouter.get("/canonicalize", (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : "";
  if (!url) return res.status(400).json(errorBody("VALIDATION_ERROR", "url query required"));
  const r = canonicalizeUrl(url);
  res.json({
    ok: true,
    input: url,
    canonicalUrl: r.canonicalUrl,
    urlHash: r.urlHash,
    host: r.host,
    removedTrackingParams: r.removedTrackingParams,
    warning: r.warning,
    safetyNotice: DEDUPE_SAFETY_NOTICE
  });
});

// POST /api/dedupe/check — 단일 후보가 기존 candidates 와 중복인지 확인
const CheckBodySchema = z.object({
  moduleId: z.string().optional(),
  url: z.string().min(1),
  title: z.string().max(500).optional(),
  contentText: z.string().max(20000).optional()
});

dedupeRouter.post("/check", async (req, res) => {
  try {
    const input = CheckBodySchema.parse(req.body);
    const existing = await candidateRepository.list({ moduleId: input.moduleId, limit: 500 });
    const result = dedupeEngine.dedupeCandidate(
      { url: input.url, title: input.title, contentText: input.contentText, moduleId: input.moduleId },
      existing.map((c) => ({ id: c.id, url: c.url, title: c.title }))
    );
    res.json({
      ok: true,
      moduleId: input.moduleId,
      result,
      safetyNotice: DEDUPE_SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/dedupe/batch — 다수 후보 배치 dedupe
const BatchBodySchema = z.object({
  moduleId: z.string().optional(),
  candidates: z.array(z.object({
    id: z.string().optional(),
    url: z.string().min(1),
    title: z.string().max(500).optional(),
    contentText: z.string().max(20000).optional()
  })).min(1).max(500),
  includeExisting: z.boolean().optional()
});

dedupeRouter.post("/batch", async (req, res) => {
  try {
    const input = BatchBodySchema.parse(req.body);
    const existing = input.includeExisting
      ? (await candidateRepository.list({ moduleId: input.moduleId, limit: 500 })).map((c) => ({ id: c.id, url: c.url, title: c.title }))
      : [];
    const report = dedupeEngine.dedupeBatch(input.candidates, existing);
    await dedupeEngine.writeReport(report).catch(() => undefined);
    res.json({
      ok: true,
      moduleId: input.moduleId,
      report,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/dedupe/report — 최근 batch report
dedupeRouter.get("/report", async (_req, res) => {
  const r = await dedupeEngine.readLatestReport();
  res.json({
    ok: true,
    report: r,
    safetyNotice: DEDUPE_SAFETY_NOTICE,
    autoReport: false
  });
});
