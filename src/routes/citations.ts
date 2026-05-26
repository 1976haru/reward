import { Router } from "express";
import { ZodError, z } from "zod";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import {
  validateReportCitations,
  extractClaimsFromReportJson,
  writeCitationValidationReport,
  CITATION_VALIDATION_NOTICE
} from "../analysis/citationValidator.js";
import type {
  CitationValidationMode,
  CitationValidationReport,
  ReportClaim
} from "../types/citationValidation.js";

const CITATION_OUTPUT_DIR = process.env.CITATION_OUTPUT_DIR ?? "data/analysis/citation-validation";
const CITATION_HUMAN_REVIEW_NOTICE =
  "부정수급으로 단정하지 않으며 포상금 지급을 보장하지 않습니다. 사람 검토가 필요합니다. 근거 검증은 환각·오류 방지 장치입니다.";

// 자체 포함 샘플 claims (외부 호출/테스트 의존 없음, deterministic).
// 일부는 강한 근거가 있고, 하나는 핵심 주장인데 근거가 없어 "보강 필요"로 표시된다.
function buildSampleClaims(): ReportClaim[] {
  return [
    {
      claimId: "sample#claim-1",
      text: "광고 페이지에 '당뇨 완치' 표현이 존재합니다.",
      kind: "core",
      section: "suspectedClaim",
      citations: [{ type: "source_url", sourceUrl: "https://example.com/ad/p-1", isFixtureBased: true }]
    },
    {
      claimId: "sample#claim-2",
      text: "원본 캡처와 PDF 증거가 보관되어 있습니다.",
      kind: "core",
      section: "evidence",
      citations: [{ type: "evidence_id", evidenceId: "EVID-SAMPLE-001", isFixtureBased: true }]
    },
    {
      claimId: "sample#claim-3",
      text: "위험점수 90점(매우 높음) 검토 후보로 분류되었습니다.",
      kind: "computed",
      section: "riskScore",
      citations: [{ type: "computed_model", label: "모델 계산 결과 (검토 신호)" }]
    },
    {
      claimId: "sample#claim-4",
      text: "이 광고는 명백한 위반으로 보입니다 (근거 미연결 예시).",
      kind: "core",
      section: "suspectedClaim",
      citations: []
    },
    {
      claimId: "sample#claim-5",
      text: "본 결과는 법 위반 확정이 아니며 사람 검토가 필요합니다.",
      kind: "disclaimer",
      section: "disclaimer",
      citations: []
    }
  ];
}

/**
 * 근거 검증 (Citation Validation) API — 체크리스트 29.
 *
 * AI 분석/신고서 초안/위험점수 설명의 핵심 주장마다 공개자료 근거가 연결됐는지 검증한다.
 * - 근거 없는 핵심 주장은 warning(기본) / strict 모드에서 fail.
 * - 법 위반 확정이 아니라 환각·오류 방지 보조 장치다. 실제 LLM 호출 없이 deterministic.
 */
export const citationsRouter = Router();

