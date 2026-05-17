import { Router } from "express";
import { ZodError, z } from "zod";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
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
  ALLOWED_TRANSITIONS,
  isHttpUrl
} from "../utils/validation.js";
import { moduleRegistry } from "../modules/index.js";
import {
  ALLOWED_EVIDENCE_FILENAMES,
  EvidenceService,
  isAllowedEvidenceFileName,
  isSafeCaseId
} from "../services/EvidenceService.js";
import { CollectorAgent } from "../agents/CollectorAgent.js";
import {
  ReportService,
  isAllowedReportFileName as isAllowedReportFileNameFn,
  isSafeCaseId as isSafeCaseIdReport
} from "../services/ReportService.js";
import { ALLOWED_REPORT_FILENAMES } from "../types/report.js";

const repo: ICaseRepository = createCaseRepository();
const evidence = new EvidenceService();
const collector = new CollectorAgent();
const reportService = new ReportService();
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

// GET /api/cases/:id — 상세 (+ evidence package summary + report summary)
casesRouter.get("/:id", async (req, res) => {
  try {
    const found = await repo.get(req.params.id);
    let evidencePackage = null as Awaited<ReturnType<typeof evidence.summarizePackage>> | null;
    let reportSummary = null as Awaited<ReturnType<typeof reportService.summarizeReport>> | null;
    if (isSafeCaseId(found.id)) {
      try { evidencePackage = await evidence.summarizePackage(found.id); } catch { evidencePackage = null; }
      try { reportSummary = await reportService.summarizeReport(found.id); } catch { reportSummary = null; }
    }
    res.json({
      ok: true,
      case: found,
      evidencePackage,
      reportSummary,
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

// ============================================================
// Evidence sub-routes — /api/cases/:id/evidence/*
// ============================================================

const CaptureBodySchema = z.object({
  url: z
    .string()
    .min(1)
    .refine(isHttpUrl, { message: "URL은 http 또는 https 만 허용됩니다." })
});

// GET /api/cases/:id/evidence/package — package summary (file flags + completeness score)
casesRouter.get("/:id/evidence/package", async (req, res) => {
  const caseId = req.params.id;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const summary = await evidence.summarizePackage(caseId);
    res.json({
      ok: true,
      caseId,
      evidencePackage: summary,
      safetyNotice: summary.safetyNotice,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// POST /api/cases/:id/evidence/package — 명시적 패키지 생성 (URL 수집 + 선택 산출물 JSON 첨부)
const PackageBodySchema = z
  .object({
    url: z.string().min(1).refine(isHttpUrl, { message: "URL은 http 또는 https 만 허용됩니다." }).optional(),
    title: z.string().max(500).optional(),
    moduleId: z.string().default("false_ad"),
    extraction: z.unknown().optional(),
    rules: z.unknown().optional(),
    analysis: z.unknown().optional(),
    scoring: z.unknown().optional()
  })
  .refine(
    (v) => Boolean(v.url) || v.extraction !== undefined || v.rules !== undefined || v.analysis !== undefined || v.scoring !== undefined,
    { message: "url 또는 extraction/rules/analysis/scoring 중 하나 이상 필요합니다." }
  );

casesRouter.post("/:id/evidence/package", async (req, res) => {
  const caseId = req.params.id;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const input = PackageBodySchema.parse(req.body);
    if (input.url) {
      const doc = await collector.collectUrl(input.url);
      const summary = await evidence.createPackage(caseId, doc, {
        extraction: input.extraction,
        rules: input.rules,
        analysis: input.analysis,
        scoring: input.scoring
      });
      return res.status(201).json({
        ok: true,
        caseId,
        evidencePackage: summary,
        message: "증거 패키지가 저장되었습니다. 자동 신고가 아니라 사람 검토용 로컬 자료입니다.",
        autoReport: false,
        humanReviewRequired: true
      });
    }
    // URL 없이 산출물만 첨부 — buildEvidence를 호출하지 않고 JSON만 저장
    const written: string[] = [];
    if (input.extraction !== undefined) { await evidence.saveJsonFile(caseId, "extraction.json", input.extraction); written.push("extraction.json"); }
    if (input.rules !== undefined)      { await evidence.saveJsonFile(caseId, "rules.json", input.rules);            written.push("rules.json"); }
    if (input.analysis !== undefined)   { await evidence.saveJsonFile(caseId, "analysis.json", input.analysis);      written.push("analysis.json"); }
    if (input.scoring !== undefined)    { await evidence.saveJsonFile(caseId, "scoring.json", input.scoring);        written.push("scoring.json"); }
    const summary = await evidence.summarizePackage(caseId);
    return res.status(201).json({
      ok: true,
      caseId,
      written,
      evidencePackage: summary,
      message: "산출물 JSON이 패키지에 첨부되었습니다.",
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("PACKAGE_FAILED", (error as Error).message));
  }
});

// GET /api/cases/:id/evidence — manifest 또는 디렉터리 스캔 결과
casesRouter.get("/:id/evidence", async (req, res) => {
  const caseId = req.params.id;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    // Case 존재 확인은 강제하지 않는다 — 분석 외에 capture로 단독 생성된 evidence도 조회 가능
    const manifest = await evidence.listEvidence(caseId);
    if (!manifest) {
      return res.status(404).json(errorBody("EVIDENCE_NOT_FOUND", `No evidence found for case ${caseId}`));
    }
    res.json({
      ok: true,
      caseId,
      manifest,
      safetyNotice:
        "본 자료는 사람 검토용 증거 보존이며, 외부 신고 제출은 사용자가 공식 기준을 확인한 뒤 직접 진행합니다.",
      autoReport: false
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/cases/:id/evidence/:fileName — 개별 파일 다운로드 (allowlist만)
casesRouter.get("/:id/evidence/:fileName", async (req, res) => {
  const { id: caseId, fileName } = req.params;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  if (!isAllowedEvidenceFileName(fileName)) {
    return res.status(400).json(errorBody(
      "INVALID_FILE_NAME",
      `Allowed file names: ${[...ALLOWED_EVIDENCE_FILENAMES].join(", ")}`
    ));
  }
  try {
    const filePath = evidence.getFilePath(caseId, fileName);
    const s = await stat(filePath); // ENOENT throws
    const mime = MIME_BY_FILENAME[fileName] ?? "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(s.size));
    res.setHeader("Cache-Control", "no-store");
    const stream = createReadStream(filePath);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json(errorBody("INTERNAL_ERROR", err.message));
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return res.status(404).json(errorBody("EVIDENCE_FILE_NOT_FOUND", `Not found: ${fileName}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

const MIME_BY_FILENAME: Record<string, string> = {
  "page.html": "text/html; charset=utf-8",
  "page.txt": "text/plain; charset=utf-8",
  "screenshot.png": "image/png",
  "page.pdf": "application/pdf",
  "metadata.json": "application/json; charset=utf-8",
  "manifest.json": "application/json; charset=utf-8"
};

// POST /api/cases/:id/evidence/capture — 공개 URL을 수집해 evidence 저장
casesRouter.post("/:id/evidence/capture", async (req, res) => {
  const caseId = req.params.id;
  if (!isSafeCaseId(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const { url } = CaptureBodySchema.parse(req.body);
    const doc = await collector.collectUrl(url);
    const bundle = await evidence.buildEvidence(caseId, doc);
    const manifest = await evidence.readManifest(caseId);
    res.status(201).json({
      ok: true,
      caseId,
      evidence: bundle,
      manifest,
      message: "증거 파일이 저장되었습니다. 외부 신고 전 사람이 공식 기준을 검토해야 합니다.",
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json(errorBody("VALIDATION_ERROR", zodErrorMessage(error)));
    }
    res.status(500).json(errorBody("CAPTURE_FAILED", (error as Error).message));
  }
});

// ============================================================
// Report sub-routes — /api/cases/:id/report/*
// ============================================================

// POST /api/cases/:id/report/draft — 신고서 초안 생성 (md/txt/docx/metadata)
casesRouter.post("/:id/report/draft", async (req, res) => {
  const caseId = req.params.id;
  if (!isSafeCaseIdReport(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const found = await repo.get(caseId);
    const ev = await evidence.summarizePackage(caseId).catch(() => null);
    const result = await reportService.generateDraft({
      caseId: found.id,
      moduleId: found.moduleId,
      title: found.title,
      url: found.url,
      productName: found.extraction?.productName,
      status: found.status,
      agencyCandidate: found.agencyCandidate,
      priorityScore: found.scoringResult?.priorityScore ?? found.riskScore,
      priorityLabel: found.scoringResult?.priorityLabel ?? found.riskLevel,
      capturedAt: ev?.capturedAt ?? found.createdAt,
      memo: found.memo,
      ruleMatches: found.ruleDetection?.matches ?? [],
      ruleSafetyNotice: found.ruleDetection?.safetyNotice,
      llmAnalysis: found.llmAnalysis ?? null,
      scoringResult: found.scoringResult ?? null,
      evidence: ev
        ? {
            hasHtml: ev.hasHtml, hasText: ev.hasText, hasScreenshot: ev.hasScreenshot,
            hasPdf: ev.hasPdf, hasMetadata: ev.hasMetadata, hasManifest: ev.hasManifest,
            capturedAt: ev.capturedAt,
            files: ev.files.map((f) => ({ name: f.name, size: f.size, sha256: f.sha256, mimeType: f.mimeType }))
          }
        : undefined,
      sellerCandidates: found.extraction?.sellerCandidates
    });
    res.status(201).json({
      ok: true,
      caseId,
      report: {
        title: result.title,
        markdown: result.markdown,
        text: result.text,
        files: {
          markdownPath: result.files.markdownPath,
          textPath: result.files.textPath,
          docxPath: result.files.docxPath,
          metadataPath: result.files.metadataPath
        },
        generatedAt: result.generatedAt
      },
      warnings: result.warnings,
      safetyNotice: "이 초안은 자동 신고서가 아니며 사람이 검토·수정 후 직접 제출해야 합니다.",
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    if (error instanceof CaseNotFoundError) {
      return res.status(404).json(errorBody("CASE_NOT_FOUND", `Case not found: ${caseId}`));
    }
    res.status(500).json(errorBody("REPORT_DRAFT_FAILED", (error as Error).message));
  }
});

// GET /api/cases/:id/report — 파일 목록 + metadata 요약
casesRouter.get("/:id/report", async (req, res) => {
  const caseId = req.params.id;
  if (!isSafeCaseIdReport(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  try {
    const summary = await reportService.summarizeReport(caseId);
    res.json({
      ok: true,
      caseId,
      reportSummary: summary,
      safetyNotice: summary.safetyNotice,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

// GET /api/cases/:id/report/:fileName — 개별 파일 다운로드 (allowlist만)
casesRouter.get("/:id/report/:fileName", async (req, res) => {
  const { id: caseId, fileName } = req.params;
  if (!isSafeCaseIdReport(caseId)) {
    return res.status(400).json(errorBody("VALIDATION_ERROR", `Invalid caseId: ${caseId}`));
  }
  if (!isAllowedReportFileNameFn(fileName)) {
    return res.status(400).json(errorBody(
      "INVALID_FILE_NAME",
      `Allowed report file names: ${[...ALLOWED_REPORT_FILENAMES].join(", ")}`
    ));
  }
  try {
    const filePath = reportService.getReportFilePath(caseId, fileName);
    const s = await stat(filePath);
    const mime =
      fileName === "report.md" ? "text/markdown; charset=utf-8" :
      fileName === "report.txt" ? "text/plain; charset=utf-8" :
      fileName === "report.docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
      "application/json; charset=utf-8";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", String(s.size));
    res.setHeader("Cache-Control", "no-store");
    const stream = createReadStream(filePath);
    stream.on("error", (err) => {
      if (!res.headersSent) res.status(500).json(errorBody("INTERNAL_ERROR", err.message));
      else res.destroy(err);
    });
    stream.pipe(res);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return res.status(404).json(errorBody("REPORT_FILE_NOT_FOUND", `Not found: ${fileName}`));
    }
    res.status(500).json(errorBody("INTERNAL_ERROR", (error as Error).message));
  }
});

export { repo as casesRepository };
