// 보조금 결과·보상 기록 + 상태 전이 안전장치 (체크리스트 68).
//
// - submittedManually=true & confirmManualSubmission=true + recorder/reviewer + agencyName +
//   externalReceiptNo/referenceNumber + manualSubmissionNote 없이는 submitted_manually 로 전환하지 않는다.
// - rewardAmount 는 rewardConfirmedAt(실제 지급 확인)이 있을 때만 저장한다(예상액 저장 금지).
// - 모든 텍스트 필드는 저장 전 마스킹한다(개인정보/API 키 원문 제거).
// - 산출물은 data/outcomes/subsidy/{candidateId}/ (gitignore).

import { mkdir, readFile, readdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import {
  SUBSIDY_OUTCOME_NOTICE,
  type SubsidyOutcomeInput,
  type SubsidyOutcomeRecord,
  type SubsidyOutcomeStatus,
  type SubsidyStateChangeLogEntry
} from "../types/subsidyOutcome.js";

const DEFAULT_DIR = "data/outcomes/subsidy";

/** outcome 상태 전이 규칙(자동 submitted 금지 — 가드 충족 시에만 submitted_manually). */
const OUTCOME_STATUS_TRANSITIONS: Record<SubsidyOutcomeStatus, SubsidyOutcomeStatus[]> = {
  draft: ["submitted_manually", "rejected", "unknown"],
  submitted_manually: ["under_review", "completed", "rejected", "unknown"],
  under_review: ["completed", "rejected", "unknown"],
  completed: ["unknown"],
  rejected: ["draft", "unknown"],
  unknown: ["draft", "submitted_manually", "under_review", "completed", "rejected"]
};

export interface OutcomeOpResult {
  ok: boolean;
  code?: string;
  message?: string;
  record?: SubsidyOutcomeRecord;
  warnings: string[];
}

// ---------- 유틸 ----------

function mask(v: unknown): string | undefined {
  if (typeof v !== "string" || v.trim().length === 0) return undefined;
  return sanitizeForStorage(v).sanitizedText.trim() || undefined;
}

function safeCandidateDir(candidateId: string): string {
  return candidateId.replace(/[^A-Za-z0-9_\-:.]+/g, "_").slice(0, 80) || "candidate";
}

function outcomePaths(baseDir: string, candidateId: string) {
  const dir = path.join(baseDir, safeCandidateDir(candidateId));
  return {
    dir,
    file: path.join(dir, "outcome.json"),
    log: path.join(dir, "state-log.jsonl")
  };
}

/** 직접 제출 기록 생성/전환 가드 충족 여부. */
export function isManualSubmissionConfirmed(input: SubsidyOutcomeInput): boolean {
  return Boolean(
    input.submittedManually === true &&
      input.confirmManualSubmission === true &&
      (mask(input.recorderName) || mask(input.reviewerName)) &&
      mask(input.agencyName) &&
      (mask(input.externalReceiptNo) || mask(input.referenceNumber)) &&
      mask(input.manualSubmissionNote)
  );
}

async function readRecord(baseDir: string, candidateId: string): Promise<SubsidyOutcomeRecord | null> {
  try {
    const { file } = outcomePaths(baseDir, candidateId);
    return JSON.parse(await readFile(file, "utf8")) as SubsidyOutcomeRecord;
  } catch {
    return null;
  }
}

async function persist(
  baseDir: string,
  record: SubsidyOutcomeRecord,
  logEntry: SubsidyStateChangeLogEntry
): Promise<void> {
  const { dir, file, log } = outcomePaths(baseDir, record.candidateId);
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(record, null, 2), "utf8");
  await appendFile(log, JSON.stringify(logEntry) + "\n", "utf8");
}

function buildLogEntry(
  candidateId: string,
  fromStatus: string,
  toStatus: string,
  changedBy: string,
  reason: string,
  confirmManualSubmission: boolean
): SubsidyStateChangeLogEntry {
  return {
    candidateId,
    fromStatus,
    toStatus,
    changedAt: new Date().toISOString(),
    changedBy: mask(changedBy) ?? "unknown",
    reason: mask(reason) ?? "",
    confirmManualSubmission
  };
}

