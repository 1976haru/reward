import cors from "cors";
import express from "express";
import path from "node:path";
import { z } from "zod";
import { OrchestratorAgent } from "./agents/OrchestratorAgent.js";
import { CaseRepository } from "./services/CaseRepository.js";
import { config } from "./utils/config.js";
import { ensureDir } from "./utils/fs.js";

const app = express();
const orchestrator = new OrchestratorAgent();
const cases = new CaseRepository();

// 시작 시 데이터 폴더 보장 (초보자 환경에서 EXDIR 오류 방지)
await Promise.all([
  ensureDir(path.join(config.dataDir, "cases")),
  ensureDir(config.evidenceDir),
  ensureDir(config.reportsDir),
  ensureDir(path.join(config.dataDir, "raw"))
]);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(process.cwd(), "public")));
app.use("/data", express.static(path.join(process.cwd(), "data")));

const analyzeSchema = z.object({
  url: z.string().url(),
  moduleId: z.literal("false_ad").default("false_ad"),
  memo: z.string().optional()
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "reward-agent-mvp",
    module: "false_ad",
    category: "health_functional_food",
    environment: config.env,
    port: config.port,
    mockAi: config.mockAi,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/cases/analyze", async (req, res) => {
  try {
    const payload = analyzeSchema.parse(req.body);
    const result = await orchestrator.analyze(payload);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({ error: message });
  }
});

app.get("/api/cases", async (_req, res) => {
  res.json(await cases.list());
});

app.get("/api/cases/:id", async (req, res) => {
  try {
    res.json(await cases.get(req.params.id));
  } catch {
    res.status(404).json({ error: "case not found" });
  }
});

app.patch("/api/cases/:id/status", async (req, res) => {
  const statusSchema = z.object({
    status: z.enum(["draft", "needs_review", "ready_to_report", "reported", "rejected", "archived"])
  });
  try {
    const { status } = statusSchema.parse(req.body);
    res.json(await cases.updateStatus(req.params.id, status));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({ error: message });
  }
});

app.listen(config.port, () => {
  console.log(`Reward Agent MVP running at http://localhost:${config.port}`);
});
