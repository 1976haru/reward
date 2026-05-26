import type { RuleHit } from "../../types/core.js";
import { ruleAgent } from "../../agents/RuleAgent.js";

// 일반식품 허위·과대광고 모듈 메타데이터 (체크리스트 32~33).
// 2차 확장 모듈. 건강기능식품(false_ad) 1차 MVP 를 대체하지 않는다.
// 실제 키워드/룰셋은 keywords.json + keywordLoader.ts + RuleAgent 로 분리되어 있다.

export const generalFoodFalseAdModule = {
  id: "general_food_false_ad" as const,
  name: "일반식품 온라인 허위·과대광고 탐지 (2차 확장)",
  recommendedAgency: "식품의약품안전처 또는 관할 기관",
  description:
    "일반식품(건강기능식품이 아닌 가공식품·음료·차·즙·발효식품 등) 광고가 의약품·건강기능식품처럼 보이는 경우를 검토 후보로 탐지합니다. 질병 치료·예방 표현, 의약품 대체 표현, 다이어트·면역·해독 과장 표현을 탐지합니다. 매칭은 법 위반 확정이 아니라 사람 검토가 필요한 후보입니다. 본 단계는 스코프·키워드 룰셋까지이며 신고서 템플릿·agency_config 는 다음 단계에서 추가합니다."
};

/** 레거시 호환 함수. 새 구현은 RuleAgent (keywords.json 기반)에 있다. */
export function detectGeneralFoodFalseAdRules(text: string): RuleHit[] {
  return ruleAgent.detect("general_food_false_ad", text);
}
