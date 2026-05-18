import { appendFile, readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../../utils/config.js";
import {
  TRACE_EVENT_TYPES,
  TRACE_SAFETY_NOTICE,
  TRACE_SEVERITIES,
  type TraceContextFields,
  type TraceEvent,
  type TraceEventType,
  type TraceListQuery,
  type TraceSeverity,
  type TraceSummary
} from "../../types/trace.js";
import { maskSensitive, truncate } from "./maskSensitive.js";

export function createTraceId(prefix = "tr"): string {
  return `${prefix}_${new Date().toISOString().replace(/[:.]/g, "-")}_${nanoid(8)}`;
}

export function createRunId(prefix = "run"): string {
  return `${prefix}_${new Date().toISOString().replace(/[:.]/g, "-")}_${nanoid(6)}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isSafeDateName(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export interface LogInput
  extends Partial<TraceContextFields> {
  eventType: TraceEventType;
  severity?: TraceSeverity;
  message?: string;
  inputSummary?: unknown;
  outputSummary?: unknown;
  meta?: Record<string, unknown>;
  durationMs?: number;
  actor?: string;
}

export class TraceLogger {
  private readonly dir: string;

  constructor(dir: string = config.trace.dir) {
    this.dir = dir;
  }

  private filePathFor(dateUtc: string = todayUtc()): string {
    return path.join(this.dir, `${dateUtc}.jsonl`);
  }

  /** 한 줄 append. trace 비활성이면 no-op. 실패는 throw 하지 않고 console.warn (감사로그가 메인 흐름을 막지 않게). */
  async log(input: LogInput): Promise<TraceEvent | null> {
    if (!config.trace.enabled) return null;

    const eventType = input.eventType;
    if (!(TRACE_EVENT_TYPES as readonly string[]).includes(eventType)) {
      console.warn(`[TraceLogger] unknown eventType: ${eventType}`);
      return null;
    }
    const severity: TraceSeverity = input.severity ?? "info";
    if (!(TRACE_SEVERITIES as readonly string[]).includes(severity)) {
      console.warn(`[TraceLogger] unknown severity: ${severity}`);
      return null;
    }

    // 마스킹 / 트렁케이트
    let sensitiveMasked = false;
    let inputSummary = input.inputSummary;
    let outputSummary = input.outputSummary;
    let meta = input.meta;
    let message = input.message;

    if (inputSummary !== undefined) {
      const r = maskSensitive(inputSummary, {
        enabled: config.trace.maskSensitive,
        maxStringLen: config.trace.maxInputChars,
        maxDepth: 6
      });
      inputSummary = r.value;
      sensitiveMasked = sensitiveMasked || r.changed;
    }
    if (outputSummary !== undefined) {
      const r = maskSensitive(outputSummary, {
        enabled: config.trace.maskSensitive,
        maxStringLen: config.trace.maxOutputChars,
        maxDepth: 6
      });
      outputSummary = r.value;
      sensitiveMasked = sensitiveMasked || r.changed;
    }
    if (meta !== undefined) {
      const r = maskSensitive(meta, {
        enabled: config.trace.maskSensitive,
        maxStringLen: 1000,
        maxDepth: 5
      });
      meta = r.value as Record<string, unknown>;
      sensitiveMasked = sensitiveMasked || r.changed;
    }
    if (typeof message === "string") {
      const r = truncate(message, 500);
      message = r.value;
    }

    // llm_prompt 이벤트는 storeFullPrompt=false 면 본문을 저장하지 않음
    if (eventType === "llm_prompt" && !config.trace.storeFullPrompt) {
      const orig = inputSummary;
      inputSummary = {
        note: "TRACE_STORE_FULL_PROMPT=false — 전체 prompt 본문 미저장 (메타만 저장)",
        promptCharCount: typeof orig === "string" ? orig.length : undefined
      };
    }

    const event: TraceEvent = {
      schemaVersion: "1.0.0",
      id: `evt_${nanoid(12)}`,
      ts: new Date().toISOString(),
      traceId: input.traceId ?? createTraceId(),
      runId: input.runId,
      caseId: input.caseId,
      candidateId: input.candidateId,
      moduleId: input.moduleId,
      agentName: input.agentName,
      eventType,
      severity,
      message,
      inputSummary,
      outputSummary,
      meta,
      durationMs: input.durationMs,
      actor: input.actor,
      sensitiveMasked
    };

    try {
      await mkdir(this.dir, { recursive: true });
      await appendFile(this.filePathFor(), JSON.stringify(event) + "\n", "utf8");
    } catch (e) {
      console.warn(`[TraceLogger] append failed: ${(e as Error).message}`);
    }
    return event;
  }

  /** 날짜 범위 내 JSONL 파일들을 모두 읽어 조건에 맞는 이벤트 반환. 최신순 정렬. */
  async list(query: TraceListQuery = {}): Promise<TraceEvent[]> {
    const dates = await this.resolveDateRange(query.from, query.to);
    const events: TraceEvent[] = [];
    for (const d of dates) {
      const file = this.filePathFor(d);
      try {
        const raw = await readFile(file, "utf8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as TraceEvent;
            if (this.matches(ev, query)) events.push(ev);
          } catch { /* corrupt line — skip */ }
        }
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") console.warn(`[TraceLogger] read failed ${file}: ${(e as Error).message}`);
      }
    }
    events.sort((a, b) => b.ts.localeCompare(a.ts));
    const limit = Math.max(1, Math.min(query.limit ?? 100, 1000));
    return events.slice(0, limit);
  }

  async listByCase(caseId: string, limit = 200): Promise<TraceEvent[]> {
    // 최근 7일치까지 훑는다 (충분 + 비용 통제)
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    const out: TraceEvent[] = [];
    for (const d of dates) {
      const file = this.filePathFor(d);
      try {
        const raw = await readFile(file, "utf8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as TraceEvent;
            if (ev.caseId === caseId) out.push(ev);
          } catch { /* skip */ }
        }
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") console.warn(`[TraceLogger] read failed ${file}: ${(e as Error).message}`);
      }
    }
    out.sort((a, b) => b.ts.localeCompare(a.ts));
    return out.slice(0, Math.max(1, Math.min(limit, 1000)));
  }

  async getSummary(query: TraceListQuery = {}): Promise<TraceSummary> {
    const events = await this.list({ ...query, limit: 1000 });
    const byAgent: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    for (const e of events) {
      if (e.agentName) byAgent[e.agentName] = (byAgent[e.agentName] ?? 0) + 1;
      byEventType[e.eventType] = (byEventType[e.eventType] ?? 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
      if (e.moduleId) byModule[e.moduleId] = (byModule[e.moduleId] ?? 0) + 1;
    }
    const recentErrors = events.filter((e) => e.severity === "error").slice(0, 5);
    return {
      total: events.length,
      byAgent,
      byEventType,
      bySeverity,
      byModule,
      recentErrors,
      safetyNotice: TRACE_SAFETY_NOTICE
    };
  }

  async listAvailableDates(): Promise<string[]> {
    try {
      const files = await readdir(this.dir);
      return files
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => f.replace(/\.jsonl$/, ""))
        .filter(isSafeDateName)
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  private matches(ev: TraceEvent, q: TraceListQuery): boolean {
    if (q.traceId && ev.traceId !== q.traceId) return false;
    if (q.runId && ev.runId !== q.runId) return false;
    if (q.caseId && ev.caseId !== q.caseId) return false;
    if (q.candidateId && ev.candidateId !== q.candidateId) return false;
    if (q.moduleId && ev.moduleId !== q.moduleId) return false;
    if (q.agentName && ev.agentName !== q.agentName) return false;
    if (q.eventType && ev.eventType !== q.eventType) return false;
    if (q.severity && ev.severity !== q.severity) return false;
    return true;
  }

  private async resolveDateRange(from?: string, to?: string): Promise<string[]> {
    if (!from && !to) {
      // 기본: 오늘 + 어제 (자정 즈음 누락 방지)
      const t = todayUtc();
      const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
      return [t, y.toISOString().slice(0, 10)];
    }
    const start = from && isSafeDateName(from) ? from : todayUtc();
    const end = to && isSafeDateName(to) ? to : start;
    const startMs = Date.parse(start + "T00:00:00Z");
    const endMs = Date.parse(end + "T00:00:00Z");
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return [todayUtc()];
    const out: string[] = [];
    let cursor = Math.min(startMs, endMs);
    const max = Math.max(startMs, endMs);
    // 안전 상한 60일
    for (let i = 0; i < 60 && cursor <= max; i++) {
      out.push(new Date(cursor).toISOString().slice(0, 10));
      cursor += 24 * 60 * 60 * 1000;
    }
    return out;
  }
}

export const traceLogger = new TraceLogger();
export { TRACE_SAFETY_NOTICE };
