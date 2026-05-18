import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const dataDir = process.env.DATA_DIR ?? "./data";

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  env: process.env.NODE_ENV ?? "development",
  dataDir,
  evidenceDir: process.env.EVIDENCE_DIR ?? path.join(dataDir, "evidence"),
  reportsDir: process.env.REPORTS_DIR ?? path.join(dataDir, "reports"),
  mockAi: parseBool(process.env.MOCK_AI, true),
  useDb: parseBool(process.env.USE_DB, false),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "gpt-4.1-mini",
  openaiModel: process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini",
  llmTemperature: Number.isFinite(Number(process.env.LLM_TEMPERATURE))
    ? Number(process.env.LLM_TEMPERATURE)
    : 0.1,
  evidence: {
    captureTimeoutMs: Number(process.env.EVIDENCE_CAPTURE_TIMEOUT_MS ?? 15000),
    enableScreenshot: parseBool(process.env.EVIDENCE_ENABLE_SCREENSHOT, true),
    enablePdf: parseBool(process.env.EVIDENCE_ENABLE_PDF, true)
  },
  discovery: {
    mock: parseBool(process.env.MOCK_DISCOVERY, true),
    maxCandidates: Number(process.env.DISCOVERY_MAX_CANDIDATES ?? 30)
  },
  scout: {
    mock: parseBool(process.env.MOCK_SCOUT, true),
    dailyLimit: Number(process.env.SCOUT_DAILY_LIMIT ?? 50),
    naverClientId: process.env.NAVER_CLIENT_ID ?? "",
    naverClientSecret: process.env.NAVER_CLIENT_SECRET ?? "",
    openaiWebSearchEnabled: parseBool(process.env.OPENAI_WEB_SEARCH_ENABLED, false),
    rssEnabled: parseBool(process.env.RSS_SCOUT_ENABLED, false)
  },
  scheduler: {
    enabled: parseBool(process.env.SCHEDULER_ENABLED, false),
    cron: process.env.SCHEDULER_CRON ?? "0 9 * * *",
    timezone: process.env.SCHEDULER_TIMEZONE ?? "Asia/Seoul",
    mode: (process.env.SCHEDULER_MODE ?? "standard"),
    topics: (process.env.SCHEDULER_TOPICS ?? "blood-sugar,joint-cartilage,diet-body-fat,liver-detox,immunity")
      .split(",").map((s) => s.trim()).filter(Boolean),
    sources: (process.env.SCHEDULER_SOURCES ?? "mock")
      .split(",").map((s) => s.trim()).filter(Boolean),
    maxCandidates: Number(process.env.SCHEDULER_MAX_CANDIDATES ?? 30),
    retryAttempts: Number(process.env.SCHEDULER_RETRY_ATTEMPTS ?? 2),
    retryDelayMs: Number(process.env.SCHEDULER_RETRY_DELAY_MS ?? 2000),
    maxRunLog: Number(process.env.SCHEDULER_MAX_RUN_LOG ?? 200)
  },
  feedback: {
    dir: process.env.FEEDBACK_DIR ?? path.join(dataDir, "feedback"),
    useDb: parseBool(process.env.FEEDBACK_USE_DB, false)
  },
  eval: {
    dir: process.env.EVAL_DIR ?? path.join(dataDir, "eval"),
    defaultSet: process.env.EVAL_DEFAULT_SET ?? "health_false_ad_synthetic_v1",
    threshold: Number.isFinite(Number(process.env.EVAL_THRESHOLD))
      ? Number(process.env.EVAL_THRESHOLD)
      : 60,
    useLlm: parseBool(process.env.EVAL_USE_LLM, false),
    maxSamples: Number(process.env.EVAL_MAX_SAMPLES ?? 200)
  },
  trace: {
    enabled: parseBool(process.env.TRACE_ENABLED, true),
    dir: process.env.TRACE_DIR ?? path.join(dataDir, "traces"),
    maxInputChars: Number(process.env.TRACE_MAX_INPUT_CHARS ?? 2000),
    maxOutputChars: Number(process.env.TRACE_MAX_OUTPUT_CHARS ?? 2000),
    maskSensitive: parseBool(process.env.TRACE_MASK_SENSITIVE, true),
    storeFullPrompt: parseBool(process.env.TRACE_STORE_FULL_PROMPT, false)
  },
  outcome: {
    dir: process.env.OUTCOME_DIR ?? path.join(dataDir, "outcomes"),
    useDb: parseBool(process.env.OUTCOME_USE_DB, false),
    defaultFollowUpDays: Number(process.env.OUTCOME_DEFAULT_FOLLOWUP_DAYS ?? 14)
  },
  privacy: {
    maskingEnabled: parseBool(process.env.PRIVACY_MASKING_ENABLED, true),
    scanDirs: (process.env.PRIVACY_SCAN_DIRS ?? dataDir)
      .split(",").map((s) => s.trim()).filter(Boolean),
    dryRun: parseBool(process.env.PRIVACY_DRY_RUN, true),
    retentionDays: {
      default: Number(process.env.PRIVACY_RETENTION_DAYS ?? 90),
      trace: Number(process.env.PRIVACY_TRACE_RETENTION_DAYS ?? 30),
      evidence: Number(process.env.PRIVACY_EVIDENCE_RETENTION_DAYS ?? 90),
      report: Number(process.env.PRIVACY_REPORT_RETENTION_DAYS ?? 90),
      feedback: Number(process.env.PRIVACY_FEEDBACK_RETENTION_DAYS ?? 180),
      case: Number(process.env.PRIVACY_CASE_RETENTION_DAYS ?? 180),
      raw: Number(process.env.PRIVACY_RAW_RETENTION_DAYS ?? 30),
      scheduler: Number(process.env.PRIVACY_SCHEDULER_RETENTION_DAYS ?? 90),
      scout: Number(process.env.PRIVACY_SCOUT_RETENTION_DAYS ?? 90)
    }
  }
};
