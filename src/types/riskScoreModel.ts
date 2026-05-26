import { CitationReference } from "./citationValidation.js";

export const RISK_GRADES = ["A", "B", "C"] as const;
export type RiskGrade = (typeof RISK_GRADES)[number];

export const RISK_SCORE_COMPONENTS = [
  "repetition",
  "amount",
  "growth",
  "output",
  "address",
  "settlement",
  "contractor",
  "evidence"
] as const;
export type RiskScoreComponent = (typeof RISK_SCORE_COMPONENTS)[number];

export const RISK_RULE_TYPES = [
  "repeat_subsidy",
  "address_cluster",
  "output_settlement",
  "spending_anomaly",
  "contractor_network",
  "similar_project", // 체크리스트 60 룰 E(사업명 유사 반복) 연계
  "data_quality",
  "manual"
] as const;
export type UnifiedRiskRuleType = (typeof RISK_RULE_TYPES)[number];

/**
 * 체크리스트 60 보조금 룰 5종 결과(SubsidyRiskRuleResult.ruleId) → 통합 위험점수 룰타입 매핑.
 * 통합 점수 모델이 룰 5종 결과(rule-results.json)를 입력으로 받을 수 있게 한다.
 */
export const SUBSIDY_RULE_ID_TO_RISK_TYPE: Record<string, UnifiedRiskRuleType> = {
  repeat_recipient: "repeat_subsidy",
  same_address: "address_cluster",
  missing_output_settlement: "output_settlement",
  budget_anomaly: "spending_anomaly",
  similar_project_repeat: "similar_project"
};

/** 룰 결과 severity(low/medium/high) → 통합 점수 입력용 0~100 보조 점수. */
export const SUBSIDY_SEVERITY_TO_SCORE: Record<string, number> = {
  low: 45,
  medium: 65,
  high: 85
};

export const RISK_SCORE_COMPONENT_WEIGHTS = {
  repetition: 20,
  amount: 15,
  growth: 10,
  output: 15,
  address: 15,
  settlement: 15,
  contractor: 10,
  evidence: 5
} as const satisfies Record<RiskScoreComponent, number>;

export const RISK_GRADE_THRESHOLDS = { A: 80, B: 60 } as const;

export interface UnifiedRiskInputCandidate {
  candidateId: string;
  ruleType: UnifiedRiskRuleType;
  riskScore: number;
  riskLevel?: string;
  recordIds: string[];
  subjectKey?: string;
  signals: string[];
  evidence: unknown;
  reason?: string;
  createdAt?: string;
  isFixtureBased?: boolean;
}

export interface RiskScoreBreakdown {
  repetitionScore: number;
  amountScore: number;
  growthScore: number;
  outputScore: number;
  addressScore: number;
  settlementScore: number;
  contractorScore: number;
  evidenceScore: number;
  totalBeforeClamp: number;
  finalRiskScore: number;
}

export interface RiskScoreContribution {
  component: RiskScoreComponent;
  score: number;
  sourceCandidateId: string;
  ruleType: UnifiedRiskRuleType;
  signal: string;
}

export interface RiskScoreResult {
  scoreId: string;
  /** 체크리스트 61: 후보 식별자(subjectKey 기반). 우선 검토 후보 식별용. */
  candidateId: string;
  subjectKey: string;
  sourceCandidateIds: string[];
  finalRiskScore: number;
  riskGrade: RiskGrade;
  scoreBreakdown: RiskScoreBreakdown;
  contributingSignals: RiskScoreContribution[];
  evidenceSummary: string[];
  reason: string;
  /** 오탐 가능성/데이터 품질 경고 등 중립 주의문(체크리스트 61). */
  cautionNotes: string[];
  reviewRequired: boolean;
  /** 항상 true — 위법/부정수급 확정이 아니다(체크리스트 61). */
  notLegalConclusion: true;
  createdAt: string;
  isFixtureBased?: boolean;
  // 체크리스트 25: 근거 검증용 citation (computed_model + record_id/evidence_id 등).
  citations?: CitationReference[];
}

export interface RiskScoreReport {
  runId: string;
  totalInputCandidates: number;
  totalScoredSubjects: number;
  gradeSummary: Record<RiskGrade, number>;
  topScores: RiskScoreResult[];
  createdAt: string;
  notes: string[];
  isFixtureBased: boolean;
  sourceNote: string;
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface RiskScoreModelOptions {
  limit?: number;
  runId?: string;
  outputDir?: string;
  isFixtureBased?: boolean;
  sourceNote?: string;
  mergeStrategy?: "capped_sum" | "max";
  manualComponentScores?: Partial<Record<RiskScoreComponent, number>>;
}

export const RISK_SCORE_MODEL_NOTICE =
  "본 모델은 여러 룰 기반 탐지 결과를 통합해 0~100점 위험점수와 A/B/C 검토 등급을 산출하는 보조 도구입니다. " +
  "점수와 A등급은 우선 검토 후보를 뜻하며 확정 판단이나 자동 신고가 아닙니다. " +
  "개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 evidenceSummary, reason, report에 넣지 않습니다. " +
  "모든 결과는 사람 검토 대상이며 reviewRequired=true입니다.";