/** rewardAmount 는 rewardConfirmedAt 가 있을 때만 허용(예상액/자동산정액 저장 금지). */
function resolveReward(input: SubsidyOutcomeInput, warnings: string[]): { rewardAmount?: number; rewardConfirmedAt?: string } {
  if (input.rewardAmount === undefined) return {};
  if (!input.rewardConfirmedAt) {
    warnings.push("rewardAmount 는 실제 지급 확인일(rewardConfirmedAt) 없이 저장하지 않습니다. 예상액/자동산정액은 기록하지 않습니다.");
    return {};
  }
  if (typeof input.rewardAmount !== "number" || !Number.isFinite(input.rewardAmount) || input.rewardAmount < 0) {
    warnings.push("rewardAmount 형식이 올바르지 않아 저장하지 않았습니다.");
    return {};
  }
  return { rewardAmount: input.rewardAmount, rewardConfirmedAt: mask(input.rewardConfirmedAt) };
}

// ---------- 기록(생성) ----------

export async function recordSubsidyOutcome(
  input: SubsidyOutcomeInput,
  baseDir: string = DEFAULT_DIR
): Promise<OutcomeOpResult> {
  const warnings: string[] = [];
  const candidateId = mask(input.candidateId);
  if (!candidateId) return { ok: false, code: "INVALID_CANDIDATE_ID", message: "candidateId 가 필요합니다.", warnings };

  const wantsSubmission = input.submittedManually === true || input.status === "submitted_manually";
  const confirmed = isManualSubmissionConfirmed(input);

  if (wantsSubmission && !confirmed) {
    return {
      ok: false,
      code: "MANUAL_SUBMISSION_NOT_CONFIRMED",
      message:
        "직접 제출 기록을 만들려면 submittedManually=true, confirmManualSubmission=true, 기록자(recorder/reviewer), 신고기관(agencyName), 접수번호(externalReceiptNo 또는 referenceNumber), 수동제출 메모(manualSubmissionNote)가 모두 필요합니다.",
      warnings
    };
  }

  const existing = await readRecord(baseDir, candidateId);
  const fromStatus = existing?.status ?? "draft";

  // 외부 접수번호 등 근거 없이는 submitted 상태로 전환하지 않는다.
  const status: SubsidyOutcomeStatus = confirmed ? "submitted_manually" : "draft";
  const reward = resolveReward(input, warnings);
  const now = new Date().toISOString();

  const record: SubsidyOutcomeRecord = {
    candidateId,
    caseId: mask(input.caseId),
    moduleId: "subsidy_fraud",
    submittedManually: confirmed,
    confirmManualSubmission: Boolean(input.confirmManualSubmission),
    recorderName: mask(input.recorderName),
    reviewerName: mask(input.reviewerName),
    agencyName: mask(input.agencyName),
    officialUrl: mask(input.officialUrl),
    externalReceiptNo: mask(input.externalReceiptNo),
    referenceNumber: mask(input.referenceNumber),
    manualSubmissionNote: mask(input.manualSubmissionNote),
    submittedAt: confirmed ? mask(input.submittedAt) ?? now : undefined,
    status,
    decision: mask(input.decision),
    result: mask(input.result),
    rewardRelated: Boolean(input.rewardRelated),
    ...reward,
    rewardGuaranteed: false,
    autoSubmitted: false,
    notLegalConclusion: true,
    memo: mask(input.memo),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    stateLog: existing?.stateLog ?? []
  };

  const logEntry = buildLogEntry(
    candidateId,
    fromStatus,
    status,
    input.recorderName ?? input.reviewerName ?? "unknown",
    confirmed ? "사용자 직접 제출 확인 후 수동 제출 기록" : "초안/사전 기록(직접 제출 미확인)",
    Boolean(input.confirmManualSubmission)
  );
  record.stateLog = [...record.stateLog, logEntry];

  await persist(baseDir, record, logEntry);
  return { ok: true, record, warnings };
}

// ---------- 업데이트(상태 전이) ----------

export interface SubsidyOutcomePatch extends Partial<SubsidyOutcomeInput> {
  status?: SubsidyOutcomeStatus;
  changedBy?: string;
  reason?: string;
}

