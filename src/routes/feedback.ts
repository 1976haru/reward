import { Router } from "express";
import { ZodError, z } from "zod";
import {
  createFeedbackRepository,
  FeedbackValidationError,
  type IFeedbackRepository
} from "../repositories/FeedbackRepository.js";
import { createCaseRepository, CaseNotFoundError } from "../repositories/CaseRepository.js";
import {
  FEEDBACK_DECISIONS,
  FEEDBACK_REASON_CATEGORIES,
  FEEDBACK_REASON_CATEGORY_INFO,
  FEEDBACK_DECISION_LABELS,
  FEEDBACK_SAFETY_NOTICE,
  FEEDBACK_MEMO_MAX,
  FEEDBACK_NOTES_MAX
} from "../types/feedback.js";
import { isSafeCaseId } from "../services/EvidenceService.js";
import { traceLogger } from "../services/trace/TraceLogger.js";

const feedbackRepo: IFeedbackRepository = createFeedbackRepository();
const caseRepo = createCaseRepository();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

const CreateFeedbackSchema = z.object({
  decision: z.enum(FEEDBACK_DECISIONS),
  reasonCategories: z.array(z.enum(FEEDBACK_REASON_CATEGORIES)).optional(),
  reviewerName: z.string().max(80).optional(),
  memo: z.string().max(FEEDBACK_MEMO_MAX).optional(),
  relatedRuleIds: z.array(z.string().max(64)).max(50).optional(),
  relatedKeywords: z.array(z.string().max(100)).max(50).optional(),
  llmIssueNotes: z.string().max(FEEDBACK_NOTES_MAX).optional(),
  scoringIssueNotes: z.string().max(FEEDBACK_NOTES_MAX).optional(),
  suggestedRuleChanges: z.array(z.string().max(300)).max(20).optional(),
  suggestedPromptChanges: z.array(z.string().max(300)).max(20).optional(),
  suggestedScoringChanges: z.array(z.string().max(300)).max(20).optional(),
  caseStatusAtFeedback: z.string().max(40).optional(),
  moduleId: z.string().max(80).optional()
});

const ListQuerySchema = z.object({
  decision: z.enum(FEEDBACK_DECISIONS).optional(),
  reasonCategory: z.enum(FEEDBACK_REASON_CATEGORIES).optional(),
  ruleId: z.string().max(64).optional(),
  keyword: z.string().max(100).optional(),
  caseId: z.string().max(64).optional(),
  limit: z.string().transform((v) => Number(v)).pipe(z.number().int().min(1).max(200)).optional(),
  offset: z.string().transform((v) => Number(v)).pipe(z.number().int().min(0)).optional()
});

// ============================================================
// 검토자/사용자 편의: meta — 카테고리 사전, decisions, safetyNotice
// ============================================================
export const feedbackMetaRouter = Router();

feedbackMetaRouter.get("/meta", (_req, res) => {
  res.json({
    ok: true,
    decisions: FEEDBACK_DECISIONS.map((d) => ({ code: d, label: FEEDBACK_DECISION_LABELS[d] })),
    reasonCategories: FEEDBACK_REASON_CATEGORIES.map((c) => FEEDBACK_REASON_CATEGORY_INFO[c]),
    safetyNotice: FEEDBACK_SAFETY_NOTICE,
    autoRuleChange: false,
    autoReport: false,
    humanReviewRequired: true
  });
});

// ============================================================
// 전체 피드백 라우터 — /api/feedback
// ============================================================
export const feedbackRouter = Router();

feedbackRouter.get("/meta", (_req, res) => {
  res.json({
    ok: true,
    decisions: FEEDBACK_DECISIONS.map((d) => ({ code: d, label: FEEDBACK_DECISION_LABELS[d] })),
    reasonCategories: FEEDBACK_REASON_CATEGORIES.map((c) => FEEDBACK_REASON_CATEGORY_INFO[c]),
    safetyNotice: FEEDBACK_SAFETY_NOTICE
  });
});

