import { Router } from "express";
import {
  reportingRegistryService,
  REPORTING_REGISTRY_SAFETY_NOTICE
} from "../services/reporting/ReportingRegistry.js";

/**
 * 공식 신고처 URL Registry (체크리스트 24) — 조회 전용.
 *
 * 안전:
 * - 단순 외부 링크만 제공한다. 자동 제출/자동 로그인/자동 양식입력 없음.
 * - 신고 내용·개인정보·API 키·caseId 를 URL 에 자동으로 붙이지 않는다.
 */
export const agenciesRouter = Router();

agenciesRouter.get("/", (req, res) => {
  try {
    const moduleId = typeof req.query.moduleId === "string" ? req.query.moduleId : undefined;
    const agencies = moduleId
      ? reportingRegistryService.listByModule(moduleId)
      : reportingRegistryService.listAll();
    res.json({
      ok: true,
      moduleId: moduleId ?? null,
      agencies,
      total: agencies.length,
      lastReviewedAt: reportingRegistryService.getLastReviewedAt(),
      manualSubmissionOnly: true,
      autoSubmitAvailable: false,
      humanReviewRequired: true,
      officialCheckRequired: true,
      safetyNotice: REPORTING_REGISTRY_SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});

agenciesRouter.get("/:agencyId", (req, res) => {
  try {
    const agency = reportingRegistryService.getByAgencyId(String(req.params.agencyId || "").trim());
    if (!agency) {
      return res.status(404).json({ ok: false, error: "AGENCY_NOT_FOUND", message: `Unknown agencyId: ${req.params.agencyId}` });
    }
    res.json({
      ok: true,
      agency,
      manualSubmissionOnly: true,
      autoSubmitAvailable: false,
      humanReviewRequired: true,
      safetyNotice: REPORTING_REGISTRY_SAFETY_NOTICE,
      autoReport: false
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR", message: (error as Error).message });
  }
});
