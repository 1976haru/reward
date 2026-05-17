// RSS Scout 어댑터 placeholder. 다음 체크리스트에서 실제 파서 + seed RSS 목록 추가 예정.

import type { DiscoveryCandidate } from "../../types/candidate.js";
import type { SearchOptions, SearchSourceAdapter } from "./SearchSourceAdapter.js";

export class RssScoutAdapter implements SearchSourceAdapter {
  sourceType = "rss" as const;
  sourceName = "RSS Scout (준비 중)";
  status: "active" | "disabled" | "planned" = "planned";
  disabledReason = "이번 MVP에서는 placeholder입니다. RSS_SCOUT_ENABLED=true + seed RSS URL 등록 후 다음 체크리스트에서 활성화 예정.";

  isEnabled(): boolean {
    return false;
  }

  async search(_query: string, _options: SearchOptions): Promise<DiscoveryCandidate[]> {
    return [];
  }
}
