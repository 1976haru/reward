// 기관명·단체명 정규화 표준 타입 (체크리스트 13).
//
// 본 모듈은 보조금 자료/지자체 공고/업로드 파일/나라장터 계약자료에 등장하는
// 기관명·단체명의 표기 차이(주식회사/(주)/㈜/사단법인/띄어쓰기/특수문자 등)를 통합하기 위한
// 타입/상수를 정의한다.
//
// 중요: 본 모듈은 동일 기관을 "확정"하는 도구가 아니라 "동일 기관 후보"를 만드는
// 정규화·병합 보조 도구다. 자동 확정 병합을 수행하지 않으며, 최종 판단은 사람이 한다.
// 대표자명/전화번호/상세주소는 단독 병합 기준으로 사용하지 않는다.
//
// 운영 기준: docs/ENTITY_NORMALIZATION_GUIDE.md
// 본 모듈은 법률 자문이나 운영기관 공식 안내를 대체하지 않으며, 단체를 부정수급자로 단정하지 않는다.

// ---------- enum / 분류 ----------

export const ENTITY_KINDS = [
  "organization",
  "corporation",
  "nonprofit",
  "cooperative",
  "local_government",
  "department",
  "unknown"
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_MATCH_DECISIONS = [
  "strong_match",
  "likely_match",
  "possible_match",
  "no_match",
  "ambiguous"
] as const;
export type EntityMatchDecision = (typeof ENTITY_MATCH_DECISIONS)[number];

// ---------- 인터페이스 ----------

export interface NormalizedEntityName {
  /** 입력 원문. */
  originalName: string;
  /** 법인표현/괄호/특수문자 제거 후 공백 정규화한 비교용 이름(소문자). */
  normalizedName: string;
  /** 띄어쓰기·특수문자를 모두 제거한 비교용 이름(소문자). */
  compactName: string;
  /** normalizedName 의 토큰 목록. */
  tokens: string[];
  /** 제거된 법인/단체 표현(예: 주식회사, (주), 사단법인). */
  removedTokens: string[];
  /** 추정 기관 유형. */
  entityKind: EntityKind;
  /** 경고(빈 값/너무 짧음/일반명사만 남음 등). */
  warnings: string[];
}

export interface EntityMatchCandidate {
  left: NormalizedEntityName;
  right: NormalizedEntityName;
  /** 0~1 유사도. */
  similarityScore: number;
  decision: EntityMatchDecision;
  reasons: string[];
  /** 동일 기관 후보는 항상 사람 검토 대상 — 자동 확정 병합 금지. */
  reviewRequired: boolean;
}

export interface EntityNormalizationOptions {
  /** 괄호 안 지부/지점/지역 표현 제거 여부 (기본 true). */
  removeBranches?: boolean;
  /** 센터/복지관/협회/연합회/지부/지회 등 보조 접미어 제거 여부 (기본 false — 식별에 필요할 수 있음). */
  removeOptionalSuffixes?: boolean;
  /** 영문 소문자화 여부 (기본 true). */
  lowercase?: boolean;
}

export interface EntityMatchOptions extends EntityNormalizationOptions {
  /** likely_match 임계값 (기본 0.88). */
  likelyThreshold?: number;
  /** possible_match 임계값 (기본 0.72). */
  possibleThreshold?: number;
}

export interface EntityCandidateGroup {
  /** 대표 정규화명(compactName). */
  groupKey: string;
  /** 그룹에 속한 원문 이름들. */
  members: string[];
  /** 그룹 형성 사유. */
  basis: "exact_compact" | "high_similarity";
  /** 그룹 내 대표 후보 정규화 결과. */
  representative: NormalizedEntityName;
  /** 동일 기관 후보 그룹 — 자동 확정 병합이 아니다. */
  reviewRequired: boolean;
}

// ---------- 법인·단체 표현 사전 ----------

/** 접두로 자주 등장하는 법인/단체 표현 (괄호 약칭 포함). */
export const ENTITY_LEGAL_PREFIXES: readonly string[] = [
  "주식회사",
  "유한회사",
  "유한책임회사",
  "합자회사",
  "합명회사",
  "사단법인",
  "재단법인",
  "사회복지법인",
  "학교법인",
  "의료법인",
  "종교법인",
  "농업회사법인",
  "비영리민간단체",
  "민간단체",
  "(주)",
  "(사)",
  "(재)",
  "(유)",
  "(합)",
  "㈜"
];

/** 접미로 자주 등장하는 법인/단체 표현. */
export const ENTITY_LEGAL_SUFFIXES: readonly string[] = [
  "주식회사",
  "사회적협동조합",
  "영농조합법인",
  "농업회사법인",
  "협동조합",
  "(주)",
  "㈜"
];

/** 무조건 제거하지 않고 옵션으로 처리하는 보조 접미어(기관 식별에 필요할 수 있음). */
export const ENTITY_OPTIONAL_SUFFIXES: readonly string[] = [
  "센터",
  "복지관",
  "협회",
  "연합회",
  "지부",
  "지회",
  "지점"
];

/** 단독으로 남으면 식별력이 약한 일반명사/유형 토큰 (ambiguous 판정 보조). */
export const ENTITY_GENERIC_TOKENS: readonly string[] = [
  "센터",
  "복지관",
  "협회",
  "연합회",
  "마을",
  "사업단",
  "위원회",
  "공동체",
  "재단",
  "법인",
  "단체",
  "조합"
];

/** 시군구/광역 등 지역명 — 단독으로 남으면 ambiguous (보조 신호로만 사용). */
export const ENTITY_REGION_TOKENS: readonly string[] = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "수원",
  "성남",
  "고양",
  "용인",
  "예시시",
  "예시군"
];

// ---------- 안내문 ----------

export const ENTITY_NORMALIZATION_NOTICE =
  "본 모듈은 기관명·단체명 표기 차이를 통합해 '동일 기관 후보'를 만드는 정규화·병합 보조 도구입니다. " +
  "동일 기관을 확정하지 않으며, 자동 확정 병합을 수행하지 않습니다. 모든 병합 후보는 사람 검토 대상입니다. " +
  "대표자명·전화번호·상세주소는 단독 병합 기준으로 사용하지 않으며, 주민번호/계좌번호/개인 연락처/개인 이메일은 수집·저장하지 않습니다. " +
  "지역명(시군구)은 보조 신호로만 사용합니다. 본 모듈은 단체를 부정수급자로 단정하지 않습니다.";
