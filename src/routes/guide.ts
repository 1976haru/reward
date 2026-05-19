import { Router } from "express";
import { guideService, GUIDE_SAFETY_NOTICE } from "../services/guide/GuideService.js";

export const guideRouter = Router();

// GET /api/guide/qa — 사용자 가이드 / Q&A 데이터
// 자동 신고를 수행하지 않으며, 포상금 수령을 보장하지 않는다.
guideRouter.get("/qa", (_req, res) => {
  try {
    const guide = guideService.getGuide();
    res.json({
      ok: true,
      guide,
      safetyNotice: GUIDE_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: (error as Error).message
    });
  }
});
