export type ModuleId = string;

// 새 Case 상태 (체크리스트 7 표준)
export const CASE_STATUSES = ["DRAFT", "REVIEW", "APPROVED", "SUBMITTED", "REJECTED"] as const;
export type CaseStatus = typeof CASE_STATUSES[number];

// 사람 검토 결정 코드
export const REVIEW_DECISIONS = [
  "PENDING",
  "NEEDS_MORE_EVIDENCE",
  "APPROVED_TO_REPORT",
  "REJECTED"
] as const;
export type ReviewDecision = typeof REVIEW_DECISIONS[number];

export interface AnalyzeRequest {
  url: string;
  moduleId: ModuleId;
  memo?: string;
}

export interface CollectedDocument {
  url: string;
  title: string;
  html: string;
  text: string;
  fetchedAt: string;
  sourceType: "user_url" | "search_result" | "seed_source";
}

export interface RuleHit {
  ruleId: string;
  category: string;
  keyword: string;
  severity: "low" | "medium" | "high" | "critical";
  excerpt: string;
  reason: string;
}

export interface AiFinding {
  suspicious: boolean;
  confidence: number;
  violationType: string;
  summary: string;
  reasons: string[];
  requiredHumanChecks: string[];
  recommendedAgency: string;
  safeWording: string;
}

export interface EvidenceBundle {
  htmlPath: string;
  textPath: string;
  screenshotPath?: string;
  pdfPath?: string;
  capturedAt: string;
}

export interface StatusHistoryEntry {
  at: string;
  from: CaseStatus | null;
  to: CaseStatus;
  reviewerName?: string;
  note?: string;
}

export interface ReviewRecord {
  id: string;
  at: string;
  reviewerName: string;
  decision: ReviewDecision;
  notes?: string;
}

export type LlmOverallRisk = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "UNCERTAIN";
export type LlmViolationLikelihood = "LOW" | "MEDIUM" | "HIGH" | "UNCERTAIN";

export interface LlmAnalysisFinding {
  issue: string;
  evidence: string;
  reason: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "UNCERTAIN";
  sourceSection?: string;
}

export interface CaseLlmAnalysis {
  schemaVersion: "1.0.0";
  moduleId: string;
  notLegalConclusion: true;
  rewardGuaranteed: false;
  overallRisk: LlmOverallRisk;
  violationLikelihood: LlmViolationLikelihood;
  confidence: number;
  summary: string;
  findings: LlmAnalysisFinding[];
  missingEvidence: string[];
  recommendedAgency: string;
  agencyCandidates: string[];
  reportDraftSummary: string;
  prohibitedPhrases: string[];
  humanReviewChecklist: string[];
  safetyWarnings: string[];
}

export interface CaseRuleMatch {
  ruleId: string;
  keyword: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  weight: number;
  category: string;
  reason: string;
  matchType: "keyword" | "regex" | "combo";
  sentence: string;
  excerpt: string;
  sourceSection: "claim" | "review" | "ingredient" | "usage" | "warning" | "seller" | "main";
}

export interface CaseRuleDetection {
  schemaVersion: string;
  matches: CaseRuleMatch[];
  riskScore: number;
  riskLevel: "낮음" | "검토 필요" | "높음" | "매우 높음";
  counts: { HIGH: number; MEDIUM: number; LOW: number; combo: number; total: number };
  highlightedSegments: { sentence: string; riskLevel: "HIGH" | "MEDIUM" | "LOW"; keywords: string[]; sourceSection: string }[];
  safetyNotice: string;
}

export interface CaseExtractionSummary {
  productName?: string;
  priceCandidates: string[];
  claimCandidates: string[];
  reviewCandidates: string[];
  ingredientCandidates: string[];
  usageCandidates: string[];
  warningCandidates: string[];
  sellerCandidates: string[];
  textLength: number;
  extractionWarnings: string[];
  removedBoilerplateHints: string[];
}

export interface RewardCase {
  id: string;
  moduleId: ModuleId;
  status: CaseStatus;
  url: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  score: number;
  riskScore: number;
  riskLevel?: string;
  agencyCandidate?: string;
  summary?: string;
  memo?: string;
  rewardCaution?: string;
  ruleHits: RuleHit[];
  aiFinding: AiFinding;
  evidence: EvidenceBundle;
  reportPath: string;
  statusHistory: StatusHistoryEntry[];
  reviews: ReviewRecord[];
  extraction?: CaseExtractionSummary;
  ruleDetection?: CaseRuleDetection;
  llmAnalysis?: CaseLlmAnalysis;
  scoringResult?: import("./scoring.js").ScoringResult;
}
