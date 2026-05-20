import { Router } from "express";
import { settingsService, SETTINGS_SAFETY_NOTICE } from "../services/settings/SettingsService.js";

export const settingsRouter = Router();

/**
 * GET /api/settings — 공익레이더 실행 환경 / 설정 상태 조회 전용.
 *
 * - API 키 원문 (OPENAI_API_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET) 은 응답에 포함되지 않는다.
 * - 외부 신고기관 자동 제출 / 자동 로그인 / 포상금 신청을 자동화하는 설정은 노출하지 않는다.
 * - /api 공통 미들웨어가 Cache-Control: no-store 를 설정하지만, 안전을 위해 라우터 단에서도 명시한다.
 */
settingsRouter.get("/", (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const settings = settingsService.getSettings();
    res.json({
      ok: true,
      settings,
      safetyNotice: SETTINGS_SAFETY_NOTICE,
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
