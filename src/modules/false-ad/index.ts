import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { falseAdModule } from "./config.js";

export { falseAdModule, detectFalseAdRules } from "./config.js";
export { loadFalseAdKeywords, loadFalseAdKeywordsSync, type KeywordConfig } from "./keywordLoader.js";

export const falseAdDefinition: ModuleDefinition = {
  id: "false_ad",
  slug: "false-ad",
  name: falseAdModule.name,
  category: "health_functional_food",
  status: "active",
  capabilities: {
    publicUrlAnalysis: true,
    ruleBasedDetection: true,
    aiAnalysis: true,
    evidencePackage: true,
    reportDraft: true
  },
  configPath: "src/modules/false-ad/config.ts",
  agencyConfigPath: "src/modules/false-ad/agency_config.json",
  reportTemplatePath: "src/modules/false-ad/report-template.md",
  supportedInputTypes: ["public_url"],
  safetyNotes: [
    "공개자료만 분석",
    "자동 신고 금지",
    "사람 검토 필수",
    "포상금 수령 보장 없음",
    "특정인 위법 단정 표현 금지"
  ],
  ui: {
    agency: "식품의약품안전처, 국민신문고, 관할 보건소",
    target: "건강기능식품 온라인 상품·광고 페이지 (1차 MVP 시작 카테고리)",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect: "질병 치료·예방·완치 표현, 의약품 오인 표현, 100% 효과·기적의 등 과장 효능 표현 (건강기능식품 광고 문구 중심)",
      report: "식품의약품안전처, 국민신문고, 관할 보건소",
      evidence: "원본 URL, 광고 문구 원문, 화면 캡처, PDF 저장본, 판매자 공개 정보, 수집일시",
      reward: "사안·처분 결과·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution: "AI 판단은 참고용이며, 최종 신고 여부는 사람이 검토한 뒤 직접 제출해야 합니다. 1차 MVP는 건강기능식품 광고에만 적용됩니다."
    }
  }
};
