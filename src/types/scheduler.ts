// Scheduler — 정기 후보 수집 스케줄러 공통 타입.
// 본 스케줄러는 후보 발굴만 수행하며 외부 신고기관에 자동 제출하지 않는다.

export type SchedulerMode = "quick" | "standard" | "deep";

export interface SchedulerConfig {
  enabled: boolean;
  cron: string;
  timezone: string;
  mode: SchedulerMode;
  topics: string[];
  sources: string[];
  maxCandidates: number;
  retryAttempts: number;
  retryDelayMs: number;
  maxRunLog: number;
}

export type SchedulerRunStatus = "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";

export interface SchedulerAttemptEntry {
  attempt: number;
  at: string;
  error?: string;
}

export interface SchedulerRunResultPayload {
  totalFound: number;
  totalSaved: number;
  duplicatesRemoved: number;
  usedSources: string[];
  sourceFallbacks: string[];
  warnings: string[];
}

export interface SchedulerRunRecord {
  id: string;
  reason: string;            // "cron" | "manual" | "manual:<note>"
  startedAt: string;
  finishedAt?: string;
  status: SchedulerRunStatus;
  attempts: SchedulerAttemptEntry[];
  result?: SchedulerRunResultPayload;
  error?: string;
  safetyNotice: string;
}

export interface SchedulerStatusResponse {
  ok: true;
  enabled: boolean;
  running: boolean;
  cron: string;
  timezone: string;
  mode: SchedulerMode;
  topics: string[];
  sources: string[];
  maxCandidates: number;
  retryAttempts: number;
  retryDelayMs: number;
  nextRunNote: string;
  latestRun: SchedulerRunRecord | null;
  safetyNotice: string;
  autoReport: false;
}
