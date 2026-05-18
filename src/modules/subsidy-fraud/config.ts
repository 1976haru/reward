// 보조금 부정수급 의심 후보 탐지 프로토타입 (체크리스트 25)
// 본 모듈은 공공자료 기반으로 "검토 후보"를 만들 뿐, 부정수급을 확정하지 않는다.
// 사람이 원자료/기관 기준/관련 법령/실제 사업 수행 여부를 확인해야 한다.
// 자동 신고 / 자동 민원 제출 / 특정 단체를 부정수급자로 단정하는 표현 / 비공개 자료 수집 /
// 개인정보 수집 / 공공데이터포털 인증키 커밋 — 모두 금지한다.

export const subsidyFraudModule = {
  id: "subsidy_fraud" as const,
  name: "보조금 부정수급 의심 후보 탐지",
  recommendedAgency: "국민권익위원회, 보조금 관리기관, 관할 지자체 감사부서",
  category: "public_funds" as const,
  description:
    "공공자료(보조금통합포털, e나라도움, 보조사업자 정보공시, 보탬e, 공공데이터포털 등)를 근거로 보조금 부정수급 의심 후보의 검토 우선순위를 산정한다. 본 결과는 부정수급 확정이 아니며, 신고 채널·환수·처분·포상 여부는 공식 기준과 기관 판단에 따라 달라진다.",
  supportedInputTypes: ["public_subsidy_record"] as const,
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: true,
    reportDraft: true,
    dataMatching: true,
    riskScoring: true,
    humanReview: true
  },
  safetyNotes: [
    "본 결과는 부정수급 확정이 아닙니다. 공공자료 기반 의심 후보일 뿐입니다.",
    "특정 단체/개인/사업자를 부정수급자로 단정하지 않습니다.",
    "주민등록번호/계좌번호/민감정보를 수집하거나 저장하지 않습니다.",
    "비공개 보조금 자료 / 로그인 우회 / 무단 대량 크롤링은 수행하지 않습니다.",
    "자동 신고 제출 / 자동 민원 제출 / 공식기관 자동 로그인은 수행하지 않습니다.",
    "포상금/보상 지급 여부는 환수·처분·공식 기준에 따라 달라지며 보장하지 않습니다.",
    "신고 전 사람이 원자료/기관 기준/법령/실제 사업 수행 여부를 확인해야 합니다."
  ],
  pilot: {
    region: "충청남도 당진시",
    regionId: "dangjin",
    notes:
      "공공데이터포털에 당진시 지방보조금 데이터 예시가 공개되어 있음을 참고. 본 모듈의 sample-data.json 은 가상/샘플이며 실제 단체/개인/사업자 정보를 단정하지 않는다."
  },
  defaultAgencyCandidates: [
    "국민권익위원회 / 국민신문고",
    "보조금 관리기관 (중앙부처/지자체/공공기관)",
    "관할 지자체 감사부서"
  ],
  defaultEvidenceRequirements: [
    "보조사업명",
    "보조사업자명 (공시 영역)",
    "교부기관",
    "회계연도",
    "교부금액",
    "집행내역 (공개)",
    "정산/결과보고 자료 (공개)",
    "결과물 URL 또는 증빙 (공개)",
    "원본 공고/공시 URL",
    "수집일시",
    "캡처/PDF"
  ]
};

export const SUBSIDY_FRAUD_SAFETY_NOTICE =
  "보조금 모듈은 공개자료 기반 검토 후보를 만드는 프로토타입입니다. 부정수급 확정 판단이 아니며, 공식기관 확인이 필요합니다.";
