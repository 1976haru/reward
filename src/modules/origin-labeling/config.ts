import type { RuleHit } from "../../types/core.js";
import { ruleAgent } from "../../agents/RuleAgent.js";

// 원산지 표시 위반 의심 모듈 메타데이터 (체크리스트 48~49).
// 후속 쉬운 확장 모듈. 건강기능식품(1차 MVP)·일반식품·화장품·의료기기·위조상품 모듈을 대체하지 않는다.
// 실제 키워드/룰셋은 keywords.json + keywordLoader.ts + RuleAgent 로 분리되어 있다.

export const originLabelingModule = {
  id: "origin_labeling" as const,
  name: "원산지 표시 위반 의심 탐지 (확장)",
  recommendedAgency: "국립농산물품질관리원 또는 관할 기관",
  description:
    "공개 판매글에서 원산지 표시 불일치·누락 의심 신호를 검토 후보로 탐지합니다. 국내산/수입산 표시 불일치, 원산지 미표시, 혼합 원료 원산지 누락, 상세페이지·옵션·이미지 표시 불일치, 국산처럼 보이게 하는 표현과 원산지 정보 부족 조합을 탐지합니다. 매칭은 원산지 표시 위반 확정이 아니라 사람·관계기관 검토가 필요한 후보입니다. 본 단계는 스코프·키워드 룰셋까지이며 신고서 템플릿·agency_config 는 다음 단계에서 추가합니다."
};

/** 레거시 호환 함수. 새 구현은 RuleAgent (keywords.json 기반)에 있다. */
export function detectOriginLabelingRules(text: string): RuleHit[] {
  return ruleAgent.detect("origin_labeling", text);
}
