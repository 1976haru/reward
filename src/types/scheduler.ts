// Scheduler — 정기 후보 수집 스케줄러 공통 타입.
// 본 스케줄러는 후보 발굴만 수행하며 외부 신고기관에 자동 제출하지 않는다.

export type SchedulerMode = "quick" | "standard" | "deep";

// discover_only: 기존 동작(발굴만). full: 발굴 후 AutoPipeline 분석~검수 적재까지 (명시적 opt-in).
export type SchedulerPipelineMode = "discover_only" | "full";

export interface SchedulerConfig {
  enabled: boolean;
  cron: string;
  timezone: string;
  mode: SchedulerMode;
  pipelineMode: SchedulerPipelineMode;
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

export interface SchedulerPipelinePayload {
  mode: SchedulerPipelineMode;
  analyzed: number;
  autoReviewQueued: number;
  needsTriageQueued: number;
  noiseDropped: number;
  duplicatesSkipped: number;
  failed: number;
  limitReached: boolean;
  // 끝점은 항상 사람 검수 대기. 자동 제출은 수행하지 않는다.
  autoSubmitted: false;
  humanReviewRequired: true;
}

export interface SchedulerRunResultPayload {
  totalFound: number;
  totalSaved: number;
  duplicatesRemoved: number;
  usedSources: string[];
  sourceFallbacks: string[];
  warnings: string[];
  // pipelineMode=full 일 때만 채워진다.
  pipeline?: SchedulerPipelinePayload;
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
  pipelineMode: SchedulerPipelineMode;
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
