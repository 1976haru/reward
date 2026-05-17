// Dedupe Engine 공통 타입.
// 중복 제거는 분석 효율을 위한 보조 기능이며, 애매한 유사 후보는 사람이 확인해야 한다.

export type DedupeStatus = "UNIQUE" | "DUPLICATE" | "POSSIBLE_DUPLICATE";

export type DedupeReasonCode =
  | "EXACT_URL_HASH"
  | "CANONICAL_URL_MATCH"
  | "DOMAIN_PATH_MATCH"
  | "TITLE_SIMILARITY"
  | "CONTENT_HASH_MATCH"
  | "URL_INVALID"
  | "TOO_SHORT_TO_COMPARE";

export interface DedupeReason {
  code: DedupeReasonCode;
  detail: string;
  score?: number;        // 0..1 (예: title similarity)
}

export interface DedupeCandidateInput {
  id?: string;
  moduleId?: string;
  url: string;
  title?: string;
  contentText?: string;  // optional, present when full body available
}

export interface DedupeExistingCandidate {
  id: string;
  url: string;
  canonicalUrl?: string;
  urlHash?: string;
  title?: string;
  contentHash?: string;
}

export interface DedupeResult {
  status: DedupeStatus;
  duplicateOf?: string;     // existing candidate id
  canonicalUrl: string;
  urlHash: string;
  contentHash?: string;
  reasons: DedupeReason[];
}

export interface DedupeBatchSummary {
  total: number;
  kept: number;
  duplicates: number;
  possibleDuplicates: number;
  duplicateRate: number;    // 0..1
}

export interface DedupeBatchResult {
  summary: DedupeBatchSummary;
  results: Array<DedupeResult & { inputId?: string; inputUrl: string }>;
  generatedAt: string;
  safetyNotice: string;
}
