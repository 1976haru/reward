// 공공데이터포털 API 후보 스키마 (체크리스트 8).
//
// 본 모듈은 보조금 / 지방보조금 / 기관별 보조사업 / 공공재정 환수 관련 분석에 사용할 수 있는
// 공공데이터포털 오픈 API 후보를 타입으로 표현한다. 실제 수집기는 별도 단계에서 구현된다 —
// 본 파일은 타입 정의 + 후보 상수만 포함하며 런타임 동작이 없다.
//
// 본 스키마는 docs/DATA_SOURCE_MAP_PUBLIC_API.md §3·§4·§9 와 동기화되어야 한다.
// 정적 검증: tests/publicApiCandidates.test.ts (`npm run test:public-api-candidates`).
//
// 본 모듈은 법률 자문이나 운영기관 공식 안내를 대체하지 않는다.

// ---------- enum / 분류 ----------

export const PUBLIC_API_TYPES = ["REST", "OpenAPI", "SOAP", "GraphQL", "unknown"] as const;
export type PublicApiType = (typeof PUBLIC_API_TYPES)[number];

export const PUBLIC_API_DATA_FORMATS = ["JSON", "XML", "CSV", "Excel", "unknown"] as const;
export type PublicApiDataFormat = (typeof PUBLIC_API_DATA_FORMATS)[number];

export const PUBLIC_API_AUTH_REQUIRED = ["yes", "no", "unknown"] as const;
export type PublicApiAuthRequired = (typeof PUBLIC_API_AUTH_REQUIRED)[number];

export const PUBLIC_API_RELEVANCE_TAGS = [
  "국고보조금",
  "지방보조금",
  "기관별 보조사업",
  "집행",
  "정산",
  "환수",
  "감사·점검",
  "공공재정 일반"
] as const;
export type PublicApiRelevance = (typeof PUBLIC_API_RELEVANCE_TAGS)[number];

export const PUBLIC_API_PRIVACY_RISK = ["low", "medium", "high", "unknown"] as const;
export type PublicApiPrivacyRisk = (typeof PUBLIC_API_PRIVACY_RISK)[number];

export const PUBLIC_API_ACCESS_STATUS = [
  "candidate",
  "needs_verification",
  "verified",
  "excluded"
] as const;
export type PublicApiAccessStatus = (typeof PUBLIC_API_ACCESS_STATUS)[number];

export const PUBLIC_API_PRIORITIES = ["P0", "P1", "P2"] as const;
export type PublicApiPriority = (typeof PUBLIC_API_PRIORITIES)[number];

// ---------- 후보 카드 인터페이스 ----------

/**
 * 공공데이터포털 API 후보를 표현하는 단일 카드.
 *
 * - `accessStatus` 는 기본 `"candidate"` — "사용 가능 확정" 이 아니다.
 * - `lastCheckedAt` 은 본 항목을 마지막으로 재확인한 일시 (ISO 8601).
 * - 운영기관 정책 변경에 따라 URL · 명칭 · 제공기관이 변경될 수 있다.
 */
export interface PublicApiCandidate {
  apiId: string;
  apiName: string;
  providerName: string;
  dataGoKrUrl: string;
  apiType: PublicApiType;
  dataFormat: readonly PublicApiDataFormat[];
  authRequired: PublicApiAuthRequired;
  trafficLimit?: string;
  relevance: readonly PublicApiRelevance[];
  keyFields: readonly string[];
  purpose: readonly string[];
  privacyRisk: PublicApiPrivacyRisk;
  accessStatus: PublicApiAccessStatus;
  priority: PublicApiPriority;
  lastCheckedAt?: string;
  notes?: string;
}

// ---------- 후보 상수 (7건) ----------

