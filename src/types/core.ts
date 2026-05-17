export type ModuleId = "false_ad";

export type CaseStatus =
  | "draft"
  | "needs_review"
  | "ready_to_report"
  | "reported"
  | "rejected"
  | "archived";

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

export interface RewardCase {
  id: string;
  moduleId: ModuleId;
  status: CaseStatus;
  url: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  score: number;
  ruleHits: RuleHit[];
  aiFinding: AiFinding;
  evidence: EvidenceBundle;
  reportPath: string;
  memo?: string;
}
