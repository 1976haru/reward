// 위조상품 모듈 메타데이터 (체크리스트 24)
// 본 모듈은 공개 판매게시글 기반 "위조상품 의심 후보"를 찾기 위한 보조 도구이며,
// 위조 여부 확정 / 권리자 침해 확정 / 자동 신고 / 자동 로그인 / 비공개자료 수집 / 개인정보 수집을 수행하지 않는다.

export const counterfeitGoodsModule = {
  id: "counterfeit_goods" as const,
  name: "위조상품 온라인 판매 의심 탐지",
  recommendedAgency: "특허청, 지식재산침해 원스톱 신고상담센터",
  category: "intellectual_property" as const,
  description:
    "공개 판매게시글에서 위조상품(상표권 침해 의심) 가능성이 있는 표현·구성·판매 방식 신호를 탐지한다. 본 모듈은 위조 여부를 확정하지 않으며, 권리자 감정과 관계기관 판단을 대체하지 않는다.",
  supportedInputTypes: ["public_url"] as const,
  capabilities: {
    publicUrlAnalysis: true,
    ruleBasedDetection: true,
    aiAnalysis: false,
    evidencePackage: true,
    reportDraft: true
  },
  safetyNotes: [
    "공개 판매게시글만 분석합니다.",
    "위조 여부 확정 판단을 하지 않습니다. 권리자 감정/관계기관 판단이 필요합니다.",
    "비공개 채팅방/구매자 개인정보/판매자 개인정보 추적/차단 우회/CAPTCHA 우회는 수행하지 않습니다.",
    "외부 신고기관 자동 제출 기능은 제공되지 않습니다. 사람이 직접 공식 창구에 제출해야 합니다.",
    "포상금 수령을 보장하지 않습니다. 공식 기준 확인이 필요합니다."
  ],
  defaultAgencyCandidates: [
    "특허청 (위조상품 신고포상금 안내)",
    "지식재산침해 원스톱 신고상담센터"
  ],
  defaultEvidenceRequirements: [
    "판매게시글 공개 URL",
    "상품 이미지 (공개 영역)",
    "로고/상표 표시 부분 캡처",
    "판매자 표시 정보 (공개 영역)",
    "가격 표시 캡처",
    "위조상품 의심 문구 캡처",
    "PDF 저장본",
    "수집 시각 (capturedAt)"
  ]
};
