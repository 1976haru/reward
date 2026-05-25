export type ModuleId = string;

// Case 상태 (체크리스트 16 확장: 8단계 사람 검토 흐름)
// DRAFT(신규) → REVIEW(검토중) → APPROVED(승인) → REPORT_DRAFT(신고초안) → SUBMITTED(제출=내부 기록) → OUTCOME_CHECK(결과확인) → REJECTED(폐기)
// 보류: REVIEW ↔ HOLD
// SUBMITTED는 사용자가 외부 공식 창구에 직접 제출한 사실을 기록하는 내부 상태이며, 시스템이 자동 제출하지 않는다.
export const CASE_STATUSES = [
  "DRAFT", "REVIEW", "HOLD", "APPROVED", "REPORT_DRAFT", "SUBMITTED", "OUTCOME_CHECK", "REJECTED"
] as const;
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
  // 수집 성공 여부. "fallback"은 실제 페이지 수집에 실패해 안전한 대체 문서로 분석을 이어갔음을 의미한다.
  collectionStatus?: "fetched" | "fallback";
  // fallback 사유(네트워크 실패/HTTP 오류 등). 사용자에게 "수집 실패 → 검토 필요" 안내용.
  collectionNote?: string;
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
  repeatedPhrases?: { keyword: string; ruleId: string; count: number }[];
  cooccurrence?: { productAndDisease: boolean; treatmentAndDisease: boolean };
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
  // 본문 수집 결과. "fallback"이면 실제 페이지 수집 실패 → 사람이 직접 확인 필요.
  collection?: { status: "fetched" | "fallback"; note?: string; fetchedAt: string };
}
