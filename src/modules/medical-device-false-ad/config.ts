import type { RuleHit } from "../../types/core.js";
import { ruleAgent } from "../../agents/RuleAgent.js";

// 의료기기 허위·과대광고 모듈 메타데이터 (체크리스트 40~41).
// 후속 쉬운 확장 모듈. 건강기능식품(false_ad) 1차 MVP, 일반식품(general_food_false_ad) 2차,
// 화장품(cosmetic_false_ad) 3차 확장을 대체하지 않는다.
// 실제 키워드/룰셋은 keywords.json + keywordLoader.ts + RuleAgent 로 분리되어 있다.

export const medicalDeviceFalseAdModule = {
  id: "medical_device_false_ad" as const,
  name: "의료기기 온라인 허위·과대광고 탐지 (확장)",
  recommendedAgency: "식품의약품안전처 또는 관할 기관",
  description:
    "의료기기 광고가 허가 범위를 초과하거나 의료적 효능을 단정하는 경우, 또는 의료기기가 아닌 제품을 의료기기처럼 보이게 하는 경우를 검토 후보로 탐지합니다. 질병 치료·예방·완치 표현, 허가받지 않은 효능 단정, 병원 치료 대체, 수술 없이 완치, 통증·혈압·혈당·관절·디스크·불면 등 증상 오인 표현을 탐지합니다. 매칭은 법 위반 확정이 아니라 사람 검토가 필요한 후보입니다. 본 단계는 스코프·키워드 룰셋까지이며 신고서 템플릿·agency_config 는 다음 단계에서 추가합니다."
};

/** 레거시 호환 함수. 새 구현은 RuleAgent (keywords.json 기반)에 있다. */
export function detectMedicalDeviceFalseAdRules(text: string): RuleHit[] {
  return ruleAgent.detect("medical_device_false_ad", text);
}
