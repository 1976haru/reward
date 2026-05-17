import cors from "cors";
import express from "express";
import path from "node:path";
import { z } from "zod";
import { OrchestratorAgent } from "./agents/OrchestratorAgent.js";
import { CaseRepository } from "./services/CaseRepository.js";
import { config } from "./utils/config.js";
import { ensureDir } from "./utils/fs.js";
import { moduleRegistry } from "./modules/index.js";

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
  moduleId: z.string().optional(),
  memo: z.string().optional()
});

app.get("/api/health", (_req, res) => {
  const defaultModule = moduleRegistry.getDefault();
  res.json({
    ok: true,
    service: "reward-agent-mvp",
    module: defaultModule.id,
    category: defaultModule.category,
    environment: config.env,
    port: config.port,
    mockAi: config.mockAi,
    registeredModules: moduleRegistry.list().length,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/modules", (_req, res) => {
  res.json({
    ok: true,
    defaultModuleId: moduleRegistry.getDefault().id,
    modules: moduleRegistry.list()
  });
});

app.get("/api/modules/:moduleId", (req, res) => {
  const mod = moduleRegistry.get(req.params.moduleId);
  if (!mod) {
    return res.status(404).json({ ok: false, error: "MODULE_NOT_FOUND", message: `Unknown moduleId: ${req.params.moduleId}` });
  }
  res.json({ ok: true, module: mod });
});

app.post("/api/cases/analyze", async (req, res) => {
  try {
    const payload = analyzeSchema.parse(req.body);
    const requestedModuleId = payload.moduleId ?? moduleRegistry.getDefault().id;
    const moduleDef = moduleRegistry.get(requestedModuleId);

    if (!moduleDef) {
      return res.status(404).json({
        ok: false,
        error: "MODULE_NOT_FOUND",
        message: `Unknown moduleId: ${requestedModuleId}`
      });
    }
    if (moduleDef.status !== "active") {
      return res.status(409).json({
        ok: false,
        error: "MODULE_NOT_READY",
        message: "해당 모듈은 아직 준비 중입니다.",
        moduleId: moduleDef.id,
        moduleStatus: moduleDef.status
      });
    }
    if (moduleDef.id !== "false_ad") {
      return res.status(501).json({
        ok: false,
        error: "MODULE_NOT_IMPLEMENTED",
        message: "분석 파이프라인이 아직 연결되지 않은 모듈입니다.",
        moduleId: moduleDef.id
      });
    }

    const result = await orchestrator.analyze({
      url: payload.url,
      moduleId: "false_ad",
      memo: payload.memo
    });
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
