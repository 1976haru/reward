import { Router } from "express";
import {
  subsidyGuideService,
  SUBSIDY_GUIDE_SAFETY_NOTICE
} from "../services/subsidy-guide/SubsidyGuideService.js";

export const subsidyGuideRouter = Router();

/**
 * GET /api/modules/subsidy-fraud/guide
 *
 * 보조금 부정수급 의심 후보 탐지 모듈(`subsidy_fraud`)의 보조금/공익신고 보상·포상 가이드 (조회 전용).
 * - 외부 신고기관(국민권익위원회·국민신문고·보조금 관리기관·지자체)에 자동 제출하지 않는다.
 * - 부정수급 여부 또는 보상·포상 지급을 단정하지 않는다.
 * - 특정 단체·개인·사업자를 형사적 표현으로 단정하지 않는다.
 */
subsidyGuideRouter.get("/guide", (_req, res) => {
  try {
    const guide = subsidyGuideService.getSubsidyGuide();
    res.json({
      ok: true,
      guide,
      safetyNotice: SUBSIDY_GUIDE_SAFETY_NOTICE,
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
