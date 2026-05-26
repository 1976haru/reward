import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { originLabelingModule } from "./config.js";

export { originLabelingModule, detectOriginLabelingRules } from "./config.js";
export { loadOriginLabelingKeywords, loadOriginLabelingKeywordsSync, type KeywordConfig } from "./keywordLoader.js";

// 후속 쉬운 확장 모듈 — 룰셋(키워드 탐지)까지 준비 완료. 신고서 템플릿/agency_config/E2E 는 다음 단계.
// status "ready": 룰 탐지가 연결됨. 자동 신고는 수행하지 않으며 사람 검토가 필수다.
export const originLabelingDefinition: ModuleDefinition = {
  id: "origin_labeling",
  slug: "origin-labeling",
  name: originLabelingModule.name,
  category: "food_labeling",
  status: "ready",
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: false,
    reportDraft: false
  },
  configPath: "src/modules/origin-labeling/config.ts",
  supportedInputTypes: ["public_url"],
  safetyNotes: [
    "건강기능식품(1차 MVP)·일반식품·화장품·의료기기·위조상품을 대체하지 않는 후속 확장 모듈",
    "공개자료만 분석",
    "자동 신고 금지",
    "사람 검토 필수",
    "포상금 수령 보장 없음",
    "키워드 매칭은 원산지 표시 위반 확정이 아니라 검토 후보"
  ],
  ui: {
    agency: "국립농산물품질관리원, 관세청, 관할 지자체",
    target: "농수산물·가공식품 온라인 판매글의 원산지 표시 — 쉬운 확장 분야",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect: "공개 판매글에서 원산지 표시 불일치·누락 의심 신호(국내산/수입산 불일치, 원산지 미표시, 혼합 원료 누락, 국산처럼 보이게 하는 표현 + 원산지 정보 부족, 상세·옵션 불일치, 원산지 문의 유도)를 검토 후보로 탐지",
      report: "국립농산물품질관리원, 국민신문고, 관할 지자체",
      evidence: "원본 URL, 상품명/옵션/상세페이지 원산지 표시 캡처, 이미지, 수집일시",
      reward: "사안·처분 결과·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution: "현재는 스코프·키워드 룰셋까지 준비된 단계입니다. 신고서 초안·증거 패키지·agency_config 연결은 다음 단계에서 진행하며, 자동 신고는 하지 않습니다. 원산지 표시 위반 여부는 관계기관·사람 검토가 필요합니다."
    }
  }
};
