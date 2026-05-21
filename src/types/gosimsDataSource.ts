// e나라도움 / 국고보조금 데이터소스 수집기 스키마 초안 (체크리스트 7).
//
// 본 모듈은 향후 수집기가 만들 레코드 형식의 초안 타입이다.
// 실제 수집기는 별도 단계에서 구현된다 — 본 파일은 타입 정의만 포함하며 런타임 동작이 없다.
//
// 본 스키마는 docs/DATA_SOURCE_MAP_GOSIMS.md §5 / §8 과 동기화되어야 한다.
// 정적 검증: tests/dataSourceMap.test.ts (`npm run test:datasource-map`).
//
// 본 모듈은 법률 자문 또는 운영기관 공식 안내를 대체하지 않는다.

// ---------- 카테고리 / 분류 ----------

/** 보조사업자/수급자 구분. 개인일 경우 마스킹 또는 수집 제외 검토. */
export const GOSIMS_RECIPIENT_TYPES = [
  "institution",
  "organization",
  "corporation",
  "individual",
  "unknown"
] as const;
export type GosimsRecipientType = (typeof GOSIMS_RECIPIENT_TYPES)[number];

/** 원본 자료 다운로드 포맷. */
export const GOSIMS_DOWNLOAD_FORMATS = [
  "csv",
  "excel",
  "txt",
  "html",
  "api",
  "unknown"
] as const;
export type GosimsDownloadFormat = (typeof GOSIMS_DOWNLOAD_FORMATS)[number];

/** 레코드가 속한 데이터소스 카테고리 — 공개 통계센터의 각 화면에 대응. */
export const GOSIMS_RECORD_CATEGORIES = [
  "subsidy_project",
  "sub_project",
  "subsidy_recipient",
  "project_recipient_link",
  "execution_status",
  "settlement",
  "unknown"
] as const;
export type GosimsRecordCategory = (typeof GOSIMS_RECORD_CATEGORIES)[number];

// ---------- 레코드 스키마 ----------

/**
 * 향후 수집기가 만들 단일 레코드.
 *
 * 모든 금액 필드는 원화 기준이며, 원본 단위(원/천원/백만원) 가 다르면 수집기에서
 * 환산 후 저장한다. 환산 정보는 dataLimitNote 에 기록한다.
 *
 * 개인 식별 가능 필드(recipientName 이 개인인 경우 등) 는 저장 전에
 * src/policy/privacyGuard.ts 의 sanitizeForStorage 를 통과시켜야 한다.
 */
export interface GosimsDataRecord {
  // --- 출처 (필수) ---
  sourceName: string;
  sourceUrl: string;
  collectedAt: string;
  category: GosimsRecordCategory;

  // --- 사업/기관 ---
  fiscalYear?: number;
  ministryName?: string;
  agencyName?: string;
  projectName: string;
  subProjectName?: string;

  // --- 수급자 / 보조사업자 ---
  recipientName?: string;
  recipientType?: GosimsRecipientType;
  region?: string;

  // --- 금액 ---
  budgetAmount?: number;
  subsidyAmount?: number;
  executionAmount?: number;
  settlementAmount?: number;
  returnAmount?: number;

  // --- 기간 / 상태 ---
  projectPeriodStart?: string;
  projectPeriodEnd?: string;
  status?: string;

  // --- 증거 / 출처 / 제한 ---
  downloadFormat?: GosimsDownloadFormat;
  evidenceUrl?: string;
  dataLimitNote?: string;
}

// ---------- 데이터소스 항목 (URL 표) ----------

/** docs/DATA_SOURCE_MAP_GOSIMS.md §3 의 행에 대응. */
export interface GosimsSourceEntry {
  id: string;
  label: string;
  url: string;
  description: string;
  accessMethod: string;
  priority: "P0" | "P1" | "P2";
  category: GosimsRecordCategory | "entry_point" | "reference";
}

/**
 * 1차 조사 대상 URL 목록.
 * 본 배열은 문서의 표와 동기화되어야 하며, 수집기 구현 직전에 URL 유효성을 재확인해야 한다.
 */
