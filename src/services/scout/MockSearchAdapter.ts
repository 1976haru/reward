// Mock Scout Adapter — 외부 API 없이도 동작하는 시연용 어댑터.
// 후보 URL은 RFC 6761 예약 도메인(.test/.example/.invalid)을 사용해 실 네트워크 호출이 일어나지 않는다.

import { SeedMockDiscovery } from "../discovery/SeedMockDiscovery.js";
import { getTopicById } from "../../modules/false-ad/topics.js";
import { config } from "../../utils/config.js";
import type { DiscoveryCandidate } from "../../types/candidate.js";
import type { SearchOptions, SearchSourceAdapter } from "./SearchSourceAdapter.js";

const mock = new SeedMockDiscovery();

export class MockSearchAdapter implements SearchSourceAdapter {
  sourceType = "mock" as const;
  sourceName = "Mock Scout (개발/시연용)";
  status: "active" | "disabled" | "planned" = "active";
  disabledReason?: string;

  isEnabled(): boolean {
    return config.scout.mock !== false;
  }

  async search(_query: string, options: SearchOptions): Promise<DiscoveryCandidate[]> {
    const topic = getTopicById(options.topicId);
    if (!topic) return [];
    const out = mock.generate({
      moduleId: options.moduleId,
      topics: [topic],
      maxCandidates: Math.max(1, Math.min(options.limit, 50))
    });
    // 어댑터 출처 정보 명시
    for (const c of out) c.source = "scout-mock";
    return out;
  }
}
