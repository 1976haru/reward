import { Router } from "express";
import { ZodError, z } from "zod";
import { dashboardService, DASHBOARD_SAFETY_NOTICE } from "../services/dashboard/DashboardService.js";
import { buildOperationsSummary } from "../services/operationsSummary.js";
import {
  getDailyRoutineDefinition,
  getDailyRoutineState,
  setDailyRoutineStep,
  DAILY_ROUTINE_NOTES
} from "../services/dailyOperationsRoutine.js";

export const dashboardRouter = Router();

function errorBody(error: string, message: string) {
  return { ok: false, error, message };
}

// GET /api/dashboard/summary — 통합 요약 + 운영 현황(operations, 체크리스트 69)
dashboardRouter.get("/summary", async (_req, res) => {
  try {
    // 기존 요약은 유지하고, 운영 현황 블록을 추가한다. 둘 중 하나가 실패해도 화면이 깨지지 않게 처리.
    let summary: Record<string, unknown> = {};
    try {
      summary = (await dashboardService.getSummary()) as unknown as Record<string, unknown>;
    } catch {
      summary = {};
    }
    const operations = await buildOperationsSummary();
    res.json({ ok: true, ...summary, operations });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/dashboard/daily-routine — 오늘 일일 작업표 정의 + 체크 상태 (체크리스트 70)
dashboardRouter.get("/daily-routine", async (req, res) => {
  try {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const state = await getDailyRoutineState(date);
    res.json({
      ok: true,
      definition: getDailyRoutineDefinition(),
      state,
      notes: DAILY_ROUTINE_NOTES,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

const RoutineStepSchema = z.object({
  stepId: z.number().int().min(1).max(10),
  done: z.boolean(),
  date: z.string().max(10).optional(),
  note: z.string().max(500).optional()
});

// POST /api/dashboard/daily-routine/step — 단계 수동 체크 (data/operations 저장)
dashboardRouter.post("/daily-routine/step", async (req, res) => {
  try {
    const body = RoutineStepSchema.parse(req.body ?? {});
    const state = await setDailyRoutineStep(body.stepId, body.done, { date: body.date, note: body.note });
    res.json({ ok: true, state, autoReport: false, humanReviewRequired: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", (error as Error).message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/dashboard/top-candidates?limit=10
dashboardRouter.get("/top-candidates", async (req, res) => {
  try {
    const raw = Number(req.query.limit ?? 10);
    const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
    const items = await dashboardService.getTopCandidates(limit);
    res.json({
      ok: true,
      items,
      total: items.length,
      safetyNotice: DASHBOARD_SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/dashboard/module-performance
dashboardRouter.get("/module-performance", async (_req, res) => {
  try {
    const modules = await dashboardService.getModulePerformance();
    res.json({
      ok: true,
      modules,
      safetyNotice: DASHBOARD_SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/dashboard/quality
dashboardRouter.get("/quality", async (_req, res) => {
  try {
    const q = await dashboardService.getQuality();
    res.json({
      ok: true,
      ...q,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
