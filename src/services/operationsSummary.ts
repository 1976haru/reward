// 운영 대시보드 요약 (체크리스트 69).
//
// 전체 모듈의 "오늘" 운영 현황을 한 곳에 모아 보여준다. 데이터가 없어도 빈 상태로 안전하게 동작한다.
// 자동 신고/자동 로그인/자동 양식입력은 만들지 않는다. 개인정보 원문은 포함하지 않는다.

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { moduleRegistry } from "../modules/index.js"; // import 시 모듈 등록(bootstrap) 보장
import { listSubsidyOutcomes } from "./subsidyOutcomeTracker.js";
import { createFeedbackRepository } from "../repositories/FeedbackRepository.js";

export interface OperationsModuleStatus {
  id: string;
  name: string;
  category: string;
  status: string;
  locked: boolean; // active/ready 가 아니면 잠금/준비중
}

export interface OperationsSummary {
  date: string;
  todayCounts: {
    collected: number;
    analyzed: number;
    reviewed: number;
    reportDrafts: number;
    manualSubmissions: number;
    outcomes: number;
  };
  modules: OperationsModuleStatus[];
  lockedModules: string[];
  warnings: {
    privacyScanWarnings: number;
    citationFailures: number;
    humanReviewPending: number;
  };
  recentActivity: Array<{ at: string; type: string; summary: string }>;
  isEmpty: boolean;
  emptyStateMessage?: string;
  notices: string[];
  autoReport: false;
  rewardGuaranteed: false;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** baseDir(상대경로) 하위 디렉터리 중 오늘 수정된 것의 개수. 없으면 0(안전). */
async function countDirsModifiedToday(baseDir: string): Promise<number> {
  const root = path.resolve(baseDir);
  const today = todayStr();
  let count = 0;
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const s = await stat(path.join(root, e.name));
        if (s.mtime.toISOString().slice(0, 10) === today) count++;
      } catch {
        /* skip */
      }
    }
  } catch {
    return 0;
  }
  return count;
}

async function sumCounts(baseDirs: string[]): Promise<number> {
  let total = 0;
  for (const d of baseDirs) total += await countDirsModifiedToday(d);
  return total;
}

export interface OperationsSummaryOptions {
  /** 테스트용 베이스 경로 오버라이드. */
  outcomesDir?: string;
}

export async function buildOperationsSummary(options: OperationsSummaryOptions = {}): Promise<OperationsSummary> {
  const date = todayStr();

  // 오늘 카운트 — 각 단계 산출물 run 디렉터리(오늘 수정분) 기준. 없으면 0.
  const collected = await sumCounts(["data/collector/runs", "data/baseline/runs", "data/upload-parser/runs"]);
  const analyzed = await sumCounts([
    "data/risk/runs",
    "data/risk/score/runs",
    "data/reward-score/runs",
    "data/analysis/llm-explanation/runs"
  ]);
  const reportDrafts = await countDirsModifiedToday("data/reports/subsidy");

  // 검토/제출/결과 — feedback, outcomes 기반(오늘).
  let reviewed = 0;
  try {
    const repo = createFeedbackRepository();
    const { items } = await repo.list({ limit: 200 });
    reviewed = items.filter((f) => (f.createdAt ?? "").slice(0, 10) === date).length;
  } catch {
    reviewed = 0;
  }

  let manualSubmissions = 0;
  let outcomes = 0;
  try {
    const records = await listSubsidyOutcomes(options.outcomesDir);
    outcomes = records.filter((r) => (r.updatedAt ?? "").slice(0, 10) === date).length;
    manualSubmissions = records.filter(
      (r) => r.submittedManually && (r.submittedAt ?? r.updatedAt ?? "").slice(0, 10) === date
    ).length;
  } catch {
    /* 0 */
  }

  // 모듈별 현황.
  const modules: OperationsModuleStatus[] = moduleRegistry.list().map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    status: m.status,
    locked: !(m.status === "active" || m.status === "ready")
  }));
  const lockedModules = modules.filter((m) => m.locked).map((m) => m.id);

  // 경고/검토 대기 — best-effort. 개인정보는 포함하지 않는다.
  let privacyScanWarnings = 0;
  let humanReviewPending = 0;
  try {
    const repo = createFeedbackRepository();
    const stats = await repo.stats();
    const byDecision = (stats as { byDecision?: Record<string, number> }).byDecision ?? {};
    humanReviewPending = (byDecision.HOLD ?? 0) + (byDecision.NEEDS_MORE_EVIDENCE ?? 0);
  } catch {
    /* 0 */
  }
  const warnings = { privacyScanWarnings, citationFailures: 0, humanReviewPending };

  // 최근 작업 이력(개인정보 미포함, 마스킹된 outcome 기준).
  const recentActivity: OperationsSummary["recentActivity"] = [];
  try {
    const records = await listSubsidyOutcomes(options.outcomesDir);
    for (const r of records.slice(0, 5)) {
      recentActivity.push({
        at: r.updatedAt,
        type: "subsidy_outcome",
        summary: `${r.candidateId} 상태=${r.status} (자동제출 아님)`
      });
    }
  } catch {
    /* none */
  }

  const totalToday = collected + analyzed + reviewed + reportDrafts + manualSubmissions + outcomes;
  const isEmpty = totalToday === 0 && recentActivity.length === 0;

  return {
    date,
    todayCounts: { collected, analyzed, reviewed, reportDrafts, manualSubmissions, outcomes },
    modules,
    lockedModules,
    warnings,
    recentActivity,
    isEmpty,
    emptyStateMessage: isEmpty ? "오늘 기록된 운영 활동이 아직 없습니다. 일일 작업표에서 1건부터 시작해 보세요." : undefined,
    notices: [
      "운영 현황판은 진행상황 확인용입니다.",
      "의심 후보는 법 위반 확정이 아닙니다.",
      "실제 신고는 사용자가 공식 창구에서 직접 제출합니다."
    ],
    autoReport: false,
    rewardGuaranteed: false
  };
}
