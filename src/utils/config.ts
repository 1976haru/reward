import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? "./data",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "gpt-4.1-mini"
};
