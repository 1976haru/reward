import { Router } from "express";
import { ZodError, z } from "zod";
import {
  CaseNotFoundError,
  CaseTransitionError,
  createCaseRepository,
  type ICaseRepository
} from "../repositories/CaseRepository.js";
import { CASE_STATUSES, type CaseStatus } from "../types/core.js";
import {
  ALLOWED_TRANSITIONS,
  LIMITS
} from "../utils/validation.js";
import { requireManualSubmissionConfirmation, SUBMITTED_RESPONSE_MESSAGE } from "../policy/approvalGate.js";
import { EvidenceService, isSafeCaseId } from "../services/EvidenceService.js";
import { ReportService } from "../services/ReportService.js";
import {
  REVIEW_QUEUE_STATUS_LABELS,
  type ReviewLogEntry,
  type ReviewQueueItem,
  type ReviewQueueStatus,
  type QueueSummary
} from "../types/reviewQueue.js";
import { traceLogger } from "../services/trace/TraceLogger.js";

const repo: ICaseRepository = createCaseRepository();
const evidence = new EvidenceService();
const reportService = new ReportService();

export const reviewRouter = Router();

const SAFETY_NOTICE =
  "이 시스템은 자동 신고를 수행하지 않습니다. 모든 제출은 사람이 공식 기관 사이트에서 직접 해야 합니다. SUBMITTED 상태는 외부 제출 사실을 내부 기록으로 표시할 뿐입니다.";

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

// ============================================================
// GET /api/review/queue — 상태별 카운트 + 페이지 + 필터
// ============================================================

const ListQuerySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  moduleId: z.string().optional(),
  minPriorityScore: z.string().transform((v) => Number(v)).pipe(z.number().min(0).max(100)).optional(),
  hasEvidence: z.string().transform((v) => v === "true").optional(),
  hasReport: z.string().transform((v) => v === "true").optional(),
  sort: z.enum(["priority", "recent"]).default("priority").optional(),
  limit: z.string().transform((v) => Number(v)).pipe(z.number().int().min(1).max(200)).optional(),
  offset: z.string().transform((v) => Number(v)).pipe(z.number().int().min(0)).optional()
});

