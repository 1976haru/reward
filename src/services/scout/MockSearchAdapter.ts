// Mock Scout Adapter — 외부 API 없이도 동작하는 시연용 어댑터.
// 후보 URL은 RFC 6761 예약 도메인(.test/.example/.invalid)을 사용해 실 네트워크 호출이 일어나지 않는다.

import { SeedMockDiscovery } from "../discovery/SeedMockDiscovery.js";
import { getTopicById } from "../../modules/false-ad/topics.js";
import { getCounterfeitTopicById } from "../../modules/counterfeit-goods/scout_topics.js";
import { config } from "../../utils/config.js";
import type { DiscoveryCandidate } from "../../types/candidate.js";
import type { SearchOptions, SearchSourceAdapter } from "./SearchSourceAdapter.js";

const mock = new SeedMockDiscovery();

// 위조상품 모듈은 별도 mock 후보 텍스트 — 실제 브랜드명을 과도하게 노출하지 않는다.
const COUNTERFEIT_MOCK_TITLES = [
  "{label} 의심 판매글 후보",
  "{label} 미러급 구성 후보",
  "{label} 1:1 구성 후보 (정품급 표현 의심)",
  "{label} 풀박스 구성 후보"
];

export class MockSearchAdapter implements SearchSourceAdapter {
  sourceType = "mock" as const;
  sourceName = "Mock Scout (개발/시연용)";
  status: "active" | "disabled" | "planned" = "active";
  disabledReason?: string;

  isEnabled(): boolean {
    return config.scout.mock !== false;
  }

  async search(_query: string, options: SearchOptions): Promise<DiscoveryCandidate[]> {
    if (options.moduleId === "counterfeit_goods") {
      return this.searchCounterfeit(options);
    }
    const topic = getTopicById(options.topicId);
    if (!topic) return [];
    const out = mock.generate({
      moduleId: options.moduleId,
      topics: [topic],
      maxCandidates: Math.max(1, Math.min(options.limit, 50))
    });
    for (const c of out) c.source = "scout-mock";
    return out;
  }

  // 위조상품 mock 후보 — RFC 6761 예약 도메인 사용, 실제 브랜드명 회피
  private async searchCounterfeit(options: SearchOptions): Promise<DiscoveryCandidate[]> {
    const topic = getCounterfeitTopicById(options.topicId);
    if (!topic) return [];
    const limit = Math.max(1, Math.min(options.limit, 20));
    const now = new Date().toISOString();
    const out: DiscoveryCandidate[] = [];
    for (let i = 0; i < limit; i++) {
      const titleTpl = COUNTERFEIT_MOCK_TITLES[i % COUNTERFEIT_MOCK_TITLES.length];
      out.push({
        id: `cf-${topic.id}-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
        moduleId: options.moduleId,
        topic: topic.id,
        keyword: topic.seedKeywords[i % topic.seedKeywords.length] ?? topic.label,
        title: titleTpl.replace("{label}", topic.label),
        url: `https://counterfeit-mock.example/${encodeURIComponent(topic.id)}/p-${i + 1}`,
        snippet: `${topic.label} 위조 의심 후보 (mock). 미러급/1:1/정품급 등 의심 표현 검토 대상.`,
        source: "scout-mock",
        firstScore: 60 + ((i * 7) % 30),
        reasons: ["mock counterfeit candidate"],
        discoveryMethod: "seed",
        status: "NEW",
        foundAt: now
      });
    }
    return out;
  }
}
