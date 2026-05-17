import path from "node:path";
import { nanoid } from "nanoid";
import { schedule, validate, type ScheduledTask } from "node-cron";
import { config } from "../../utils/config.js";
import { ensureDir, readJson, writeJson } from "../../utils/fs.js";
import { scoutAgent } from "../scout/ScoutAgent.js";
import type {
  SchedulerAttemptEntry,
  SchedulerConfig,
  SchedulerMode,
  SchedulerRunRecord,
  SchedulerStatusResponse
} from "../../types/scheduler.js";
import type { ScoutSourceType } from "../scout/SearchSourceAdapter.js";

const SAFETY_NOTICE =
  "스케줄러는 후보 발굴만 수행하며 외부 신고기관에 자동 제출하지 않습니다. 일일 후보 50건은 운영 목표이며 API 키·소스·약관에 따라 실제 수집량은 달라질 수 있습니다.";

const RUNS_FILE = path.join(process.cwd(), "data/scheduler/runs.json");

function loadSchedulerConfig(): SchedulerConfig {
  return { ...config.scheduler } as SchedulerConfig;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

export class SchedulerService {
  private cfg: SchedulerConfig;
  private task: ScheduledTask | null = null;
  private running = false;

  constructor(cfg?: Partial<SchedulerConfig>) {
    this.cfg = { ...loadSchedulerConfig(), ...(cfg ?? {}) };
  }

  getConfig(): SchedulerConfig {
    return { ...this.cfg };
  }

  isCronValid(): boolean {
    try { return validate(this.cfg.cron); } catch { return false; }
  }

  /** start — SCHEDULER_ENABLED=true + cron 유효일 때만 등록. 테스트 환경에서는 호출하지 않는다. */
  start(): { started: boolean; reason?: string } {
    if (this.task) return { started: false, reason: "이미 시작됨" };
    if (!this.cfg.enabled) return { started: false, reason: "SCHEDULER_ENABLED=false (disabled)" };
    if (!this.isCronValid()) return { started: false, reason: `유효하지 않은 cron: ${this.cfg.cron}` };
    this.task = schedule(this.cfg.cron, () => {
      void this.runWithRetry("cron");
    }, { timezone: this.cfg.timezone });
    return { started: true };
  }

  stop(): void {
    if (this.task) {
      try { this.task.stop(); } catch { /* ignore */ }
      this.task = null;
    }
  }

  async getStatus(): Promise<SchedulerStatusResponse> {
    const latest = await this.getLatestRun();
    return {
      ok: true,
      enabled: this.cfg.enabled,
      running: this.running,
      cron: this.cfg.cron,
      timezone: this.cfg.timezone,
      mode: this.cfg.mode,
      topics: this.cfg.topics,
      sources: this.cfg.sources,
      maxCandidates: this.cfg.maxCandidates,
      retryAttempts: this.cfg.retryAttempts,
      retryDelayMs: this.cfg.retryDelayMs,
      nextRunNote: this.task
        ? "node-cron이 다음 실행 시각을 자체적으로 계산합니다. 정확한 시각 표시는 후속 단계에서 cron-parser로 추가 예정."
        : (this.cfg.enabled ? "스케줄이 등록되지 않았습니다. cron 유효성 확인 필요." : "SCHEDULER_ENABLED=false 상태입니다."),
      latestRun: latest,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false
    };
  }

  /** 수동 실행 진입점. 이미 실행 중이면 SKIPPED 기록 후 반환. */
  async runOnce(reason: string, overrides?: {
    topics?: string[]; sources?: string[]; mode?: SchedulerMode; maxCandidates?: number;
  }): Promise<SchedulerRunRecord> {
    if (this.running) {
      const skipped: SchedulerRunRecord = {
        id: nanoid(12),
        reason: `${reason}|SKIPPED:already_running`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        status: "SKIPPED",
        attempts: [],
        safetyNotice: SAFETY_NOTICE
      };
      await this.appendRun(skipped);
      return skipped;
    }
    return this.runWithRetry(reason, overrides);
  }

  async runWithRetry(reason: string, overrides?: {
    topics?: string[]; sources?: string[]; mode?: SchedulerMode; maxCandidates?: number;
  }): Promise<SchedulerRunRecord> {
    const record: SchedulerRunRecord = {
      id: nanoid(12),
      reason,
      startedAt: new Date().toISOString(),
      status: "RUNNING",
      attempts: [],
      safetyNotice: SAFETY_NOTICE
    };
    this.running = true;
    await this.appendRun(record);

    const totalAttempts = Math.max(1, this.cfg.retryAttempts + 1);
    let lastError: Error | undefined;
    let result: SchedulerRunRecord["result"];

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const at = new Date().toISOString();
      try {
        result = await this.executeScoutRun(overrides);
        record.attempts.push({ attempt, at });
        record.status = "SUCCESS";
        record.result = result;
        record.error = undefined;
        break;
      } catch (error) {
        lastError = error as Error;
        record.attempts.push({ attempt, at, error: lastError.message });
        if (attempt < totalAttempts) {
          await sleep(this.cfg.retryDelayMs);
        }
      }
    }

    if (record.status !== "SUCCESS") {
      record.status = "FAILED";
      record.error = lastError?.message ?? "unknown error";
    }
    record.finishedAt = new Date().toISOString();
    this.running = false;
    // 새 상태로 저장 (append가 아닌 update)
    await this.updateRun(record);
    return record;
  }

  async executeScoutRun(overrides?: {
    topics?: string[]; sources?: string[]; mode?: SchedulerMode; maxCandidates?: number;
  }): Promise<NonNullable<SchedulerRunRecord["result"]>> {
    const topics = (overrides?.topics ?? this.cfg.topics).map(normalizeTopicId);
    const sources = (overrides?.sources ?? this.cfg.sources) as ScoutSourceType[];
    const mode = (overrides?.mode ?? this.cfg.mode);
    const maxCandidates = overrides?.maxCandidates ?? this.cfg.maxCandidates;

    if (!Array.isArray(topics) || topics.length === 0) {
      throw new Error("스케줄러에 등록된 topics가 없습니다 (SCHEDULER_TOPICS).");
    }

    const out = await scoutAgent.discover({
      moduleId: "false_ad",
      topics,
      mode,
      sourceTypes: sources,
      maxCandidates
    });

    const warnings: string[] = [];
    if (out.sourceFallbacks.length > 0) {
      warnings.push(`disabled adapters: ${out.sourceFallbacks.join(", ")}`);
    }
    if (out.usedSources.length === 0) {
      warnings.push("활성 어댑터가 없어 mock 폴백이 사용되었거나 0건 발굴");
    }

    return {
      totalFound: out.candidates.length,
      totalSaved: out.added.length,
      duplicatesRemoved: out.candidates.length - out.added.length,
      usedSources: out.usedSources,
      sourceFallbacks: out.sourceFallbacks,
      warnings
    };
  }

  // ---------- run log ----------

  async listRuns(limit = 50): Promise<SchedulerRunRecord[]> {
    await ensureDir(path.dirname(RUNS_FILE));
    let all: SchedulerRunRecord[] = [];
    try {
      const data = await readJson<{ runs: SchedulerRunRecord[] }>(RUNS_FILE);
      all = Array.isArray(data?.runs) ? data.runs : [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return all.slice(0, Math.max(1, Math.min(limit, 500)));
  }

  async getLatestRun(): Promise<SchedulerRunRecord | null> {
    const list = await this.listRuns(1);
    return list[0] ?? null;
  }

  private async loadAllRuns(): Promise<SchedulerRunRecord[]> {
    await ensureDir(path.dirname(RUNS_FILE));
    try {
      const data = await readJson<{ runs: SchedulerRunRecord[] }>(RUNS_FILE);
      return Array.isArray(data?.runs) ? data.runs : [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      return [];
    }
  }

  private async saveAllRuns(runs: SchedulerRunRecord[]): Promise<void> {
    await ensureDir(path.dirname(RUNS_FILE));
    const limited = runs.slice(-Math.max(10, this.cfg.maxRunLog));
    await writeJson(RUNS_FILE, { runs: limited });
  }

  private async appendRun(rec: SchedulerRunRecord): Promise<void> {
    const all = await this.loadAllRuns();
    all.push(rec);
    await this.saveAllRuns(all);
  }

  private async updateRun(rec: SchedulerRunRecord): Promise<void> {
    const all = await this.loadAllRuns();
    const idx = all.findIndex((r) => r.id === rec.id);
    if (idx >= 0) all[idx] = rec;
    else all.push(rec);
    await this.saveAllRuns(all);
  }

  // ---------- helpers ----------

  recordRunStart(reason: string): SchedulerRunRecord {
    return {
      id: nanoid(12),
      reason,
      startedAt: new Date().toISOString(),
      status: "RUNNING",
      attempts: [],
      safetyNotice: SAFETY_NOTICE
    };
  }
}

// 외부 cron 표기는 underscore도 허용 (예: blood_sugar) — 내부 topic id는 hyphen
function normalizeTopicId(id: string): string {
  if (!id) return id;
  if (id.includes("-")) return id;
  return id.replace(/_/g, "-");
}

export { loadSchedulerConfig, SAFETY_NOTICE as SCHEDULER_SAFETY_NOTICE };
export const schedulerService = new SchedulerService();
