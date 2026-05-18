import path from "node:path";
import { access, constants } from "node:fs/promises";
import { nanoid } from "nanoid";
import { config } from "../utils/config.js";
import { ensureDir, readJson, writeJson } from "../utils/fs.js";
import { maskPiiForFeedback } from "../utils/piiMask.js";
import {
  FEEDBACK_DECISIONS,
  FEEDBACK_REASON_CATEGORIES,
  FEEDBACK_REASON_CATEGORY_INFO,
  FEEDBACK_SAFETY_NOTICE,
  FEEDBACK_MEMO_MAX,
  FEEDBACK_NOTES_MAX,
  type CreateFeedbackInput,
  type FeedbackDecision,
  type FeedbackEntry,
  type FeedbackImprovements,
  type FeedbackListQuery,
  type FeedbackReasonCategory,
  type FeedbackStats
} from "../types/feedback.js";

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

export interface CreateFeedbackResult {
  feedback: FeedbackEntry;
  piiMasked: boolean;
  piiHits: { email: number; phone: number; rrn: number };
}

export interface IFeedbackRepository {
  create(input: CreateFeedbackInput): Promise<CreateFeedbackResult>;
  list(query?: FeedbackListQuery): Promise<{ items: FeedbackEntry[]; total: number; limit: number; offset: number }>;
  getById(id: string): Promise<FeedbackEntry | null>;
  listByCaseId(caseId: string): Promise<FeedbackEntry[]>;
  stats(): Promise<FeedbackStats>;
  improvements(): Promise<FeedbackImprovements>;
}

interface FeedbackFile {
  schemaVersion: "1.0.0";
  updatedAt: string;
  feedback: FeedbackEntry[];
}

