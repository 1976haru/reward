// Scout Agent 검색 소스 어댑터 인터페이스.
// 검색엔진 HTML 직접 스크래핑은 허용하지 않는다.
// 공식 API, 허용된 RSS, 수동 Seed, Mock만 사용한다.

import type { DiscoveryCandidate, DiscoveryTopic } from "../../types/candidate.js";

export type ScoutSourceType = "mock" | "naver" | "openai_web_search" | "rss" | "manual";

export interface SearchOptions {
  limit: number;
  moduleId: string;
  topicId: string;
}

export interface SearchSourceAdapter {
  sourceType: ScoutSourceType;
  sourceName: string;          // 사람이 읽는 이름
  status: "active" | "disabled" | "planned";
  disabledReason?: string;
  isEnabled(): boolean;
  search(query: string, options: SearchOptions): Promise<DiscoveryCandidate[]>;
}

export interface ScoutSourceSummary {
  sourceType: ScoutSourceType;
  sourceName: string;
  status: "active" | "disabled" | "planned";
  disabledReason?: string;
}

// 어댑터가 만든 후보에 공통 메타를 채워 넣는 헬퍼
export function attachDiscoveryMeta(
  cand: Omit<DiscoveryCandidate, "id" | "foundAt" | "status">,
  topic?: DiscoveryTopic
): DiscoveryCandidate {
  // id/foundAt/status는 ScoutAgent에서 채운다 — 여기서는 빈 값
  return {
    ...cand,
    id: "",
    foundAt: "",
    status: "NEW",
    topic: cand.topic || topic?.label || "manual"
  };
}
