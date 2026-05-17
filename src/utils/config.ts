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
  }
};
