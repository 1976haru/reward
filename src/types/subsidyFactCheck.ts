// 보조금 신고 전 사실점검 11항목 타입 (체크리스트 65).
//
// 보조금 후보 Case가 "신고서 초안 생성"으로 넘어가기 전에 반드시 통과해야 하는
// 안전 확인 단계다. 부정수급으로 단정하는 판단이 아니며, 근거 부족·개인정보 노출·사람 검토 없음
// 상태에서는 신고서 초안을 생성하지 않는다(canGenerateReportDraft=false).
//
// 안전 원칙:
// - reviewRequired=true / notLegalConclusion=true / autoSubmitAvailable=false / rewardGuaranteed=false 고정.
// - 대표자명·전화번호·주민번호·계좌번호·상세주소 원문은 결과에 넣지 않는다(식별 가능 여부만 본다).

// ---------- 항목 식별 ----------

export const SUBSIDY_FACT_CHECK_ITEM_IDS = [
  "public_data", // 1. 공개자료 여부
  "source_origin", // 2. 원본 URL/파일 출처
  "collected_at", // 3. 수집일시
  "identification", // 4. 수급기관/사업명 식별 가능
  "amount_year_agency", // 5. 금액/연도/기관 정보
  "risk_rule_hits", // 6. 위험룰 근거
  "risk_reward_scores", // 7. 위험점수·보상가능성 점수
  "llm_explanation", // 8. LLM 설명형 분석
  "citation_strict", // 9. 근거검증 strict 통과
  "privacy_api_scan", // 10. 개인정보/API 키 스캔
  "human_review" // 11. 사람 검토 승인
] as const;
export type SubsidyFactCheckItemId = (typeof SUBSIDY_FACT_CHECK_ITEM_IDS)[number];

export const SUBSIDY_FACT_CHECK_ITEM_NAMES: Record<SubsidyFactCheckItemId, string> = {
  public_data: "공개자료 여부 확인",
  source_origin: "원본 URL/파일 출처 확인",
  collected_at: "수집일시 확인",
  identification: "수급기관/사업명 식별 가능 여부",
  amount_year_agency: "금액/연도/기관 정보 확인",
  risk_rule_hits: "위험룰 근거 확인",
  risk_reward_scores: "위험점수·보상가능성 점수 확인",
  llm_explanation: "LLM 설명형 분석 확인",
  citation_strict: "근거검증 strict 통과 여부",
  privacy_api_scan: "개인정보/API 키 스캔 통과 여부",
  human_review: "사람 검토 승인 여부"
};

/**
 * FAIL 시 신고서 초안 생성을 강하게 차단(BLOCKED)하는 항목.
 * 그 외 항목의 FAIL은 NEEDS_FIX(보강 후 가능)로 처리한다.
 */
export const SUBSIDY_FACT_CHECK_HARD_BLOCK_ITEMS: SubsidyFactCheckItemId[] = [
  "public_data",
  "source_origin",
  "citation_strict",
  "privacy_api_scan",
  "human_review"
];

export const SUBSIDY_FACT_CHECK_ITEM_STATUSES = ["PASS", "WARNING", "FAIL", "NOT_APPLICABLE"] as const;
export type SubsidyFactCheckItemStatus = (typeof SUBSIDY_FACT_CHECK_ITEM_STATUSES)[number];

export const SUBSIDY_FACT_CHECK_OVERALL_STATUSES = [
  "PASS",
  "PASS_WITH_WARNINGS",
  "NEEDS_FIX",
  "BLOCKED"
] as const;
export type SubsidyFactCheckOverallStatus = (typeof SUBSIDY_FACT_CHECK_OVERALL_STATUSES)[number];

// ---------- 입력 ----------

/**
 * 보조금 후보 Case 사실점검 입력. CL60~64 산출물을 모은 형태이며 개인정보 원문은 포함하지 않는다.
 * 이름 필드(recipientName/projectName)는 "식별 가능 여부" 판정에만 쓰고 결과에 원문을 echo하지 않는다.
 */
export interface SubsidyFactCheckInput {
  caseId?: string;
  candidateId?: string;

  // 1. 공개자료
  evidenceIsPublic?: boolean;
  hasLoginRequiredSource?: boolean;
  hasPrivateSource?: boolean;

  // 2. 출처
  sourceUrl?: string;
  sourceFileName?: string;
  sourceRowNumber?: number | string;
  pageNumber?: number | string;

  // 3. 수집일시
  collectedAt?: string;
  parsedAt?: string;
  capturedAt?: string;

  // 4. 식별
  recipientName?: string;
  normalizedRecipientName?: string;
  projectName?: string;
  normalizedProjectName?: string;

  // 5. 금액/연도/기관
  amount?: number;
  subsidyAmount?: number;
  fiscalYear?: number;
  year?: number;
  agencyName?: string;
  localGovName?: string;

  // 6. 위험룰 hit (ruleId 목록)
  ruleHits?: string[];

  // 7. 점수
  finalRiskScore?: number;
  rewardPossibilityScore?: number;

  // 8. LLM 설명형 분석
  explanation?: {
    summary?: string;
    whyFlagged?: unknown[];
    keyEvidence?: unknown[];
    additionalChecks?: unknown[];
  };

  // 9. 근거검증 strict
  citationStrictPassed?: boolean;

  // 10. privacy/API 키 스캔
  privacyScanPassed?: boolean;
  privacyScanFindings?: string[];

  // 11. 사람 검토
  reviewerName?: string;
  reviewStatus?: string; // approved | rejected | pending 등
  reviewMemo?: string;

  isFixtureBased?: boolean;
}

// ---------- 결과 ----------

export interface SubsidyFactCheckItemResult {
  itemId: SubsidyFactCheckItemId;
  itemName: string;
  status: SubsidyFactCheckItemStatus;
  reason: string;
  requiredAction: string;
  evidenceRefs: string[];
}

export interface SubsidyFactCheckResult {
  caseId?: string;
  candidateId?: string;
  checkedAt: string;
  checklistItems: SubsidyFactCheckItemResult[];
  overallStatus: SubsidyFactCheckOverallStatus;
  /** 모든 항목이 PASS 또는 허용 WARNING(=FAIL 없음)일 때만 true. */
  canGenerateReportDraft: boolean;
  reviewRequired: true;
  notLegalConclusion: true;
  autoSubmitAvailable: false;
  rewardGuaranteed: false;
  /** 신고서 초안 차단 사유 요약(중립 문구). */
  blockingReasons: string[];
  isFixtureBased?: boolean;
  safetyNotice: string;
}

export interface SubsidyFactCheckReport {
  runId: string;
  createdAt: string;
  totalCases: number;
  results: SubsidyFactCheckResult[];
  overallSummary: Record<SubsidyFactCheckOverallStatus, number>;
  canGenerateCount: number;
  isFixtureBased: boolean;
  sourceNote?: string;
  reportJsonFile?: string;
  reportMdFile?: string;
}

export const SUBSIDY_FACT_CHECK_NOTICE =
  "이 점검은 신고서 초안 생성 전 안전 확인 단계입니다. 부정수급으로 단정하는 판단이 아닙니다. " +
  "근거 부족, 개인정보 노출, 사람 검토 없음 상태에서는 신고서 초안을 생성하지 않습니다. " +
  "자동 신고/자동 제출 기능은 없으며, 실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다. " +
  "포상금 지급을 보장하지 않습니다.";