// GET /api/feedback — 전체 목록 + 필터
feedbackRouter.get("/", async (req, res) => {
  try {
    const q = ListQuerySchema.parse(req.query);
    const result = await feedbackRepo.list(q);
    res.json({
      ok: true,
      ...result,
      safetyNotice: FEEDBACK_SAFETY_NOTICE,
      autoRuleChange: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/feedback — 신고 후 피드백 입력(개선 후보 반영용, 룰/점수 자동 변경 없음)
// 외부 표기(APPROVED/REJECTED)를 내부 코드(APPROVE/REJECT)로 매핑한다. memo 는 저장 전 마스킹된다.
const DECISION_ALIAS: Record<string, string> = {
  APPROVED: "APPROVE",
  REJECTED: "REJECT",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  HOLD: "HOLD",
  NEEDS_MORE_EVIDENCE: "NEEDS_MORE_EVIDENCE",
  DUPLICATE: "DUPLICATE",
  NOT_RELEVANT: "NOT_RELEVANT",
  FALSE_POSITIVE: "FALSE_POSITIVE",
  OUTCOME_CONFIRMED: "OUTCOME_CONFIRMED"
};

const PostFeedbackSchema = z.object({
  caseId: z.string().max(64).optional(),
  candidateId: z.string().max(64).optional(),
  moduleId: z.string().max(80).optional(),
  decision: z.string().max(40),
  reasonCategory: z.enum(FEEDBACK_REASON_CATEGORIES).optional(),
  reasonCategories: z.array(z.enum(FEEDBACK_REASON_CATEGORIES)).optional(),
  reviewerName: z.string().max(80).optional(),
  memo: z.string().max(FEEDBACK_MEMO_MAX).optional(),
  relatedKeywords: z.array(z.string().max(100)).max(50).optional()
});

feedbackRouter.post("/", async (req, res) => {
  try {
    const body = PostFeedbackSchema.parse(req.body ?? {});
    const decision = DECISION_ALIAS[String(body.decision).toUpperCase()];
    if (!decision) {
      return res
        .status(400)
        .json(errorBody("VALIDATION_ERROR", `decision은 ${FEEDBACK_DECISIONS.join("/")} (또는 APPROVED/REJECTED) 중 하나여야 합니다.`));
    }
    const reasonCategories = body.reasonCategories ?? (body.reasonCategory ? [body.reasonCategory] : []);
    const result = await feedbackRepo.create({
      caseId: body.caseId ?? body.candidateId ?? `manual_${Date.now()}`,
      moduleId: body.moduleId,
      decision: decision as never,
      reasonCategories,
      reviewerName: body.reviewerName,
      memo: body.memo,
      relatedKeywords: body.relatedKeywords
    } as never);
    res.status(201).json({
      ok: true,
      feedback: result.feedback,
      piiMasked: result.piiMasked,
      message: "피드백은 다음 버전 개선 후보로만 반영됩니다. 자동으로 신고 기준이나 점수를 바꾸지 않습니다. 사람 검토 후 다음 버전에 반영합니다.",
      safetyNotice: FEEDBACK_SAFETY_NOTICE,
      autoRuleChange: false,
      autoReport: false,
      rewardGuaranteed: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", error.message));
    }
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/feedback/stats
feedbackRouter.get("/stats", async (_req, res) => {
  try {
    const stats = await feedbackRepo.stats();
    res.json({
      ok: true,
      stats,
      safetyNotice: FEEDBACK_SAFETY_NOTICE,
      autoRuleChange: false
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/feedback/improvements
feedbackRouter.get("/improvements", async (_req, res) => {
  try {
    const r = await feedbackRepo.improvements();
    res.json({
      ok: true,
      ...r,
      message: "자동 변경이 아니라 사람이 검토할 개선 후보입니다.",
      safetyNotice: FEEDBACK_SAFETY_NOTICE,
      autoRuleChange: false
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

feedbackRouter.get("/:id", async (req, res) => {
  try {
    const item = await feedbackRepo.getById(req.params.id);
    if (!item) return res.status(404).json(errorBody("FEEDBACK_NOT_FOUND", `Feedback not found: ${req.params.id}`));
    res.json({ ok: true, feedback: item, safetyNotice: FEEDBACK_SAFETY_NOTICE });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// Case 별 피드백 — Case API 라우터에 mount
// POST /api/cases/:id/feedback
// GET  /api/cases/:id/feedback
// ============================================================
export const caseFeedbackRouter = Router({ mergeParams: true });

caseFeedbackRouter.post("/:caseId/feedback", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const input = CreateFeedbackSchema.parse(req.body);

    // Case 존재 확인 — 없으면 warning (테스트 환경에서도 통과시킴)
    let caseExists = true;
    let moduleId = input.moduleId;
    let statusAtFeedback = input.caseStatusAtFeedback;
    try {
      const c = await caseRepo.get(caseId);
      moduleId = moduleId ?? c.moduleId;
      statusAtFeedback = statusAtFeedback ?? c.status;
    } catch (e) {
      if (e instanceof CaseNotFoundError) {
        caseExists = false;
      } else {
        throw e;
      }
    }

    const created = await feedbackRepo.create({
      caseId,
      decision: input.decision,
      reasonCategories: input.reasonCategories,
      reviewerName: input.reviewerName,
      memo: input.memo,
      relatedRuleIds: input.relatedRuleIds,
      relatedKeywords: input.relatedKeywords,
      llmIssueNotes: input.llmIssueNotes,
      scoringIssueNotes: input.scoringIssueNotes,
      suggestedRuleChanges: input.suggestedRuleChanges,
      suggestedPromptChanges: input.suggestedPromptChanges,
      suggestedScoringChanges: input.suggestedScoringChanges,
      caseStatusAtFeedback: statusAtFeedback,
      moduleId
    });

    // Trace: human_action 으로 피드백 저장 기록 (memo 본문은 trace 에 저장 X)
    void traceLogger.log({
      eventType: "human_action",
      severity: "info",
      traceId: req.traceContext?.traceId,
      caseId,
      moduleId: moduleId,
      agentName: "FeedbackDB",
      actor: input.reviewerName ?? "anonymous",
      message: `피드백 저장: ${input.decision}`,
      meta: {
        decision: input.decision,
        reasonCategories: input.reasonCategories ?? [],
        piiMasked: created.piiMasked,
        relatedRuleIds: input.relatedRuleIds ?? [],
        hasMemo: typeof input.memo === "string" && input.memo.length > 0
      }
    });

    res.status(201).json({
      ok: true,
      feedback: created.feedback,
      piiMasked: created.piiMasked,
      piiHits: created.piiHits,
      caseExists,
      warning: !caseExists ? "해당 caseId를 찾을 수 없어 피드백만 단독으로 기록되었습니다." : undefined,
      message:
        "피드백이 저장되었습니다. 이 정보는 룰/프롬프트/점수 개선 근거로 사용되며, 시스템이 자동으로 룰을 변경하지 않습니다.",
      safetyNotice: FEEDBACK_SAFETY_NOTICE,
      autoRuleChange: false,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof FeedbackValidationError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", error.message));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

caseFeedbackRouter.get("/:caseId/feedback", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const items = await feedbackRepo.listByCaseId(caseId);
    res.json({
      ok: true,
      caseId,
      items,
      total: items.length,
      safetyNotice: FEEDBACK_SAFETY_NOTICE
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});
