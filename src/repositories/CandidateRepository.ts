import path from "node:path";
import { config } from "../utils/config.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import {
  CANDIDATE_STATUSES,
  type CandidateStatus,
  type DiscoveryCandidate
} from "../types/candidate.js";

export interface CandidateListQuery {
  moduleId?: string;
  topic?: string;
  status?: CandidateStatus;
  minScore?: number;
  limit?: number;
}

export class CandidateNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Candidate not found: ${id}`);
    this.name = "CandidateNotFoundError";
  }
}

export class CandidateRepository {
  private readonly filePath: string;
  private cache: DiscoveryCandidate[] | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(config.dataDir, "candidates", "candidates.json");
  }

  private async load(): Promise<DiscoveryCandidate[]> {
    if (this.cache) return this.cache;
    await ensureDir(path.dirname(this.filePath));
    try {
      const data = await readJson<{ candidates: DiscoveryCandidate[] }>(this.filePath);
      this.cache = Array.isArray(data?.candidates) ? data.candidates : [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    await ensureDir(path.dirname(this.filePath));
    await writeJson(this.filePath, { candidates: this.cache ?? [] });
  }

  async list(query: CandidateListQuery = {}): Promise<DiscoveryCandidate[]> {
    const all = await this.load();
    let out = [...all];
    if (query.moduleId) out = out.filter((c) => c.moduleId === query.moduleId);
    if (query.topic) out = out.filter((c) => c.topic === query.topic);
    if (query.status) out = out.filter((c) => c.status === query.status);
    if (typeof query.minScore === "number") {
      out = out.filter((c) => c.firstScore >= query.minScore!);
    }
    out.sort((a, b) => {
      if (b.firstScore !== a.firstScore) return b.firstScore - a.firstScore;
      return b.foundAt.localeCompare(a.foundAt);
    });
    if (query.limit) out = out.slice(0, query.limit);
    return out;
  }

  async getById(id: string): Promise<DiscoveryCandidate> {
    const all = await this.load();
    const found = all.find((c) => c.id === id);
    if (!found) throw new CandidateNotFoundError(id);
    return found;
  }

  /**
   * URL 기준 dedupe — 같은 (moduleId, url) 조합이 이미 있으면 skip.
   * 새로 들어간 candidate만 반환한다.
   */
  async createMany(candidates: DiscoveryCandidate[]): Promise<DiscoveryCandidate[]> {
    const all = await this.load();
    const existingKeys = new Set(all.map((c) => `${c.moduleId}|${c.url}`));
    const added: DiscoveryCandidate[] = [];
    for (const cand of candidates) {
      const key = `${cand.moduleId}|${cand.url}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      added.push(cand);
    }
    this.cache = [...all, ...added];
    await this.persist();
    return added;
  }

  async updateStatus(id: string, status: CandidateStatus, extra: Partial<Pick<DiscoveryCandidate, "caseId">> = {}): Promise<DiscoveryCandidate> {
    if (!(CANDIDATE_STATUSES as readonly string[]).includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    const all = await this.load();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) throw new CandidateNotFoundError(id);
    const updated: DiscoveryCandidate = { ...all[idx], status, ...extra };
    all[idx] = updated;
    this.cache = all;
    await this.persist();
    return updated;
  }

  async clearMockCandidates(): Promise<number> {
    const all = await this.load();
    const kept = all.filter((c) => c.source !== "seed-mock");
    const removed = all.length - kept.length;
    this.cache = kept;
    await this.persist();
    return removed;
  }
}

export const candidateRepository = new CandidateRepository();
