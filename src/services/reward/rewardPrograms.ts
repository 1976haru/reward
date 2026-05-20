/**
 * Reward Programs — 공익레이더가 참고하는 신고포상금·보상금 제도 안내 DB.
 *
 * 안전 원칙:
 * - 이 데이터는 사용자가 어떤 자료를 모아 어디에 신고해야 하는지 이해시키는 안내 DB이다.
 * - 포상금/보상금 수령을 보장하는 화면이 아니다.
 * - 금액·한도·기준은 공식 기관 페이지에서 확인해야 한다.
 * - 자동 신고 / 자동 제출 / 포상금 신청을 자동화하는 흐름은 본 시스템에서 수행하지 않는다.
 * - 표현 정책: 수령 확정 / 지급 단정 / 보장 단정 류의 긍정문은 사용하지 않는다.
 *   sanitizeRewardText() 가 대표 패턴을 중립 표현으로 자동 치환한다.
 */

export interface RewardProgram {
  id: string;
  moduleId: string;                // false_ad / counterfeit_goods / bid_collusion / public_interest / subsidy_fraud
  title: string;
  agencyName: string;
  departmentHint: string;
  officialUrl: string;
  whatToCollect: string[];
  evidenceChecklist: string[];
  rewardBasisSummary: string;
  amountGuide: string;              // 항상 "공식 기준 확인 필요" 안내 동반
  exclusionNotes: string[];
  cautionRules: string[];           // 화면 하단 주의 문구 (수령 보장 없음 등)
  lastReviewedAt: string;           // 사람이 마지막으로 점검한 날짜 (자동 갱신 아님)
}

/**
 * 사람이 마지막으로 공식 기준을 점검한 날짜 — 기관별 신고처/포상금 기준은 변경될 수 있으므로
 * 실전 신고 전 사람이 공식 페이지에서 다시 확인해야 한다.
 */
export const REWARD_PROGRAMS_LAST_REVIEWED_AT = "2026-05-20";

const COMMON_CAUTIONS: string[] = [
  "본 안내는 참고용이며, 포상금/보상금 수령을 보장하지 않습니다.",
  "지급 여부·금액·기준은 공식 기관의 처리 결과와 지급 제외 사유에 따라 달라질 수 있습니다.",
  "실전 신고 전 공식 URL에서 최신 기준을 사람이 직접 재확인해야 합니다.",
  "공익레이더는 외부 신고기관에 자동으로 제출하지 않습니다."
];

