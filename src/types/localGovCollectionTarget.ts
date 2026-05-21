// 경기도 지자체 공시자료 수집대상 (체크리스트 9).
//
// 본 모듈은 보조금 / 정산 / 감사 / 환수 등 지자체 공개자료 수집의 1차 파일럿 대상을
// 타입으로 표현한다. 실제 수집기는 별도 단계에서 구현되며, 본 파일은 타입 정의 +
// 상수만 포함하고 런타임 동작이 없다.
//
// 본 스키마는 docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md §3 / §5 / §9 와 동기화되어야 한다.
// 정적 검증: tests/localGovCollectionTargets.test.ts (`npm run test:local-gov-targets`).
//
// 본 모듈은 법률 자문이나 운영기관 공식 안내를 대체하지 않는다.

// ---------- enum / 분류 ----------

export const LOCAL_GOV_REGION_LEVELS = ["province", "city", "county"] as const;
export type LocalGovRegionLevel = (typeof LOCAL_GOV_REGION_LEVELS)[number];

export const LOCAL_GOV_PRIORITIES = ["P0", "P1", "P2"] as const;
export type LocalGovPriority = (typeof LOCAL_GOV_PRIORITIES)[number];

export const LOCAL_GOV_STATUSES = [
  "candidate",
  "needs_verification",
  "verified",
  "excluded"
] as const;
export type LocalGovStatus = (typeof LOCAL_GOV_STATUSES)[number];

export const LOCAL_GOV_DOCUMENT_TYPES = [
  "subsidy_notice", // 보조금 공고
  "selection_result", // 선정 결과
  "settlement", // 정산
  "inspection", // 검사·점검
  "audit_result", // 감사결과
  "recovery_return", // 환수·반환
  "budget_settlement", // 예산·결산
  "ordinance" // 조례
] as const;
export type LocalGovDocumentType = (typeof LOCAL_GOV_DOCUMENT_TYPES)[number];

export const LOCAL_GOV_PRIVACY_RISKS = ["low", "medium", "high", "unknown"] as const;
export type LocalGovPrivacyRisk = (typeof LOCAL_GOV_PRIVACY_RISKS)[number];

// ---------- 검색 키워드 세트 ----------

export const LOCAL_GOV_KEYWORD_SETS: Readonly<Record<string, readonly string[]>> = {
  보조금_기본: ["보조금", "지방보조금", "국고보조금", "보조사업", "민간보조", "보조사업자"],
  공모_선정: ["공모", "모집", "지원사업", "신청", "선정결과", "대상자 선정"],
  교부_집행: ["교부", "교부결정", "집행", "집행결과", "집행잔액"],
  정산_반납: ["정산", "정산보고", "반납", "반환", "집행잔액", "잔액"],
  점검_검사: ["점검", "지도점검", "현장점검", "검사", "실태점검"],
  감사_환수: ["감사결과", "특정감사", "종합감사", "처분요구", "환수", "부정청구"],
  제도_기준: ["관리기준", "보조금 조례", "지원 조례", "운영지침"]
} as const;

const DEFAULT_KEYWORDS: readonly string[] = ["보조금", "정산", "환수", "감사"];

const DEFAULT_DOCUMENT_TYPES: readonly LocalGovDocumentType[] = [
  "subsidy_notice",
  "selection_result",
  "settlement",
  "inspection",
  "audit_result",
  "recovery_return"
];

// ---------- 수집 대상 인터페이스 ----------

/**
 * 경기도 / 시군 1곳을 표현하는 수집 대상 카드.
 *
 * - `status: "candidate"` 가 기본 — "자료 확보 완료"가 아니다.
 * - `officialSiteUrl` 등 게시판 URL 은 지자체 홈페이지 개편으로 변경될 수 있으며,
 *   대부분 31개 시군은 `undefined` (재확인 필요) 로 둔다.
 * - `lastCheckedAt` 은 본 항목을 마지막으로 재확인한 일시 (ISO 8601).
 */
export interface LocalGovCollectionTarget {
  id: string;
  regionLevel: LocalGovRegionLevel;
  provinceName: "경기도";
  localGovName: string;
  officialSiteUrl?: string;
  noticeBoardUrl?: string;
  disclosureUrl?: string;
  auditResultUrl?: string;
  subsidyBoardUrl?: string;
  priority: LocalGovPriority;
  status: LocalGovStatus;
  searchKeywords: readonly string[];
  targetDocumentTypes: readonly LocalGovDocumentType[];
  collectionYearRange: {
    mode: "recent_2_to_3_years";
    note: string;
  };
  privacyRisk: LocalGovPrivacyRisk;
  accessLimitNote?: string;
  lastCheckedAt?: string;
}

// ---------- 32개 수집 대상 상수 ----------

const YEAR_RANGE_NOTE = "기준연도는 실제 수집 실행일 기준 최근 2~3년. 예: 2026년 수집이면 2024~2026년 우선.";

