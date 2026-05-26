/**
 * ReportingRegistry — 공식 신고처 URL 중앙 Registry (체크리스트 24).
 *
 * 건강기능식품 허위·과대광고 등 모듈별 "공식 신고처" 후보를 한 곳에서 관리한다.
 *
 * 안전 원칙:
 * - 여기 등록된 URL 은 "단순 외부 링크"로만 사용한다. 자동 제출/자동 로그인/자동 양식입력 없음.
 * - 신고서 내용·개인정보·API 키·caseId 를 URL 에 자동으로 붙이지 않는다.
 * - manualSubmissionOnly=true, autoSubmitAvailable=false 가 모든 항목에 고정된다.
 * - 공식 사이트가 페이지 구조를 바꾸면 URL 이 변경될 수 있다. 정기적으로 공식 사이트에서 확인이 필요하다.
 */

export interface ReportingAgency {
  agencyId: string;
  agencyName: string;
  /** category 와 moduleId 는 동일 값으로 둔다 (예: "false_ad"). */
  moduleId: string;
  category: string;
  officialUrl: string;
  description: string;
  requiredEvidence: string[];
  cautions: string[];
  manualSubmissionOnly: true;
  autoSubmitAvailable: false;
  /** 사람이 마지막으로 공식 사이트를 확인한 날짜 (자동 갱신 아님). */
  lastReviewedAt: string;
  /** lastReviewedAt 의 별칭 — 외부 점검일을 동일하게 노출한다. */
  sourceCheckedAt: string;
}

export const REPORTING_REGISTRY_LAST_REVIEWED_AT = "2026-05-26";

export const REPORTING_REGISTRY_SAFETY_NOTICE =
  "공식 신고처 링크만 제공합니다. 실제 신고는 사용자가 공식 창구에서 직접 제출해야 하며, 공익레이더는 자동 제출·자동 로그인·자동 양식입력을 하지 않습니다. 공식 URL 은 변경될 수 있으므로 신고 전 공식 사이트에서 정기적으로 확인이 필요합니다.";

const COMMON_CAUTIONS: string[] = [
  "이 링크는 단순 외부 링크입니다. 시스템은 자동 입력·자동 로그인·자동 제출을 하지 않습니다.",
  "신고 내용·개인정보·API 키·caseId 가 링크로 자동 전송되지 않습니다.",
  "공식 URL 과 접수 경로는 변경될 수 있으니 신고 전 공식 사이트에서 직접 확인하세요.",
  "후보는 신고 대상 확정이 아니라 검토가 필요한 항목입니다. 포상금 지급은 보장되지 않습니다."
];

function entry(
  partial: Omit<ReportingAgency, "moduleId" | "manualSubmissionOnly" | "autoSubmitAvailable" | "lastReviewedAt" | "sourceCheckedAt"> & { moduleId: string }
): ReportingAgency {
  return {
    ...partial,
    category: partial.moduleId,
    manualSubmissionOnly: true,
    autoSubmitAvailable: false,
    lastReviewedAt: REPORTING_REGISTRY_LAST_REVIEWED_AT,
    sourceCheckedAt: REPORTING_REGISTRY_LAST_REVIEWED_AT
  };
}

/**
 * 건강기능식품 허위·과대광고(false_ad) 공식 신고처 후보.
 * 최소 포함: 식약처/식품안전 공식 신고 안내, 국민신문고, 관할 지자체·보건소·식품안전관리과.
 */
