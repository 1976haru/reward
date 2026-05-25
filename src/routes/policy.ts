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
  res.json({
    ok: true,
    policy: approvalGatePolicy,
    moduleId,
    officialLinks: getOfficialReportingLinks(moduleId),
    notice: getApprovalGateNotice(),
    autoReport: false,
    humanReviewRequired: true,
    manualSubmissionRecordOnly: true
  });
});
