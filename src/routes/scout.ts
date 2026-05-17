import { Router } from "express";
import { ZodError, z } from "zod";
import {
  CandidateNotFoundError,
  candidateRepository
} from "../repositories/CandidateRepository.js";
import { scoutAgent, InvalidScoutTopicError } from "../services/scout/ScoutAgent.js";
import { moduleRegistry } from "../modules/index.js";
import { config } from "../utils/config.js";
import { DISCOVERY_MODES, CANDIDATE_STATUSES, type CandidateStatus } from "../types/candidate.js";

export const scoutRouter = Router();

const SAFETY_NOTICE =
  "Scout 후보 발굴 결과는 신고 대상 확정이 아닙니다. 본문 분석·증거 저장·사람 검토가 필요합니다. 일일 50건은 운영 목표이며 API 키/소스/약관/호출 제한에 따라 달라집니다.";

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
  if (!mod) return { ok: false as const, status: 404, body: errorBody("MODULE_NOT_FOUND", `Unknown moduleId: ${moduleId}`) };
  if (mod.status !== "active") return { ok: false as const, status: 409, body: errorBody("MODULE_NOT_READY", "해당 모듈은 아직 준비 중입니다.", { moduleId }) };
  return { ok: true as const };
}

// GET /api/scout/topics
scoutRouter.get("/topics", (req, res) => {
  const moduleId = typeof req.query.moduleId === "string" ? req.query.moduleId : "false_ad";
  const gate = requireActiveModule(moduleId);
  if (!gate.ok) return res.status(gate.status).json(gate.body);
  const topics = scoutAgent.listTopics(moduleId).map((t) => ({
    id: t.id, label: t.label, description: t.description, seedKeywords: t.seedKeywords
  }));
  res.json({
    ok: true, moduleId, topics,
    safetyNotice: "선택된 주제 시드 키워드는 의심 후보 탐색용이며 광고 작성용이 아닙니다."
  });
});

// GET /api/scout/sources
scoutRouter.get("/sources", (_req, res) => {
  res.json({
    ok: true,
    sources: scoutAgent.listSources(),
    safetyNotice: "검색 결과 HTML 직접 스크래핑은 사용하지 않습니다. 공식 API/RSS/Mock/수동 Seed만 사용합니다.",
    dailyTarget: config.scout.dailyLimit
  });
});

// POST /api/scout/discover
const DiscoverBodySchema = z.object({
  moduleId: z.string().default("false_ad"),
  topics: z.array(z.string()).default([]),
  mode: z.enum(DISCOVERY_MODES).default("quick"),
  sourceTypes: z.array(z.enum(["mock", "naver", "openai_web_search", "rss", "manual"])).optional(),
  maxCandidates: z.number().int().positive().max(200).optional()
});

scoutRouter.post("/discover", async (req, res) => {
  try {
    const input = DiscoverBodySchema.parse(req.body);
    const gate = requireActiveModule(input.moduleId);
    if (!gate.ok) return res.status(gate.status).json(gate.body);

    const result = await scoutAgent.discover({
      moduleId: input.moduleId,
      topics: input.topics,
      mode: input.mode,
      sourceTypes: input.sourceTypes,
      maxCandidates: input.maxCandidates
    });
    res.status(201).json({
      ok: true,
      moduleId: input.moduleId,
      candidates: result.candidates,
      added: result.added.length,
      usedSources: result.usedSources,
      sourceFallbacks: result.sourceFallbacks,
      dailyLimit: result.dailyLimit,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    if (error instanceof InvalidScoutTopicError) return res.status(400).json(errorBody("INVALID_TOPIC", error.message));
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/scout/candidates
const ListCandidatesQuerySchema = z.object({
  moduleId: z.string().optional(),
  topic: z.string().optional(),
  status: z.enum(CANDIDATE_STATUSES).optional(),
  minScore: z.string().transform((v) => Number(v)).pipe(z.number().min(0).max(100)).optional(),
  limit: z.string().transform((v) => Number(v)).pipe(z.number().int().min(1).max(200)).optional()
});

scoutRouter.get("/candidates", async (req, res) => {
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
      ok: true, candidates: cands, total: cands.length,
      safetyNotice: SAFETY_NOTICE, autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/scout/candidates/:id/queue
scoutRouter.post("/candidates/:id/queue", async (req, res) => {
  try {
    const body = z.object({ reviewerName: z.string().max(80).optional() }).parse(req.body ?? {});
    const result = await scoutAgent.queueCandidate(req.params.id, { reviewerName: body.reviewerName });
    res.status(201).json({
      ok: true,
      candidate: result.candidate,
      case: result.case,
      note: result.note,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    if (error instanceof CandidateNotFoundError) return res.status(404).json(errorBody("CANDIDATE_NOT_FOUND", error.message));
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/scout/candidates/:id/reject
scoutRouter.post("/candidates/:id/reject", async (req, res) => {
  try {
    const body = z.object({ note: z.string().max(300).optional() }).parse(req.body ?? {});
    const cand = await scoutAgent.rejectCandidate(req.params.id, body.note);
    res.json({
      ok: true,
      candidate: cand,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    if (error instanceof CandidateNotFoundError) return res.status(404).json(errorBody("CANDIDATE_NOT_FOUND", error.message));
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
