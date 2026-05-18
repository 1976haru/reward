export const CANDIDATE_STATUSES = ["NEW", "QUEUED", "ANALYZED", "REJECTED"] as const;
export type CandidateStatus = typeof CANDIDATE_STATUSES[number];

export const DISCOVERY_METHODS = ["seed", "search_api", "rss", "manual"] as const;
export type DiscoveryMethod = typeof DISCOVERY_METHODS[number];

export const DISCOVERY_MODES = ["quick", "standard", "deep"] as const;
export type DiscoveryMode = typeof DISCOVERY_MODES[number];

export interface DiscoveryCandidate {
  id: string;
  moduleId: string;
  topic: string;
  keyword: string;
  title: string;
  url: string;
  snippet?: string;
  source: string;
  discoveryMethod: DiscoveryMethod;
  firstScore: number;
  reasons: string[];
  foundAt: string;
  status: CandidateStatus;
  // 분석으로 이어진 경우 연결되는 case id
  caseId?: string;
}

export interface DiscoveryTopic {
  id: string;        // slug, "blood-sugar"
  label: string;     // "혈당/당뇨"
  description: string;
  seedKeywords: string[];
  // false_ad 모듈에서 질병 힌트, counterfeit_goods 등 비질병 모듈에서는 생략 가능.
  diseaseHints?: string[];
}

export const MODE_TO_LIMIT: Record<DiscoveryMode, number> = {
  quick: 10,
  standard: 30,
  deep: 50
};
