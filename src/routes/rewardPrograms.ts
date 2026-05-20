import { Router } from "express";
import {
  rewardRegistryService,
  REWARD_REGISTRY_SAFETY_NOTICE
} from "../services/reward/RewardRegistryService.js";

export const rewardProgramsRouter = Router();

/**
 * Reward Registry — 신고포상금·보상금 제도 안내 (조회 전용).
 *
 * 안전:
 * - 외부 신고기관에 자동 제출하지 않는다.
 * - 포상금/보상금 수령을 보장하지 않는다.
 * - 금액·한도·기준은 공식 기관 페이지에서 확인해야 한다.
 */

rewardProgramsRouter.get("/", (_req, res) => {
  try {
    const programs = rewardRegistryService.listRewardPrograms();
    const summary = rewardRegistryService.getSummary();
    res.json({
      ok: true,
      programs,
      summary,
      officialLinks: rewardRegistryService.getOfficialLinks(),
      safetyNotice: REWARD_REGISTRY_SAFETY_NOTICE,
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

rewardProgramsRouter.get("/module/:moduleId", (req, res) => {
  try {
    const moduleId = String(req.params.moduleId || "").trim();
    if (!moduleId) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_MODULE_ID",
        message: "moduleId is required"
      });
    }
    const programs = rewardRegistryService.listByModule(moduleId);
    res.json({
      ok: true,
      moduleId,
      programs,
      total: programs.length,
      safetyNotice: REWARD_REGISTRY_SAFETY_NOTICE,
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

rewardProgramsRouter.get("/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PROGRAM_ID",
        message: "id is required"
      });
    }
    const program = rewardRegistryService.getRewardProgram(id);
    if (!program) {
      return res.status(404).json({
        ok: false,
        error: "PROGRAM_NOT_FOUND",
        message: `Unknown program id: ${id}`
      });
    }
    res.json({
      ok: true,
      program,
      safetyNotice: REWARD_REGISTRY_SAFETY_NOTICE,
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
