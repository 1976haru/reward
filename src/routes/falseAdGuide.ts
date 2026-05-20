import { Router } from "express";
import {
  falseAdGuideService,
  FALSE_AD_GUIDE_SAFETY_NOTICE
} from "../services/false-ad-guide/FalseAdGuideService.js";

export const falseAdGuideRouter = Router();

/**
 * GET /api/modules/false-ad/guide
 *
 * 건강기능식품 온라인 허위·과대광고 모듈 실전 신고·포상 가이드 (조회 전용).
 * - 외부 신고기관에 자동 제출하지 않는다.
 * - 법 위반 또는 포상금 지급을 확정하지 않는다.
 * - 공식 기준은 사람이 실전 신고 전 직접 확인해야 한다.
 */
falseAdGuideRouter.get("/guide", (_req, res) => {
  try {
    const guide = falseAdGuideService.getGuide();
    res.json({
      ok: true,
      guide,
      safetyNotice: FALSE_AD_GUIDE_SAFETY_NOTICE,
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