// 내부 CitationValidationReport → 체크리스트 29 표준 응답 형태로 변환.
function toCitationApiResult(report: CitationValidationReport) {
  const warnings = report.claimResults.filter((r) => r.status === "warning").length;
  const failedClaims = report.claimResults.filter((r) => r.status === "fail").length;
  const passed = report.status === "pass";
  const strictPassed = report.mode === "strict" ? passed : failedClaims === 0 && report.missingClaims === 0;

  // 근거 보강 제안 — 근거 없는 핵심 주장 / 차단된 근거 기준.
  const suggestedFixes: Array<{ claimId: string; section: string; kind: string; suggestion: string }> = [];
  for (const r of report.claimResults) {
    if (!r.needsCitationReinforcement) continue;
    suggestedFixes.push({
      claimId: r.claimId,
      section: r.section,
      kind: r.kind,
      suggestion:
        r.kind === "core"
          ? "핵심 주장에 원문 URL / 파일명+행번호 / evidenceId 같은 공개자료 근거를 추가하세요. (근거 보강 필요)"
          : "공개자료 근거 또는 모델 계산 결과 표시를 추가해 검토 가능하게 하세요."
    });
  }

  return {
    mode: report.mode,
    status: report.status,
    totalClaims: report.totalClaims,
    supportedClaims: report.supportedClaims,
    unsupportedClaims: report.unsupportedClaims,
    coreClaims: report.coreClaims,
    warnings,
    warningClaims: report.warningClaims,
    failedClaims: report.failedClaims,
    passed,
    strictPassed: report.strictPassed,
    unsupportedClaimIds: report.missingClaimIds,
    privacyBlockedCitations: report.privacyBlockedCitations,
    blockedPersonalInfoCount: report.blockedPersonalInfoCount,
    blockedPrivateUrlCount: report.blockedPrivateUrlCount,
    suggestedFixes: report.suggestedFixes.length ? report.suggestedFixes : suggestedFixes,
    notes: report.notes,
    notice: CITATION_VALIDATION_NOTICE,
    reviewRequired: true,
    notLegalConclusion: true,
    rewardGuaranteed: false,
    // 근거 없는 핵심 주장 안내 (UI 표시용)
    reinforcementNotice: "근거 없는 주장은 신고 전 보강이 필요합니다. 근거 검증은 법 위반 확정이 아니라 환각·오류 방지 장치입니다.",
    humanReviewNotice: CITATION_HUMAN_REVIEW_NOTICE,
    autoReport: false,
    humanReviewRequired: true
  };
}

// GET /api/citations/sample?mode=strict|warning — fixture 기반 샘플 검증 (외부 호출 없음)
citationsRouter.get("/sample", (req, res) => {
  try {
    const mode: CitationValidationMode = req.query.mode === "strict" ? "strict" : "warning";
    const claims = buildSampleClaims();
    const report = validateReportCitations(claims, { mode, isFixtureBased: true });
    res.json({ ok: true, source: "fixture", ...toCitationApiResult(report) });
  } catch (error) {
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});

const ValidateBodySchema = z.object({
  mode: z.enum(["strict", "warning"]).optional(),
  claims: z.array(z.any()).max(2000).optional(),
  report: z.any().optional()
});

// POST /api/citations/validate — 입력 claims 또는 리포트 JSON 의 근거 검증
citationsRouter.post("/validate", async (req, res) => {
  try {
    const body = ValidateBodySchema.parse(req.body ?? {});
    const mode: CitationValidationMode = body.mode === "strict" ? "strict" : "warning";

    let claims: ReportClaim[] = [];
    let source = "claims";
    if (Array.isArray(body.claims) && body.claims.length > 0) {
      claims = body.claims as ReportClaim[];
    } else if (body.report !== undefined) {
      const extracted = extractClaimsFromReportJson(body.report);
      claims = extracted.claims;
      source = extracted.kind;
    } else {
      // 입력이 없으면 fixture 로 안전하게 시연 (서버 중단 없음)
      claims = buildSampleClaims();
      source = "fixture";
    }

    const report = validateReportCitations(claims, { mode, isFixtureBased: source === "fixture" });
    const written = await writeCitationValidationReport(CITATION_OUTPUT_DIR, report);
    res.json({ ok: true, source, runId: report.reportId, outputDir: path.dirname(written.reportJsonFile), ...toCitationApiResult(report) });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: (error as Error).message });
    }
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});

// GET /api/citations/latest — 가장 최근 근거 검증 실행 결과 요약
citationsRouter.get("/latest", async (_req, res) => {
  try {
    const runsRoot = path.join(process.cwd(), CITATION_OUTPUT_DIR, "runs");
    let entries: string[] = [];
    try {
      entries = (await readdir(runsRoot, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      entries = [];
    }
    if (entries.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "NO_RUN_FOUND",
        message: "근거 검증 실행 기록이 없습니다. 먼저 POST /api/citations/validate 또는 `npm run validate:citations -- --fixture --strict` 을 실행하세요."
      });
    }
    const latest = entries[entries.length - 1];
    const report = JSON.parse(
      await readFile(path.join(runsRoot, latest, "citation-validation-report.json"), "utf8")
    ) as CitationValidationReport;
    res.json({ ok: true, source: "latest-run", runId: report.reportId, ...toCitationApiResult(report) });
  } catch (error) {
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});
