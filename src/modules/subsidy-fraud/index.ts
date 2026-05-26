import type { ModuleDefinition } from "../../core/moduleRegistry.js";
import { subsidyFraudModule } from "./config.js";

export { subsidyFraudModule, SUBSIDY_FRAUD_SAFETY_NOTICE } from "./config.js";
export {
  analyzeSubsidySample,
  buildSubsidyReportMarkdown,
  getSubsidyCandidate,
  loadSubsidySampleDataSync,
  type SubsidyAnalysisResult,
  type SubsidyAnalyzedCandidate,
  type SubsidyRecord,
  type DetectedSignal
} from "./collector.js";

export const subsidyFraudDefinition: ModuleDefinition = {
  id: "subsidy_fraud",
  slug: "subsidy-fraud",
  name: subsidyFraudModule.name,
  category: "public_funds",
  status: "prototype",
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: true,
    reportDraft: true
  },
  configPath: "src/modules/subsidy-fraud/config.ts",
  agencyConfigPath: "src/modules/subsidy-fraud/agency_config.json",
  reportTemplatePath: "src/modules/subsidy-fraud/report-template.md",
  supportedInputTypes: ["public_subsidy_record"],
  safetyNotes: [
    "후순위 고급 모듈 / 프로토타입 — 실데이터 기준선·신고 전 사실점검 준비 후 진행 (실전 시작 잠금/준비중)",
    "쉬운 분야(건강기능식품·일반식품·화장품·의료기기·위조상품·원산지) 다음의 후순위로 고정",
    "공공자료 기반 검토 후보 — 부정수급 확정이 아님",
    "특정 단체/개인/사업자를 부정수급자로 단정하지 않음",
    "주민등록번호/계좌번호/민감정보 수집·저장 금지",
    "비공개 보조금 자료 / 로그인 우회 / 무단 대량 크롤링 금지",
    "자동 신고 제출 / 자동 민원 제출 / 공식기관 자동 로그인 금지",
    "포상금/보상 수령 보장 없음 — 환수·처분·공식 기준에 따라 달라짐",
    "공공데이터포털 인증키 커밋 금지"
  ],
  ui: {
    agency: "국민권익위원회 / 보조금 관리기관 / 관할 지자체 감사부서",
    target: "보조금통합포털·e나라도움·보조사업자 정보공시·보탬e·공공데이터포털 등 공개자료",
    difficulty: "어려움",
    rewardLikelihood: "공식 기준 확인 필요 (수령 보장 없음)",
    guide: {
      detect:
        "반복 수급, 동일 주소 다단체, 유사 사업명, 결과물 증빙 부족, 교부금액 대비 산출물 부족, 특수관계(용역업체) 정황, 집행 패턴 이상, 공시 누락, 결과보고 콘텐츠 중복 — 모두 검토 후보 신호",
      report:
        "국민권익위원회 / 국민신문고 / 청렴포털, 보조금 관리기관, 관할 지자체 감사부서",
      evidence:
        "보조사업명, 보조사업자명(공시 영역), 교부기관, 회계연도, 교부금액, 집행내역(공개), 정산/결과보고(공개), 결과물 URL(공개), 원본 공시 URL, 캡처/PDF, 수집일시",
      reward:
        "환수·처분·공공기관 수입 회복·공식 기준에 따라 달라지며 수령을 보장하지 않습니다.",
      caution:
        "본 모듈은 프로토타입입니다. 부정수급 확정 판단이 아니며, 시범 지자체 1곳의 합성 sample 데이터로 분석 구조만 시연합니다. 실제 신고는 사람이 공식 채널에서 직접 진행해야 합니다."
    }
  }
};