const FALSE_AD_AGENCIES: ReportingAgency[] = [
  entry({
    agencyId: "mfds",
    agencyName: "식품의약품안전처",
    moduleId: "false_ad",
    category: "false_ad",
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    description: "식품·건강기능식품 온라인 불법유통·허위·과대광고 신고 안내 페이지. 사용자가 직접 공식 양식에 따라 제출합니다.",
    requiredEvidence: ["원본 URL", "광고 문구 원문", "상품명", "화면 캡처/PDF", "수집일시", "질병 치료·예방·완치 표현 위치"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "epeople",
    agencyName: "국민신문고",
    moduleId: "false_ad",
    category: "false_ad",
    officialUrl: "https://www.epeople.go.kr",
    description: "민원·공익신고 통합 창구. 사용자가 직접 접속해 양식을 작성·제출합니다.",
    requiredEvidence: ["원본 URL", "위반 의심 문구 캡처", "수집일시", "신고 취지 요약(중립 표현)"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "local_government",
    agencyName: "관할 지자체 · 보건소 · 식품안전관리과",
    moduleId: "false_ad",
    category: "false_ad",
    officialUrl: "https://www.gov.kr",
    description: "정부24에서 관할 시·군·구청 또는 보건소/식품안전관리과를 찾아 직접 신고합니다. 지자체별 부서 명칭·접수 경로가 다릅니다.",
    requiredEvidence: ["원본 URL", "캡처/PDF", "관할 지역 확인", "수집일시"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "foodsafetykorea",
    agencyName: "식품안전나라",
    moduleId: "false_ad",
    category: "false_ad",
    officialUrl: "https://www.foodsafetykorea.go.kr/portal/fooddanger/puff.do",
    description: "허위·과대광고 유형 안내 및 신고 안내. 직접 접수 채널 여부는 공식 안내를 확인하고 사용자가 직접 제출합니다.",
    requiredEvidence: ["원본 URL", "광고 유형 분류", "캡처/PDF", "수집일시"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "acrc",
    agencyName: "국민권익위원회",
    moduleId: "false_ad",
    category: "false_ad",
    officialUrl: "https://www.acrc.go.kr",
    description: "공익신고 제도 일반 안내. 구체 접수 경로는 사이트 내 공식 안내를 확인하세요.",
    requiredEvidence: ["원본 URL", "공익침해 해당 여부 확인 자료", "캡처/PDF", "수집일시"],
    cautions: COMMON_CAUTIONS
  })
];

/**
 * 일반식품 허위·과대광고(general_food_false_ad) 공식 신고처 후보 (체크리스트 34).
 * 최소 포함: 식약처/식품안전 공식 신고 안내, 국민신문고, 관할 지자체·보건소·식품안전관리과.
 */
const GENERAL_FOOD_AGENCIES: ReportingAgency[] = [
  entry({
    agencyId: "mfds_general_food",
    agencyName: "식품의약품안전처",
    moduleId: "general_food_false_ad",
    category: "general_food",
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    description: "일반식품 온라인 허위·과대광고(질병·의약품 오인 표현 등) 신고 안내 페이지. 사용자가 직접 공식 양식에 따라 제출합니다.",
    requiredEvidence: ["원본 URL", "광고 문구 원문", "상품명", "화면 캡처/PDF", "수집일시", "질병·의약품 오인 표현 위치"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "epeople_general_food",
    agencyName: "국민신문고",
    moduleId: "general_food_false_ad",
    category: "general_food",
    officialUrl: "https://www.epeople.go.kr",
    description: "민원·공익신고 통합 창구. 사용자가 직접 접속해 양식을 작성·제출합니다.",
    requiredEvidence: ["원본 URL", "의심 문구 캡처", "수집일시", "신고 취지 요약(중립 표현)"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "local_government_general_food",
    agencyName: "관할 지자체 · 보건소 · 식품안전관리과",
    moduleId: "general_food_false_ad",
    category: "general_food",
    officialUrl: "https://www.gov.kr",
    description: "정부24에서 관할 시·군·구청 또는 보건소/식품안전관리과를 찾아 직접 신고합니다. 지자체별 부서 명칭·접수 경로가 다릅니다.",
    requiredEvidence: ["원본 URL", "캡처/PDF", "관할 지역 확인", "수집일시"],
    cautions: COMMON_CAUTIONS
  })
];

/**
 * 화장품 허위·과대광고(cosmetic_false_ad) 공식 신고처 후보 (체크리스트 38).
 * 최소 포함: 식약처/화장품 표시·광고 공식 신고 안내, 국민신문고, 관할 지자체·관련 행정기관.
 */
const COSMETIC_AGENCIES: ReportingAgency[] = [
  entry({
    agencyId: "mfds_cosmetic",
    agencyName: "식품의약품안전처",
    moduleId: "cosmetic_false_ad",
    category: "cosmetic",
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    description: "화장품 표시·광고 허위·과대광고(의약품 오인·기능성 범위 초과 등) 신고 안내 페이지. 사용자가 직접 공식 양식에 따라 제출합니다.",
    requiredEvidence: ["원본 URL", "광고 문구 원문", "상품명", "화면 캡처/PDF", "수집일시", "의약품·질환 오인 표현 위치"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "epeople_cosmetic",
    agencyName: "국민신문고",
    moduleId: "cosmetic_false_ad",
    category: "cosmetic",
    officialUrl: "https://www.epeople.go.kr",
    description: "민원·공익신고 통합 창구. 사용자가 직접 접속해 양식을 작성·제출합니다.",
    requiredEvidence: ["원본 URL", "의심 문구 캡처", "수집일시", "신고 취지 요약(중립 표현)"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "local_government_cosmetic",
    agencyName: "관할 지자체 · 보건소 · 관련 행정기관",
    moduleId: "cosmetic_false_ad",
    category: "cosmetic",
    officialUrl: "https://www.gov.kr",
    description: "정부24에서 관할 시·군·구청 또는 관련 행정기관을 찾아 직접 신고합니다. 지자체별 부서 명칭·접수 경로가 다릅니다.",
    requiredEvidence: ["원본 URL", "캡처/PDF", "관할 지역 확인", "수집일시"],
    cautions: COMMON_CAUTIONS
  })
];

/**
 * 의료기기 허위·과대광고(medical_device_false_ad) 공식 신고처 후보 (체크리스트 42).
 * 최소 포함: 식약처/의료기기 표시·광고 공식 신고 안내, 국민신문고, 관할 지자체·관련 행정기관.
 */
const MEDICAL_DEVICE_AGENCIES: ReportingAgency[] = [
  entry({
    agencyId: "mfds_medical_device",
    agencyName: "식품의약품안전처",
    moduleId: "medical_device_false_ad",
    category: "medical_device",
    officialUrl: "https://www.mfds.go.kr/wpge/m_660/de010410l001.do",
    description: "의료기기 표시·광고 허위·과대광고(허가 범위 초과·의료 효능 단정·의료기기 오인 등) 신고 안내 페이지. 사용자가 직접 공식 양식에 따라 제출합니다.",
    requiredEvidence: ["원본 URL", "광고 문구 원문", "상품명", "화면 캡처/PDF", "수집일시", "허가 범위 초과·의료 효능 단정 표현 위치"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "epeople_medical_device",
    agencyName: "국민신문고",
    moduleId: "medical_device_false_ad",
    category: "medical_device",
    officialUrl: "https://www.epeople.go.kr",
    description: "민원·공익신고 통합 창구. 사용자가 직접 접속해 양식을 작성·제출합니다.",
    requiredEvidence: ["원본 URL", "의심 문구 캡처", "수집일시", "신고 취지 요약(중립 표현)"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "local_government_medical_device",
    agencyName: "관할 지자체 · 보건소 · 관련 행정기관",
    moduleId: "medical_device_false_ad",
    category: "medical_device",
    officialUrl: "https://www.gov.kr",
    description: "정부24에서 관할 시·군·구청 또는 관련 행정기관을 찾아 직접 신고합니다. 지자체별 부서 명칭·접수 경로가 다릅니다.",
    requiredEvidence: ["원본 URL", "캡처/PDF", "관할 지역 확인", "수집일시"],
    cautions: COMMON_CAUTIONS
  })
];

/**
 * 위조상품 온라인 판매 의심(counterfeit_goods) 공식 신고처 후보 (체크리스트 46).
 * 최소 포함: 특허청 위조상품 신고 안내, 지식재산침해 원스톱 신고상담센터, 국민신문고, 관할 행정기관(단순 후보).
 */
const COUNTERFEIT_AGENCIES: ReportingAgency[] = [
  entry({
    agencyId: "kipo_counterfeit",
    agencyName: "특허청 (위조상품 신고)",
    moduleId: "counterfeit_goods",
    category: "counterfeit_goods",
    officialUrl: "https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346",
    description: "위조상품 신고포상금제도·지식재산침해 신고 안내 페이지. 위조 여부는 권리자 감정·관계기관 판단이 필요하며, 사용자가 직접 공식 양식에 따라 제출합니다.",
    requiredEvidence: ["판매게시글 URL", "상품명/브랜드 표시", "가격/구성품", "상품·로고 이미지 캡처", "동일 판매자 추정 근거", "수집일시"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "koipa_ippolice",
    agencyName: "지식재산침해 원스톱 신고상담센터",
    moduleId: "counterfeit_goods",
    category: "counterfeit_goods",
    officialUrl: "https://www.koipa.re.kr/ippolice/",
    description: "지식재산(상표권 등) 침해 신고·상담 안내. 사용자가 직접 접속해 상담·신고합니다. 위조 확정이 아니라 검토 요청 취지입니다.",
    requiredEvidence: ["판매게시글 URL", "위조 의심 증거화면", "상표 표시 캡처", "수집일시"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "epeople_counterfeit",
    agencyName: "국민신문고",
    moduleId: "counterfeit_goods",
    category: "counterfeit_goods",
    officialUrl: "https://www.epeople.go.kr",
    description: "민원·공익신고 통합 창구. 사용자가 직접 접속해 양식을 작성·제출합니다.",
    requiredEvidence: ["원본 URL", "의심 표현 캡처", "수집일시", "신고 취지 요약(중립 표현)"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "local_authority_counterfeit",
    agencyName: "관할 행정기관 · 수사기관 (단순 후보)",
    moduleId: "counterfeit_goods",
    category: "counterfeit_goods",
    officialUrl: "https://www.gov.kr",
    description: "사안에 따라 관할 행정기관·수사기관이 접수처가 될 수 있습니다. 단순 후보 안내이며, 구체 접수처는 사용자가 공식 안내로 직접 확인합니다.",
    requiredEvidence: ["원본 URL", "캡처/PDF", "수집일시"],
    cautions: COMMON_CAUTIONS
  })
];

/**
 * 원산지 표시 위반 의심(origin_labeling) 공식 신고처 후보 (체크리스트 50).
 * 최소 포함: 국립농산물품질관리원 원산지 표시 신고 안내, 국민신문고, 관할 지자체·관련 행정기관.
 */
const ORIGIN_LABELING_AGENCIES: ReportingAgency[] = [
  entry({
    agencyId: "naqs_origin",
    agencyName: "국립농산물품질관리원",
    moduleId: "origin_labeling",
    category: "origin_labeling",
    officialUrl: "https://www.naqs.go.kr",
    description: "농수산물·가공식품 원산지 표시 위반 신고 안내. 사용자가 직접 공식 창구로 제출하며, 위반 여부는 관계기관 판단이 필요합니다.",
    requiredEvidence: ["원본 URL", "상품명/옵션/상세페이지 원산지 표시 캡처", "수집일시", "표시 불일치·누락 화면 위치"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "epeople_origin",
    agencyName: "국민신문고",
    moduleId: "origin_labeling",
    category: "origin_labeling",
    officialUrl: "https://www.epeople.go.kr",
    description: "민원·공익신고 통합 창구. 사용자가 직접 접속해 양식을 작성·제출합니다.",
    requiredEvidence: ["원본 URL", "의심 표시 캡처", "수집일시", "신고 취지 요약(중립 표현)"],
    cautions: COMMON_CAUTIONS
  }),
  entry({
    agencyId: "local_authority_origin",
    agencyName: "관할 지자체 · 관련 행정기관",
    moduleId: "origin_labeling",
    category: "origin_labeling",
    officialUrl: "https://www.gov.kr",
    description: "정부24에서 관할 시·군·구청 또는 관련 행정기관을 찾아 직접 신고합니다. 지자체·기관별 접수 경로가 다릅니다.",
    requiredEvidence: ["원본 URL", "캡처/PDF", "관할 지역 확인", "수집일시"],
    cautions: COMMON_CAUTIONS
  })
];

const REGISTRY_BY_MODULE: Record<string, ReportingAgency[]> = {
  false_ad: FALSE_AD_AGENCIES,
  general_food_false_ad: GENERAL_FOOD_AGENCIES,
  cosmetic_false_ad: COSMETIC_AGENCIES,
  medical_device_false_ad: MEDICAL_DEVICE_AGENCIES,
  counterfeit_goods: COUNTERFEIT_AGENCIES,
  origin_labeling: ORIGIN_LABELING_AGENCIES
};

export class ReportingRegistryService {
  /** 모듈별 공식 신고처 목록 (조회 전용). */
  listByModule(moduleId: string): ReportingAgency[] {
    return (REGISTRY_BY_MODULE[moduleId] ?? []).map((a) => ({ ...a }));
  }

  /** 전체 신고처 목록. */
  listAll(): ReportingAgency[] {
    return Object.values(REGISTRY_BY_MODULE).flat().map((a) => ({ ...a }));
  }

  getByAgencyId(agencyId: string): ReportingAgency | null {
    const found = this.listAll().find((a) => a.agencyId === agencyId);
    return found ? { ...found } : null;
  }

  getModuleIds(): string[] {
    return Object.keys(REGISTRY_BY_MODULE);
  }

  getLastReviewedAt(): string {
    return REPORTING_REGISTRY_LAST_REVIEWED_AT;
  }
}

export const reportingRegistryService = new ReportingRegistryService();
