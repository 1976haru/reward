import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { cosmeticFalseAdModule } from "./config.js";

export { cosmeticFalseAdModule, detectCosmeticFalseAdRules } from "./config.js";
export { loadCosmeticKeywords, loadCosmeticKeywordsSync, type KeywordConfig } from "./keywordLoader.js";

// 3차 쉬운 확장 모듈 — 룰셋(키워드 탐지)까지 준비 완료. 신고서 템플릿/agency_config/E2E 는 다음 단계.
// status "ready": 룰 탐지가 연결됨. 자동 신고는 수행하지 않으며 사람 검토가 필수다.
export const cosmeticFalseAdDefinition: ModuleDefinition = {
  id: "cosmetic_false_ad",
  slug: "cosmetic-false-ad",
  name: cosmeticFalseAdModule.name,
  category: "cosmetic",
  status: "ready",
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: false,
    reportDraft: false
  },
  configPath: "src/modules/cosmetic-false-ad/config.ts",
  supportedInputTypes: ["public_url"],
  safetyNotes: [
    "건강기능식품(1차 MVP)·일반식품(2차 확장)을 대체하지 않는 3차 확장 모듈",
    "공개자료만 분석",
    "자동 신고 금지",
    "사람 검토 필수",
    "포상금 수령 보장 없음",
    "키워드 매칭은 법 위반 확정이 아니라 검토 후보"
  ],
  ui: {
    agency: "식품의약품안전처, 국민신문고, 관할 보건소",
    target: "화장품(크림·세럼·앰플·마스크팩 등) 온라인 광고 — 3차 쉬운 확장 분야",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect: "화장품 광고가 의약품·치료제처럼 보이는 경우(피부질환 치료, 의약품 대체, 주름 완전 제거, 미백·재생·흉터 제거 과장, 탈모·아토피·여드름·피부염 치료 오인, 즉시효과·100% 보장, 기능성 화장품 범위 초과 표현)를 검토 후보로 탐지",
      report: "식품의약품안전처, 국민신문고, 관할 보건소",
      evidence: "원본 URL, 광고 문구 원문, 화면 캡처, PDF 저장본, 판매자 공개 정보, 수집일시",
      reward: "사안·처분 결과·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution: "현재는 스코프·키워드 룰셋까지 준비된 단계입니다. 신고서 초안·증거 패키지·agency_config 연결은 다음 단계에서 진행하며, 자동 신고는 하지 않습니다. 미백·주름개선·자외선차단 등 인정된 기능성 범위 표현은 사람이 검토합니다."
    }
  }
};