export async function updateSubsidyOutcome(
  candidateId: string,
  patch: SubsidyOutcomePatch,
  baseDir: string = DEFAULT_DIR
): Promise<OutcomeOpResult> {
  const warnings: string[] = [];
  const safeId = mask(candidateId);
  if (!safeId) return { ok: false, code: "INVALID_CANDIDATE_ID", message: "candidateId 가 필요합니다.", warnings };
  const existing = await readRecord(baseDir, safeId);
  if (!existing) return { ok: false, code: "OUTCOME_NOT_FOUND", message: "기록이 없습니다. 먼저 결과를 기록하세요.", warnings };

  const targetStatus = (patch.status ?? existing.status) as SubsidyOutcomeStatus;
  if (targetStatus !== existing.status) {
    const allowed = OUTCOME_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `상태 전이가 허용되지 않습니다: ${existing.status} → ${targetStatus}.`,
        warnings
      };
    }
    // submitted_manually 전환 가드.
    if (targetStatus === "submitted_manually") {
      const confirmed = isManualSubmissionConfirmed({
        candidateId: safeId,
        submittedManually: true,
        confirmManualSubmission: patch.confirmManualSubmission,
        recorderName: patch.recorderName ?? existing.recorderName,
        reviewerName: patch.reviewerName ?? existing.reviewerName,
        agencyName: patch.agencyName ?? existing.agencyName,
        externalReceiptNo: patch.externalReceiptNo ?? existing.externalReceiptNo,
        referenceNumber: patch.referenceNumber ?? existing.referenceNumber,
        manualSubmissionNote: patch.manualSubmissionNote ?? existing.manualSubmissionNote
      });
      if (!confirmed) {
        return {
          ok: false,
          code: "MANUAL_SUBMISSION_NOT_CONFIRMED",
          message: "submitted_manually 전환에는 confirmManualSubmission, 기록자, 신고기관, 접수번호, 수동제출 메모가 필요합니다.",
          warnings
        };
      }
    }
  }

  const reward = resolveReward({ ...patch, candidateId: safeId } as SubsidyOutcomeInput, warnings);
  const now = new Date().toISOString();
  const updated: SubsidyOutcomeRecord = {
    ...existing,
    caseId: mask(patch.caseId) ?? existing.caseId,
    recorderName: mask(patch.recorderName) ?? existing.recorderName,
    reviewerName: mask(patch.reviewerName) ?? existing.reviewerName,
    agencyName: mask(patch.agencyName) ?? existing.agencyName,
    officialUrl: mask(patch.officialUrl) ?? existing.officialUrl,
    externalReceiptNo: mask(patch.externalReceiptNo) ?? existing.externalReceiptNo,
    referenceNumber: mask(patch.referenceNumber) ?? existing.referenceNumber,
    manualSubmissionNote: mask(patch.manualSubmissionNote) ?? existing.manualSubmissionNote,
    submittedAt: mask(patch.submittedAt) ?? existing.submittedAt,
    status: targetStatus,
    submittedManually: targetStatus === "submitted_manually" ? true : existing.submittedManually,
    decision: mask(patch.decision) ?? existing.decision,
    result: mask(patch.result) ?? existing.result,
    rewardRelated: patch.rewardRelated ?? existing.rewardRelated,
    rewardAmount: reward.rewardAmount ?? existing.rewardAmount,
    rewardConfirmedAt: reward.rewardConfirmedAt ?? existing.rewardConfirmedAt,
    rewardGuaranteed: false,
    autoSubmitted: false,
    notLegalConclusion: true,
    memo: mask(patch.memo) ?? existing.memo,
    updatedAt: now
  };

  const logEntry = buildLogEntry(
    safeId,
    existing.status,
    targetStatus,
    patch.changedBy ?? patch.recorderName ?? patch.reviewerName ?? "unknown",
    patch.reason ?? "상태/결과 업데이트",
    Boolean(patch.confirmManualSubmission)
  );
  updated.stateLog = [...existing.stateLog, logEntry];

  await persist(baseDir, updated, logEntry);
  return { ok: true, record: updated, warnings };
}

// ---------- 조회 ----------

export async function getSubsidyOutcome(
  candidateId: string,
  baseDir: string = DEFAULT_DIR
): Promise<SubsidyOutcomeRecord | null> {
  const safeId = mask(candidateId);
  if (!safeId) return null;
  return readRecord(baseDir, safeId);
}

export async function listSubsidyOutcomes(baseDir: string = DEFAULT_DIR): Promise<SubsidyOutcomeRecord[]> {
  const root = path.resolve(baseDir);
  let dirs: string[] = [];
  try {
    dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const out: SubsidyOutcomeRecord[] = [];
  for (const d of dirs) {
    const r = await readRecord(baseDir, d);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export { SUBSIDY_OUTCOME_NOTICE };
