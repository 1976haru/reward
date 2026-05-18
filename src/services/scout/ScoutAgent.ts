import { searchSourceRegistry } from "./SearchSourceRegistry.js";
import { falseAdTopics, getTopicById } from "../../modules/false-ad/topics.js";
import { counterfeitTopics, getCounterfeitTopicById } from "../../modules/counterfeit-goods/scout_topics.js";
import { candidateRepository, CandidateNotFoundError } from "../../repositories/CandidateRepository.js";
import { createCaseRepository, type ICaseRepository } from "../../repositories/CaseRepository.js";
import { config } from "../../utils/config.js";
import { isHttpUrl } from "../../utils/validation.js";
import {
  MODE_TO_LIMIT,
  type DiscoveryCandidate,
  type DiscoveryMode,
  type DiscoveryTopic
} from "../../types/candidate.js";
import type { ScoutSourceType } from "./SearchSourceAdapter.js";
import { dedupeEngine } from "../dedupe/DedupeEngine.js";

const DEFAULT_TOPICS_BY_MODULE: Record<string, DiscoveryTopic[]> = {
  false_ad: falseAdTopics,
  counterfeit_goods: counterfeitTopics
};

function resolveTopicForModule(moduleId: string, id: string): DiscoveryTopic | undefined {
  if (moduleId === "counterfeit_goods") return getCounterfeitTopicById(id);
  return getTopicById(id);
}

export class ScoutAgent {
  private cases: ICaseRepository = createCaseRepository();

  listTopics(moduleId: string): DiscoveryTopic[] {
    return DEFAULT_TOPICS_BY_MODULE[moduleId] ?? [];
  }

  listSources() {
    return searchSourceRegistry.listSources();
  }