function isFeedbackDecision(v: unknown): v is FeedbackDecision {
  return typeof v === "string" && (FEEDBACK_DECISIONS as readonly string[]).includes(v);
}
function isReasonCategory(v: unknown): v is FeedbackReasonCategory {
  return typeof v === "string" && (FEEDBACK_REASON_CATEGORIES as readonly string[]).includes(v);
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeStringArray(arr: unknown, max = 50, eachMax = 200): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const v = clamp(item.trim(), eachMax);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export class JsonFeedbackRepository implements IFeedbackRepository {
  private readonly filePath: string;

  constructor(dir: string = config.feedback.dir) {
    this.filePath = path.join(dir, "feedback.json");
  }

  private async load(): Promise<FeedbackFile> {
    await ensureDir(path.dirname(this.filePath));
    try {
      await access(this.filePath, constants.F_OK);
    } catch {
      const empty: FeedbackFile = {
        schemaVersion: "1.0.0",
        updatedAt: new Date().toISOString(),
        feedback: []
      };
      await writeJson(this.filePath, empty);
      return empty;
    }
    try {
      const raw = await readJson<FeedbackFile>(this.filePath);
      if (!Array.isArray(raw.feedback)) {
        return { schemaVersion: "1.0.0", updatedAt: new Date().toISOString(), feedback: [] };
      }
      return raw;
    } catch {
      return { schemaVersion: "1.0.0", updatedAt: new Date().toISOString(), feedback: [] };
    }
  }

  private async save(file: FeedbackFile): Promise<void> {
    await ensureDir(path.dirname(this.filePath));
    file.updatedAt = new Date().toISOString();
    await writeJson(this.filePath, file);
  }

  async create(input: CreateFeedbackInput): Promise<CreateFeedbackResult> {
    if (!input.caseId || typeof input.caseId !== "string") {
      throw new FeedbackValidationError("caseId가 필요합니다.");
    }
    if (!isFeedbackDecision(input.decision)) {
      throw new FeedbackValidationError(
        `decision은 ${FEEDBACK_DECISIONS.join("/")} 중 하나여야 합니다.`
      );
    }

    const reasonCategories = (input.reasonCategories ?? []).filter(isReasonCategory);
    // 중복 제거
    const reasonCategoriesUnique = Array.from(new Set(reasonCategories)) as FeedbackReasonCategory[];

    // memo PII 마스킹
    const rawMemo = typeof input.memo === "string" ? input.memo : "";
    const memoClamped = clamp(rawMemo.trim(), FEEDBACK_MEMO_MAX);
    const memoMasked = maskPiiForFeedback(memoClamped);

    // LLM/Scoring 노트도 동일하게 마스킹
    const llmRaw = typeof input.llmIssueNotes === "string" ? input.llmIssueNotes : "";
    const llmMasked = maskPiiForFeedback(clamp(llmRaw.trim(), FEEDBACK_NOTES_MAX));
    const scoringRaw = typeof input.scoringIssueNotes === "string" ? input.scoringIssueNotes : "";
    const scoringMasked = maskPiiForFeedback(clamp(scoringRaw.trim(), FEEDBACK_NOTES_MAX));

    const piiChanged = memoMasked.changed || llmMasked.changed || scoringMasked.changed;
    const piiHits = {
      email: memoMasked.hits.email + llmMasked.hits.email + scoringMasked.hits.email,
      phone: memoMasked.hits.phone + llmMasked.hits.phone + scoringMasked.hits.phone,
      rrn: memoMasked.hits.rrn + llmMasked.hits.rrn + scoringMasked.hits.rrn
    };

    const reviewerName = typeof input.reviewerName === "string"
      ? clamp(input.reviewerName.trim(), 80)
      : undefined;

    const entry: FeedbackEntry = {
      schemaVersion: "1.0.0",
      id: `fb_${nanoid(10)}`,
      caseId: input.caseId,
      moduleId: input.moduleId,
      decision: input.decision,
      reasonCategories: reasonCategoriesUnique,
      reviewerName: reviewerName && reviewerName.length > 0 ? reviewerName : undefined,
      memo: memoMasked.masked ? memoMasked.masked : undefined,
      relatedRuleIds: sanitizeStringArray(input.relatedRuleIds, 50, 64),
      relatedKeywords: sanitizeStringArray(input.relatedKeywords, 50, 100),
      llmIssueNotes: llmMasked.masked ? llmMasked.masked : undefined,
      scoringIssueNotes: scoringMasked.masked ? scoringMasked.masked : undefined,
      suggestedRuleChanges: sanitizeStringArray(input.suggestedRuleChanges, 20, 300),
      suggestedPromptChanges: sanitizeStringArray(input.suggestedPromptChanges, 20, 300),
      suggestedScoringChanges: sanitizeStringArray(input.suggestedScoringChanges, 20, 300),
      caseStatusAtFeedback: input.caseStatusAtFeedback,
      piiMasked: piiChanged,
      createdAt: new Date().toISOString(),
      safetyNotice: FEEDBACK_SAFETY_NOTICE
    };

    const file = await this.load();
    file.feedback.push(entry);
    await this.save(file);

    return { feedback: entry, piiMasked: piiChanged, piiHits };
  }

  async list(query: FeedbackListQuery = {}): Promise<{ items: FeedbackEntry[]; total: number; limit: number; offset: number }> {
    const file = await this.load();
    let items = file.feedback.slice();

    if (query.caseId) items = items.filter((f) => f.caseId === query.caseId);
    if (query.decision) items = items.filter((f) => f.decision === query.decision);
    if (query.reasonCategory) {
      items = items.filter((f) => f.reasonCategories.includes(query.reasonCategory!));
    }
    if (query.ruleId) {
      items = items.filter((f) => f.relatedRuleIds.includes(query.ruleId!));
    }
    if (query.keyword) {
      const k = query.keyword;
      items = items.filter(
        (f) => f.relatedKeywords.some((kw) => kw.includes(k)) || (f.memo ? f.memo.includes(k) : false)
      );
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const offset = Math.max(0, Number(query.offset ?? 0));
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50)));
    const paged = items.slice(offset, offset + limit);
    return { items: paged, total, limit, offset };
  }

  async getById(id: string): Promise<FeedbackEntry | null> {
    const file = await this.load();
    return file.feedback.find((f) => f.id === id) ?? null;
  }

  async listByCaseId(caseId: string): Promise<FeedbackEntry[]> {
    const file = await this.load();
    return file.feedback
      .filter((f) => f.caseId === caseId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async stats(): Promise<FeedbackStats> {
    const file = await this.load();
    const all = file.feedback;
    const byDecision: Record<string, number> = {};
    for (const d of FEEDBACK_DECISIONS) byDecision[d] = 0;
    const byReasonCategory: Record<string, number> = {};
    for (const c of FEEDBACK_REASON_CATEGORIES) byReasonCategory[c] = 0;
    const ruleFp: Record<string, number> = {};
    const keywordFp: Record<string, number> = {};
    let evidenceInsuf = 0;
    let urlInaccessible = 0;

    for (const f of all) {
      byDecision[f.decision] = (byDecision[f.decision] ?? 0) + 1;
      for (const c of f.reasonCategories) {
        byReasonCategory[c] = (byReasonCategory[c] ?? 0) + 1;
        if (c === "EVIDENCE_INSUFFICIENT") evidenceInsuf += 1;
        if (c === "URL_INACCESSIBLE") urlInaccessible += 1;
      }
      const isRuleFp =
        f.decision === "FALSE_POSITIVE" || f.reasonCategories.includes("RULE_FALSE_POSITIVE");
      if (isRuleFp) {
        for (const rid of f.relatedRuleIds) ruleFp[rid] = (ruleFp[rid] ?? 0) + 1;
        for (const kw of f.relatedKeywords) keywordFp[kw] = (keywordFp[kw] ?? 0) + 1;
      }
    }

    const topRuleFalsePositiveIds = Object.entries(ruleFp)
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const topKeywordFalsePositives = Object.entries(keywordFp)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total: all.length,
      byDecision,
      byReasonCategory,
      topRuleFalsePositiveIds,
      topKeywordFalsePositives,
      evidenceIssueCounts: {
        EVIDENCE_INSUFFICIENT: evidenceInsuf,
        URL_INACCESSIBLE: urlInaccessible
      }
    };
  }

  async improvements(): Promise<FeedbackImprovements> {
    const s = await this.stats();

    const ruleImprovements = s.topRuleFalsePositiveIds
      .filter((r) => r.count >= 1)
      .map((r) => {
        const fpEntries = (s.topKeywordFalsePositives ?? []).map((k) => k.keyword);
        return {
          ruleId: r.ruleId,
          falsePositiveCount: r.count,
          relatedKeywords: fpEntries.slice(0, 5),
          recommendation:
            r.count >= 5
              ? `오탐이 5건 이상 누적되었습니다. keywords.json에서 ruleId=${r.ruleId} 의 임계값/문맥 예외를 검토하세요.`
              : `오탐 누적 중입니다. ruleId=${r.ruleId} 의 false positive 예시를 검토 대상으로 기록해 두세요.`
        };
      });

    const llmCount = s.byReasonCategory["LLM_OVERSTATED"] ?? 0;
    const promptImprovements = llmCount > 0
      ? [
          {
            issue: "LLM_OVERSTATED",
            count: llmCount,
            recommendation:
              llmCount >= 5
                ? "LLM 판단 과장이 5건 이상입니다. analysis_prompt.md 의 보수적 판단 규칙을 강화하세요."
                : "LLM 판단 과장 사례가 누적 중입니다. analysis_prompt.md 의 일반 표현 vs 치료 표현 구분을 보강하는 후보로 검토하세요."
          }
        ]
      : [];

    const scoreCount = s.byReasonCategory["SCORE_TOO_HIGH"] ?? 0;
    const lowSell = s.byReasonCategory["LOW_SELL_SIGNAL"] ?? 0;
    const scoringImprovements: FeedbackImprovements["scoringImprovements"] = [];
    if (scoreCount > 0) {
      scoringImprovements.push({
        issue: "SCORE_TOO_HIGH",
        count: scoreCount,
        recommendation:
          scoreCount >= 5
            ? "점수 과대평가 사례가 5건 이상입니다. scoring_rules.ts 의 ruleSignal/llmSignal 가중치를 보수적으로 재조정하세요."
            : "점수 과대평가 사례 누적 중. scoring_rules.ts 의 가중치 후보 검토."
      });
    }
    if (lowSell > 0) {
      scoringImprovements.push({
        issue: "LOW_SELL_SIGNAL",
        count: lowSell,
        recommendation: "판매 신호가 약한 후보가 자주 들어옵니다. commerceSignal 가중치를 검토하세요."
      });
    }

    const evIssues = s.evidenceIssueCounts.EVIDENCE_INSUFFICIENT;
    const urlIssues = s.evidenceIssueCounts.URL_INACCESSIBLE;
    const evidenceImprovements: FeedbackImprovements["evidenceImprovements"] = [];
    if (evIssues > 0) {
      evidenceImprovements.push({
        issue: "EVIDENCE_INSUFFICIENT",
        count: evIssues,
        recommendation:
          evIssues >= 5
            ? "증거 부족 사례가 5건 이상입니다. Evidence Package 생성 시 캡처/문구 위치 누락 검사를 보강하세요."
            : "Evidence Package 생성 흐름의 누락 가능 항목을 검토 대상으로 기록하세요."
      });
    }
    if (urlIssues > 0) {
      evidenceImprovements.push({
        issue: "URL_INACCESSIBLE",
        count: urlIssues,
        recommendation: "후보 단계에서 접근 가능 여부 사전 검사를 검토하세요."
      });
    }

    return { ruleImprovements, promptImprovements, scoringImprovements, evidenceImprovements };
  }
}

export function createFeedbackRepository(): IFeedbackRepository {
  if (config.feedback.useDb) {
    console.warn(
      "[FeedbackRepository] FEEDBACK_USE_DB=true 설정이지만 Prisma 구현은 아직 미연결입니다. JSON 저장소를 사용합니다."
    );
  }
  return new JsonFeedbackRepository();
}

export { FEEDBACK_REASON_CATEGORY_INFO };
