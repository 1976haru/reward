// 나라장터 계약데이터 연계 스키마 (체크리스트 10).
//
// 본 모듈은 보조사업 수행업체와 나라장터 공공입찰·계약 정보의 동일성 후보 매칭에 사용할
// 타입과 후보 데이터소스를 정의한다. 실제 수집기·매칭기는 별도 단계에서 구현되며,
// 본 파일은 타입 정의 + 상수만 포함하고 런타임 동작이 없다.
//
// 본 스키마는 docs/G2B_CONTRACT_LINKAGE_MAP.md §3 / §4 / §5 / §6 / §9 와 동기화되어야 한다.
// 정적 검증: tests/g2bContractLinkage.test.ts (`npm run test:g2b-linkage`).
//
// 본 모듈은 법률 자문이나 운영기관 공식 안내를 대체하지 않는다.

// ---------- enum / 분류 ----------

export const G2B_MATCHING_SIGNALS = [
  "business_number_hash_match",
  "corporate_number_hash_match",
  "name_similarity",
  "address_region_match",
  "phone_masked_match",
  "agency_match",
  "title_similarity",
  "period_overlap",
  "amount_similarity"
] as const;
export type G2bMatchingSignal = (typeof G2B_MATCHING_SIGNALS)[number];

export const G2B_LINKAGE_CONFIDENCES = ["high", "medium", "low", "excluded"] as const;
export type G2bLinkageConfidence = (typeof G2B_LINKAGE_CONFIDENCES)[number];

export const G2B_LINKAGE_PRIVACY_RISKS = ["low", "medium", "high", "unknown"] as const;
export type G2bLinkagePrivacyRisk = (typeof G2B_LINKAGE_PRIVACY_RISKS)[number];

export const G2B_LINKAGE_STATUSES = [
  "candidate",
  "needs_verification",
  "reviewed",
  "excluded"
] as const;
export type G2bLinkageStatus = (typeof G2B_LINKAGE_STATUSES)[number];

export const G2B_SOURCE_PRIORITIES = ["P0", "P1", "P2"] as const;
export type G2bSourcePriority = (typeof G2B_SOURCE_PRIORITIES)[number];

// ---------- 데이터소스 카드 ----------

export interface G2bDataSourceEntry {
  id: string;
  name: string;
  providerName: string;
  dataGoKrUrl: string;
  contentSummary: string;
  apiType: string;
  dataFormat: string;
  authRequired: string;
  priority: G2bSourcePriority;
  status: "candidate" | "needs_verification" | "verified" | "excluded";
  notes?: string;
}

/** docs/G2B_CONTRACT_LINKAGE_MAP.md §3 의 5개 후보 데이터소스. */
export const G2B_DATA_SOURCES: readonly G2bDataSourceEntry[] = [
  {
    id: "g2b_contract_info",
    name: "조달청_나라장터 계약정보서비스",
    providerName: "조달청",
    dataGoKrUrl: "https://www.data.go.kr/data/15129427/openapi.do",
    contentSummary: "계약정보목록, 계약상세정보, 계약변경이력, 계약삭제이력",
    apiType: "REST/OpenAPI 재확인 필요",
    dataFormat: "JSON/XML 재확인 필요",
    authRequired: "활용신청·인증키 확인 필요",
    priority: "P0",
    status: "candidate",
    notes: "계약 식별·계약상대자 매칭의 1차 자료원. 응답 필드 재확인 필요."
  },
  {
    id: "g2b_contract_process_open",
    name: "조달청_나라장터 계약과정통합공개서비스",
    providerName: "조달청",
    dataGoKrUrl: "https://www.data.go.kr/data/15129459/openapi.do",
    contentSummary: "입찰공고, 사전규격, 발주계획, 조달요청, 낙찰, 계약 진행 과정",
    apiType: "REST/OpenAPI 재확인 필요",
    dataFormat: "JSON/XML 재확인 필요",
    authRequired: "활용신청·인증키 확인 필요",
    priority: "P0",
    status: "candidate",
    notes: "입찰~계약 과정의 시계열 추적. 기간 겹침(period_overlap) 매칭에 유용."
  },
  {
    id: "g2b_open_standard",
    name: "조달청_나라장터 공공데이터개방표준서비스",
    providerName: "조달청",
    dataGoKrUrl: "https://www.data.go.kr/data/15058815/openapi.do",
    contentSummary: "입찰·낙찰·계약정보 개방표준",
    apiType: "REST/OpenAPI 재확인 필요",
    dataFormat: "JSON/XML 재확인 필요",
    authRequired: "활용신청·인증키 확인 필요",
    priority: "P1",
    status: "candidate",
    notes: "표준화된 입찰·낙찰·계약 정보. 필드 스키마 안정성 검토 필요."
  },
  {
    id: "g2b_user_info",
    name: "조달청_나라장터 사용자정보 서비스",
    providerName: "조달청",
    dataGoKrUrl: "https://www.data.go.kr/data/15129466/openapi.do",
    contentSummary: "조달업체·수요기관 등 사용자 정보 후보",
    apiType: "REST/OpenAPI 재확인 필요",
    dataFormat: "JSON/XML 재확인 필요",
    authRequired: "활용신청·인증키 확인 필요",
    priority: "P1",
    status: "candidate",
    notes:
      "업체 식별 정보 — 사업자등록번호/대표자/연락처 등 개인·식별 정보가 포함될 가능성. 저장 전 해시/마스킹 필수."
  },
  {
    id: "g2b_procurement_request",
    name: "조달청_나라장터 조달요청서비스",
    providerName: "조달청",
    dataGoKrUrl: "https://www.data.go.kr/data/15129468/openapi.do",
    contentSummary: "수요기관, 조달요청, 계약체결형태, 발주기관 정보",
    apiType: "REST/OpenAPI 재확인 필요",
    dataFormat: "JSON/XML 재확인 필요",
    authRequired: "활용신청·인증키 확인 필요",
    priority: "P1",
    status: "candidate",
    notes: "수요·발주 기관 매칭(agency_match). 조직개편으로 기관명 변경 가능성 주의."
  }
] as const;

