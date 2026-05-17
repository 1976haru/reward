import { Router } from "express";
import { ZodError, z } from "zod";
import {
  CandidateNotFoundError,
  candidateRepository
} from "../repositories/CandidateRepository.js";
import {
  CandidateDiscoveryService,
  InvalidCandidateInputError,
  InvalidTopicError,
  candidateDiscoveryService
} from "../services/CandidateDiscoveryService.js";
import { moduleRegistry } from "../modules/index.js";
import { OrchestratorAgent } from "../agents/OrchestratorAgent.js";
import { CANDIDATE_STATUSES, DISCOVERY_MODES, type CandidateStatus } from "../types/candidate.js";
import { isHttpUrl } from "../utils/validation.js";

const orchestrator = new OrchestratorAgent();
const service: CandidateDiscoveryService = candidateDiscoveryService;
export const discoveryRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

function requireActiveModule(moduleId: string) {
  const mod = moduleRegistry.get(moduleId);
  if (!mod) {
    return { ok: false as const, status: 404, body: errorBody("MODULE_NOT_FOUND", `Unknown moduleId: ${moduleId}`) };
  }
  if (mod.status !== "active") {
    return {
      ok: false as const,
      status: 409,
      body: errorBody("MODULE_NOT_READY", "해당 모듈은 아직 준비 중입니다.", {
        moduleId,
        moduleStatus: mod.status
      })
    };
  }
  return { ok: true as const, module: mod };
}

const SAFETY_NOTICE =
  "후보 발굴 결과는 신고 대상 확정이 아니며, 본문 분석과 사람 검토가 필요합니다. 본 도구는 자동 신고를 수행하지 않습니다.";

// ============================================================
// GET /api/discovery/topics
// ============================================================

discoveryRouter.get("/topics", (req, res) => {
  const moduleId = typeof req.query.moduleId === "string" ? req.query.moduleId : "false_ad";
  const gate = requireActiveModule(moduleId);
  if (!gate.ok) return res.status(gate.status).json(gate.body);

  const topics = service.listTopics(moduleId).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    seedKeywords: t.seedKeywords
  }));
  res.json({
    ok: true,
    moduleId,
    topics,
    safetyNotice:
      "선택된 주제 시드 키워드는 의심 후보 탐색용입니다. 광고 작성용이 아닙니다."
  });
});

// ============================================================
// POST /api/discovery/candidates
// ============================================================

const DiscoverBodySchema = z.object({
  moduleId: z.string().default("false_ad"),
  topics: z.array(z.string()).default([]),
  mode: z.enum(DISCOVERY_MODES).default("quick"),
  maxCandidates: z.number().int().positive().max(200).optional()
});

discoveryRouter.post("/candidates", async (req, res) => {
  try {
    const input = DiscoverBodySchema.parse(req.body);
    const gate = requireActiveModule(input.moduleId);
    if (!gate.ok) return res.status(gate.status).json(gate.body);

    const result = await service.discover({
      moduleId: input.moduleId,
      topics: input.topics,
      mode: input.mode,
      maxCandidates: input.maxCandidates
    });
    res.status(201).json({
      ok: true,
      moduleId: input.moduleId,
      mode: input.mode,
      discoveryMode: result.mode,
      candidates: result.candidates,
      added: result.added.length,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof InvalidTopicError) {
      return res.status(400).json(errorBody("INVALID_TOPIC", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// GET /api/discovery/candidates
// ============================================================

const ListCandidatesQuerySchema = z.object({
  moduleId: z.string().optional(),
  topic: z.string().optional(),
  status: z.enum(CANDIDATE_STATUSES).optional(),
  minScore: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().min(0).max(100))
    .optional(),
  limit: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(200))
    .optional()
});

discoveryRouter.get("/candidates", async (req, res) => {
  try {
    const q = ListCandidatesQuerySchema.parse(req.query);
    const cands = await candidateRepository.list({
      moduleId: q.moduleId,
      topic: q.topic,
      status: q.status as CandidateStatus | undefined,
      minScore: q.minScore,
      limit: q.limit ?? 50
    });
    res.json({
      ok: true,
      candidates: cands,
      total: cands.length,
      safetyNotice: SAFETY_NOTICE
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// POST /api/discovery/candidates/:id/analyze
// ============================================================

discoveryRouter.post("/candidates/:id/analyze", async (req, res) => {
  try {
    const cand = await candidateRepository.getById(req.params.id);
    const gate = requireActiveModule(cand.moduleId);
    if (!gate.ok) return res.status(gate.status).json(gate.body);

    if (!isHttpUrl(cand.url)) {
      return res.status(400).json(errorBody("INVALID_URL", "후보 URL이 http/https가 아닙니다."));
    }
    if (cand.moduleId !== "false_ad") {
      return res.status(501).json(errorBody("MODULE_NOT_IMPLEMENTED", "분석 파이프라인이 아직 연결되지 않은 모듈입니다."));
    }

    const rewardCase = await orchestrator.analyze({
      url: cand.url,
      moduleId: "false_ad",
      memo: `discovery topic=${cand.topic}; keyword=${cand.keyword}; candidateId=${cand.id}`
    });
    const updated = await candidateRepository.updateStatus(cand.id, "ANALYZED", { caseId: rewardCase.id });
    res.status(201).json({
      ok: true,
      candidate: updated,
      case: rewardCase,
      message: "후보 본문 분석을 완료하고 Case를 생성했습니다. 외부 신고 전 사람이 공식 기준을 검토해야 합니다.",
      humanReviewRequired: true,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof CandidateNotFoundError) {
      return res.status(404).json(errorBody("CANDIDATE_NOT_FOUND", error.message));
    }
    res.status(500).json(errorBody("ANALYZE_FAILED", (error as Error).message));
  }
});

// ============================================================
// POST /api/discovery/manual
// ============================================================

const ManualBodySchema = z.object({
  moduleId: z.string().default("false_ad"),
  url: z.string().min(1).refine(isHttpUrl, { message: "URL은 http 또는 https 만 허용됩니다." }),
  title: z.string().max(300).optional(),
  snippet: z.string().max(2000).optional(),
  topic: z.string().max(80).optional()
});

discoveryRouter.post("/manual", async (req, res) => {
  try {
    const input = ManualBodySchema.parse(req.body);
    const gate = requireActiveModule(input.moduleId);
    if (!gate.ok) return res.status(gate.status).json(gate.body);

    const candidate = await service.createManualCandidate(input);
    res.status(201).json({
      ok: true,
      candidate,
      message: "수동 URL이 후보로 등록되었습니다. 본문 분석은 별도 요청이 필요합니다.",
      humanReviewRequired: true,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof InvalidCandidateInputError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
