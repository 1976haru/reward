// Feedback DB (체크리스트 21)
// 검토자가 AI 후보를 승인/보류/폐기한 이유를 구조화해 저장한다.
// 이 데이터는 Rule/Prompt/Score 개선을 위한 사람 검토 근거로만 사용된다.
// 자동 신고/자동 룰 변경/외부 신고기관 자동 제출은 수행하지 않는다.

export const FEEDBACK_DECISIONS = [
  "APPROVE",
  "HOLD",
  "REJECT",
  "NEEDS_MORE_EVIDENCE",
  "DUPLICATE",
  "NOT_RELEVANT",
  "FALSE_POSITIVE",
  "OUTCOME_CONFIRMED"
] as const;
export type FeedbackDecision = typeof FEEDBACK_DECISIONS[number];

export const FEEDBACK_DECISION_LABELS: Record<FeedbackDecision, string> = {
  APPROVE: "승인",
  HOLD: "보류",
  REJECT: "폐기",
  NEEDS_MORE_EVIDENCE: "증거 부족",
  DUPLICATE: "중복",
  NOT_RELEVANT: "관련 없음",
  FALSE_POSITIVE: "오탐",
  OUTCOME_CONFIRMED: "결과 확인됨"
};

// 반려/오탐 사유 카테고리
export const FEEDBACK_REASON_CATEGORIES = [
  "NOT_HEALTH_FUNCTIONAL_FOOD",
  "NOT_ADVERTISEMENT",
  "NO_PROHIBITED_CLAIM",
  "GENERAL_HEALTH_EXPRESSION",
  "CONTEXT_ALLOWED",
  "NEEDS_CONTEXT",
  "EVIDENCE_INSUFFICIENT",
  "URL_INACCESSIBLE",
  "DUPLICATE_CANDIDATE",
  "DUPLICATE_CASE",
  "LOW_SELL_SIGNAL",
  "RULE_FALSE_POSITIVE",
  "LLM_OVERSTATED",
  "SCORE_TOO_HIGH",
  "AGENCY_MISMATCH",
  "PII_RISK",
  "OTHER"
] as const;
export type FeedbackReasonCategory = typeof FEEDBACK_REASON_CATEGORIES[number];

export interface FeedbackReasonCategoryInfo {
  code: FeedbackReasonCategory;
  label: string;
  description: string;
  recommendedAction: string;
}

export const FEEDBACK_REASON_CATEGORY_INFO: Record<FeedbackReasonCategory, FeedbackReasonCategoryInfo> = {
  NOT_HEALTH_FUNCTIONAL_FOOD: {
    code: "NOT_HEALTH_FUNCTIONAL_FOOD",
    label: "건강기능식품 아님",
    description: "대상이 건강기능식품으로 보기 어렵습니다.",
    recommendedAction: "RuleAgent의 카테고리 판정 기준을 보강하세요."
  },
  NOT_ADVERTISEMENT: {
    code: "NOT_ADVERTISEMENT",
    label: "광고 아님",
    description: "광고가 아닌 일반 정보/뉴스/리뷰 페이지일 수 있습니다.",
    recommendedAction: "후보 발굴 필터에서 광고/판매 신호를 강화하세요."
  },
  NO_PROHIBITED_CLAIM: {
    code: "NO_PROHIBITED_CLAIM",
    label: "금지표현 없음",
    description: "RuleAgent가 탐지했지만 실제 문맥상 금지표현으로 보기 어렵습니다.",
    recommendedAction: "해당 룰의 false positive 예시로 기록하고 threshold를 조정하세요."
  },
  GENERAL_HEALTH_EXPRESSION: {
    code: "GENERAL_HEALTH_EXPRESSION",
    label: "일반 건강 표현",
    description: "치료 표현이 아니라 일반적인 건강 정보 표현으로 보입니다.",
    recommendedAction: "일반 건강 표현 vs 질병 치료 표현 구분 규칙을 강화하세요."
  },
  CONTEXT_ALLOWED: {
    code: "CONTEXT_ALLOWED",
    label: "문맥상 허용 가능",
    description: "문맥상 인용/부정/반박 등 허용 가능한 사용입니다.",
    recommendedAction: "문맥 기반 예외 처리를 RuleAgent에 추가 검토하세요."
  },
  NEEDS_CONTEXT: {
    code: "NEEDS_CONTEXT",
    label: "추가 문맥 필요",
    description: "판단을 위해 주변 문맥/추가 정보가 더 필요합니다.",
    recommendedAction: "문맥 수집 범위(주변 문장/페이지 섹션)를 넓히는 방안을 사람이 검토하세요."
  },
  EVIDENCE_INSUFFICIENT: {
    code: "EVIDENCE_INSUFFICIENT",
    label: "증거 부족",
    description: "URL, 캡처, PDF, 문구 위치 등 증거가 부족합니다.",
    recommendedAction: "Evidence Package 생성 기준을 보강하세요."
  },
  URL_INACCESSIBLE: {
    code: "URL_INACCESSIBLE",
    label: "URL 접근 불가",
    description: "대상 URL에 접근할 수 없습니다.",
    recommendedAction: "후보 검증 단계에서 접근 가능 여부 확인 흐름을 보강하세요."
  },
  DUPLICATE_CANDIDATE: {
    code: "DUPLICATE_CANDIDATE",
    label: "중복 후보",
    description: "이미 처리된 후보와 사실상 동일합니다.",
    recommendedAction: "Dedupe Engine 임계값을 검토하세요."
  },
  DUPLICATE_CASE: {
    code: "DUPLICATE_CASE",
    label: "중복 Case",
    description: "이미 등록·처리된 Case 와 사실상 동일한 신고 대상입니다.",
    recommendedAction: "Case 중복 판정/병합 기준을 사람이 검토하세요."
  },
  LOW_SELL_SIGNAL: {
    code: "LOW_SELL_SIGNAL",
    label: "판매 신호 낮음",
    description: "광고/판매 신호가 약합니다.",
    recommendedAction: "ScoringAgent의 commerceSignal 가중치를 조정하세요."
  },
  RULE_FALSE_POSITIVE: {
    code: "RULE_FALSE_POSITIVE",
    label: "룰 오탐",
    description: "RuleAgent의 키워드/규칙이 잘못 매칭되었습니다.",
    recommendedAction: "해당 ruleId의 false positive 예시를 검토 후 keywords.json을 조정하세요."
  },
  LLM_OVERSTATED: {
    code: "LLM_OVERSTATED",
    label: "AI 판단 과장",
    description: "LLM이 문맥을 과하게 해석했습니다.",
    recommendedAction: "analysis_prompt.md에 보수적 판단 규칙을 강화하세요."
  },
  SCORE_TOO_HIGH: {
    code: "SCORE_TOO_HIGH",
    label: "점수 과대평가",
    description: "ScoringAgent가 우선순위 점수를 지나치게 높게 계산했습니다.",
    recommendedAction: "scoring_rules.ts 가중치를 조정하세요."
  },
  AGENCY_MISMATCH: {
    code: "AGENCY_MISMATCH",
    label: "신고처 부정확",
    description: "추천된 신고기관이 적절하지 않습니다.",
    recommendedAction: "agency_config.json의 매핑을 점검하세요."
  },
  PII_RISK: {
    code: "PII_RISK",
    label: "개인정보 위험",
    description: "대상 페이지/메모에 개인정보가 포함되어 있을 가능성이 있습니다.",
    recommendedAction: "수집/저장 단계에서 PII 마스킹을 강화하세요."
  },
  OTHER: {
    code: "OTHER",
    label: "기타",
    description: "기타 사유. 메모에 자세한 내용을 적어 주세요.",
    recommendedAction: "사유를 검토자 메모에서 확인하고 새 카테고리화가 필요한지 평가하세요."
  }
};

