import { Router } from "express";
import { ZodError, z } from "zod";
import { schedulerService } from "../services/scheduler/SchedulerService.js";
import { DISCOVERY_MODES } from "../types/candidate.js";

export const schedulerRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const RunOnceBodySchema = z.object({
  reason: z.string().max(200).optional(),
  topics: z.array(z.string().max(80)).max(50).optional(),
  sources: z.array(z.enum(["mock", "naver", "openai_web_search", "rss", "manual"])).max(10).optional(),
  maxCandidates: z.number().int().positive().max(200).optional(),
  mode: z.enum(DISCOVERY_MODES).optional()
});

schedulerRouter.get("/status", async (_req, res) => {
  const status = await schedulerService.getStatus();
  res.json(status);
});

schedulerRouter.get("/runs", async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit ?? 20) || 20, 200));
  const runs = await schedulerService.listRuns(limit);
  res.json({
    ok: true,
    runs,
    safetyNotice: "스케줄러는 후보 발굴만 수행하며 외부 신고기관에 자동 제출하지 않습니다.",
    autoReport: false
  });
});

schedulerRouter.post("/run-once", async (req, res) => {
  try {
    const input = RunOnceBodySchema.parse(req.body ?? {});
    const rec = await schedulerService.runOnce(`manual:${input.reason ?? "ad-hoc"}`, {
      topics: input.topics,
      sources: input.sources,
      mode: input.mode,
      maxCandidates: input.maxCandidates
    });
    const httpStatus = rec.status === "SKIPPED" ? 409 : rec.status === "FAILED" ? 500 : 200;
    res.status(httpStatus).json({
      ok: rec.status !== "FAILED",
      run: rec,
      message: rec.status === "SKIPPED"
        ? "이미 실행 중입니다. 잠시 후 다시 시도하세요."
        : (rec.status === "SUCCESS"
          ? "후보 발굴이 완료되었습니다. 외부 신고 자동 제출은 수행되지 않습니다."
          : `실행 실패: ${rec.error ?? "unknown"}`),
      safetyNotice: rec.safetyNotice,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});
