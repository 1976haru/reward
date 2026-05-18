// 입찰담합 의심 패턴 분석 프로토타입 (체크리스트 26)
// 본 모듈은 공개 입찰 데이터 패턴 분석으로 "검토 후보"를 만들 뿐, 담합을 확정하지 않는다.
// 실제 담합 여부는 공정거래위원회, 수사기관, 법원 등 관계기관의 조사·판단이 필요하다.
// 자동 신고 / 자동 민원 / 자동 로그인 / 비공개 자료 수집 / 무단 대량 크롤링 / 인증키 커밋은 모두 금지한다.

export const bidCollusionModule = {
  id: "bid_collusion" as const,
  name: "입찰담합 의심 패턴 분석",
  recommendedAgency: "공정거래위원회 / 발주기관 감사부서 / 국민신문고",
  category: "antitrust" as const,
  description:
    "정형 공개 입찰 데이터(나라장터 등)에서 동일 업체군 반복 참여, 순환 낙찰, 좁은 투찰 간격, 들러리 후보 패턴 등 검토 우선순위가 높은 신호를 탐지한다. 본 결과는 담합 확정이 아니며, 신고 채널·과징금·포상금 여부는 공정거래위원회 공식 기준과 처리 결과에 따라 달라진다.",
  supportedInputTypes: ["public_bid_record"] as const,
  capabilities: {
    publicUrlAnalysis: false,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: true,
    reportDraft: true,
    structuredDataAnalysis: true,
    bidderGroupAnalysis: true,
    riskScoring: true,
    humanReview: true
  },
  safetyNotes: [
    "본 결과는 담합 확정이 아닙니다. 공개 입찰 데이터 기반 의심 후보일 뿐입니다.",
    "특정 업체/개인/발주기관을 담합 주체로 단정하지 않습니다.",
    "주민등록번호/계좌번호/연락처/내부자료 등 민감정보·비공개 정보를 수집하거나 저장하지 않습니다.",
    "비공개 입찰자료 / 로그인 우회 / 무단 대량 크롤링 / 공식 API 제한 우회는 수행하지 않습니다.",
    "자동 신고 제출 / 자동 민원 제출 / 공식기관 자동 로그인은 수행하지 않습니다.",
    "신고포상금은 공정거래위원회 공식 기준·조치 결과·과징금·증거 수준에 따라 달라지며 보장하지 않습니다.",
    "신고 전 사람이 원자료(나라장터/조달데이터허브)와 공정거래위원회 공식 안내를 직접 확인해야 합니다.",
    "공공데이터포털 / 나라장터 인증키를 커밋하지 않습니다."
  ],
  defaultAgencyCandidates: [
    "공정거래위원회 (담합 신고 / 신고포상금)",
    "발주기관 감사부서",
    "국민신문고 / 국민권익위원회"
  ],
  defaultEvidenceRequirements: [
    "입찰공고번호",
    "공고명",
    "발주기관",
    "공고일자",
    "개찰일자",
    "예정가격 또는 기초금액",
    "낙찰금액",
    "낙찰률",
    "참여업체 목록 (공개)",
    "업체별 투찰금액",
    "개찰순위",
    "반복 낙찰 패턴 근거",
    "동일 업체군 반복 참여 근거",
    "유사 낙찰률 근거",
    "원본 API/공개자료 URL",
    "수집일시",
    "분석 리포트"
  ]
};

export const BID_COLLUSION_SAFETY_NOTICE =
  "입찰담합 모듈은 공개자료 기반 패턴 분석 프로토타입입니다. 담합 확정 판단이 아니며, 관계기관의 조사와 사람 검토가 필요합니다.";
