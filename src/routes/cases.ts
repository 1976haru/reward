import { Router } from "express";
import { ZodError } from "zod";
import {
  CaseNotFoundError,
  CaseTransitionError,
  createCaseRepository,
  type ICaseRepository
} from "../repositories/CaseRepository.js";
import {
  CreateCaseSchema,
  CreateReviewSchema,
  ListCasesQuerySchema,
  PatchCaseSchema,
  PatchStatusSchema,
  requiresManualSubmissionConfirmation,
  ALLOWED_TRANSITIONS
} from "../utils/validation.js";
import { moduleRegistry } from "../modules/index.js";

const repo: ICaseRepository = createCaseRepository();
export const casesRouter = Router();

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues
    .map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`)
    .join("; ");
}

function errorBody(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

// GET /api/cases — 목록 + 필터 + 페이지
casesRouter.get("/", async (req, res) => {
  try {
    const query = ListCasesQuerySchema.parse(req.query);
    const { cases, total, limit, offset } = await repo.list({
      status: query.status,
      moduleId: query.moduleId,
      minRiskScore: query.minRiskScore,
      limit: query.limit ?? 20,
      offset: query.offset ?? 0
    });
    res.json({
      ok: true,
      cases,
      page: { limit, offset, total }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/cases — 수동 Case 생성 (항상 DRAFT)
casesRouter.post("/", async (req, res) => {
  try {
    const input = CreateCaseSchema.parse(req.body);
    const moduleDef = moduleRegistry.get(input.moduleId);
    if (!moduleDef) {
      return res
        .status(404)
        .json(errorBody("MODULE_NOT_FOUND", `Unknown moduleId: ${input.moduleId}`));
    }
    if (moduleDef.status !== "active") {
      return res
        .status(409)
        .json(errorBody("MODULE_NOT_READY", "해당 모듈은 아직 준비 중입니다.", {
          moduleId: moduleDef.id,
          moduleStatus: moduleDef.status
        }));
    }
    const created = await repo.create({
      moduleId: input.moduleId,
      title: input.title,
      url: input.url,
      riskScore: input.riskScore,
      riskLevel: input.riskLevel,
      agencyCandidate: input.agencyCandidate,
      summary: input.summary,
      memo: input.memo,
      rewardCaution: input.rewardCaution
    });
    res.status(201).json({
      ok: true,
      case: created,
      humanReviewRequired: true,
      message: "Case가 생성되었습니다. 외부 신고 전 사람이 공식 기준을 검토해야 합니다.",
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/cases/:id — 상세
casesRouter.get("/:id", async (req, res) => {
  try {
    const found = await repo.get(req.params.id);
    res.json({
      ok: true,
      case: found,
      safetyNotice:
        "본 정보는 사람 검토용 자료이며, 외부 신고는 사용자가 공식 기준을 확인한 뒤 직접 진행해야 합니다."
    });
  } catch (error) {
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${req.params.id}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// PATCH /api/cases/:id — 안전 필드 수정
casesRouter.patch("/:id", async (req, res) => {
  try {
    const fields = PatchCaseSchema.parse(req.body);
    const updated = await repo.patch(req.params.id, fields);
    res.json({ ok: true, case: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${req.params.id}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// PATCH /api/cases/:id/status — 상태 전이
casesRouter.patch("/:id/status", async (req, res) => {
  try {
    const input = PatchStatusSchema.parse(req.body);

    if (requiresManualSubmissionConfirmation(input)) {
      return res.status(400).json(errorBody(
        "MANUAL_SUBMISSION_CONFIRMATION_REQUIRED",
        "SUBMITTED 상태로 변경하려면 confirmManualSubmission=true 또는 사람이 직접 제출했다는 메모(note)가 필요합니다. 이 도구는 외부 신고를 자동 제출하지 않습니다."
      ));
    }

    const updated = await repo.transition(req.params.id, {
      status: input.status,
      reviewerName: input.reviewerName,
      note: input.note
    });
    res.json({
      ok: true,
      case: updated,
      message: "상태가 변경되었습니다. 이 변경은 내부 기록이며 자동 신고 제출이 아닙니다.",
      humanReviewRequired: true,
      autoReport: false
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${req.params.id}`));
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

// POST /api/cases/:id/reviews — 사람 검토 기록 추가
casesRouter.post("/:id/reviews", async (req, res) => {
  try {
    const input = CreateReviewSchema.parse(req.body);
    const result = await repo.addReview(req.params.id, input);
    res.status(201).json({ ok: true, review: result.review, case: result.case });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${req.params.id}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

export { repo as casesRepository };