// 단일 피드백 엔트리
export interface FeedbackEntry {
  schemaVersion: "1.0.0";
  id: string;
  caseId: string;
  moduleId?: string;
  decision: FeedbackDecision;
  reasonCategories: FeedbackReasonCategory[];
  reviewerName?: string;
  memo?: string;
  // 관련 Rule Match — UI에서 표시/선택한 ruleId 목록 + 키워드
  relatedRuleIds: string[];
  relatedKeywords: string[];
  // LLM 판단 오류 유형 (자유 메모)
  llmIssueNotes?: string;
  // 점수화 오류 유형 (자유 메모)
  scoringIssueNotes?: string;
  // 룰/프롬프트/점수 개선 제안 (사람 입력)
  suggestedRuleChanges: string[];
  suggestedPromptChanges: string[];
  suggestedScoringChanges: string[];
  // 어떤 상태로 전이됐는지 (REJECT/HOLD/APPROVE 등) — Review Queue 연동용
  caseStatusAtFeedback?: string;
  // PII 마스킹 발생 여부 — true면 memo가 일부 마스킹됨
  piiMasked: boolean;
  createdAt: string;
  // 안전 고지 — 자동 룰 수정 금지 원칙
  safetyNotice: string;
}

// 통계 응답
export interface FeedbackStats {
  total: number;
  byDecision: Record<string, number>;
  byReasonCategory: Record<string, number>;
  topRuleFalsePositiveIds: Array<{ ruleId: string; count: number }>;
  topKeywordFalsePositives: Array<{ keyword: string; count: number }>;
  evidenceIssueCounts: {
    EVIDENCE_INSUFFICIENT: number;
    URL_INACCESSIBLE: number;
  };
}

// 개선 후보 리포트
export interface FeedbackImprovements {
  ruleImprovements: Array<{
    ruleId: string;
    falsePositiveCount: number;
    relatedKeywords: string[];
    recommendation: string;
  }>;
  promptImprovements: Array<{
    issue: string;
    count: number;
    recommendation: string;
  }>;
  scoringImprovements: Array<{
    issue: string;
    count: number;
    recommendation: string;
  }>;
  evidenceImprovements: Array<{
    issue: string;
    count: number;
    recommendation: string;
  }>;
}

export interface FeedbackListQuery {
  caseId?: string;
  decision?: FeedbackDecision;
  reasonCategory?: FeedbackReasonCategory;
  ruleId?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface CreateFeedbackInput {
  caseId: string;
  moduleId?: string;
  decision: FeedbackDecision;
  reasonCategories?: FeedbackReasonCategory[];
  reviewerName?: string;
  memo?: string;
  relatedRuleIds?: string[];
  relatedKeywords?: string[];
  llmIssueNotes?: string;
  scoringIssueNotes?: string;
  suggestedRuleChanges?: string[];
  suggestedPromptChanges?: string[];
  suggestedScoringChanges?: string[];
  caseStatusAtFeedback?: string;
}

export const FEEDBACK_SAFETY_NOTICE =
  "피드백은 자동으로 룰/프롬프트/점수를 변경하지 않습니다. 사람이 검토할 개선 근거로만 누적됩니다. 외부 신고기관 자동 제출은 수행하지 않습니다.";

export const FEEDBACK_MEMO_MAX = 2000;
export const FEEDBACK_NOTES_MAX = 1000;
