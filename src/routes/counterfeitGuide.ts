import { Router } from "express";
import {
  counterfeitGuideService,
  COUNTERFEIT_GUIDE_SAFETY_NOTICE
} from "../services/counterfeit-guide/CounterfeitGuideService.js";

export const counterfeitGuideRouter = Router();

/**
 * GET /api/modules/counterfeit-goods/guide
 *
 * 위조상품 온라인 판매 의심 탐지 모듈(`counterfeit_goods`)의 실전 신고·포상 가이드 (조회 전용).
 * - 외부 신고기관(특허청 / 지식재산침해 원스톱 신고상담센터)에 자동 제출하지 않는다.
 * - 위조 여부 또는 포상금 지급을 확정하지 않는다.
 * - 특정 판매자를 형사적 표현으로 단정하지 않는다.
 */
counterfeitGuideRouter.get("/guide", (_req, res) => {
  try {
    const guide = counterfeitGuideService.getGuide();
    res.json({
      ok: true,
      guide,
      safetyNotice: COUNTERFEIT_GUIDE_SAFETY_NOTICE,
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
