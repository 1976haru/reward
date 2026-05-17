import type { RuleHit } from "../../types/core.js";
import { ruleAgent } from "../../agents/RuleAgent.js";

// 모듈 메타데이터 (registry에서 사용).
// 실제 키워드/룰셋은 keywords.json + keywordLoader.ts + RuleAgent로 분리되었다.

export const falseAdModule = {
  id: "false_ad" as const,
  name: "건강기능식품 온라인 허위·과대광고 탐지",
  recommendedAgency: "식품의약품안전처 또는 관할 기관",
  description: "1차 MVP는 건강기능식품 온라인 상품/광고 페이지에 한정합니다. 질병 치료·예방·완치 표현, 의약품 오인 표현, 과장 효능 표현을 탐지합니다. 일반 식품·화장품·의료기기는 후속 모듈로 확장합니다."
};

/**
 * 레거시 호환 함수. 새 구현은 RuleAgent (keywords.json 기반)에 있다.
 * 기존 코드 (예: 스모크 테스트, 외부 import)에서 같은 시그니처로 사용 가능하다.
 */
export function detectFalseAdRules(text: string): RuleHit[] {
  return ruleAgent.detect("false_ad", text);
}