export const GOSIMS_SOURCE_ENTRIES: readonly GosimsSourceEntry[] = [
  {
    id: "gosims_main",
    label: "e나라도움 메인",
    url: "https://www.gosims.go.kr",
    description: "국고보조금 통합관리시스템 (제도 안내, 로그인 영역은 수집 제외)",
    accessMethod: "web",
    priority: "P0",
    category: "entry_point"
  },
  {
    id: "eduopn_main",
    label: "공개 통계센터",
    url: "https://eduopn.gosims.go.kr",
    description: "공개 통계 조회 진입점",
    accessMethod: "web",
    priority: "P0",
    category: "entry_point"
  },
  {
    id: "eduopn_subsidy_project_view",
    label: "보조사업별 현황",
    url: "https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001001QView.do",
    description: "보조사업 현황 (다운로드 가능 여부 확인)",
    accessMethod: "web/csv/excel/txt",
    priority: "P0",
    category: "subsidy_project"
  },
  {
    id: "eduopn_sub_project_view",
    label: "내역사업별 현황",
    url: "https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001002QView.do",
    description: "내역사업 단위 현황",
    accessMethod: "web/csv/excel/txt",
    priority: "P0",
    category: "sub_project"
  },
  {
    id: "eduopn_recipient_view",
    label: "보조사업자별 현황",
    url: "https://eduopn.gosims.go.kr/opn/ih/ih002/getIH002002QView.do",
    description: "보조사업자 기준 현황",
    accessMethod: "web/csv/excel/txt",
    priority: "P0",
    category: "subsidy_recipient"
  },
  {
    id: "eduopn_project_recipient_view",
    label: "보조사업별 보조사업자 현황",
    url: "https://eduopn.gosims.go.kr/opn/ih/ih002/getIH002001QView.do",
    description: "사업별 보조사업자 정보",
    accessMethod: "web/csv/excel/txt",
    priority: "P0",
    category: "project_recipient_link"
  },
  {
    id: "losims_main",
    label: "보탬e (지방보조금)",
    url: "https://www.losims.go.kr",
    description: "지방보조금 참고 자료 (별도 데이터소스맵 후속 정리)",
    accessMethod: "web",
    priority: "P1",
    category: "reference"
  }
] as const;

// ---------- 공개 범위 분류 ----------

export interface GosimsScopeEntry {
  category: string;
  description: string;
  collectability: "high" | "medium" | "limited" | "excluded";
  caution: string;
}

/** docs §4 의 공개 범위 분류 표. */
export const GOSIMS_SCOPE_CLASSIFICATION: readonly GosimsScopeEntry[] = [
  {
    category: "subsidy_project",
    description: "중앙부처·기관의 보조사업 정보",
    collectability: "high",
    caution: "공개 범위 내에서만 수집"
  },
  {
    category: "sub_project",
    description: "보조사업 아래의 세부 내역사업 단위 정보",
    collectability: "high",
    caution: "명칭 변경·조직개편 가능성 주의"
  },
  {
    category: "subsidy_recipient",
    description: "보조금을 수행하는 기관·단체·법인·사업자 정보",
    collectability: "medium",
    caution: "개인 수급자 정보는 제외 또는 마스킹"
  },
  {
    category: "individual_recipient",
    description: "개인 또는 단체 수급 상세 정보",
    collectability: "limited",
    caution: "개인정보 포함 가능성 — 공개자료 한정"
  },
  {
    category: "execution_status",
    description: "교부·집행 금액 등 공개 집계 정보",
    collectability: "medium",
    caution: "원문 기준·단위(원/천원/백만원) 확인 필요"
  },
  {
    category: "settlement",
    description: "정산, 환수, 점검, 감사 결과",
    collectability: "medium",
    caution: "감사원·소관 부처 공개자료와 교차 필요"
  },
  {
    category: "restricted_project",
    description: "안보·통일·외교 등 공개 제한 사업",
    collectability: "excluded",
    caution: "표시되지 않거나 마스킹되어 노출될 수 있음 — 수집 제외"
  }
] as const;

// ---------- 운영 / 안전 ----------

export const GOSIMS_DATA_SOURCE_MAP_NOTICE =
  "본 데이터소스맵은 수집기 구현 전 조사 문서이며, 실제 수집기는 별도 단계에서 구현됩니다. " +
  "공개자료 중심 분석 원칙을 따르며, 로그인 / 인증 / 우회 / 자동 대량 요청 / 약관 위반 크롤링은 금지합니다. " +
  "개인정보가 포함된 자료는 수집 대상에서 제외하거나 마스킹합니다.";