export const PUBLIC_API_CANDIDATES: readonly PublicApiCandidate[] = [
  {
    apiId: "moef_subsidy_info",
    apiName: "재정경제부_국고보조금 정보",
    providerName: "재정경제부 (재확인 필요)",
    dataGoKrUrl: "https://www.data.go.kr/data/15097584/openapi.do",
    apiType: "unknown",
    dataFormat: ["JSON", "XML", "unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요 — 개발계정/운영계정 별도 한도 가능성",
    relevance: ["국고보조금", "기관별 보조사업"],
    keyFields: [
      "fiscalYear",
      "ministryName",
      "agencyName",
      "projectName",
      "budgetAmount",
      "subsidyAmount",
      "sourceUrl",
      "collectedAt"
    ],
    purpose: [
      "국고보조금 사업 기준 데이터 확보",
      "보조사업별 금액·부처·연도 정규화",
      "e나라도움 공개 통계센터 자료와 교차 검증"
    ],
    privacyRisk: "low",
    accessStatus: "candidate",
    priority: "P0",
    notes: "API 명세·필드 구조는 데이터셋 상세 페이지에서 재확인 필요. 사업자/수급자 식별 정보가 포함될 가능성이 있으면 마스킹/제외."
  },
  {
    apiId: "moef_subsidy_execution",
    apiName: "재정경제부_국고보조금 집행 및 보조사업 현황",
    providerName: "재정경제부 (재확인 필요)",
    dataGoKrUrl: "https://www.data.go.kr/data/15126793/openapi.do",
    apiType: "unknown",
    dataFormat: ["JSON", "XML", "unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요",
    relevance: ["국고보조금", "집행", "기관별 보조사업"],
    keyFields: [
      "fiscalYear",
      "projectName",
      "subProjectName",
      "subsidyAmount",
      "executionAmount",
      "status",
      "sourceUrl",
      "collectedAt"
    ],
    purpose: [
      "보조사업 집행률·금액 불일치 신호 검출",
      "동일 사업명·동일 기관 반복 신호 패턴 분석",
      "신고서 초안의 금액 근거 자료"
    ],
    privacyRisk: "low",
    accessStatus: "candidate",
    priority: "P0",
    notes: "단위(원/천원/백만원) 재확인 필요. 응답 스키마 변경 가능성."
  },
  {
    apiId: "mois_lofin365_local_subsidy",
    apiName: "행정안전부_지방재정365_지방보조금",
    providerName: "행정안전부",
    dataGoKrUrl: "https://www.data.go.kr/data/15138713/openapi.do",
    apiType: "unknown",
    dataFormat: ["JSON", "XML", "unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요",
    relevance: ["지방보조금", "기관별 보조사업"],
    keyFields: [
      "fiscalYear",
      "localGovernmentName",
      "projectName",
      "subProjectName",
      "recipientName",
      "subsidyAmount",
      "executionAmount",
      "sourceUrl",
      "collectedAt"
    ],
    purpose: [
      "시·군·구 단위 보조사업 기초 데이터",
      "동일 보조사업자 다지자체 반복 수급 신호 검토",
      "보탬e (losims) 와 교차 검증 가능성"
    ],
    privacyRisk: "medium",
    accessStatus: "candidate",
    priority: "P0",
    notes: "recipientName 이 개인일 경우 마스킹/제외. 지방재정365 API 사양은 변동 가능."
  },
  {
    apiId: "mois_lofin365_local_subsidy_ratio",
    apiName: "행정안전부_지방재정365_지방보조금비율",
    providerName: "행정안전부",
    dataGoKrUrl: "https://www.data.go.kr/data/15058377/openapi.do",
    apiType: "unknown",
    dataFormat: ["JSON", "XML", "unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요",
    relevance: ["지방보조금"],
    keyFields: ["fiscalYear", "localGovernmentName", "sourceUrl", "collectedAt"],
    purpose: [
      "지자체별 보조금 비중·추이 비교",
      "의심사례 우선순위 보조 지표 (정황 자료, 메인 의심근거 아님)"
    ],
    privacyRisk: "low",
    accessStatus: "candidate",
    priority: "P1",
    notes: "비율·집계 중심 — 개별 부정수급 분석에는 부적합. 보조 지표로만 활용."
  },
  {
    apiId: "lofin365_settlement_return_search",
    apiName: "행정안전부_지방재정365_지방보조사업 정산·환수 (추가 후보)",
    providerName: "행정안전부 / 지방재정365 (재확인 필요)",
    dataGoKrUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=지방보조사업+정산",
    apiType: "unknown",
    dataFormat: ["unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요",
    relevance: ["지방보조금", "정산", "환수"],
    keyFields: [
      "fiscalYear",
      "localGovernmentName",
      "projectName",
      "settlementAmount",
      "returnAmount",
      "status",
      "sourceUrl",
      "collectedAt"
    ],
    purpose: [
      "정산 누락·반납·환수 신호 분석",
      "의심사례 검토 단계에서 환수 가능성 보조 자료"
    ],
    privacyRisk: "medium",
    accessStatus: "needs_verification",
    priority: "P1",
    notes: "키워드 검색 결과 페이지 — 실제 데이터셋 ID/명세는 데이터셋 상세 페이지에서 확인 필요."
  },
  {
    apiId: "bai_audit_results_search",
    apiName: "감사원_감사결과 공개 (추가 후보)",
    providerName: "감사원 (재확인 필요)",
    dataGoKrUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=감사결과",
    apiType: "unknown",
    dataFormat: ["unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요",
    relevance: ["감사·점검", "환수"],
    keyFields: ["agencyName", "projectName", "status", "evidenceUrl", "collectedAt", "dataLimitNote"],
    purpose: [
      "의심근거 보강 (사실관계 점검의 suspicionBasisConfirmed)",
      "감사 결과 기반 신호 신뢰도 가중치"
    ],
    privacyRisk: "medium",
    accessStatus: "needs_verification",
    priority: "P1",
    notes: "진행 중인 감사·소송·민감 사안은 수집 대상에서 제외. 원문 보고서 저장 시 마스킹 필요."
  },
  {
    apiId: "acrc_public_interest_report_stats",
    apiName: "국민권익위원회_공익신고 처리현황 (추가 후보)",
    providerName: "국민권익위원회 (재확인 필요)",
    dataGoKrUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=공익신고",
    apiType: "unknown",
    dataFormat: ["unknown"],
    authRequired: "unknown",
    trafficLimit: "재확인 필요",
    relevance: ["공공재정 일반", "환수"],
    keyFields: ["fiscalYear", "agencyName", "sourceUrl", "collectedAt"],
    purpose: [
      "Outcome Tracker 와 연계해 보상·포상 결과 추세 참고 (개별 신고 결과는 사용자 입력으로만 기록)",
      "신고 채널별 처리 현황 일반 통계 — 사용자 안내 보조용"
    ],
    privacyRisk: "low",
    accessStatus: "needs_verification",
    priority: "P2",
    notes: "개별 신고 결과 자동 추적이 아니라 집계 안내 자료로만 활용. 자동 신고/보상금 신청 정책과 충돌 금지."
  }
] as const;

// ---------- 헬퍼 ----------

export function getCandidateById(apiId: string): PublicApiCandidate | undefined {
  return PUBLIC_API_CANDIDATES.find((c) => c.apiId === apiId);
}

export function listCandidatesByRelevance(tag: PublicApiRelevance): readonly PublicApiCandidate[] {
  return PUBLIC_API_CANDIDATES.filter((c) => c.relevance.includes(tag));
}

export function listCandidatesByPriority(priority: PublicApiPriority): readonly PublicApiCandidate[] {
  return PUBLIC_API_CANDIDATES.filter((c) => c.priority === priority);
}

// ---------- 안내문 ----------

export const PUBLIC_API_CANDIDATES_NOTICE =
  "본 API 후보는 '활용 가능성 검토 대상' 입니다 — '사용 가능 확정' 이 아닙니다. " +
  "각 API 의 명세 / 활용신청 절차 / 인증키 / 트래픽 한도 / 이용허락 범위 / 재배포 정책은 " +
  "수집기 구현 직전에 데이터셋 상세 페이지에서 재확인이 필요합니다. " +
  "로그인 / 인증 우회 / 무제한 호출 / 약관 위반 수집은 금지되며, " +
  "개인정보가 포함된 응답은 저장 전 마스킹 또는 수집 제외 처리합니다.";
