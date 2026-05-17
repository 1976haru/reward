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
  aiModel: process.env.AI_MODEL ?? "gpt-4.1-mini"
};
