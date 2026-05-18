import { readdir } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type {
  CaseStatus,
  ReviewDecision,
  ReviewRecord,
  RewardCase,
  StatusHistoryEntry
} from "../types/core.js";
import { config } from "../utils/config.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import {
  ALLOWED_TRANSITIONS,
  clampRiskScore,
  isAllowedTransition,
  normalizeStatus,
  riskLevelFromScore,
  sanitizeString,
  LIMITS
} from "../utils/validation.js";
import { maskText } from "../services/privacy/MaskingService.js";

export interface CaseListQuery {
  status?: CaseStatus;
  moduleId?: string;
  minRiskScore?: number;
  limit?: number;
  offset?: number;
}

export interface CaseListResult {
  cases: RewardCase[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateCaseInput {
  moduleId: string;
  title: string;
  url: string;
  riskScore?: number;
  riskLevel?: string;
  agencyCandidate?: string;
  summary?: string;
  memo?: string;
  rewardCaution?: string;
}

export interface PatchCaseFields {
  title?: string;
  summary?: string;
  memo?: string;
  agencyCandidate?: string;
  rewardCaution?: string;
  riskLevel?: string;
  riskScore?: number;
}

export interface TransitionInput {
  status: CaseStatus;
  reviewerName?: string;
  note?: string;
}

export interface ReviewInput {
  reviewerName: string;
  decision: ReviewDecision;
  notes?: string;
}

export class CaseTransitionError extends Error {
  constructor(public readonly from: CaseStatus, public readonly to: CaseStatus) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = "CaseTransitionError";
  }
}

export class CaseNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Case not found: ${id}`);
    this.name = "CaseNotFoundError";
  }
}

export interface ICaseRepository {
  save(rewardCase: RewardCase): Promise<RewardCase>;
  create(input: CreateCaseInput): Promise<RewardCase>;
  list(query?: CaseListQuery): Promise<CaseListResult>;
  get(id: string): Promise<RewardCase>;
  patch(id: string, fields: PatchCaseFields): Promise<RewardCase>;
  transition(id: string, input: TransitionInput): Promise<RewardCase>;
  addReview(id: string, input: ReviewInput): Promise<{ review: ReviewRecord; case: RewardCase }>;
}

// ---------- JSON 구현 ----------

export class JsonCaseRepository implements ICaseRepository {
  constructor(private readonly casesDir: string = path.join(config.dataDir, "cases")) {}

  private filePath(id: string): string {
    return path.join(this.casesDir, `${id}.json`);
  }

  async save(rewardCase: RewardCase): Promise<RewardCase> {
    await ensureDir(this.casesDir);
    const normalized = this.normalize(rewardCase);
    await writeJson(this.filePath(normalized.id), normalized);
    return normalized;
  }

  async create(input: CreateCaseInput): Promise<RewardCase> {
    const now = new Date().toISOString();
    const id = nanoid(12);
    const score = clampRiskScore(input.riskScore ?? 0);
    const riskLevel = input.riskLevel
      ? sanitizeString(input.riskLevel, LIMITS.riskLevel)
      : riskLevelFromScore(score);
    // 사람이 입력한 memo / summary 는 저장 전 개인정보 마스킹 (체크리스트 28)
    const memoMasked = input.memo ? maskText(input.memo, { enabled: true }).masked : input.memo;
    const summaryMasked = input.summary ? maskText(input.summary, { enabled: true }).masked : input.summary;
    const created: RewardCase = {
      id,
      moduleId: input.moduleId,
      status: "DRAFT",
      url: input.url,
      title: sanitizeString(input.title, LIMITS.title) ?? input.title,
      createdAt: now,
      updatedAt: now,
      score,
      riskScore: score,
      riskLevel,
      agencyCandidate: sanitizeString(input.agencyCandidate, LIMITS.agencyCandidate),
      summary: sanitizeString(summaryMasked, LIMITS.summary),
      memo: sanitizeString(memoMasked, LIMITS.memo),
      rewardCaution: sanitizeString(input.rewardCaution, LIMITS.rewardCaution),
      ruleHits: [],
      aiFinding: {
        suspicious: false,
        confidence: 0,
        violationType: "수동 등록",
        summary: input.summary ?? "사용자가 수동으로 등록한 Case입니다. 외부 신고 전 사람이 공식 기준으로 재검토해야 합니다.",
        reasons: [],
        requiredHumanChecks: [
          "공개 URL이 정확한지 확인",
          "광고 문구가 위반에 해당하는지 사람이 직접 판단"
        ],
        recommendedAgency: input.agencyCandidate ?? "관할 기관 확인 필요",
        safeWording: "공개 자료를 바탕으로 검토가 필요한 사안으로 보입니다."
      },
      evidence: {
        htmlPath: "",
        textPath: "",
        capturedAt: now
      },
      reportPath: "",
      statusHistory: [
        { at: now, from: null, to: "DRAFT", note: "Case 생성 (수동)" }
      ],
      reviews: []
    };
    await this.save(created);
    return created;
  }

  async list(query: CaseListQuery = {}): Promise<CaseListResult> {
    await ensureDir(this.casesDir);
    const files = (await readdir(this.casesDir)).filter((f) => f.endsWith(".json"));
    const all = await Promise.all(files.map((f) => readJson<RewardCase>(path.join(this.casesDir, f))));
    const normalized = all.map((c) => this.normalize(c));

    let filtered = normalized;
    if (query.status) filtered = filtered.filter((c) => c.status === query.status);
    if (query.moduleId) filtered = filtered.filter((c) => c.moduleId === query.moduleId);
    if (typeof query.minRiskScore === "number") {
      filtered = filtered.filter((c) => (c.riskScore ?? c.score ?? 0) >= query.minRiskScore!);
    }

    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = filtered.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const paged = filtered.slice(offset, offset + limit);
    return { cases: paged, total, limit, offset };
  }

  async get(id: string): Promise<RewardCase> {
    try {
      const raw = await readJson<RewardCase>(this.filePath(id));
      return this.normalize(raw);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new CaseNotFoundError(id);
      throw error;
    }
  }

  async patch(id: string, fields: PatchCaseFields): Promise<RewardCase> {
    const current = await this.get(id);
    const next: RewardCase = { ...current };
    if (fields.title !== undefined) next.title = sanitizeString(fields.title, LIMITS.title) ?? current.title;
    if (fields.summary !== undefined) next.summary = sanitizeString(fields.summary, LIMITS.summary);
    if (fields.memo !== undefined) next.memo = sanitizeString(fields.memo, LIMITS.memo);
    if (fields.agencyCandidate !== undefined)
      next.agencyCandidate = sanitizeString(fields.agencyCandidate, LIMITS.agencyCandidate);
    if (fields.rewardCaution !== undefined)
      next.rewardCaution = sanitizeString(fields.rewardCaution, LIMITS.rewardCaution);
    if (fields.riskLevel !== undefined)
      next.riskLevel = sanitizeString(fields.riskLevel, LIMITS.riskLevel);
    if (fields.riskScore !== undefined) {
      next.riskScore = clampRiskScore(fields.riskScore);
      next.score = next.riskScore;
    }
    next.updatedAt = new Date().toISOString();
    await this.save(next);
    return next;
  }

  async transition(id: string, input: TransitionInput): Promise<RewardCase> {
    const current = await this.get(id);
    if (!isAllowedTransition(current.status, input.status)) {
      throw new CaseTransitionError(current.status, input.status);
    }
    const now = new Date().toISOString();
    const historyEntry: StatusHistoryEntry = {
      at: now,
      from: current.status,
      to: input.status,
      reviewerName: sanitizeString(input.reviewerName, LIMITS.reviewerName),
      note: sanitizeString(input.note, LIMITS.reviewNote)
    };
    const next: RewardCase = {
      ...current,
      status: input.status,
      updatedAt: now,
      statusHistory: [...(current.statusHistory ?? []), historyEntry]
    };
    await this.save(next);
    return next;
  }

  async addReview(id: string, input: ReviewInput): Promise<{ review: ReviewRecord; case: RewardCase }> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const review: ReviewRecord = {
      id: nanoid(10),
      at: now,
      reviewerName: sanitizeString(input.reviewerName, LIMITS.reviewerName) ?? input.reviewerName,
      decision: input.decision,
      notes: sanitizeString(input.notes, LIMITS.reviewNote)
    };
    const next: RewardCase = {
      ...current,
      reviews: [...(current.reviews ?? []), review],
      updatedAt: now
    };
    await this.save(next);
    return { review, case: next };
  }

  // 레거시 또는 부분 필드 보정 — 새 enum/필드를 항상 채운다
  private normalize(raw: RewardCase): RewardCase {
    const status = normalizeStatus(raw.status as unknown);
    const score = clampRiskScore(raw.riskScore ?? raw.score ?? 0);
    return {
      ...raw,
      status,
      score,
      riskScore: score,
      riskLevel: raw.riskLevel ?? riskLevelFromScore(score),
      statusHistory: raw.statusHistory ?? [],
      reviews: raw.reviews ?? []
    };
  }
}

// ---------- factory ----------

export function createCaseRepository(): ICaseRepository {
  if (config.useDb) {
    // Prisma 저장소는 다음 체크리스트에서 도입한다.
    // 현재는 USE_DB=true여도 안전을 위해 JSON으로 폴백한다.
    console.warn("[CaseRepository] USE_DB=true 설정이지만 Prisma 구현은 아직 미연결입니다. JSON 저장소를 사용합니다.");
  }
  return new JsonCaseRepository();
}

export { ALLOWED_TRANSITIONS };
