import type { NextFunction, Request, Response } from "express";
import { createTraceId, traceLogger } from "../services/trace/TraceLogger.js";

// /api/* 요청에 traceId 부여 + 응답 후 service_call/http_response 기록.
// /styles.css, /app.js, /data, /favicon 등 정적 자원은 trace 에서 제외.

const TRACE_INCLUDE_PREFIX = "/api/";
const TRACE_EXCLUDE_API = new Set<string>([
  // 너무 빈번/노이즈 — trace 자체 조회는 기록 안 함 (재귀/볼륨 방지)
  "/api/traces",
  "/api/traces/summary",
  "/api/dashboard/summary",
  "/api/health"
]);

declare module "express-serve-static-core" {
  interface Request {
    traceContext?: { traceId: string };
  }
}

function shouldTrace(req: Request): boolean {
  if (!req.path.startsWith(TRACE_INCLUDE_PREFIX)) return false;
  // 정확 경로 + prefix 모두 체크
  if (TRACE_EXCLUDE_API.has(req.path)) return false;
  // /api/traces/... 하위 전체 제외
  if (req.path.startsWith("/api/traces")) return false;
  if (req.path.startsWith("/api/dashboard/summary")) return false;
  return true;
}

export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-trace-id");
  const traceId = (incoming && /^[A-Za-z0-9_\-:.]{4,128}$/.test(incoming))
    ? incoming
    : createTraceId("tr");
  req.traceContext = { traceId };
  res.setHeader("x-trace-id", traceId);

  if (!shouldTrace(req)) {
    next();
    return;
  }

  const start = Date.now();
  // moduleId / caseId 단서 추출 — 너무 깊게 들어가지 않음
  const caseIdFromParam = typeof req.params?.caseId === "string" ? req.params.caseId
    : typeof req.params?.id === "string" ? req.params.id : undefined;
  const moduleIdFromBody = (req.body && typeof req.body === "object" && typeof (req.body as Record<string, unknown>).moduleId === "string")
    ? String((req.body as Record<string, unknown>).moduleId) : undefined;
  const moduleIdFromQuery = typeof req.query?.moduleId === "string" ? req.query.moduleId : undefined;

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const severity = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    void traceLogger.log({
      eventType: "service_call",
      severity,
      traceId,
      caseId: caseIdFromParam,
      moduleId: moduleIdFromBody ?? moduleIdFromQuery,
      message: `${req.method} ${req.path} → ${res.statusCode}`,
      meta: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        // body / header 는 의도적으로 저장하지 않음 (개인정보·키 회피)
        // query 의 일부 안전 필드만
        query: pickSafeQuery(req.query)
      },
      durationMs
    });
  });

  next();
}

function pickSafeQuery(q: unknown): Record<string, unknown> {
  if (!q || typeof q !== "object") return {};
  const SAFE_KEYS = new Set([
    "moduleId", "caseId", "candidateId", "agentName", "eventType", "severity",
    "limit", "offset", "status", "sort", "category", "regionId", "evalSetId",
    "threshold", "from", "to", "useLlm", "maxSamples"
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q as Record<string, unknown>)) {
    if (SAFE_KEYS.has(k)) out[k] = v;
  }
  return out;
}
