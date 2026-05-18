import { createTraceId, traceLogger } from "./TraceLogger.js";
import type { TraceContextFields, TraceEvent } from "../../types/trace.js";

// withAgentTrace — Agent 실행을 감싸 agent_start / agent_end / agent_error 를 자동 기록한다.
export interface WithAgentTraceOptions extends Partial<TraceContextFields> {
  agentName: string;
  inputSummary?: unknown;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface WithAgentTraceResult<T> {
  result: T;
  startEvent: TraceEvent | null;
  endEvent: TraceEvent | null;
  errorEvent?: TraceEvent | null;
  traceId: string;
  durationMs: number;
}

export async function withAgentTrace<T>(
  opts: WithAgentTraceOptions,
  fn: () => Promise<T> | T
): Promise<WithAgentTraceResult<T>> {
  const traceId = opts.traceId ?? createTraceId("tr");
  const start = Date.now();
  const startEvent = await traceLogger.log({
    eventType: "agent_start",
    severity: "info",
    agentName: opts.agentName,
    traceId,
    runId: opts.runId,
    caseId: opts.caseId,
    candidateId: opts.candidateId,
    moduleId: opts.moduleId,
    inputSummary: opts.inputSummary,
    message: opts.message ?? `${opts.agentName} 시작`,
    meta: opts.meta
  });

  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const endEvent = await traceLogger.log({
      eventType: "agent_end",
      severity: "info",
      agentName: opts.agentName,
      traceId,
      runId: opts.runId,
      caseId: opts.caseId,
      candidateId: opts.candidateId,
      moduleId: opts.moduleId,
      message: `${opts.agentName} 완료`,
      outputSummary: summarizeForTrace(result),
      durationMs
    });
    return { result, startEvent, endEvent, traceId, durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorEvent = await traceLogger.log({
      eventType: "agent_error",
      severity: "error",
      agentName: opts.agentName,
      traceId,
      runId: opts.runId,
      caseId: opts.caseId,
      candidateId: opts.candidateId,
      moduleId: opts.moduleId,
      message: `${opts.agentName} 실패: ${(error as Error).message}`,
      meta: { error: (error as Error).message, name: (error as Error).name },
      durationMs
    });
    return Promise.reject(Object.assign(error as Error, { traceId, errorEvent, durationMs }));
  }
}

// 결과를 trace 에 적합한 요약 형태로 변환 — 큰 페이로드/PII 가 들어가지 않도록 슬림화.
export function summarizeForTrace(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return {
      _array: true,
      length: value.length,
      first: value.slice(0, 3).map((v) => slim(v))
    };
  }
  const v = value as Record<string, unknown>;
  // 알려진 결과 객체 형식 인지 — 핵심 메타만 남긴다
  const known: Record<string, unknown> = {};
  for (const k of [
    "id", "runId", "caseId", "moduleId", "schemaVersion",
    "priorityScore", "priorityLabel", "priorityLevel",
    "riskScore", "riskLevel",
    "totalBids", "uniqueBidders", "uniqueIssuers", "riskGroupCount", "suspiciousBidCount",
    "recordCount", "candidates",
    "matches", "counts",
    "ok", "status", "from", "to"
  ]) {
    if (k in v) known[k] = slim(v[k]);
  }
  // 알려진 키가 없으면 상위 5개 key 만
  if (Object.keys(known).length === 0) {
    let i = 0;
    for (const [k, val] of Object.entries(v)) {
      if (i++ >= 5) break;
      known[k] = slim(val);
    }
  }
  return known;
}

function slim(v: unknown): unknown {
  if (v == null) return v;
  if (Array.isArray(v)) return { _array: true, length: v.length };
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    return { _object: true, keys: keys.slice(0, 10), keyCount: keys.length };
  }
  if (typeof v === "string" && v.length > 200) return v.slice(0, 200) + "…";
  return v;
}

export { createTraceId };
