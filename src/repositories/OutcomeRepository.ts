import path from "node:path";
import { access, constants } from "node:fs/promises";
import { nanoid } from "nanoid";
import { config } from "../utils/config.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import { maskText } from "../services/privacy/MaskingService.js";
import {
  OUTCOME_DECISIONS,
  OUTCOME_LIMITS,
  OUTCOME_SAFETY_NOTICE,
  OUTCOME_STATUSES,
  REWARD_OUTCOMES,
  type CreateOutcomeInput,
  type FollowUpItem,
  type OutcomeDecision,
  type OutcomeEntry,
  type OutcomeListQuery,
  type OutcomePatternStats,
  type OutcomeStats,
  type OutcomeStatus,
  type RewardOutcome,
  type UpdateOutcomeInput
} from "../types/outcome.js";

export class OutcomeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeValidationError";
  }
}

export class OutcomeNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Outcome not found: ${id}`);
    this.name = "OutcomeNotFoundError";
  }
}

interface OutcomeFile {
  schemaVersion: "1.0.0";
  updatedAt: string;
  outcomes: OutcomeEntry[];
}

function isOutcomeStatus(v: unknown): v is OutcomeStatus {
  return typeof v === "string" && (OUTCOME_STATUSES as readonly string[]).includes(v);
}
function isOutcomeDecision(v: unknown): v is OutcomeDecision {
  return typeof v === "string" && (OUTCOME_DECISIONS as readonly string[]).includes(v);
}
function isRewardOutcome(v: unknown): v is RewardOutcome {
  return typeof v === "string" && (REWARD_OUTCOMES as readonly string[]).includes(v);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isSafeDate(s: string | undefined): boolean {
  if (!s) return true;
  return DATE_RE.test(s);
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateOutcomeResult {
  outcome: OutcomeEntry;
  piiMasked: boolean;
}

export class JsonOutcomeRepository {
  private readonly filePath: string;

  constructor(dir: string = config.outcome.dir) {
    this.filePath = path.join(dir, "outcomes.json");
  }

  private async load(): Promise<OutcomeFile> {
    await ensureDir(path.dirname(this.filePath));
    try {
      await access(this.filePath, constants.F_OK);
    } catch {
      const empty: OutcomeFile = {
        schemaVersion: "1.0.0",
        updatedAt: nowIso(),
        outcomes: []
      };
      await writeJson(this.filePath, empty);
      return empty;
    }
    try {
      const raw = await readJson<OutcomeFile>(this.filePath);
      if (!Array.isArray(raw.outcomes)) {
        return { schemaVersion: "1.0.0", updatedAt: nowIso(), outcomes: [] };
      }
      return raw;
    } catch {
      return { schemaVersion: "1.0.0", updatedAt: nowIso(), outcomes: [] };
    }
  }

  private async save(file: OutcomeFile): Promise<void> {
    await ensureDir(path.dirname(this.filePath));
    file.updatedAt = nowIso();
    await writeJson(this.filePath, file);
  }

  private sanitizeAndValidate(input: CreateOutcomeInput | UpdateOutcomeInput, partial: boolean):
    { sanitized: Partial<OutcomeEntry>; piiMasked: boolean } {
    let piiMasked = false;
    const sanitized: Partial<OutcomeEntry> = {};

    if (!partial) {
      if (!input.caseId || typeof input.caseId !== "string") {
        throw new OutcomeValidationError("caseId 가 필요합니다.");
      }
    }
    if (input.caseId !== undefined) {
      if (typeof input.caseId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(input.caseId)) {
        throw new OutcomeValidationError(`잘못된 caseId: ${input.caseId}`);
      }
      sanitized.caseId = input.caseId;
    }
    if (input.moduleId !== undefined) {
      if (typeof input.moduleId !== "string" || input.moduleId.length > 80) {
        throw new OutcomeValidationError("moduleId 길이 또는 형식 오류");
      }
      sanitized.moduleId = input.moduleId;
    }
    if (input.agencyName !== undefined) {
      if (typeof input.agencyName !== "string") throw new OutcomeValidationError("agencyName 은 문자열이어야 합니다.");
      sanitized.agencyName = clamp(input.agencyName.trim(), OUTCOME_LIMITS.agencyName);
    }
    if (input.agencyChannel !== undefined) {
      if (typeof input.agencyChannel !== "string") throw new OutcomeValidationError("agencyChannel 은 문자열이어야 합니다.");
      sanitized.agencyChannel = clamp(input.agencyChannel.trim(), OUTCOME_LIMITS.agencyChannel);
    }
    for (const k of ["submittedAt", "receivedAt", "followUpDueAt"] as const) {
      const v = input[k];
      if (v !== undefined) {
        if (typeof v !== "string" || !isSafeDate(v)) {
          throw new OutcomeValidationError(`${k} 는 YYYY-MM-DD 형식이어야 합니다.`);
        }
        sanitized[k] = v;
      }
    }
    if (input.referenceNumber !== undefined) {
      if (typeof input.referenceNumber !== "string") throw new OutcomeValidationError("referenceNumber 문자열 오류");
      const ref = clamp(input.referenceNumber.trim(), OUTCOME_LIMITS.referenceNumber);
      // 접수번호 자체는 정책상 마스킹 옵션 — 여기선 원본 저장하되 PII 패턴 (이메일/전화/주민) 매칭 시 마스킹
      const r = maskText(ref, { enabled: true });
      sanitized.referenceNumber = r.masked;
      sanitized.referenceNumberMasked = r.changed;
      if (r.changed) piiMasked = true;
    }
    if (input.status !== undefined) {
      if (!isOutcomeStatus(input.status)) {
        throw new OutcomeValidationError(
          `status 는 ${OUTCOME_STATUSES.join("/")} 중 하나여야 합니다.`
        );
      }
      sanitized.status = input.status;
    }
    if (input.decision !== undefined) {
      if (!isOutcomeDecision(input.decision)) {
        throw new OutcomeValidationError(
          `decision 은 ${OUTCOME_DECISIONS.join("/")} 중 하나여야 합니다.`
        );
      }
      sanitized.decision = input.decision;
    }
    if (input.rewardOutcome !== undefined) {
      if (!isRewardOutcome(input.rewardOutcome)) {
        throw new OutcomeValidationError(
          `rewardOutcome 은 ${REWARD_OUTCOMES.join("/")} 중 하나여야 합니다.`
        );
      }
      sanitized.rewardOutcome = input.rewardOutcome;
    }
    if (input.rewardAmount !== undefined) {
      if (input.rewardAmount === null) {
        sanitized.rewardAmount = null;
      } else {
        if (typeof input.rewardAmount !== "number" || !Number.isFinite(input.rewardAmount)) {
          throw new OutcomeValidationError("rewardAmount 는 숫자여야 합니다.");
        }
        if (input.rewardAmount < 0) {
          throw new OutcomeValidationError("rewardAmount 는 0 이상이어야 합니다.");
        }
        sanitized.rewardAmount = input.rewardAmount;
      }
    }
    if (input.rewardCurrency !== undefined) {
      if (typeof input.rewardCurrency !== "string") throw new OutcomeValidationError("rewardCurrency 문자열 오류");
      sanitized.rewardCurrency = clamp(input.rewardCurrency.trim(), OUTCOME_LIMITS.rewardCurrency);
    }

    // 본문 텍스트 — 마스킹 적용
    for (const k of ["resultSummary", "rejectionReason", "supplementRequest", "notes"] as const) {
      const v = input[k];
      if (v === undefined) continue;
      if (typeof v !== "string") throw new OutcomeValidationError(`${k} 는 문자열이어야 합니다.`);
      const max = (OUTCOME_LIMITS as Record<string, number>)[k] ?? 1000;
      const trimmed = clamp(v.trim(), max);
      const r = maskText(trimmed, { enabled: true });
      sanitized[k] = r.masked;
      if (r.changed) piiMasked = true;
    }

    return { sanitized, piiMasked };
  }

  async create(input: CreateOutcomeInput): Promise<CreateOutcomeResult> {
    const { sanitized, piiMasked } = this.sanitizeAndValidate(input, false);
    const now = nowIso();
    const entry: OutcomeEntry = {
      schemaVersion: "1.0.0",
      id: `oc_${nanoid(10)}`,
      caseId: sanitized.caseId!,
      moduleId: sanitized.moduleId,
      agencyName: sanitized.agencyName,
      agencyChannel: sanitized.agencyChannel,
      submittedAt: sanitized.submittedAt,
      receivedAt: sanitized.receivedAt,
      referenceNumber: sanitized.referenceNumber,
      referenceNumberMasked: sanitized.referenceNumberMasked ?? false,
      status: sanitized.status ?? "SUBMITTED_MANUALLY",
      decision: sanitized.decision ?? "PENDING",
      resultSummary: sanitized.resultSummary,
      rejectionReason: sanitized.rejectionReason,
      supplementRequest: sanitized.supplementRequest,
      rewardOutcome: sanitized.rewardOutcome ?? "UNKNOWN",
      rewardAmount: sanitized.rewardAmount ?? null,
      rewardCurrency: sanitized.rewardCurrency,
      followUpDueAt: sanitized.followUpDueAt,
      notes: sanitized.notes,
      piiMasked,
      createdAt: now,
      updatedAt: now,
      safetyNotice: OUTCOME_SAFETY_NOTICE
    };

    const file = await this.load();
    file.outcomes.push(entry);
    await this.save(file);
    return { outcome: entry, piiMasked };
  }

  async update(id: string, input: UpdateOutcomeInput): Promise<CreateOutcomeResult> {
    const { sanitized, piiMasked } = this.sanitizeAndValidate(input, true);
    const file = await this.load();
    const idx = file.outcomes.findIndex((o) => o.id === id);
    if (idx === -1) throw new OutcomeNotFoundError(id);
    const prev = file.outcomes[idx];
    const merged: OutcomeEntry = {
      ...prev,
      ...sanitized,
      // caseId 는 변경 불가
      caseId: prev.caseId,
      piiMasked: piiMasked || prev.piiMasked || false,
      updatedAt: nowIso()
    };
    file.outcomes[idx] = merged;
    await this.save(file);
    return { outcome: merged, piiMasked };
  }

  async upsertByCaseId(caseId: string, input: CreateOutcomeInput): Promise<CreateOutcomeResult> {
    if (!caseId) throw new OutcomeValidationError("caseId 가 필요합니다.");
    const file = await this.load();
    const existing = file.outcomes.find((o) => o.caseId === caseId);
    if (!existing) {
      return this.create({ ...input, caseId });
    }
    return this.update(existing.id, { ...input, caseId });
  }

  async getById(id: string): Promise<OutcomeEntry | null> {
    const file = await this.load();
    return file.outcomes.find((o) => o.id === id) ?? null;
  }

  async listByCaseId(caseId: string): Promise<OutcomeEntry[]> {
    const file = await this.load();
    return file.outcomes
      .filter((o) => o.caseId === caseId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async list(query: OutcomeListQuery = {}): Promise<{ items: OutcomeEntry[]; total: number; limit: number; offset: number }> {
    const file = await this.load();
    let items = file.outcomes.slice();

    if (query.caseId) items = items.filter((o) => o.caseId === query.caseId);
    if (query.moduleId) items = items.filter((o) => o.moduleId === query.moduleId);
    if (query.agencyName) items = items.filter((o) => o.agencyName === query.agencyName);
    if (query.status) items = items.filter((o) => o.status === query.status);
    if (query.decision) items = items.filter((o) => o.decision === query.decision);
    if (query.rewardOutcome) items = items.filter((o) => o.rewardOutcome === query.rewardOutcome);
    if (query.followUpDue === true) {
      const todayStr = new Date().toISOString().slice(0, 10);
      items = items.filter((o) => typeof o.followUpDueAt === "string" && o.followUpDueAt <= todayStr);
    }

    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const offset = Math.max(0, Number(query.offset ?? 0));
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
    return { items: items.slice(offset, offset + limit), total, limit, offset };
  }

  async getStats(): Promise<OutcomeStats> {
    const file = await this.load();
    const all = file.outcomes;
    const byStatus: Record<string, number> = {};
    for (const s of OUTCOME_STATUSES) byStatus[s] = 0;
    const byDecision: Record<string, number> = {};
    for (const d of OUTCOME_DECISIONS) byDecision[d] = 0;
    const byRewardOutcome: Record<string, number> = {};
    for (const r of REWARD_OUTCOMES) byRewardOutcome[r] = 0;

    let rewardPaidAmountTotal = 0;
    let rewardPaidEntries = 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    let followUpDueCount = 0;

    for (const o of all) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      byDecision[o.decision] = (byDecision[o.decision] ?? 0) + 1;
      byRewardOutcome[o.rewardOutcome] = (byRewardOutcome[o.rewardOutcome] ?? 0) + 1;
      if (o.rewardOutcome === "PAID" && typeof o.rewardAmount === "number" && o.rewardAmount > 0) {
        rewardPaidAmountTotal += o.rewardAmount;
        rewardPaidEntries += 1;
      }
      if (typeof o.followUpDueAt === "string" && o.followUpDueAt <= todayStr) {
        followUpDueCount += 1;
      }
    }

    return {
      total: all.length,
      byStatus,
      byDecision,
      byRewardOutcome,
      submittedCount: byStatus.SUBMITTED_MANUALLY ?? 0,
      receivedCount: byStatus.RECEIVED ?? 0,
      inReviewCount: byStatus.IN_REVIEW ?? 0,
      supplementRequestedCount: byStatus.SUPPLEMENT_REQUESTED ?? 0,
      acceptedCount: byStatus.ACCEPTED ?? 0,
      rejectedCount: byStatus.REJECTED ?? 0,
      rewardReviewCount: byStatus.REWARD_REVIEW ?? 0,
      rewardPaidCount: byStatus.REWARD_PAID ?? 0,
      followUpDueCount,
      rewardPaidAmountTotal,
      rewardPaidEntries
    };
  }

  async getPatternStats(): Promise<OutcomePatternStats> {
    const file = await this.load();
    const all = file.outcomes;
    const modMap = new Map<string, { total: number; accepted: number; rejected: number; rewardPaid: number }>();
    const agencyMap = new Map<string, { total: number; accepted: number; rejected: number; rewardPaid: number }>();
    const reasonMap = new Map<string, number>();

    for (const o of all) {
      if (o.moduleId) {
        const cur = modMap.get(o.moduleId) ?? { total: 0, accepted: 0, rejected: 0, rewardPaid: 0 };
        cur.total += 1;
        if (o.decision === "ACCEPTED" || o.decision === "PARTIAL_ACCEPTED") cur.accepted += 1;
        if (o.decision === "REJECTED") cur.rejected += 1;
        if (o.rewardOutcome === "PAID") cur.rewardPaid += 1;
        modMap.set(o.moduleId, cur);
      }
      if (o.agencyName) {
        const cur = agencyMap.get(o.agencyName) ?? { total: 0, accepted: 0, rejected: 0, rewardPaid: 0 };
        cur.total += 1;
        if (o.decision === "ACCEPTED" || o.decision === "PARTIAL_ACCEPTED") cur.accepted += 1;
        if (o.decision === "REJECTED") cur.rejected += 1;
        if (o.rewardOutcome === "PAID") cur.rewardPaid += 1;
        agencyMap.set(o.agencyName, cur);
      }
      if (o.rejectionReason) {
        // 마스킹된 텍스트 그대로 카운트 (길어지면 100자까지)
        const key = clamp(o.rejectionReason.trim(), 100);
        if (key) reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
      }
    }

    return {
      byModule: [...modMap.entries()].map(([moduleId, v]) => ({ moduleId, ...v }))
        .sort((a, b) => b.total - a.total).slice(0, 10),
      byAgency: [...agencyMap.entries()].map(([agencyName, v]) => ({ agencyName, ...v }))
        .sort((a, b) => b.total - a.total).slice(0, 10),
      topRejectionReasons: [...reasonMap.entries()].map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count).slice(0, 10),
      safetyNotice: OUTCOME_SAFETY_NOTICE
    };
  }

  async getFollowUpDue(graceDays = 0): Promise<FollowUpItem[]> {
    const file = await this.load();
    const todayMs = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const out: FollowUpItem[] = [];
    for (const o of file.outcomes) {
      if (typeof o.followUpDueAt !== "string" || !DATE_RE.test(o.followUpDueAt)) continue;
      const dueMs = Date.parse(o.followUpDueAt + "T00:00:00Z");
      if (!Number.isFinite(dueMs)) continue;
      const daysOverdue = Math.floor((todayMs - dueMs) / (24 * 60 * 60 * 1000));
      if (daysOverdue >= -graceDays) {
        out.push({
          outcomeId: o.id,
          caseId: o.caseId,
          moduleId: o.moduleId,
          agencyName: o.agencyName,
          status: o.status,
          followUpDueAt: o.followUpDueAt,
          daysOverdue
        });
      }
    }
    out.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return out;
  }

  async deleteById(id: string): Promise<boolean> {
    const file = await this.load();
    const before = file.outcomes.length;
    file.outcomes = file.outcomes.filter((o) => o.id !== id);
    if (file.outcomes.length === before) return false;
    await this.save(file);
    return true;
  }
}

export function createOutcomeRepository(): JsonOutcomeRepository {
  if (config.outcome.useDb) {
    console.warn("[OutcomeRepository] OUTCOME_USE_DB=true 설정이지만 Prisma 구현은 아직 미연결입니다. JSON 저장소를 사용합니다.");
  }
  return new JsonOutcomeRepository();
}
