import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { counterfeitGoodsModule } from "./config.js";

export { counterfeitGoodsModule } from "./config.js";
export { counterfeitTopics, getCounterfeitTopicById } from "./scout_topics.js";
export {
  loadCounterfeitKeywords,
  loadCounterfeitKeywordsSync,
  getCounterfeitKeywordSummary,
  type CounterfeitKeywordConfig
} from "./keywordLoader.js";

export const counterfeitGoodsDefinition: ModuleDefinition = {
  id: "counterfeit_goods",
  slug: "counterfeit-goods",
  name: counterfeitGoodsModule.name,
  category: "intellectual_property",
  status: "ready",
  capabilities: {
    publicUrlAnalysis: true,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: true,
    reportDraft: true
  },
  configPath: "src/modules/counterfeit-goods/config.ts",
  agencyConfigPath: "src/modules/counterfeit-goods/agency_config.json",
  reportTemplatePath: "src/modules/counterfeit-goods/report-template.md",
  supportedInputTypes: ["public_url"],
  safetyNotes: [
    "공개 판매게시글만 분석",
    "위조 여부 확정 판단을 하지 않음 (권리자 감정 / 관계기관 판단 필요)",
    "비공개 채팅방 / 개인정보 추적 / 자동 신고 / 자동 로그인 / 차단 우회 / CAPTCHA 우회 모두 금지",
    "포상금 수령 보장 없음",
    "특정인 위조 단정 표현 금지"
  ],
  ui: {
    agency: "특허청, 지식재산침해 원스톱 신고상담센터",
    target: "공개 오픈마켓·SNS·중고거래 등 공개 판매게시글",
    difficulty: "보통",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect: "레플리카·미러급·SA급·S급·1:1·정품급·공장판 등 위조 의심 표현, 브랜드명 + 위조표현 조합, 단속 피해/비밀배송/세관 문제 없음 등 회피 신호, 풀박스/영수증/보증서 등 정품 구성품 모방 표현",
      report: "특허청, 지식재산침해 원스톱 신고상담센터, 사안에 따라 관할 지자체/수사기관",
      evidence: "판매게시글 URL, 화면 캡처, PDF 저장본, 상품 이미지(공개 영역), 로고/상표 표시 캡처, 판매자 표시 정보(공개 영역), 가격 캡처, 수집일시",
      reward: "사안·처분 결과·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution: "본 결과는 위조 확정이 아닙니다. 권리자 감정과 관계기관 판단이 필요하며, 최종 신고는 사람이 공식 채널에서 직접 진행해야 합니다."
    }
  }
};
