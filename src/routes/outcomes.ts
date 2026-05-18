import { Router } from "express";
import { ZodError, z } from "zod";
import {
  createOutcomeRepository,
  OutcomeNotFoundError,
  OutcomeValidationError,
  type JsonOutcomeRepository
} from "../repositories/OutcomeRepository.js";
import {
  OUTCOME_DECISIONS,
  OUTCOME_DECISION_LABELS,
  OUTCOME_LIMITS,
  OUTCOME_SAFETY_NOTICE,
  OUTCOME_STATUSES,
  OUTCOME_STATUS_LABELS,
  REWARD_OUTCOMES,
  REWARD_OUTCOME_LABELS
} from "../types/outcome.js";
import { isSafeCaseId } from "../services/EvidenceService.js";
import { traceLogger } from "../services/trace/TraceLogger.js";

const repo: JsonOutcomeRepository = createOutcomeRepository();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}
function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

const OutcomeInputSchema = z.object({
  moduleId: z.string().max(80).optional(),
  agencyName: z.string().max(OUTCOME_LIMITS.agencyName).optional(),
  agencyChannel: z.string().max(OUTCOME_LIMITS.agencyChannel).optional(),
  submittedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  followUpDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  referenceNumber: z.string().max(OUTCOME_LIMITS.referenceNumber).optional(),
  status: z.enum(OUTCOME_STATUSES).optional(),
  decision: z.enum(OUTCOME_DECISIONS).optional(),
  rewardOutcome: z.enum(REWARD_OUTCOMES).optional(),
  rewardAmount: z.number().min(0).nullable().optional(),
  rewardCurrency: z.string().max(OUTCOME_LIMITS.rewardCurrency).optional(),
  resultSummary: z.string().max(OUTCOME_LIMITS.resultSummary).optional(),
  rejectionReason: z.string().max(OUTCOME_LIMITS.rejectionReason).optional(),
  supplementRequest: z.string().max(OUTCOME_LIMITS.supplementRequest).optional(),
  notes: z.string().max(OUTCOME_LIMITS.notes).optional()
});

// ---------- Case 별 outcome ----------
// /api/cases/:caseId/outcome
export const caseOutcomesRouter = Router({ mergeParams: true });

