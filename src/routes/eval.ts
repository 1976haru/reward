import { Router } from "express";
import { ZodError, z } from "zod";
import {
  createEvalRepository,
  EvalSetNotFoundError,
  EvalRunNotFoundError,
  isSafeRunId,
  type IEvalRepository
} from "../repositories/EvalRepository.js";
import { evalRunner } from "../services/eval/EvalRunner.js";
import { EVAL_SAFETY_NOTICE, type EvalRunResult } from "../types/eval.js";
import { config } from "../utils/config.js";

const repo: IEvalRepository = createEvalRepository();
export const evalRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}
function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

// 응답에 너무 큰 results 배열이 들어가지 않도록 잘라낸다.
function trimRun(run: EvalRunResult, topN = 10): EvalRunResult {
  return {
    ...run,
    falsePositives: run.falsePositives.slice(0, topN),
    falseNegatives: run.falseNegatives.slice(0, topN),
    // 전체 results 는 응답에서 제외 (런 상세 조회는 GET /runs/:id 로)
    results: []
  };
}

const RunRequestSchema = z.object({
  evalSetId: z.string().min(1).max(80).optional(),
  threshold: z.number().min(0).max(100).optional(),
  useLlm: z.boolean().optional(),
  maxSamples: z.number().int().min(1).max(2000).optional()
});

// GET /api/eval/sets — 모듈별 평가셋 목록
evalRouter.get("/sets", async (req, res) => {
  try {
    const moduleId = typeof req.query.moduleId === "string" ? req.query.moduleId : "false_ad";
    const sets = await repo.listSets(moduleId);
    res.json({
      ok: true,
      moduleId,
      sets,
      defaultEvalSetId: config.eval.defaultSet,
      defaultThreshold: config.eval.threshold,
      defaultUseLlm: config.eval.useLlm,
      safetyNotice: EVAL_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/eval/sets/:evalSetId — 평가셋 요약 (샘플 본문은 제외)
evalRouter.get("/sets/:evalSetId", async (req, res) => {
  try {
    const set = await repo.getSet(req.params.evalSetId);
    const total = set.samples.length;
    const positives = set.samples.filter((s) => s.label === "VIOLATION_CANDIDATE").length;
    const negatives = total - positives;
    const sampleSummaries = set.samples.slice(0, 50).map((s) => ({
      id: s.id,
      label: s.label,
      category: s.category,
      productName: s.productName,
      preview: s.text.slice(0, 80) + (s.text.length > 80 ? "..." : "")
    }));
    res.json({
      ok: true,
      evalSet: {
        evalSetId: set.evalSetId,
        name: set.name,
        moduleId: set.moduleId,
        description: set.description,
        language: set.language,
        synthetic: set.synthetic,
        source: set.source,
        createdAt: set.createdAt,
        notes: set.notes,
        total,
        positives,
        negatives
      },
      samples: sampleSummaries,
      truncated: total > sampleSummaries.length,
      safetyNotice: EVAL_SAFETY_NOTICE
    });
  } catch (error) {
    if (error instanceof EvalSetNotFoundError) {
      return res.status(404).json(errorBody("EVAL_SET_NOT_FOUND", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/eval/run — 평가 실행
evalRouter.post("/run", async (req, res) => {
  try {
    const input = RunRequestSchema.parse(req.body ?? {});
    const evalSetId = input.evalSetId ?? config.eval.defaultSet;
    const set = await repo.getSet(evalSetId);
    const run = await evalRunner.run(set, {
      threshold: input.threshold,
      useLlm: input.useLlm,
      maxSamples: input.maxSamples
    });
    await repo.saveRun(run);
    res.json({
      ok: true,
      run: trimRun(run, 10),
      safetyNotice: EVAL_SAFETY_NOTICE,
      autoRuleChange: false,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof EvalSetNotFoundError) {
      return res.status(404).json(errorBody("EVAL_SET_NOT_FOUND", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/eval/runs — 최근 평가 실행 목록
evalRouter.get("/runs", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 20);
    const runs = await repo.listRuns(Number.isFinite(limit) ? limit : 20);
    const items = runs.map((r) => ({
      runId: r.runId,
      evalSetId: r.evalSetId,
      moduleId: r.moduleId,
      ranAt: r.ranAt,
      threshold: r.threshold,
      useLlm: r.useLlm,
      metrics: r.metrics,
      durationMs: r.durationMs
    }));
    res.json({ ok: true, items, total: items.length, safetyNotice: EVAL_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/eval/runs/:runId — 개별 결과 (results는 너무 크면 잘라냄)
evalRouter.get("/runs/:runId", async (req, res) => {
  const runId = req.params.runId;
  if (!isSafeRunId(runId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid runId: ${runId}`));
  }
  try {
    const r = await repo.getRun(runId);
    res.json({
      ok: true,
      run: {
        ...r,
        // results는 응답에서 50건까지만 노출
        results: r.results.slice(0, 50),
        resultsTruncated: r.results.length > 50
      },
      safetyNotice: EVAL_SAFETY_NOTICE
    });
  } catch (error) {
    if (error instanceof EvalRunNotFoundError) {
      return res.status(404).json(errorBody("EVAL_RUN_NOT_FOUND", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/eval/runs/:runId/feedback-candidates
evalRouter.get("/runs/:runId/feedback-candidates", async (req, res) => {
  const runId = req.params.runId;
  if (!isSafeRunId(runId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid runId: ${runId}`));
  }
  try {
    const r = await repo.getRun(runId);
    res.json({
      ok: true,
      runId: r.runId,
      candidates: r.feedbackCandidates,
      total: r.feedbackCandidates.length,
      message: "FP/FN 기반 개선 후보입니다. 자동 저장이 아니라 사람이 검토 후 Feedback DB에 반영해야 합니다.",
      safetyNotice: EVAL_SAFETY_NOTICE,
      autoRuleChange: false
    });
  } catch (error) {
    if (error instanceof EvalRunNotFoundError) {
      return res.status(404).json(errorBody("EVAL_RUN_NOT_FOUND", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/eval/latest — 최신 결과
evalRouter.get("/latest", async (_req, res) => {
  try {
    const latest = await repo.getLatest();
    if (!latest) {
      return res.json({ ok: true, latest: null, message: "아직 평가 실행 결과가 없습니다.", safetyNotice: EVAL_SAFETY_NOTICE });
    }
    res.json({
      ok: true,
      latest: trimRun(latest, 10),
      safetyNotice: EVAL_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
