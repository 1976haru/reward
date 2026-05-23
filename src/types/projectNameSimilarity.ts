// 사업명 유사도 표준 타입 (체크리스트 15).
//
// 본 모듈은 보조금 자료/지자체 공고/업로드 파일/공공 API의 사업명 표기 차이와
// 유사 사업명을 찾기 위한 타입/상수를 정의한다.
//
// 중요: 본 모듈은 반복 신청/유사 사업을 "확정"하는 도구가 아니라 "유사 사업명 후보"와
// "반복 신청 검토 후보"를 만드는 보조 도구다. 자동 확정 병합을 수행하지 않으며,
// 최종 판단은 사람이 한다.
//   - 형태소 분석기 의존성을 추가하지 않는다(문자열 정규화 + 토큰/문자 n-gram/편집거리 기반).
//   - 사업명 유사도만으로 반복 신청 또는 부정수급을 단정하지 않는다.
//   - 결과는 "유사 사업명 후보 / 반복 신청 검토 후보 / 추가 확인 필요"로만 표현한다.
//
// 운영 기준: docs/PROJECT_NAME_SIMILARITY_GUIDE.md
// 본 모듈은 법률 자문을 대체하지 않는다.

// ---------- enum ----------

export const PROJECT_SIMILARITY_DECISIONS = [
  "strong_similar",
  "similar_candidate",
  "possible_candidate",
  "no_match",
  "ambiguous"
] as const;
export type ProjectSimilarityDecision = (typeof PROJECT_SIMILARITY_DECISIONS)[number];

// ---------- 인터페이스 ----------

export interface NormalizedProjectName {
  originalName: string;
  /** 정규화(연도/차수/괄호 제거, 공백·구두점 정리, 소문자)된 이름. */
  normalizedName: string;
  /** 공백/특수문자를 제거한 전체 비교용 이름(연도/차수 제외, 일반토큰 포함). */
  compactName: string;
  /** 일반토큰·지역명을 제거한 '핵심' 비교용 이름(유사도 핵심 키). */
  compactCore: string;
  tokens: string[];
  importantTokens: string[];
  genericTokens: string[];
  yearTokens: string[];
  roundTokens: string[];
  regionTokens: string[];
  /** 제거된 괄호 메모 등. */
  removedTokens: string[];
  warnings: string[];
}

export interface ProjectSimilarityCandidate {
  left: NormalizedProjectName;
  right: NormalizedProjectName;
  similarityScore: number;
  decision: ProjectSimilarityDecision;
  reasons: string[];
  /** 유사 사업명 후보는 항상 사람 검토 대상 — 자동 확정 금지. */
  reviewRequired: boolean;
}

export interface ProjectSimilarityOptions {
  /** 괄호 메모 제거 여부 (기본 true). */
  removeParentheses?: boolean;
  /** 영문 소문자화 (기본 true). */
  lowercase?: boolean;
}

export interface ProjectMatchOptions extends ProjectSimilarityOptions {
  /** strong_similar 임계값 (기본 0.90). */
  strongThreshold?: number;
  /** similar_candidate 임계값 (기본 0.85). */
  similarThreshold?: number;
  /** possible_candidate 임계값 (기본 0.70). */
  possibleThreshold?: number;
}

/** findSimilarProjectNameCandidates 결과 항목. */
export interface SimilarProjectPair {
  leftName: string;
  rightName: string;
  similarityScore: number;
  decision: ProjectSimilarityDecision;
  reviewRequired: boolean;
}

// ---------- 토큰 사전 ----------

/** 식별력이 낮은 일반 토큰(낮은 가중치). 핵심 비교에서는 제거한다. */
export const PROJECT_GENERIC_TOKENS: readonly string[] = [
  "사업",
  "지원",
  "보조",
  "공모",
  "모집",
  "신청",
  "안내",
  "계획",
  "추진",
  "운영",
  "프로그램",
  "참여",
  "대상",
  "선정",
  "결과",
  "지급",
  "교부",
  "정산",
  "보급",
  "활성화"
];

/** 분야 식별에 중요한 토큰(높은 가중치). 사전에 없는 고유 토큰도 자동으로 중요 토큰으로 본다. */
export const PROJECT_IMPORTANT_TOKENS: readonly string[] = [
  "청년",
  "아동",
  "노인",
  "장애인",
  "문화",
  "예술",
  "창업",
  "농업",
  "스마트팜",
  "돌봄",
  "교육",
  "주거",
  "환경",
  "마을",
  "공동체",
  "다문화",
  "일자리",
  "체육",
  "관광"
];

/** 지역 보조 토큰 — 핵심 비교에서 제거(보조 신호로만 사용). */
export const PROJECT_REGION_TOKENS: readonly string[] = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "경기도",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "수원시",
  "수원",
  "성남시",
  "성남",
  "고양시",
  "용인시"
];

// ---------- 안내문 ----------

export const PROJECT_NAME_SIMILARITY_NOTICE =
  "본 모듈은 사업명 표기 차이와 유사 사업명을 찾아 '유사 사업명 후보 / 반복 신청 검토 후보'를 만드는 보조 도구입니다. " +
  "반복 신청 또는 부정수급을 확정하지 않으며, 자동 확정 병합을 수행하지 않습니다. 모든 후보는 사람 검토 대상입니다. " +
  "연도·차수·공모/지원/사업 같은 일반 표현은 낮은 가중치로 처리하고, 지역명은 보조 신호로만 사용합니다. " +
  "형태소 분석기 없이 문자열 정규화 + 토큰/문자 n-gram/편집거리 기반으로 유사도를 계산합니다. " +
  "유사도 0.85 이상도 확정이 아니라 추가 확인 필요 후보입니다.";