caseOutcomesRouter.post("/:caseId/outcome", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const input = OutcomeInputSchema.parse(req.body ?? {});
    const result = await repo.upsertByCaseId(caseId, { ...input, caseId });

    // Trace: state_change + human_action
    const traceId = req.traceContext?.traceId;
    void traceLogger.log({
      eventType: "state_change",
      severity: "info",
      traceId,
      caseId,
      moduleId: result.outcome.moduleId,
      agentName: "OutcomeTracker",
      message: `Outcome 저장 → status=${result.outcome.status} decision=${result.outcome.decision}`,
      meta: {
        outcomeId: result.outcome.id,
        status: result.outcome.status,
        decision: result.outcome.decision,
        rewardOutcome: result.outcome.rewardOutcome,
        agencyName: result.outcome.agencyName,
        referenceNumberPreview: result.outcome.referenceNumber
          ? String(result.outcome.referenceNumber).slice(0, 4) + "***"
          : undefined,
        piiMasked: result.piiMasked
      }
    });
    void traceLogger.log({
      eventType: "human_action",
      severity: "info",
      traceId,
      caseId,
      moduleId: result.outcome.moduleId,
      agentName: "OutcomeTracker",
      message: "사용자 수동 결과 입력"
    });

    // recommendedFeedback — 반려/종결이면 Feedback DB 연결 유도
    let recommendedFeedback: { decision: string; reasonCategories: string[] } | undefined;
    if (result.outcome.decision === "REJECTED" || result.outcome.status === "CLOSED_NO_ACTION") {
      recommendedFeedback = {
        decision: "REJECT",
        reasonCategories: ["EVIDENCE_INSUFFICIENT", "AGENCY_MISMATCH"]
      };
    }

    res.status(201).json({
      ok: true,
      outcome: result.outcome,
      piiMasked: result.piiMasked,
      recommendedFeedback,
      message: "제출 결과가 내부 기록으로 저장되었습니다. 시스템은 자동 제출을 수행하지 않으며 포상금 수령을 보장하지 않습니다.",
      safetyNotice: OUTCOME_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof OutcomeValidationError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

caseOutcomesRouter.get("/:caseId/outcome", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const items = await repo.listByCaseId(caseId);
    res.json({
      ok: true,
      caseId,
      items,
      total: items.length,
      latest: items[0] ?? null,
      safetyNotice: OUTCOME_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ---------- 전체 outcome ----------
// /api/outcomes
export const outcomesRouter = Router();

outcomesRouter.get("/meta", (_req, res) => {
  res.json({
    ok: true,
    statuses: OUTCOME_STATUSES.map((s) => ({ code: s, label: OUTCOME_STATUS_LABELS[s] })),
    decisions: OUTCOME_DECISIONS.map((d) => ({ code: d, label: OUTCOME_DECISION_LABELS[d] })),
    rewardOutcomes: REWARD_OUTCOMES.map((r) => ({ code: r, label: REWARD_OUTCOME_LABELS[r] })),
    safetyNotice: OUTCOME_SAFETY_NOTICE
  });
});

const ListQuerySchema = z.object({
  caseId: z.string().max(80).optional(),
  moduleId: z.string().max(80).optional(),
  agencyName: z.string().max(80).optional(),
  status: z.enum(OUTCOME_STATUSES).optional(),
  decision: z.enum(OUTCOME_DECISIONS).optional(),
  rewardOutcome: z.enum(REWARD_OUTCOMES).optional(),
  followUpDue: z.string().transform((v) => v === "true").optional(),
  limit: z.string().transform((v) => Number(v)).pipe(z.number().int().min(1).max(200)).optional(),
  offset: z.string().transform((v) => Number(v)).pipe(z.number().int().min(0)).optional()
});

outcomesRouter.get("/", async (req, res) => {
  try {
    const q = ListQuerySchema.parse(req.query);
    const result = await repo.list(q);
    res.json({ ok: true, ...result, safetyNotice: OUTCOME_SAFETY_NOTICE });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

outcomesRouter.get("/stats", async (_req, res) => {
  try {
    const stats = await repo.getStats();
    res.json({ ok: true, stats, safetyNotice: OUTCOME_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

outcomesRouter.get("/patterns", async (_req, res) => {
  try {
    const patterns = await repo.getPatternStats();
    res.json({ ok: true, ...patterns });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

outcomesRouter.get("/follow-up", async (req, res) => {
  try {
    const grace = Number(req.query.graceDays ?? 0);
    const items = await repo.getFollowUpDue(Number.isFinite(grace) ? Math.max(0, grace) : 0);
    res.json({ ok: true, items, total: items.length, safetyNotice: OUTCOME_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

outcomesRouter.get("/:outcomeId", async (req, res) => {
  const id = req.params.outcomeId;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid outcomeId: ${id}`));
  }
  try {
    const item = await repo.getById(id);
    if (!item) return res.status(404).json(errorBody("OUTCOME_NOT_FOUND", `Outcome not found: ${id}`));
    res.json({ ok: true, outcome: item, safetyNotice: OUTCOME_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

outcomesRouter.patch("/:outcomeId", async (req, res) => {
  const id = req.params.outcomeId;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid outcomeId: ${id}`));
  }
  try {
    const input = OutcomeInputSchema.parse(req.body ?? {});
    const before = await repo.getById(id);
    if (!before) return res.status(404).json(errorBody("OUTCOME_NOT_FOUND", `Outcome not found: ${id}`));
    const result = await repo.update(id, input);

    // Trace: 변경
    const traceId = req.traceContext?.traceId;
    void traceLogger.log({
      eventType: "state_change",
      severity: "info",
      traceId,
      caseId: result.outcome.caseId,
      moduleId: result.outcome.moduleId,
      agentName: "OutcomeTracker",
      message: `Outcome 갱신 ${before.status} → ${result.outcome.status}`,
      meta: {
        outcomeId: id,
        fromStatus: before.status,
        toStatus: result.outcome.status,
        fromDecision: before.decision,
        toDecision: result.outcome.decision,
        rewardOutcome: result.outcome.rewardOutcome,
        piiMasked: result.piiMasked
      }
    });

    res.json({
      ok: true,
      outcome: result.outcome,
      piiMasked: result.piiMasked,
      safetyNotice: OUTCOME_SAFETY_NOTICE,
      message: "Outcome 이 업데이트되었습니다. 시스템은 자동 제출/자동 조회를 수행하지 않습니다."
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof OutcomeNotFoundError) {
      return res.status(404).json(errorBody("OUTCOME_NOT_FOUND", error.message));
    }
    if (error instanceof OutcomeValidationError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
