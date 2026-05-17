// OpenAI Web Search 어댑터 placeholder.
// 정책: structured output(JSON schema)으로 후보 배열을 받도록 향후 구현. 본 MVP에서는 disabled.

import { config } from "../../utils/config.js";
import type { DiscoveryCandidate } from "../../types/candidate.js";
import type { SearchOptions, SearchSourceAdapter } from "./SearchSourceAdapter.js";

export class OpenAIWebSearchAdapter implements SearchSourceAdapter {
  sourceType = "openai_web_search" as const;
  sourceName = "OpenAI Web Search (준비 중)";
  status: "active" | "disabled" | "planned" = "planned";
  disabledReason = "이번 MVP에서는 placeholder입니다. OPENAI_WEB_SEARCH_ENABLED=true + OPENAI_API_KEY가 있을 때 다음 체크리스트에서 활성화 예정.";

  isEnabled(): boolean {
    return false;
  }

  async search(_query: string, _options: SearchOptions): Promise<DiscoveryCandidate[]> {
    if (config.scout.openaiWebSearchEnabled && config.openaiApiKey) {
      // TODO: structured output 기반 구현
    }
    return [];
  }
}
