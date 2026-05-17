// "신고 후보 우선순위 점수" (Scoring Agent) 공통 타입.
// 본 점수는 법 위반 확정·포상금 지급 가능성을 의미하지 않는다.
// 사람이 먼저 검토할 후보의 우선순위를 정하기 위한 참고 점수다.

export type PriorityLevelCode =
  | "LOW"
  | "REVIEW_NEEDED"
  | "HIGH_PRIORITY"
  | "VERY_HIGH_PRIORITY";

export type ComponentKey =
  | "ruleSignal"
  | "llmSignal"
  | "evidenceCompleteness"
  | "commercialSignal"
  | "repetitionSignal"
  | "extractionQuality";

export interface ScoringComponent {
  key: ComponentKey;
  label: string;
  maxPoints: number;
  score: number;       // 0 ~ maxPoints
  reasons: string[];   // 사람이 읽을 수 있는 근거 (배지에 노출)
}

export interface ScoringLevel {
  min: number;
  max: number;
  label: string;       // "낮음" / "검토 필요" / "우선 검토" / "최우선 검토"
  code: PriorityLevelCode;
}

export interface EvidenceScoringSummary {
  hasUrl?: boolean;
  hasHtml?: boolean;
  hasText?: boolean;
  hasScreenshot?: boolean;
  hasPdf?: boolean;
  hasMetadata?: boolean;
  hasManifest?: boolean;
  hasSha256?: boolean;
  capturedAt?: string;
  // optional supplementary
  productName?: string;
  priceCandidates?: string[];
}

export interface ScoringInputCandidate {
  id?: string;
  url?: string;
  topic?: string;
  keyword?: string;
  source?: string;
  discoveryMethod?: string;
  firstScore?: number;
  // 동일 도메인 발견 후보 수 (있으면 repetition signal에 +)
  sameDomainCount?: number;
}

export interface ScoringRuleMatchLite {
  ruleId?: string;
  keyword?: string;
  riskLevel?: string;        // HIGH | MEDIUM | LOW (or other)
  matchType?: string;        // keyword | regex | combo
  category?: string;
  sourceSection?: string;
  sentence?: string;
}

export interface ScoringRuleDetectionLite {
  riskScore?: number;        // 0..100 (RuleAgent)
  riskLevel?: string;
  counts?: { HIGH?: number; MEDIUM?: number; LOW?: number; combo?: number; total?: number };
  matches?: ScoringRuleMatchLite[];
}

export interface ScoringExtractionLite {
  productName?: string;
  textLength?: number;
  priceCandidates?: string[];
  claimCandidates?: string[];
  reviewCandidates?: string[];
  ingredientCandidates?: string[];
  warningCandidates?: string[];
  sellerCandidates?: string[];
  extractionWarnings?: string[];
}

export interface ScoringLlmLite {
  overallRisk?: string;          // LOW|MEDIUM|HIGH|VERY_HIGH|UNCERTAIN
  violationLikelihood?: string;  // LOW|MEDIUM|HIGH|UNCERTAIN
  confidence?: number;           // 0..1
  notLegalConclusion?: boolean;
  rewardGuaranteed?: boolean;
}

export interface ScoringCollectorLite {
  warnings?: string[];
  fetchedAt?: string;
  sourceType?: string;
}

export interface ScoringInput {
  moduleId: string;
  url?: string;
  title?: string;
  candidate?: ScoringInputCandidate;
  extractionResult?: ScoringExtractionLite;
  ruleDetectionResult?: ScoringRuleDetectionLite;
  llmAnalysis?: ScoringLlmLite;
  evidenceSummary?: EvidenceScoringSummary;
  collectorSummary?: ScoringCollectorLite;
}

export interface ScoringResult {
  schemaVersion: "1.0.0";
  moduleId: string;
  priorityScore: number;           // 0..100
  priorityLabel: string;           // "낮음" / "검토 필요" / "우선 검토" / "최우선 검토"
  priorityLevel: PriorityLevelCode;
  components: ScoringComponent[];
  recommendedNextActions: string[];
  notLegalConclusion: true;
  rewardGuaranteed: false;
  disclaimer: string;
  safetyWarnings: string[];
}
