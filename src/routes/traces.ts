import { Router } from "express";
import { traceLogger, TRACE_SAFETY_NOTICE } from "../services/trace/TraceLogger.js";
import { TRACE_EVENT_TYPES, TRACE_SEVERITIES, type TraceListQuery } from "../types/trace.js";

export const tracesRouter = Router();

function errorBody(error: string, message: string) {
  return { ok: false, error, message };
}

function parseQuery(req: { query: Record<string, unknown> }): TraceListQuery {
  const q = req.query;
  const limitRaw = Number(q.limit ?? 100);
  const out: TraceListQuery = {
    limit: Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 100
  };
  for (const k of ["traceId", "runId", "caseId", "candidateId", "moduleId", "agentName"] as const) {
    if (typeof q[k] === "string") (out as Record<string, unknown>)[k] = q[k];
  }
  if (typeof q.eventType === "string" && (TRACE_EVENT_TYPES as readonly string[]).includes(q.eventType)) {
    out.eventType = q.eventType as TraceListQuery["eventType"];
  }
  if (typeof q.severity === "string" && (TRACE_SEVERITIES as readonly string[]).includes(q.severity)) {
    out.severity = q.severity as TraceListQuery["severity"];
  }
  if (typeof q.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) out.from = q.from;
  if (typeof q.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) out.to = q.to;
  return out;
}

// GET /api/traces — 목록
tracesRouter.get("/", async (req, res) => {
  try {
    const q = parseQuery(req);
    const events = await traceLogger.list(q);
    res.json({
      ok: true,
      events,
      total: events.length,
      query: q,
      safetyNotice: TRACE_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/traces/summary — agent/eventType/severity/module 별 통계
tracesRouter.get("/summary", async (req, res) => {
  try {
    const q = parseQuery(req);
    const summary = await traceLogger.getSummary(q);
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/traces/dates — 사용 가능한 날짜 (디버깅 편의)
tracesRouter.get("/dates", async (_req, res) => {
  try {
    const dates = await traceLogger.listAvailableDates();
    res.json({ ok: true, dates });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// Case 별 감사로그 — /api/cases/:caseId/traces 로 mount
export const caseTracesRouter = Router({ mergeParams: true });

caseTracesRouter.get("/:caseId/traces", async (req, res) => {
  const caseId = req.params.caseId;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const events = await traceLogger.listByCase(caseId, 500);
    const byAgent: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const e of events) {
      if (e.agentName) byAgent[e.agentName] = (byAgent[e.agentName] ?? 0) + 1;
      byEventType[e.eventType] = (byEventType[e.eventType] ?? 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
    }
    res.json({
      ok: true,
      caseId,
      events,
      summary: { total: events.length, byAgent, byEventType, bySeverity },
      safetyNotice: TRACE_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