export const REWARD_PROGRAMS: ReadonlyArray<RewardProgram> = [
  {
    id: "mfds_false_ad",
    moduleId: "false_ad",
    title: "식품·건강기능식품 온라인 허위·과대광고 신고",
    agencyName: "식품의약품안전처",
    departmentHint: "식품·의약품·화장품·의료기기 온라인 불법유통 신고센터",
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    whatToCollect: [
      "원본 URL",
      "광고 문구 원문",
      "상품명",
      "판매자 공개 정보",
      "화면 캡처",
      "PDF 저장본",
      "수집일시",
      "질병 치료·예방·완치 표현 위치"
    ],
    evidenceChecklist: [
      "광고 페이지가 공개 URL인지 확인",
      "위반 의심 문구가 실제 페이지에 표시되는지 확인",
      "캡처와 PDF를 저장했는지 확인",
      "개인정보가 불필요하게 포함되지 않았는지 확인",
      "식약처 공식 신고 안내를 재확인"
    ],
    rewardBasisSummary:
      "신고포상금 지급 여부와 금액은 관련 법령·고시·처분 결과·지급 제외 사유에 따라 달라질 수 있음.",
    amountGuide:
      "공식 규정 확인 필요. 본 화면은 금액을 확정 표시하지 않으며, 식약처 공식 페이지에서 최신 기준을 확인해야 합니다.",
    exclusionNotes: [
      "허위·악의적 신고는 금지됩니다.",
      "신고포상금 목적의 조작 행위는 금지됩니다.",
      "지급 제외 사유는 공식 기관 안내에서 확인이 필요합니다."
    ],
    cautionRules: COMMON_CAUTIONS,
    lastReviewedAt: REWARD_PROGRAMS_LAST_REVIEWED_AT
  },
  {
    id: "kipo_counterfeit",
    moduleId: "counterfeit_goods",
    title: "위조상품 신고포상금제도",
    agencyName: "특허청",
    departmentHint: "위조상품 신고포상금제도 / 지식재산침해 신고",
    officialUrl: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    whatToCollect: [
      "판매게시글 URL",
      "상품명",
      "브랜드/상표 표시",
      "가격",
      "상품 이미지",
      "로고/상표 표시 캡처",
      "판매자 공개 정보",
      "동일 판매자 추정 증거",
      "수집일시"
    ],
    evidenceChecklist: [
      "온라인 판매게시글 URL 확보",
      "위조상품 의심 증거화면 확보",
      "동일 판매자 추정 증거 확보",
      "상품 이미지와 상표 표시 캡처",
      "공식 신청기한·구비서류 확인"
    ],
    rewardBasisSummary:
      "특허청 공식 기준에 따라 지급대상, 신청기한, 구비서류, 적발금액 등 요건 확인이 필요합니다.",
    amountGuide:
      "공식 기준 확인 필요. 적발금액·기소의견 송치 등 요건에 따라 달라질 수 있으며, 본 화면은 금액을 확정 표시하지 않습니다.",
    exclusionNotes: [
      "위조 여부 확정 판단은 권리자/관계기관 판단이 필요합니다.",
      "포상금 수령 보장 없음 — 공식 기준 확인 필요.",
      "허위 신고는 금지됩니다."
    ],
    cautionRules: COMMON_CAUTIONS,
    lastReviewedAt: REWARD_PROGRAMS_LAST_REVIEWED_AT
  },
  {
    id: "ftc_bid_collusion",
    moduleId: "bid_collusion",
    title: "담합 등 공정거래법 위반 신고포상금",
    agencyName: "공정거래위원회",
    departmentHint: "담합·부당한 공동행위 신고",
    officialUrl: "https://www.ftc.go.kr/www/contents.do?key=402",
    whatToCollect: [
      "입찰공고번호",
      "발주기관",
      "참여업체 목록",
      "업체별 투찰금액",
      "낙찰자",
      "낙찰금액",
      "낙찰률",
      "반복 업체군 패턴",
      "순환 낙찰 패턴",
      "원본 공개자료 URL"
    ],
    evidenceChecklist: [
      "원본 입찰공고 확인",
      "개찰결과 확인",
      "업체별 투찰금액 확인",
      "반복 참여 업체군 분석",
      "낙찰률 패턴 정리",
      "담합 확정 표현을 쓰지 않았는지 확인"
    ],
    rewardBasisSummary:
      "담합 신고로 법 위반이 인정될 경우 신고포상금 지급 대상이 될 수 있으며, 공식 기준에 따라 산정됩니다.",
    amountGuide:
      "공정위 안내 기준 확인 필요. 담합 신고포상금은 공식 안내상 상한선이 존재할 수 있으나, 지급 여부와 금액은 공식 기준과 처리 결과에 따라 달라집니다.",
    exclusionNotes: [
      "담합 확정 표현은 금지됩니다.",
      "특정 업체를 담합 업체로 단정하지 않습니다.",
      "공식 조사 결과 확인이 필요합니다.",
      "포상금 수령 보장 없음."
    ],
    cautionRules: COMMON_CAUTIONS,
    lastReviewedAt: REWARD_PROGRAMS_LAST_REVIEWED_AT
  },
  {
    id: "acrc_public_interest",
    moduleId: "public_interest",
    title: "공익신고 보상금·포상금 제도",
    agencyName: "국민권익위원회 / 청렴포털",
    departmentHint: "공익침해 신고 보상·포상 제도",
    officialUrl: "https://www.clean.go.kr/menu.es?mid=a10613010000",
    whatToCollect: [
      "신고 대상 행위 설명",
      "관련 증거자료",
      "원본 URL",
      "처분 또는 환수 가능성 관련 자료",
      "공공기관 수입 회복·증대 관련 자료",
      "행정처분 가능성 관련 자료"
    ],
    evidenceChecklist: [
      "공익침해행위에 해당하는지 공식 기준 확인",
      "증거자료 원본 확보",
      "신고자 보호·보상 신청기한 확인",
      "보상금/포상금 차이를 확인",
      "개인정보 최소화 확인"
    ],
    rewardBasisSummary:
      "공익신고로 공공기관 수입 회복·증대 등이 확정되는 경우 보상금이, 공익 증진·행정처분 등 사유에 따라 포상금이 검토될 수 있습니다.",
    amountGuide:
      "공식 기준표 확인 필요. 보상대상가액 구간별 산정 기준이 있으며, 포상금은 심의·의결에 따라 결정되므로 본 화면은 금액을 확정 표시하지 않습니다.",
    exclusionNotes: [
      "보상금과 포상금은 요건이 다릅니다.",
      "신청기한과 지급제한 사유 확인이 필요합니다.",
      "수령 보장 없음 — 공식 기준 확인 필요."
    ],
    cautionRules: COMMON_CAUTIONS,
    lastReviewedAt: REWARD_PROGRAMS_LAST_REVIEWED_AT
  },
  {
    id: "acrc_corruption_subsidy",
    moduleId: "subsidy_fraud",
    title: "부패행위 신고 보상·포상 및 보조금 부정수급 참고",
    agencyName: "국민권익위원회 / 청렴포털",
    departmentHint: "부패행위 신고 보상·포상",
    officialUrl: "https://www.clean.go.kr/menu.es?mid=a10613000000",
    whatToCollect: [
      "보조사업명",
      "보조사업자",
      "교부기관",
      "교부금액",
      "집행내역",
      "정산보고서",
      "결과보고서",
      "반복 수급 정황",
      "동일 주소/단체명 유사성",
      "원본 공고/공시 URL"
    ],
    evidenceChecklist: [
      "보조금 공고/교부/집행/정산 자료 확보",
      "정보공시 또는 공공데이터 원본 URL 확보",
      "반복 수급 또는 동일 주소 정황 정리",
      "결과물 부족 정황 정리",
      "보조금 관리기관 확인 필요"
    ],
    rewardBasisSummary:
      "부패행위 또는 보조금 부정수급 신고 관련 보상·포상은 환수·처분·공공기관 손실 방지·제도개선 등 공식 요건에 따라 달라질 수 있습니다.",
    amountGuide:
      "공식 기준 확인 필요. 포상금은 보상심의위원회 등 공식 절차에 따라 결정될 수 있으며, 본 화면은 금액을 확정 표시하지 않습니다.",
    exclusionNotes: [
      "부정수급 확정 표현은 금지됩니다.",
      "특정 단체를 범죄자로 단정하지 않습니다.",
      "실제 환수·처분 결과 확인이 필요합니다.",
      "수령 보장 없음."
    ],
    cautionRules: COMMON_CAUTIONS,
    lastReviewedAt: REWARD_PROGRAMS_LAST_REVIEWED_AT
  }
];
