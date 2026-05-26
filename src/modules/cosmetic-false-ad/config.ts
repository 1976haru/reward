import type { RuleHit } from "../../types/core.js";
import { ruleAgent } from "../../agents/RuleAgent.js";

// 화장품 허위·과대광고 모듈 메타데이터 (체크리스트 36~37).
// 3차 쉬운 확장 모듈. 건강기능식품(false_ad) 1차 MVP, 일반식품(general_food_false_ad) 2차 확장을 대체하지 않는다.
// 실제 키워드/룰셋은 keywords.json + keywordLoader.ts + RuleAgent 로 분리되어 있다.

export const cosmeticFalseAdModule = {
  id: "cosmetic_false_ad" as const,
  name: "화장품 온라인 허위·과대광고 탐지 (3차 확장)",
  recommendedAgency: "식품의약품안전처 또는 관할 기관",
  description:
    "화장품 광고가 의약품이나 인정된 기능성 화장품 범위를 넘어 보이는 경우를 검토 후보로 탐지합니다. 피부질환 치료 표현, 의약품 대체 표현, 주름 완전 제거·미백/재생/흉터 제거 과장, 탈모·아토피·여드름·피부염 치료 오인 표현을 탐지합니다. 미백·주름개선·자외선차단 등 인정된 기능성 범위 표현은 사람이 검토합니다. 매칭은 법 위반 확정이 아니라 사람 검토가 필요한 후보입니다. 본 단계는 스코프·키워드 룰셋까지이며 신고서 템플릿·agency_config 는 다음 단계에서 추가합니다."
};

/** 레거시 호환 함수. 새 구현은 RuleAgent (keywords.json 기반)에 있다. */
export function detectCosmeticFalseAdRules(text: string): RuleHit[] {
  return ruleAgent.detect("cosmetic_false_ad", text);
}
