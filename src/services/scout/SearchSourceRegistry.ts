import { MockSearchAdapter } from "./MockSearchAdapter.js";
import { NaverSearchAdapter } from "./NaverSearchAdapter.js";
import { OpenAIWebSearchAdapter } from "./OpenAIWebSearchAdapter.js";
import { RssScoutAdapter } from "./RssScoutAdapter.js";
import type {
  ScoutSourceSummary,
  ScoutSourceType,
  SearchSourceAdapter
} from "./SearchSourceAdapter.js";

class SearchSourceRegistry {
  private adapters: SearchSourceAdapter[];

  constructor() {
    this.adapters = [
      new MockSearchAdapter(),
      new NaverSearchAdapter(),
      new OpenAIWebSearchAdapter(),
      new RssScoutAdapter()
    ];
  }

  list(): SearchSourceAdapter[] {
    return [...this.adapters];
  }

  listSources(): ScoutSourceSummary[] {
    return this.adapters.map((a) => ({
      sourceType: a.sourceType,
      sourceName: a.sourceName,
      status: a.isEnabled() ? "active" : a.status,
      disabledReason: a.isEnabled() ? undefined : a.disabledReason
    }));
  }

  getAdapter(sourceType: ScoutSourceType): SearchSourceAdapter | undefined {
    return this.adapters.find((a) => a.sourceType === sourceType);
  }

  getEnabledAdapters(): SearchSourceAdapter[] {
    return this.adapters.filter((a) => a.isEnabled());
  }
}

export const searchSourceRegistry = new SearchSourceRegistry();
