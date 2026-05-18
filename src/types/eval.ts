// Eval Set (체크리스트 22)
// 정답 라벨이 있는 합성 샘플로 RuleAgent/ScoringAgent의 탐지 품질을 측정한다.
// 평가셋은 내부 품질 측정용이며 실제 신고 판단을 대체하지 않는다.
// 모든 샘플은 가상 제품/가상 문구로 작성되며 실제 업체명/개인정보를 포함하지 않는다.

export const EVAL_LABELS = ["VIOLATION_CANDIDATE", "NORMAL"] as const;
export type EvalLabel = typeof EVAL_LABELS[number];

export const EVAL_VIOLATION_CATEGORIES = [
  "DISEASE_TREATMENT",
  "DISEASE_PREVENTION",
  "DRUG_SUBSTITUTION",
  "EXAGGERATED_EFFECT",
  "DETOX_OVERSTATEMENT",
  "TESTIMONIAL_OVERSTATEMENT",
  "DIET_OVERSTATEMENT",
  "INFLAMMATION_TUMOR",
  "BP_BS_CHOL"
] as const;
export type EvalViolationCategory = typeof EVAL_VIOLATION_CATEGORIES[number];

export const EVAL_NORMAL_CATEGORIES = [
  "GENERAL_HEALTH",
  "FUNCTIONAL_INGREDIENT",
  "USAGE_WARNING",
  "GENERIC_REVIEW",
  "PRICE_SHIPPING",
  "EXPERT_CONSULT",
  "NUTRITION_INFO",
  "SELLER_INFO",
  "EXCHANGE_RETURN"
] as const;
export type EvalNormalCategory = typeof EVAL_NORMAL_CATEGORIES[number];

export interface EvalSample {
  id: string;                // 예: sample_v001
  label: EvalLabel;
  category: EvalViolationCategory | EvalNormalCategory;
  productName: string;       // 가상 상품명만 사용
  text: string;              // 분석 대상 광고/설명 문구
  expectedKeywords?: string[]; // 기대되는 매치 키워드 (선택)
  notes?: string;
}

export interface EvalSet {
  schemaVersion: "1.0.0";
  evalSetId: string;
  moduleId: string;
  name: string;
  description: string;
  language: "ko";
  synthetic: true;
  source: "synthetic_generator_v1";
  createdAt: string;
  notes: string[];
  samples: EvalSample[];
}

export interface EvalSampleResult {
  sampleId: string;
  label: EvalLabel;
  category: string;
  productName: string;
  text: string;
  // 예측 결과
  priorityScore: number;
  ruleRiskScore: number;
  matchedKeywords: string[];
  matchedRuleIds: string[];
  matchCount: number;
  threshold: number;
  prediction: "POSITIVE" | "NEGATIVE";
  predictedAsPositive: boolean;
  // 분류
  outcome: "TP" | "FP" | "TN" | "FN";
  // LLM 사용시
  llmOverallRisk?: string;
}

export interface ConfusionMatrix {
  TP: number;
  FP: number;
  TN: number;
  FN: number;
}

export interface EvalMetrics {
  total: number;
  positive: number;
  negative: number;
  threshold: number;
  confusion: ConfusionMatrix;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  notLegalConclusion: true;
  // 사람이 읽을 수 있는 한 줄 요약
  summary: string;
}

export interface FeedbackCandidate {
  sampleId: string;
  text: string;
  score: number;
  matchedKeywords: string[];
  matchedRuleIds: string[];
  category: string;
  notes?: string;
  // 어떤 Feedback 분류로 후보가 되는지
  feedbackReasonCategories: string[];
  // 사람이 검토할 개선 제안
  suggestedImprovement: string;
}

export interface EvalRunResult {
  schemaVersion: "1.0.0";
  runId: string;
  evalSetId: string;
  moduleId: string;
  ranAt: string;
  threshold: number;
  useLlm: boolean;
  maxSamples: number;
  metrics: EvalMetrics;
  // 상위 10개씩만 응답에 포함, 전체는 results
  falsePositives: EvalSampleResult[];
  falseNegatives: EvalSampleResult[];
  results: EvalSampleResult[];
  feedbackCandidates: FeedbackCandidate[];
  safetyNotice: string;
  // LLM 호출 카운트 (LLM 평가 시)
  llmCallCount: number;
  // 실행에 걸린 시간
  durationMs: number;
}

export interface EvalSetSummary {
  evalSetId: string;
  name: string;
  description: string;
  moduleId: string;
  synthetic: boolean;
  total: number;
  positives: number;
  negatives: number;
  createdAt: string;
}

export const EVAL_SAFETY_NOTICE =
  "평가셋은 내부 품질 측정용입니다. 실제 신고 판단을 대체하지 않으며, 외부 신고기관 자동 제출을 수행하지 않습니다. 평가 결과로 룰/프롬프트/점수를 자동 변경하지 않습니다.";
