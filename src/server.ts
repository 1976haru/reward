import cors from "cors";
import express from "express";
import path from "node:path";
import { z } from "zod";
import { OrchestratorAgent } from "./agents/OrchestratorAgent.js";
import { config } from "./utils/config.js";
import { ensureDir } from "./utils/fs.js";
import { moduleRegistry } from "./modules/index.js";
import { casesRouter } from "./routes/cases.js";
import { discoveryRouter } from "./routes/discovery.js";
import { extractRouter } from "./routes/extract.js";
import { rulesRouter, detectRouter } from "./routes/rules.js";
import { analyzeRouter } from "./routes/analyze.js";
import { scoreRouter } from "./routes/score.js";

const app = express();
const orchestrator = new OrchestratorAgent();

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
    useDb: config.useDb,
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

// 분석 파이프라인은 기존 경로 유지 — 라우터 등록보다 먼저 와야 한다 ('/analyze' 매치 우선)
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
    res.status(400).json({ ok: false, error: "ANALYZE_FAILED", message });
  }
});

// Case 관리 REST API (분석 라우트 뒤에 마운트 — /analyze 가 router의 /:id 와 충돌하지 않게)
app.use("/api/cases", casesRouter);

// Candidate Discovery
app.use("/api/discovery", discoveryRouter);

// HTML → 구조화 텍스트 추출 (광고 문구 후보 분리)
app.use("/api/extract", extractRouter);

// Rule Agent — 룰셋 조회 + 텍스트 탐지
app.use("/api/rules", rulesRouter);
app.use("/api/detect", detectRouter);

// Analyzer Agent (LLM 또는 mock) — 신고 후보 검토 의견 생성
app.use("/api/analyze", analyzeRouter);

// Scoring Agent — 신고 후보 우선순위 점수 (0..100)
app.use("/api/score", scoreRouter);

app.listen(config.port, () => {
  console.log(`Reward Agent MVP running at http://localhost:${config.port}`);
});