  async discover(input: {
    moduleId: string;
    topics: string[];
    mode: DiscoveryMode;
    sourceTypes?: ScoutSourceType[];
    maxCandidates?: number;
  }): Promise<{
    candidates: DiscoveryCandidate[];
    added: DiscoveryCandidate[];
    usedSources: ScoutSourceType[];
    sourceFallbacks: ScoutSourceType[];
    dailyLimit: number;
    dedupe?: { total: number; kept: number; duplicates: number; possibleDuplicates: number; duplicateRate: number };
  }> {
    const moduleTopics = this.listTopics(input.moduleId);
    if (moduleTopics.length === 0) return { candidates: [], added: [], usedSources: [], sourceFallbacks: [], dailyLimit: config.scout.dailyLimit };

    const resolvedTopics = input.topics.length
      ? input.topics.map((id) => resolveTopicForModule(input.moduleId, id)).filter(Boolean) as DiscoveryTopic[]
      : moduleTopics;
    if (resolvedTopics.length === 0) {
      throw new InvalidScoutTopicError("선택된 주제가 모듈에 없습니다.");
    }

    const limit = Math.max(1, Math.min(
      input.maxCandidates ?? MODE_TO_LIMIT[input.mode],
      config.scout.dailyLimit
    ));

    const sourceTypes: ScoutSourceType[] = input.sourceTypes?.length
      ? input.sourceTypes
      : ["mock", "naver"];

    const adapters = sourceTypes
      .map((s) => searchSourceRegistry.getAdapter(s))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));

    const usedSources: ScoutSourceType[] = [];
    const fallbacks: ScoutSourceType[] = [];
    const seen = new Set<string>();
    const all: DiscoveryCandidate[] = [];
    const perSourceLimit = Math.max(1, Math.ceil(limit / Math.max(1, adapters.length)));

    for (const adapter of adapters) {
      if (!adapter.isEnabled()) {
        fallbacks.push(adapter.sourceType);
        continue;
      }
      usedSources.push(adapter.sourceType);
      for (const topic of resolvedTopics) {
        if (all.length >= limit) break;
        for (const keyword of topic.seedKeywords.slice(0, 2)) {
          if (all.length >= limit) break;
          try {
            const out = await adapter.search(keyword, {
              limit: perSourceLimit,
              moduleId: input.moduleId,
              topicId: topic.id
            });
            for (const c of out) {
              const key = `${c.moduleId}|${c.url}`;
              if (seen.has(key)) continue;
              if (!isHttpUrl(c.url)) continue;
              seen.add(key);
              all.push(c);
              if (all.length >= limit) break;
            }
          } catch (error) {
            console.warn(`Scout adapter ${adapter.sourceType} failed:`, (error as Error).message);
          }
        }
      }
    }

    // 활성 adapter가 하나도 없으면 mock으로 안전 폴백
    if (usedSources.length === 0) {
      const mock = searchSourceRegistry.getAdapter("mock");
      if (mock && mock.isEnabled()) {
        usedSources.push("mock");
        for (const topic of resolvedTopics) {
          if (all.length >= limit) break;
          const out = await mock.search(topic.seedKeywords[0] ?? topic.label, {
            limit, moduleId: input.moduleId, topicId: topic.id
          });
          for (const c of out) {
            const key = `${c.moduleId}|${c.url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(c);
            if (all.length >= limit) break;
          }
        }
      }
    }

    // Dedupe — 기존 저장된 후보와 비교해서 DUPLICATE는 저장에서 제외
    const existing = (await candidateRepository.list({ moduleId: input.moduleId, limit: 500 }))
      .map((c) => ({ id: c.id, url: c.url, title: c.title }));
    const dedupeReport = dedupeEngine.dedupeBatch(
      all.map((c) => ({ id: c.id, url: c.url, title: c.title, moduleId: c.moduleId })),
      existing
    );
    const dropIds = new Set(
      dedupeReport.results.filter((r) => r.status === "DUPLICATE").map((r) => r.inputId)
    );
    const uniqueOrPossible = all.filter((c) => !dropIds.has(c.id));
    await dedupeEngine.writeReport(dedupeReport).catch(() => undefined);
    const added = await candidateRepository.createMany(uniqueOrPossible);
    return {
      candidates: all,
      added,
      usedSources,
      sourceFallbacks: fallbacks,
      dailyLimit: config.scout.dailyLimit,
      dedupe: dedupeReport.summary
    };
  }

  async queueCandidate(candidateId: string, options: { reviewerName?: string } = {}): Promise<{
    candidate: DiscoveryCandidate;
    case?: { id: string; status: string };
    note: string;
  }> {
    const cand = await candidateRepository.getById(candidateId);
    try {
      const created = await this.cases.create({
        moduleId: cand.moduleId,
        title: cand.title,
        url: cand.url,
        riskScore: cand.firstScore,
        riskLevel: undefined,
        agencyCandidate: undefined,
        summary: cand.snippet || `Scout 후보 (${cand.source})`,
        memo: `Scout candidate ${candidateId}; reviewer=${options.reviewerName ?? "anonymous"}`
      });
      const updated = await candidateRepository.updateStatus(candidateId, "QUEUED", { caseId: created.id });
      return {
        candidate: updated,
        case: { id: created.id, status: created.status },
        note: "DRAFT Case로 등록되었고 후보 상태가 QUEUED로 변경되었습니다. 자동 신고는 수행되지 않습니다."
      };
    } catch (error) {
      // Case 생성 실패해도 candidate status는 QUEUED로
      const updated = await candidateRepository.updateStatus(candidateId, "QUEUED");
      return {
        candidate: updated,
        note: `Case 생성 실패로 후보만 QUEUED로 변경되었습니다: ${(error as Error).message}`
      };
    }
  }

  async rejectCandidate(candidateId: string, note?: string): Promise<DiscoveryCandidate> {
    const updated = await candidateRepository.updateStatus(candidateId, "REJECTED");
    // note는 별도 저장소가 없으므로 응답으로만 안내
    void note;
    return updated;
  }
}

export class InvalidScoutTopicError extends Error {
  constructor(msg: string) { super(msg); this.name = "InvalidScoutTopicError"; }
}

export { CandidateNotFoundError };
export const scoutAgent = new ScoutAgent();
