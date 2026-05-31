import { Router } from "express";
import { ZodError, z } from "zod";
import { autoPipeline } from "../services/pipeline/AutoPipeline.js";
import { DISCOVERY_MODES } from "../types/candidate.js";
import { traceLogger } from "../services/trace/TraceLogger.js";

export const pipelineRouter = Router();

const SAFETY_NOTICE =
  "AutoPipeline 은 발굴→분석→검수 대기열 적재까지만 자동화합니다. 외부 신고기관 자동 제출은 수행하지 않으며, 모든 케이스는 사람 검수 대기(human_review_required) 에서 멈춥니다.";

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

const RunBodySchema = z.object({
  moduleId: z.string().max(80).optional(),
  topics: z.array(z.string().max(80)).max(50).optional(),
  mode: z.enum(DISCOVERY_MODES).optional(),
  sources: z.array(z.enum(["mock", "naver", "openai_web_search", "rss", "manual"])).max(10).optional(),
  maxCandidates: z.number().int().positive().max(200).optional(),
  reason: z.string().max(200).optional()
});

// POST /api/pipeline/run — 1회 실행 (발굴 → 중복제거 → 분석 → 신뢰도 라우팅 → 검수 대기열 적재).
// UI 대시보드 "지금 한 바퀴 돌리기" 버튼과 연결.
pipelineRouter.post("/run", async (req, res) => {
  try {
    const input = RunBodySchema.parse(req.body ?? {});
    const traceId = req.traceContext?.traceId;

    const result = await autoPipeline.run({
      moduleId: input.moduleId,
      topics: input.topics,
      mode: input.mode,
      sourceTypes: input.sources,
      maxCandidates: input.maxCandidates,
      reason: `manual:${input.reason ?? "ad-hoc"}`
    });

    void traceLogger.log({
      eventType: "human_action",
      severity: "info",
      traceId,
      runId: result.runId,
      moduleId: result.moduleId,
      agentName: "AutoPipeline",
      actor: "anonymous",
      message: "수동 트리거: 파이프라인 1회 실행",
      meta: {
        autoReviewQueued: result.pipeline.autoReviewQueued,
        needsTriageQueued: result.pipeline.needsTriageQueued,
        autoSubmitted: false
      }
    });

    res.json({
      ok: true,
      ...result,
      message: "파이프라인 1회 실행 완료. 高위험·高신뢰도 후보는 검수 대기열에 적재되었고, 외부 신고 자동 제출은 수행되지 않았습니다.",
      notLegalConclusion: true,
      autoReport: false,
      humanReviewRequired: true,
      safetyNotice: SAFETY_NOTICE
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    res.status(500).json({ ok: false, error: "PIPELINE_RUN_FAILED", message: (error as Error).message });
  }
});
