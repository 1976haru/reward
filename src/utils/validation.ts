import { z } from "zod";
import {
  CASE_STATUSES,
  REVIEW_DECISIONS,
  type CaseStatus,
  type ReviewDecision
} from "../types/core.js";

// 입력 길이 상한 — 너무 긴 입력 차단 (UI/저장소 보호)
export const LIMITS = {
  title: 200,
  summary: 2000,
  memo: 3000,
  reviewNote: 3000,
  agencyCandidate: 200,
  riskLevel: 40,
  reviewerName: 80,
  rewardCaution: 1000
} as const;

// 사람 검토 흐름 — 허용된 상태 전이만 진행한다.
// 자동 신고 흐름 자체가 없으므로 SUBMITTED는 "사용자가 직접 제출 후 수동 기록" 의미만 가진다.
export const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ["REVIEW", "REJECTED"],
  REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["REVIEW"],
  REJECTED: ["REVIEW"]
};

export function isAllowedTransition(from: CaseStatus, to: CaseStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function clampRiskScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function riskLevelFromScore(score: number): string {
  const s = clampRiskScore(score);
  if (s >= 80) return "매우 높음";
  if (s >= 60) return "높음";
  if (s >= 30) return "검토 필요";
  return "낮음";
}

export function sanitizeString(value: string | undefined | null, maxLen: number): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

// ---------- zod schemas ----------

const httpUrl = z
  .string()
  .min(1)
  .refine(isHttpUrl, { message: "URL은 http 또는 https 만 허용됩니다." });

export const CreateCaseSchema = z.object({
  moduleId: z.string().min(1).default("false_ad"),
  title: z.string().min(1).max(LIMITS.title),
  url: httpUrl,
  riskScore: z
    .number()
    .or(z.string().transform((v) => Number(v)))
    .optional()
    .transform((v) => (v == null ? 0 : clampRiskScore(Number(v)))),
  riskLevel: z.string().max(LIMITS.riskLevel).optional(),
  agencyCandidate: z.string().max(LIMITS.agencyCandidate).optional(),
  summary: z.string().max(LIMITS.summary).optional(),
  memo: z.string().max(LIMITS.memo).optional(),
  rewardCaution: z.string().max(LIMITS.rewardCaution).optional()
});
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;

export const PatchCaseSchema = z
  .object({
    title: z.string().min(1).max(LIMITS.title).optional(),
    summary: z.string().max(LIMITS.summary).optional(),
    memo: z.string().max(LIMITS.memo).optional(),
    agencyCandidate: z.string().max(LIMITS.agencyCandidate).optional(),
    rewardCaution: z.string().max(LIMITS.rewardCaution).optional(),
    riskLevel: z.string().max(LIMITS.riskLevel).optional(),
    riskScore: z
      .number()
      .or(z.string().transform((v) => Number(v)))
      .optional()
      .transform((v) => (v == null ? undefined : clampRiskScore(Number(v))))
  })
  .strict();
export type PatchCaseInput = z.infer<typeof PatchCaseSchema>;

export const PatchStatusSchema = z.object({
  status: z.enum(CASE_STATUSES),
  reviewerName: z.string().max(LIMITS.reviewerName).optional(),
  note: z.string().max(LIMITS.reviewNote).optional(),
  confirmManualSubmission: z.boolean().optional()
});
export type PatchStatusInput = z.infer<typeof PatchStatusSchema>;

export const CreateReviewSchema = z.object({
  reviewerName: z.string().min(1).max(LIMITS.reviewerName),
  decision: z.enum(REVIEW_DECISIONS),
  notes: z.string().max(LIMITS.reviewNote).optional()
});
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

export const ListCasesQuerySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  moduleId: z.string().optional(),
  minRiskScore: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().min(0).max(100))
    .optional(),
  limit: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1).max(200))
    .optional(),
  offset: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0))
    .optional()
});
export type ListCasesQuery = z.infer<typeof ListCasesQuerySchema>;

// SUBMITTED 전환에 대한 추가 안전 확인
export function requiresManualSubmissionConfirmation(input: PatchStatusInput): boolean {
  if (input.status !== "SUBMITTED") return false;
  if (input.confirmManualSubmission === true) return false;
  const note = sanitizeString(input.note, LIMITS.reviewNote) ?? "";
  // 사람이 직접 제출했다는 의미가 포함된 메모면 허용
  return !/직접\s*제출|수동\s*제출|manual(ly)?\s*submitted/i.test(note);
}

// 외부 정규화 — 레거시 lowercase 상태 → 새 enum
const LEGACY_TO_NEW: Record<string, CaseStatus> = {
  draft: "DRAFT",
  needs_review: "REVIEW",
  ready_to_report: "APPROVED",
  reported: "SUBMITTED",
  rejected: "REJECTED",
  archived: "REJECTED"
};

export function normalizeStatus(raw: unknown): CaseStatus {
  if (typeof raw !== "string") return "DRAFT";
  const upper = raw.toUpperCase();
  if ((CASE_STATUSES as readonly string[]).includes(upper)) return upper as CaseStatus;
  const mapped = LEGACY_TO_NEW[raw.toLowerCase()];
  return mapped ?? "DRAFT";
}

export type { CaseStatus, ReviewDecision };