reviewRouter.get("/queue", async (req, res) => {
  try {
    const q = ListQuerySchema.parse(req.query);

    // 1) 전체 → status 카운트는 필터 무관하게 한 번 계산
    const all = await repo.list({ limit: 500, offset: 0 });
    const counts: Partial<Record<ReviewQueueStatus, number>> = {};
    for (const s of CASE_STATUSES) counts[s] = 0;
    for (const c of all.cases) {
      counts[c.status as ReviewQueueStatus] = (counts[c.status as ReviewQueueStatus] ?? 0) + 1;
    }
    const summary: QueueSummary = { total: all.total, counts };

    // 2) 필터 적용
    let filtered = all.cases.slice();
    if (q.status) filtered = filtered.filter((c) => c.status === q.status);
    if (q.moduleId) filtered = filtered.filter((c) => c.moduleId === q.moduleId);
    if (typeof q.minPriorityScore === "number") {
      filtered = filtered.filter((c) => (c.riskScore ?? 0) >= q.minPriorityScore!);
    }

    // hasEvidence / hasReport — case별로 파일 존재 빠르게 확인
    let needsEvidenceCheck = false;
    let needsReportCheck = false;
    if (q.hasEvidence === true || q.hasEvidence === false) needsEvidenceCheck = true;
    if (q.hasReport === true || q.hasReport === false) needsReportCheck = true;

    // 정렬
    const sort = q.sort ?? "priority";
    filtered.sort((a, b) => {
      if (sort === "priority") {
        if ((b.riskScore ?? 0) !== (a.riskScore ?? 0)) return (b.riskScore ?? 0) - (a.riskScore ?? 0);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    const offset = q.offset ?? 0;
    const limit = q.limit ?? 30;
    const paged = filtered.slice(offset, offset + limit);

    // hasEvidence/hasReport 플래그 — 한정된 페이지에서만 stat
    const items: ReviewQueueItem[] = await Promise.all(
      paged.map(async (c) => {
        let hasEvidencePackage: boolean | undefined;
        let hasReportDraft: boolean | undefined;
        if (needsEvidenceCheck || true) {
          if (isSafeCaseId(c.id)) {
            try {
              const ev = await evidence.summarizePackage(c.id);
              hasEvidencePackage = ev.exists && (ev.hasHtml || ev.hasScreenshot || ev.hasPdf);
            } catch { hasEvidencePackage = false; }
          }
        }
        if (needsReportCheck || true) {
          try {
            const rs = await reportService.summarizeReport(c.id);
            hasReportDraft = rs.exists && (rs.hasMarkdown || rs.hasDocx);
          } catch { hasReportDraft = false; }
        }
        return {
          id: c.id,
          moduleId: c.moduleId,
          title: c.title,
          url: c.url,
          status: c.status as ReviewQueueStatus,
          priorityScore: c.riskScore,
          priorityLabel: c.riskLevel,
          agencyCandidate: c.agencyCandidate,
          summary: c.summary,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          hasEvidencePackage,
          hasReportDraft,
          matchCount: c.ruleDetection?.counts?.total ?? c.ruleHits?.length ?? 0,
          llmSummary: c.llmAnalysis?.summary
        };
      })
    );

    // hasEvidence / hasReport 필터 적용 (페이지 후가 자연스러우나 필터 일관성을 위해 한 번 더)
    let outItems = items;
    if (typeof q.hasEvidence === "boolean") outItems = outItems.filter((i) => Boolean(i.hasEvidencePackage) === q.hasEvidence);
    if (typeof q.hasReport === "boolean") outItems = outItems.filter((i) => Boolean(i.hasReportDraft) === q.hasReport);

    res.json({
      ok: true,
      summary,
      items: outItems,
      page: { limit, offset, total: filtered.length },
      statusLabels: REVIEW_QUEUE_STATUS_LABELS,
      allowedTransitions: ALLOWED_TRANSITIONS,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// GET /api/review/queue/:caseId — 상세 (Case + evidence + report + logs)
// ============================================================

reviewRouter.get("/queue/:caseId", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const c = await repo.get(caseId);
    const ev = await evidence.summarizePackage(caseId).catch(() => null);
    const rs = await reportService.summarizeReport(caseId).catch(() => null);

    const logs = buildLogs(c);

    res.json({
      ok: true,
      case: c,
      evidencePackage: ev,
      reportSummary: rs,
      logs,
      statusLabels: REVIEW_QUEUE_STATUS_LABELS,
      allowedFrom: ALLOWED_TRANSITIONS[c.status as CaseStatus] ?? [],
      safetyNotice: SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${caseId}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// PATCH /api/review/queue/:caseId/status — 상태 변경 (Case API wrapper)
// ============================================================

const PatchStatusSchema = z.object({
  status: z.enum(CASE_STATUSES),
  reviewerName: z.string().max(LIMITS.reviewerName).optional(),
  note: z.string().max(LIMITS.reviewNote).optional(),
  confirmManualSubmission: z.boolean().optional()
});

reviewRouter.patch("/queue/:caseId/status", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const input = PatchStatusSchema.parse(req.body);

    const gate = requireManualSubmissionConfirmation(input);
    if (!gate.ok) {
      return res.status(400).json(errorBody(
        gate.code === "REVIEWER_REQUIRED" ? "MANUAL_SUBMISSION_REVIEWER_REQUIRED" : "MANUAL_SUBMISSION_CONFIRMATION_REQUIRED",
        gate.message
      ));
    }

    const updated = await repo.transition(caseId, {
      status: input.status,
      reviewerName: input.reviewerName,
      note: input.note
    });

    // Trace: state_change + human_action 기록 (개인정보 미저장 — reviewerName 정도만)
    const traceId = req.traceContext?.traceId;
    void traceLogger.log({
      eventType: "state_change",
      severity: "info",
      traceId,
      caseId,
      moduleId: updated.moduleId,
      agentName: "ReviewQueue",
      message: `Case 상태 변경 → ${input.status}`,
      meta: { fromStatus: updated.statusHistory?.at(-1)?.from, toStatus: input.status }
    });
    void traceLogger.log({
      eventType: "human_action",
      severity: "info",
      traceId,
      caseId,
      moduleId: updated.moduleId,
      agentName: "ReviewQueue",
      actor: input.reviewerName ?? "anonymous",
      message: `사람 검토 결정: ${input.status}`,
      meta: { hasNote: Boolean(input.note), confirmManualSubmission: input.confirmManualSubmission }
    });

    const log: ReviewLogEntry = {
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      caseId,
      kind: "STATUS_CHANGE",
      fromStatus: (updated.statusHistory?.at(-1)?.from ?? undefined) as CaseStatus | undefined,
      toStatus: input.status,
      reviewerName: input.reviewerName,
      note: input.note,
      createdAt: updated.updatedAt
    };

    res.json({
      ok: true,
      case: updated,
      log,
      message: input.status === "SUBMITTED"
        ? SUBMITTED_RESPONSE_MESSAGE
        : "상태가 변경되었습니다. 외부 신고 자동 제출은 수행되지 않았습니다.",
      safetyNotice: SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${caseId}`));
    }
    if (error instanceof CaseTransitionError) {
      return res.status(400).json(errorBody(
        "INVALID_STATUS_TRANSITION",
        error.message,
        { allowedFrom: ALLOWED_TRANSITIONS[error.from] }
      ));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// POST /api/review/queue/:caseId/note — 검토 메모 추가
// ============================================================

const NoteSchema = z.object({
  reviewerName: z.string().max(LIMITS.reviewerName).optional(),
  note: z.string().min(1).max(LIMITS.reviewNote)
});

reviewRouter.post("/queue/:caseId/note", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const input = NoteSchema.parse(req.body);
    const result = await repo.addReview(caseId, {
      reviewerName: input.reviewerName ?? "anonymous",
      decision: "PENDING",
      notes: input.note
    });
    const log: ReviewLogEntry = {
      id: `n-${result.review.id}`,
      caseId,
      kind: "NOTE",
      reviewerName: input.reviewerName,
      note: input.note,
      createdAt: result.review.at
    };
    res.status(201).json({
      ok: true,
      log,
      case: result.case,
      safetyNotice: SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${caseId}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// ============================================================
// GET /api/review/queue/:caseId/logs — 상태 변경 + 메모 로그
// ============================================================

reviewRouter.get("/queue/:caseId/logs", async (req, res) => {
  const caseId = req.params.caseId;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const c = await repo.get(caseId);
    res.json({
      ok: true,
      logs: buildLogs(c),
      safetyNotice: SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${caseId}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

function buildLogs(c: Awaited<ReturnType<ICaseRepository["get"]>>): ReviewLogEntry[] {
  const logs: ReviewLogEntry[] = [];
  for (const h of c.statusHistory ?? []) {
    logs.push({
      id: `s-${h.at}-${h.to}`,
      caseId: c.id,
      kind: "STATUS_CHANGE",
      fromStatus: (h.from ?? undefined) as CaseStatus | undefined,
      toStatus: h.to as CaseStatus,
      reviewerName: h.reviewerName,
      note: h.note,
      createdAt: h.at
    });
  }
  for (const r of c.reviews ?? []) {
    logs.push({
      id: `n-${r.id}`,
      caseId: c.id,
      kind: "NOTE",
      reviewerName: r.reviewerName,
      note: r.notes,
      createdAt: r.at
    });
  }
  logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return logs;
}
