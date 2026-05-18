import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { bidCollusionModule } from "./config.js";

export { bidCollusionModule, BID_COLLUSION_SAFETY_NOTICE } from "./config.js";
export {
  analyzeBidDataset,
  buildBidCollusionReportMarkdown,
  calculateBidCollusionRiskSignals,
  calculateBidSpread,
  clearBidSampleCache,
  findAwardRateClustering,
  findRepeatedBidderGroups,
  findRotatingWinners,
  findSingleWinnerDominance,
  getRiskGroupById,
  listBidRecords,
  loadBidSampleData,
  normalizeCompanyName,
  type BidAnalysisResult,
  type BidRecord,
  type BidderEntry,
  type BidSampleData,
  type DetectedBidSignal,
  type RiskBidderGroup
} from "./analyzer.js";

export const bidCollusionDefinition: ModuleDefinition = {
  id: "bid_collusion",
  slug: "bid-collusion",
  name: bidCollusionModule.name,
  category: "antitrust",
  status: "prototype",
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: true,
    reportDraft: true
  },
  configPath: "src/modules/bid-collusion/config.ts",
  agencyConfigPath: "src/modules/bid-collusion/agency_config.json",
  reportTemplatePath: "src/modules/bid-collusion/report-template.md",
  supportedInputTypes: ["public_bid_record"],
  safetyNotes: [
    "공개 입찰 데이터 기반 검토 후보 — 담합 확정이 아님",
    "특정 업체/개인/발주기관을 담합 주체로 단정하지 않음",
    "비공개 입찰자료 / 로그인 우회 / 무단 대량 크롤링 금지",
    "공공데이터포털 / 나라장터 인증키 커밋 금지",
    "자동 신고 제출 / 자동 민원 제출 / 공식기관 자동 로그인 금지",
    "포상금 수령 보장 없음 — 공정거래위원회 공식 기준 확인 필요"
  ],
  ui: {
    agency: "공정거래위원회 / 발주기관 감사부서 / 국민신문고",
    target: "나라장터 등 공개 입찰·낙찰·계약 데이터",
    difficulty: "어려움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect:
        "반복 업체군 참여, 순환 낙찰, 좁은 투찰 간격, 들러리 후보 패턴, 단일 낙찰자 지배, 낙찰률 군집, 낮은 경쟁 반복, 형식 참여 — 모두 검토 후보 신호",
      report:
        "공정거래위원회 (담합 신고 / 신고포상금) / 발주기관 감사부서 / 국민신문고",
      evidence:
        "입찰공고번호, 공고명, 발주기관, 공고/개찰 일자, 예정가격, 낙찰금액, 낙찰률, 참여업체, 투찰금액, 개찰순위, 반복 낙찰 근거, 원본 API URL, 수집일시",
      reward:
        "공정거래위원회 공식 기준·조치 결과·과징금·증거 수준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution:
        "본 모듈은 프로토타입입니다. 담합 확정 판단이 아니며, sample 데이터로 패턴 분석 구조만 시연합니다. 실제 신고는 사람이 공식 채널에서 직접 진행해야 합니다."
    }
  }
};
