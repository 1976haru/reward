// 보조금 룰 5종 통합 실행 타입 (체크리스트 60).
//
// 본 모듈은 정규화된 보조금 레코드(업로드 파서/수집기 산출물)에 대해 5종의 의심 신호 룰을
// 한 번에 실행하고, 룰 결과를 합쳐 "검토 후보 TOP N"을 만들기 위한 타입을 정의한다.
//
// 중요한 안전 원칙:
// - 본 결과는 "사람 검토가 필요한 후보"일 뿐, 부정수급/위법 확정이 아니다.
// - 모든 룰 결과는 reviewRequired=true, notLegalConclusion=true 를 항상 포함한다.
// - 여기서 만드는 점수는 룰 기반 정렬용 보조 점수이며, 100점 위험점수/보상가능성 점수가 아니다.
// - 대표자명/전화번호/주민번호/계좌번호/상세주소 원문은 근거로 저장하지 않는다.

// ---------- 룰 식별 ----------

/** 체크리스트 60에서 실행하는 보조금 룰 5종. */
export const SUBSIDY_RISK_RULE_IDS = [
  "repeat_recipient", // A. 반복수급
  "same_address", // B. 동일주소 다단체
  "missing_output_settlement", // C. 결과물/정산 증빙 누락
  "budget_anomaly", // D. 예산집행 이상치
  "similar_project_repeat" // E. 사업명 유사 반복
] as const;
export type SubsidyRiskRuleId = (typeof SUBSIDY_RISK_RULE_IDS)[number];

/** 룰별 한글 표시명. */
export const SUBSIDY_RISK_RULE_NAMES: Record<SubsidyRiskRuleId, string> = {
  repeat_recipient: "반복수급 검토 후보",
  same_address: "동일주소 다단체 검토 후보",
  missing_output_settlement: "결과물·정산 증빙 누락 검토 후보",
  budget_anomaly: "예산집행 이상치 검토 후보",
  similar_project_repeat: "사업명 유사 반복 검토 후보"
};

/** 룰 기반 심각도(정렬 보조용). 위법 확정 등급이 아니다. */
export const SUBSIDY_RISK_SEVERITIES = ["low", "medium", "high"] as const;
export type SubsidyRiskSeverity = (typeof SUBSIDY_RISK_SEVERITIES)[number];

/** 정렬 보조용 심각도 가중치(룰 기반). 100점 위험점수가 아니다. */
export const SEVERITY_WEIGHT: Record<SubsidyRiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3
};

// ---------- 입력 레코드 ----------

/**
 * 룰 실행 입력으로 쓰는 정규화된 보조금 레코드(서브셋).
 * StandardSubsidyRecordFromUpload / 수집기 산출물에서 필요한 필드만 추린 형태이며,
 * 개인정보 원문(대표자명/연락처/계좌/상세주소)은 포함하지 않는다.
 */
export interface SubsidyRiskInputRecord {
  recordId: string;
  fiscalYear?: number;
  projectName?: string;
  /** 사업명 정규화 키(연도/차수 제외). 유사 사업명 비교에 사용. */
  projectNameCompactKey?: string;
  recipientName?: string;
  /** 기관명 정규화 키(동일 기관 후보용). 확정 병합 아님. */
  normalizedRecipientName?: string;
  /** 동일 주소 후보용 지역 단위 키(상세주소 제외). */
  addressRegionKey?: string;
  /** 주소 정규화 키(상세주소 제외). */
  normalizedAddressKey?: string;
  // --- 금액(원화 숫자) ---
  subsidyAmount?: number;
  executionAmount?: number;
  settlementAmount?: number;
  // --- 증빙 ---
  hasResultReport?: boolean;
  resultEvidenceUrl?: string;
  publicListingUrl?: string;
  // --- 출처 ---
  sourceFileName?: string;
  localGovName?: string;
}

// ---------- 룰 결과 ----------

/**
 * 단일 룰이 만든 검토 후보 1건.
 * involvedRecordIds: 후보에 연루된 레코드 식별자(개인정보 아님).
 * evidenceRefs: 사람이 다시 확인할 근거 위치 참조(공개 URL / 출처 파일+필드 등).
 */
export interface SubsidyRiskRuleResult {
  ruleId: SubsidyRiskRuleId;
  ruleName: string;
  severity: SubsidyRiskSeverity;
  /** 후보 식별자(룰ID + 그룹 키 해시 기반). */
  candidateId: string;
  involvedRecordIds: string[];
  evidenceRefs: string[];
  /** 왜 후보로 잡혔는지(중립 표현). */
  reason: string;
  /** 오탐 가능성/주의사항(예: 공유오피스, 회계연도 경계 등). */
  caution: string;
  /** 항상 true — 사람 검토 필요. */
  reviewRequired: true;
  /** 항상 true — 위법/부정수급 확정이 아니다. */
  notLegalConclusion: true;
  /** 사람이 다음에 확인해야 할 점검 항목. */
  suggestedNextCheck: string[];
}

// ---------- TOP N 후보 ----------

/**
 * 여러 룰 결과를 후보 그룹(연루 레코드 묶음) 단위로 합친 검토 후보.
 * ruleBasedScore 는 정렬 보조 점수이며 100점 위험점수가 아니다.
 */
export interface SubsidyRiskTopCandidate {
  candidateKey: string;
  involvedRecordIds: string[];
  ruleHits: SubsidyRiskRuleId[];
  ruleHitCount: number;
  highSeverityCount: number;
  evidenceRefCount: number;
  /** 룰 기반 정렬 점수(심각도 가중치 합 + 룰 다양성 가산). 위험점수 아님. */
  ruleBasedScore: number;
  /** 대표 사유 요약(중립 표현). */
  reasonSummary: string;
  reviewRequired: true;
  notLegalConclusion: true;
}

// ---------- 실행 결과 ----------

export interface SubsidyRiskRuleCount {
  ruleId: SubsidyRiskRuleId;
  ruleName: string;
  candidateCount: number;
  highSeverityCount: number;
}

export interface SubsidyRiskRunResult {
  runId: string;
  ranAt: string;
  /** "fixture-synthetic" | "input" 등 입력 모드 설명. */
  inputMode: string;
  isRealData: boolean;
  totalRecords: number;
  totalRuleResults: number;
  ruleCounts: SubsidyRiskRuleCount[];
  ruleResults: SubsidyRiskRuleResult[];
  topCandidates: SubsidyRiskTopCandidate[];
  topN: number;
  safetyNotice: string;
}

// ---------- 안내문 ----------

export const SUBSIDY_RISK_RULES_NOTICE =
  "본 결과는 공개·업로드된 보조금 자료에 5종 룰을 적용해 만든 '사람 검토가 필요한 후보' 목록입니다. " +
  "부정수급/위법 확정이 아니며, 특정 단체·개인·사업자를 부정수급자로 단정하지 않습니다. " +
  "여기의 정렬 점수는 룰 기반 보조 점수일 뿐 100점 위험점수가 아니며, 자동 신고/자동 제출 기능은 없습니다. " +
  "최종 판단과 신고는 사람이 공식 채널에서 직접 확인 후 진행해야 합니다.";
