import { Router } from "express";
import {
  bidCollusionGuideService,
  BID_COLLUSION_GUIDE_SAFETY_NOTICE
} from "../services/bid-collusion-guide/BidCollusionGuideService.js";

export const bidCollusionGuideRouter = Router();

/**
 * GET /api/modules/bid-collusion/guide
 *
 * 입찰담합 의심 패턴 분석 모듈(`bid_collusion`)의 공정위 담합 신고·포상 가이드 (조회 전용).
 * - 외부 신고기관(공정거래위원회 / 국민신문고)에 자동 제출하지 않는다.
 * - 담합 여부 또는 포상금 지급을 단정하지 않는다.
 * - 특정 업체를 형사적 표현으로 단정하지 않는다.
 */
bidCollusionGuideRouter.get("/guide", (_req, res) => {
  try {
    const guide = bidCollusionGuideService.getGuide();
    res.json({
      ok: true,
      guide,
      safetyNotice: BID_COLLUSION_GUIDE_SAFETY_NOTICE,
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