// ---------- 매칭 후보 카드 ----------

/**
 * 매칭기가 만들 단일 후보 카드.
 *
 * - `reviewRequired: true` 가 강제된다 — 매칭 신뢰도가 `high` 라도 사람 검토 없이 다음 단계 불가.
 * - 사업자등록번호 / 법인등록번호 원문은 저장하지 않는다. 해시 또는 마스킹된 형태로만 저장.
 * - 본 카드는 의심 신호 보강 자료이며, 위법 여부나 동일 업체 확정을 의미하지 않는다.
 */
export interface G2bContractLinkageCandidate {
  id: string;
  subsidyRecordId: string;
  contractRecordId?: string;
  sourceName: "g2b" | "data.go.kr" | "manual" | string;
  sourceUrl: string;
  collectedAt: string;
  recipientName?: string;
  normalizedRecipientName?: string;
  businessRegistrationNumberHash?: string;
  corporateRegistrationNumberHash?: string;
  representativeNameMasked?: string;
  addressRegion?: string;
  phoneNumberMasked?: string;
  subsidyProjectName?: string;
  contractTitle?: string;
  contractAmount?: number;
  subsidyAmount?: number;
  contractDate?: string;
  projectPeriodStart?: string;
  projectPeriodEnd?: string;
  orderingAgencyName?: string;
  matchingSignals: readonly G2bMatchingSignal[];
  linkageConfidence: G2bLinkageConfidence;
  linkageReason: string;
  privacyRisk: G2bLinkagePrivacyRisk;
  reviewRequired: true;
  status: G2bLinkageStatus;
}

// ---------- 헬퍼 ----------

export function getDataSourceById(id: string): G2bDataSourceEntry | undefined {
  return G2B_DATA_SOURCES.find((s) => s.id === id);
}

export function listDataSourcesByPriority(priority: G2bSourcePriority): readonly G2bDataSourceEntry[] {
  return G2B_DATA_SOURCES.filter((s) => s.priority === priority);
}

// ---------- 안내문 ----------

export const G2B_CONTRACT_LINKAGE_NOTICE =
  "본 매핑은 '동일 업체 확정' 이 아니라 '동일성 후보 탐지' 와 '추가 검토 필요' 를 위한 보조 자료입니다. " +
  "사업자등록번호 / 법인등록번호 원문은 저장하지 않고 해시 또는 마스킹된 형태로만 저장하며, " +
  "대표자명·전화번호·상세주소는 단독 매칭 기준으로 사용하지 않습니다. " +
  "각 후보 데이터소스는 활용신청 / 인증키 / 트래픽 한도 / 이용허락 범위 / 재배포 정책을 " +
  "수집기 구현 직전에 재확인해야 하며, 로그인 / 인증 우회 / 무제한 호출 / 약관 위반 수집은 금지됩니다. " +
  "본 매핑 결과는 외부 신고기관에 자동 제출되지 않고, 사람 검토 단계로만 넘깁니다.";