function makeTarget(
  id: string,
  regionLevel: LocalGovRegionLevel,
  localGovName: string,
  priority: LocalGovPriority,
  options: {
    officialSiteUrl?: string;
    status?: LocalGovStatus;
    privacyRisk?: LocalGovPrivacyRisk;
    accessLimitNote?: string;
  } = {}
): LocalGovCollectionTarget {
  return {
    id,
    regionLevel,
    provinceName: "경기도",
    localGovName,
    officialSiteUrl: options.officialSiteUrl,
    noticeBoardUrl: undefined,
    disclosureUrl: undefined,
    auditResultUrl: undefined,
    subsidyBoardUrl: undefined,
    priority,
    status: options.status ?? "candidate",
    searchKeywords: DEFAULT_KEYWORDS,
    targetDocumentTypes: DEFAULT_DOCUMENT_TYPES,
    collectionYearRange: { mode: "recent_2_to_3_years", note: YEAR_RANGE_NOTE },
    privacyRisk: options.privacyRisk ?? "low",
    accessLimitNote:
      options.accessLimitNote ??
      "게시판 URL 은 지자체 홈페이지 개편으로 변경될 수 있어 재확인 필요. 로그인/인증/비공개 게시판은 수집 제외."
  };
}

export const LOCAL_GOV_TARGETS_GYEONGGI: readonly LocalGovCollectionTarget[] = [
  // 광역 1
  makeTarget("gg_province", "province", "경기도", "P0", {
    officialSiteUrl: "https://www.gg.go.kr",
    accessLimitNote:
      "경기도청 고시·공고/정보공개/감사결과 게시판 위치는 사이트 개편 가능성으로 재확인 필요. 로그인/내부 행정망 자료는 수집 제외."
  }),
  // 기초 P0 (16)
  makeTarget("gg_suwon", "city", "수원시", "P0"),
  makeTarget("gg_seongnam", "city", "성남시", "P0"),
  makeTarget("gg_goyang", "city", "고양시", "P0"),
  makeTarget("gg_yongin", "city", "용인시", "P0"),
  makeTarget("gg_bucheon", "city", "부천시", "P0"),
  makeTarget("gg_ansan", "city", "안산시", "P0"),
  makeTarget("gg_anyang", "city", "안양시", "P0"),
  makeTarget("gg_namyangju", "city", "남양주시", "P0"),
  makeTarget("gg_hwaseong", "city", "화성시", "P0"),
  makeTarget("gg_pyeongtaek", "city", "평택시", "P0"),
  makeTarget("gg_uijeongbu", "city", "의정부시", "P0"),
  makeTarget("gg_siheung", "city", "시흥시", "P0"),
  makeTarget("gg_paju", "city", "파주시", "P0"),
  makeTarget("gg_gimpo", "city", "김포시", "P0"),
  makeTarget("gg_gwangmyeong", "city", "광명시", "P0"),
  makeTarget("gg_gwangju", "city", "광주시", "P0"),
  // 기초 P1 (15)
  makeTarget("gg_gunpo", "city", "군포시", "P1"),
  makeTarget("gg_hanam", "city", "하남시", "P1"),
  makeTarget("gg_osan", "city", "오산시", "P1"),
  makeTarget("gg_icheon", "city", "이천시", "P1"),
  makeTarget("gg_anseong", "city", "안성시", "P1"),
  makeTarget("gg_uiwang", "city", "의왕시", "P1"),
  makeTarget("gg_yangju", "city", "양주시", "P1"),
  makeTarget("gg_guri", "city", "구리시", "P1"),
  makeTarget("gg_pocheon", "city", "포천시", "P1"),
  makeTarget("gg_yeoju", "city", "여주시", "P1"),
  makeTarget("gg_dongducheon", "city", "동두천시", "P1"),
  makeTarget("gg_gwacheon", "city", "과천시", "P1"),
  makeTarget("gg_yangpyeong", "county", "양평군", "P1"),
  makeTarget("gg_gapyeong", "county", "가평군", "P1"),
  makeTarget("gg_yeoncheon", "county", "연천군", "P1")
] as const;

// ---------- 헬퍼 ----------

export function getTargetById(id: string): LocalGovCollectionTarget | undefined {
  return LOCAL_GOV_TARGETS_GYEONGGI.find((t) => t.id === id);
}

export function listTargetsByPriority(priority: LocalGovPriority): readonly LocalGovCollectionTarget[] {
  return LOCAL_GOV_TARGETS_GYEONGGI.filter((t) => t.priority === priority);
}

export function listTargetsByLevel(level: LocalGovRegionLevel): readonly LocalGovCollectionTarget[] {
  return LOCAL_GOV_TARGETS_GYEONGGI.filter((t) => t.regionLevel === level);
}

export function countTargets(): { total: number; province: number; city: number; county: number } {
  let province = 0;
  let city = 0;
  let county = 0;
  for (const t of LOCAL_GOV_TARGETS_GYEONGGI) {
    if (t.regionLevel === "province") province++;
    else if (t.regionLevel === "city") city++;
    else if (t.regionLevel === "county") county++;
  }
  return { total: LOCAL_GOV_TARGETS_GYEONGGI.length, province, city, county };
}

// ---------- 안내문 ----------

export const LOCAL_GOV_COLLECTION_NOTICE =
  "본 지자체 수집 대상은 '수집 대상 선정' 단계의 후보 목록입니다 — '자료 확보 완료' 가 아닙니다. " +
  "각 지자체의 공식 홈페이지 / 고시·공고 / 정보공개 / 감사결과 게시판 위치와 검색 가능 여부는 " +
  "수집기 구현 직전에 사람이 직접 재확인해야 합니다. " +
  "로그인 / 인증 / 비공개 게시판 / 내부 행정망 / 개인정보 포함 자료는 수집 대상에서 제외됩니다. " +
  "최근 2~3년 자료를 우선 검토하며, 본 시스템은 수집한 자료를 외부 신고기관에 자동 제출하지 않습니다.";
