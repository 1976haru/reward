/**
 * RewardRegistryService — 공익레이더가 참고하는 신고포상금·보상금 제도 안내 DB.
 *
 * 이 서비스는 다음을 제공한다.
 * - 모듈별 신고처/수집 자료/필요 증거 안내 (조회 전용)
 * - 지급 기준 요약 + "공식 기준 확인 필요" 안내
 * - 공식 신고기관 링크
 *
 * 이 서비스는 다음을 수행하지 않는다.
 * - 외부 신고기관에 자동 제출하지 않는다.
 * - 포상금/보상금 수령을 보장하지 않는다.
 * - 금액/한도를 "확정"으로 표시하지 않는다.
 */

import {
  REWARD_PROGRAMS,
  REWARD_PROGRAMS_LAST_REVIEWED_AT,
  type RewardProgram
} from "./rewardPrograms.js";

export const REWARD_REGISTRY_SAFETY_NOTICE =
  "신고포상금·보상금은 공식 기준과 처리 결과에 따라 달라지며, 공익레이더는 수령을 보장하지 않습니다. 실전 신고 전 반드시 공식 URL에서 최신 기준을 확인하세요.";

export interface RewardOfficialLink {
  programId: string;
  agencyName: string;
  url: string;
  moduleId: string;
}

export interface RewardRegistrySummary {
  total: number;
  lastReviewedAt: string;
  officialCheckRequired: true;
  moduleIds: string[];
}

/**
 * sanitizeRewardText — 본 시스템이 외부에 노출하는 reward 관련 문구에서 금지 표현을
 * 자동으로 중립 표현으로 치환한다. 입력 데이터를 검수했더라도, 안전망 차원에서 한 번 더 거른다.
 *
 * 금지 표현 → 중립 표현 매핑은 명시적이며 boolean 동의 없이 자동 적용된다.
 */
export function sanitizeRewardText(input: string): string {
  if (typeof input !== "string" || input.length === 0) return "";
  let out = input;
  const replacements: Array<[RegExp, string]> = [
    [/포상금\s*확정/g, "포상금 지급 여부는 공식 기준 확인 필요"],
    [/수익\s*확정/g, "수익 여부는 공식 기준 확인 필요"],
    [/신고하면\s*지급/g, "신고 후 공식 기관 처리 결과에 따라 달라질 수 있음"],
    [/무조건\s*지급/g, "지급 여부는 공식 기준에 따라 달라질 수 있음"],
    [/무조건\s*받을\s*수\s*있음/g, "공식 기준에 따라 달라질 수 있음"],
    [/포상금\s*보장합니다/g, "포상금 수령을 보장하지 않습니다"],
    [/포상금\s*보장됨/g, "포상금 수령은 공식 기준 확인 필요"]
  ];
  for (const [re, replacement] of replacements) {
    out = out.replace(re, replacement);
  }
  return out;
}

function sanitizeProgram(p: RewardProgram): RewardProgram {
  return {
    ...p,
    title: sanitizeRewardText(p.title),
    rewardBasisSummary: sanitizeRewardText(p.rewardBasisSummary),
    amountGuide: sanitizeRewardText(p.amountGuide),
    exclusionNotes: p.exclusionNotes.map(sanitizeRewardText),
    cautionRules: p.cautionRules.map(sanitizeRewardText)
  };
}

export class RewardRegistryService {
  listRewardPrograms(): RewardProgram[] {
    return REWARD_PROGRAMS.map(sanitizeProgram);
  }

  getRewardProgram(id: string): RewardProgram | null {
    const found = REWARD_PROGRAMS.find((p) => p.id === id);
    return found ? sanitizeProgram(found) : null;
  }

  listByModule(moduleId: string): RewardProgram[] {
    return REWARD_PROGRAMS.filter((p) => p.moduleId === moduleId).map(sanitizeProgram);
  }

  getSummary(): RewardRegistrySummary {
    const moduleIds = Array.from(new Set(REWARD_PROGRAMS.map((p) => p.moduleId))).sort();
    return {
      total: REWARD_PROGRAMS.length,
      lastReviewedAt: REWARD_PROGRAMS_LAST_REVIEWED_AT,
      officialCheckRequired: true,
      moduleIds
    };
  }

  getOfficialLinks(): RewardOfficialLink[] {
    return REWARD_PROGRAMS.map((p) => ({
      programId: p.id,
      agencyName: p.agencyName,
      url: p.officialUrl,
      moduleId: p.moduleId
    }));
  }

  getLastReviewedAt(): string {
    return REWARD_PROGRAMS_LAST_REVIEWED_AT;
  }

  sanitizeRewardText(input: string): string {
    return sanitizeRewardText(input);
  }
}

export const rewardRegistryService = new RewardRegistryService();
