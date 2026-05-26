import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { medicalDeviceFalseAdModule } from "./config.js";

export { medicalDeviceFalseAdModule, detectMedicalDeviceFalseAdRules } from "./config.js";
export { loadMedicalDeviceKeywords, loadMedicalDeviceKeywordsSync, type KeywordConfig } from "./keywordLoader.js";

// 후속 쉬운 확장 모듈 — 룰셋(키워드 탐지)까지 준비 완료. 신고서 템플릿/agency_config/E2E 는 다음 단계.
// status "ready": 룰 탐지가 연결됨. 자동 신고는 수행하지 않으며 사람 검토가 필수다.
export const medicalDeviceFalseAdDefinition: ModuleDefinition = {
  id: "medical_device_false_ad",
  slug: "medical-device-false-ad",
  name: medicalDeviceFalseAdModule.name,
  category: "medical_device",
  status: "ready",
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: false,
    reportDraft: false
  },
  configPath: "src/modules/medical-device-false-ad/config.ts",
  supportedInputTypes: ["public_url"],
  safetyNotes: [
    "건강기능식품(1차 MVP)·일반식품(2차)·화장품(3차)을 대체하지 않는 후속 확장 모듈",
    "공개자료만 분석",
    "자동 신고 금지",
    "사람 검토 필수",
    "포상금 수령 보장 없음",
    "키워드 매칭은 법 위반 확정이 아니라 검토 후보"
  ],
  ui: {
    agency: "식품의약품안전처, 국민신문고, 관할 보건소",
    target: "의료기기(전기치료기·저주파·온열기·마사지기 등) 온라인 광고 — 쉬운 확장 분야",
    difficulty: "쉬움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect: "의료기기 광고가 허가 범위를 초과하거나 의료적 효능을 단정하는 경우(질병 치료·예방·완치, 허가받지 않은 효능, 병원 치료 대체, 수술 없이 완치, 통증·혈압·혈당·관절·디스크·불면 오인, 즉시효과·100% 보장, 의료기기 아닌 제품의 의료기기 오인 표현)를 검토 후보로 탐지",
      report: "식품의약품안전처, 국민신문고, 관할 보건소",
      evidence: "원본 URL, 광고 문구 원문, 화면 캡처, PDF 저장본, 판매자 공개 정보, 수집일시",
      reward: "사안·처분 결과·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution: "현재는 스코프·키워드 룰셋까지 준비된 단계입니다. 신고서 초안·증거 패키지·agency_config 연결은 다음 단계에서 진행하며, 자동 신고는 하지 않습니다. 허가받은 효능·등급은 공식 허가 범위 내 표현일 수 있으므로 사람이 검토합니다."
    }
  }
};
