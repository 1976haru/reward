import { Router } from "express";
import { dashboardService, DASHBOARD_SAFETY_NOTICE } from "../services/dashboard/DashboardService.js";

export const dashboardRouter = Router();

function errorBody(error: string, message: string) {
  return { ok: false, error, message };
}

// GET /api/dashboard/summary — 통합 요약
dashboardRouter.get("/summary", async (_req, res) => {
  try {
    const summary = await dashboardService.getSummary();
    res.json({ ok: true, ...summary });
  } catch (error) {
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
