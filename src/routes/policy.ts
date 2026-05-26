import { Router } from "express";
import {
  approvalGatePolicy,
  getApprovalGateNotice,
  getOfficialReportingLinks
} from "../policy/approvalGate.js";

export const policyRouter = Router();

// GET /api/policy/approval-gate?moduleId=false_ad
policyRouter.get("/approval-gate", (req, res) => {
  const moduleId = typeof req.query.moduleId === "string" ? req.query.moduleId : "false_ad";
  const officialReportingLinks = getOfficialReportingLinks(moduleId);
  res.json({
    ok: true,
    policy: approvalGatePolicy,
    moduleId,
    // 체크리스트 20 — 정확 필드명
    allowedActions: approvalGatePolicy.allowedActions,
    prohibitedActions: approvalGatePolicy.prohibitedActions,
    officialReportingLinks,
    manualSubmissionOnly: true,
    autoSubmitAvailable: false,
    humanReviewRequired: true,
    // 하위 호환 (기존 UI/호출부 유지)
    officialLinks: officialReportingLinks,
    notice: getApprovalGateNotice(),
    autoReport: false,
    manualSubmissionRecordOnly: true
  });
});
