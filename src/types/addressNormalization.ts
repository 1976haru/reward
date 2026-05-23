// 주소 정규화 표준 타입 (체크리스트 14).
//
// 본 모듈은 보조금 자료/지자체 공고/업로드 파일/나라장터 계약자료의 주소 표기 차이
// (도로명/지번/층호수/약칭/괄호/특수문자/전각·반각/공백)를 통합하기 위한 타입/상수를 정의한다.
//
// 중요: 본 모듈은 동일 주소를 "확정"하는 도구가 아니라 "동일 주소 후보"를 만드는
// 정규화·매칭 보조 도구다. 자동 확정 병합을 수행하지 않으며, 최종 판단은 사람이 한다.
//   - 상세주소(동·호수·층)는 개인정보 위험이 있어 키에서 제외하고 저장·표시를 제한한다.
//   - 같은 주소 반복수급은 "검토 필요 신호"일 뿐 부정수급 확정이 아니다.
//   - 대표자명/전화번호/상세주소는 단독 병합 기준으로 사용하지 않는다.
//
// 운영 기준: docs/ADDRESS_NORMALIZATION_GUIDE.md
// 본 모듈은 법률 자문을 대체하지 않으며, 주소만으로 부정수급을 단정하지 않는다.

// ---------- enum ----------

export const ADDRESS_MATCH_DECISIONS = [
  "strong_match",
  "likely_match",
  "possible_match",
  "no_match",
  "ambiguous"
] as const;
export type AddressMatchDecision = (typeof ADDRESS_MATCH_DECISIONS)[number];

// ---------- 인터페이스 ----------

export interface NormalizedAddress {
  /** 입력 원문. */
  originalAddress: string;
  /** 개인정보 마스킹을 적용한 원문(저장/표시용). 상세주소는 마스킹/축약된다. */
  sanitizedOriginalAddress: string;

  // --- 행정구역 구성요소 ---
  sido?: string; // 시도 (정규화: 경기도, 서울특별시 등)
  sigungu?: string; // 시군구 (수원시 팔달구 등)
  eupmyeondong?: string; // 읍면동 (인계동, ○○읍, ○○면)
  roadName?: string; // 도로명 (효원로, ○○길)
  jibun?: string; // 지번/번지
  baseNumber?: string; // 도로명 기본 번지/건물번호
  buildingName?: string; // 공개자료 건물명 후보 (키에는 포함하지 않음)
  zipCode?: string; // 우편번호 (분리)

  /** 동일 주소 후보 키 — 시군구+읍면동+도로명/지번+기본번지 (상세주소 제외, 소문자/공백제거). */
  normalizedAddressKey: string;
  /** 반복수급 분석용 지역 단위 키 — 기본 번지 미포함, 개인정보 위험 축소. */
  addressRegionKey: string;

  /** 제거된 상세주소 토큰(층/호/동호수 등). 키·저장에 원문으로 남지 않는다. */
  removedDetailTokens: string[];
  tokens: string[];
  warnings: string[];
}

export interface AddressMatchCandidate {
  left: NormalizedAddress;
  right: NormalizedAddress;
  similarityScore: number;
  decision: AddressMatchDecision;
  reasons: string[];
  /** 동일 주소 후보는 항상 사람 검토 대상 — 자동 확정 병합 금지. */
  reviewRequired: boolean;
}

export interface AddressNormalizationOptions {
  /** 괄호 메모 제거 여부 (기본 true). 읍면동 후보면 경고로 남긴다. */
  removeParentheses?: boolean;
  /** 건물명 후보 보존 여부 (기본 true — 키에는 포함하지 않음). */
  keepBuildingName?: boolean;
  /** 영문 소문자화 (기본 true). */
  lowercase?: boolean;
}

export interface AddressMatchOptions extends AddressNormalizationOptions {
  /** likely_match 유사도 임계값 (기본 0.88). */
  likelyThreshold?: number;
  /** possible_match 유사도 임계값 (기본 0.72). */
  possibleThreshold?: number;
}

export interface AddressCandidateGroup {
  /** 대표 키(normalizedAddressKey). */
  groupKey: string;
  /** 그룹에 속한 원문 주소들(마스킹된 형태). */
  members: string[];
  basis: "normalized_key" | "region_key";
  representative: NormalizedAddress;
  /** 동일 주소 후보 그룹 — 자동 확정 병합이 아니다. */
  reviewRequired: boolean;
}

// ---------- 시도 약칭 사전 ----------

/** 시도 표준 명칭(긴 형태). */
export const ADDRESS_SIDO_CANONICAL: readonly string[] = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도"
];

/** 약칭 → 표준 명칭. 문자열 선두에서만 치환한다. */
export const ADDRESS_SIDO_ALIASES: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  세종시: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  강원도: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전라북도: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
  제주도: "제주특별자치도"
};

/** 상세주소(층/호/동호수) 탐지 패턴 — 키·저장에서 제거한다. */
export const ADDRESS_DETAIL_PATTERN_SOURCES: readonly string[] = [
  "\\d+\\s*동\\s*\\d+\\s*호", // 101동 202호
  "(?:지하\\s*|[Bb])\\d+\\s*층", // B1층, 지하1층
  "지하\\s*\\d*\\s*층",
  "\\d+\\s*층", // 3층
  "\\d+\\s*호", // 201호
  "\\d+\\s*동(?![가-힣])" // 101동 (행정동 '○○동'(한글+동)은 제외)
];

// ---------- 안내문 ----------

export const ADDRESS_NORMALIZATION_NOTICE =
  "본 모듈은 주소 표기 차이를 통합해 '동일 주소 후보'를 만드는 정규화·매칭 보조 도구입니다. " +
  "동일 주소를 확정하지 않으며, 자동 확정 병합을 수행하지 않습니다. 모든 병합 후보는 사람 검토 대상입니다. " +
  "상세주소(동·호수·층)와 개인 주거지 주소는 저장·표시를 제한하며, 반복수급 분석은 시도·시군구·읍면동·도로명/지번 수준의 " +
  "addressRegionKey 를 우선 사용합니다. 같은 주소 반복은 부정수급 확정이 아니라 검토 필요 신호입니다. " +
  "대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않습니다.";
