import { nanoid } from "nanoid";
import { config } from "../utils/config.js";
import { isHttpUrl } from "../utils/validation.js";
import { candidateRepository } from "../repositories/CandidateRepository.js";
import { falseAdTopics, getTopicById } from "../modules/false-ad/topics.js";
import { counterfeitTopics } from "../modules/counterfeit-goods/scout_topics.js";
import { SeedMockDiscovery } from "./discovery/SeedMockDiscovery.js";
import { SearchApiDiscovery, SearchApiDiscoveryNotImplementedError } from "./discovery/SearchApiDiscovery.js";
import { scoreCandidate } from "./discovery/CandidateScorer.js";
import {
  MODE_TO_LIMIT,
  type DiscoveryCandidate,
  type DiscoveryMode,
  type DiscoveryTopic
} from "../types/candidate.js";

const TOPICS_BY_MODULE: Record<string, DiscoveryTopic[]> = {
  false_ad: falseAdTopics,
  counterfeit_goods: counterfeitTopics
};

export class CandidateDiscoveryService {
  private mock = new SeedMockDiscovery();
  private searchApi = new SearchApiDiscovery();

  listTopics(moduleId: string): DiscoveryTopic[] {
    return TOPICS_BY_MODULE[moduleId] ?? [];
  }

  hasTopics(moduleId: string): boolean {
    return Array.isArray(TOPICS_BY_MODULE[moduleId]) && TOPICS_BY_MODULE[moduleId].length > 0;
  }

  async discover(input: {
    moduleId: string;
    topics: string[];
    mode: DiscoveryMode;
    maxCandidates?: number;
  }): Promise<{ candidates: DiscoveryCandidate[]; added: DiscoveryCandidate[]; mode: "mock" | "search_api" }> {
    const topics = this.resolveTopics(input.moduleId, input.topics);
    if (topics.length === 0) {
      throw new InvalidTopicError("선택된 주제가 모듈에 없습니다.");
    }
    const requestedLimit = input.maxCandidates ?? MODE_TO_LIMIT[input.mode];
    const max = Math.max(1, Math.min(requestedLimit, config.discovery.maxCandidates));

    let candidates: DiscoveryCandidate[];
    let usedMode: "mock" | "search_api";
    if (config.discovery.mock) {
      candidates = this.mock.generate({ moduleId: input.moduleId, topics, maxCandidates: max });
      usedMode = "mock";
    } else {
      try {
        candidates = await this.searchApi.generate({ moduleId: input.moduleId, topics, maxCandidates: max });
        usedMode = "search_api";
      } catch (error) {
        if (error instanceof SearchApiDiscoveryNotImplementedError) {
          // 안전한 폴백: 시연을 위해 mock으로 자동 전환
          candidates = this.mock.generate({ moduleId: input.moduleId, topics, maxCandidates: max });
          usedMode = "mock";
        } else {
          throw error;
        }
      }
    }

    // URL 정규화·http만 허용 + 자체 dedupe
    candidates = this.filterAndDedupe(candidates);

    const added = await candidateRepository.createMany(candidates);
    return { candidates, added, mode: usedMode };
  }

  async createManualCandidate(input: {
    moduleId: string;
    url: string;
    title?: string;
    snippet?: string;
    topic?: string;
  }): Promise<DiscoveryCandidate> {
    if (!isHttpUrl(input.url)) {
      throw new InvalidCandidateInputError("URL은 http 또는 https 만 허용됩니다.");
    }
    const host = safeHost(input.url);
    const title = (input.title ?? "").trim() || host || input.url;
    const snippet = (input.snippet ?? "").trim() || undefined;
    const { score, reasons } = scoreCandidate({ title, snippet, url: input.url });
    const candidate: DiscoveryCandidate = {
      id: nanoid(12),
      moduleId: input.moduleId,
      topic: input.topic ?? "manual",
      keyword: "manual",
      title,
      url: input.url,
      snippet,
      source: "manual",
      discoveryMethod: "manual",
      firstScore: score,
      reasons: ["사용자 직접 등록", ...reasons],
      foundAt: new Date().toISOString(),
      status: "NEW"
    };
    const added = await candidateRepository.createMany([candidate]);
    return added[0] ?? candidate;
  }

  private resolveTopics(moduleId: string, requested: string[]): DiscoveryTopic[] {
    const moduleTopics = TOPICS_BY_MODULE[moduleId] ?? [];
    if (!Array.isArray(requested) || requested.length === 0) return moduleTopics;
    const resolved: DiscoveryTopic[] = [];
    const seen = new Set<string>();
    for (const r of requested) {
      const t = getTopicById(r) ?? moduleTopics.find((mt) => mt.label === r || mt.id === r);
      if (t && !seen.has(t.id)) {
        seen.add(t.id);
        resolved.push(t);
      }
    }
    return resolved;
  }

  private filterAndDedupe(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
    const seen = new Set<string>();
    const out: DiscoveryCandidate[] = [];
    for (const c of candidates) {
      if (!isHttpUrl(c.url)) continue;
      const key = `${c.moduleId}|${c.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export class InvalidTopicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTopicError";
  }
}

export class InvalidCandidateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCandidateInputError";
  }
}

export const candidateDiscoveryService = new CandidateDiscoveryService();
