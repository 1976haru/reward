import path from "node:path";
import { readJson } from "../../utils/fs.js";
import { config } from "../../utils/config.js";
import { createCaseRepository } from "../../repositories/CaseRepository.js";
import { CandidateRepository } from "../../repositories/CandidateRepository.js";
import { createFeedbackRepository } from "../../repositories/FeedbackRepository.js";
import { createEvalRepository } from "../../repositories/EvalRepository.js";
import { schedulerService } from "../scheduler/SchedulerService.js";
import { moduleRegistry } from "../../modules/index.js";
import { EvidenceService } from "../EvidenceService.js";
import { ReportService } from "../ReportService.js";
import type { RewardCase, CaseStatus } from "../../types/core.js";

const DASHBOARD_SAFETY_NOTICE =
  "이 대시보드는 후보 발굴·분석·검토 현황을 보여주는 내부 운영 화면입니다. 시스템은 외부 신고기관에 자동 제출하지 않으며, 모든 제출은 사람이 공식 창구에서 직접 수행해야 합니다. 포상금 수령 여부를 예측하지 않습니다.";

export interface DashboardKpi {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  cls?: "ok" | "warn" | "danger" | "muted";
}

export interface DashboardTodaySummary {
  date: string;             // YYYY-MM-DD (UTC)
  collectedCandidates: number;
  newCases: number;
  inReview: number;
  reportDrafts: number;
  submittedRecords: number;
  feedbackEntries: number;
}

export interface DashboardTopCandidate {
  id: string;
  title: string;
  url: string;
  moduleId: string;
  status: CaseStatus | string;
  priorityScore: number;
  agencyCandidate?: string;
  hasEvidence: boolean;
  hasReport: boolean;
  createdAt: string;
}

export interface DashboardModulePerformance {
  moduleId: string;
  name: string;
  status: string;
  active: boolean;
  candidates: number;
  cases: number;
  reportDrafts: number;
  submittedRecords: number;
}

export interface DashboardSchedulerSummary {
  enabled: boolean;
  cron?: string;
  latestRun?: {
    runId: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    totalFound?: number;
    totalSaved?: number;
    duplicatesRemoved?: number;
    durationMs?: number;
  } | null;
  recentCount: number;
}

export interface DashboardDedupeSummary {
  exists: boolean;
  duplicateRate: number;    // 0..1
  total: number;
  kept: number;
  duplicates: number;
  generatedAt?: string;
}

export interface DashboardFeedbackSummary {
  total: number;
  falsePositives: number;
  evidenceInsufficient: number;
  duplicates: number;
  topRuleFalsePositiveIds: Array<{ ruleId: string; count: number }>;
  topReasonCategories: Array<{ code: string; count: number }>;
}

export interface DashboardEvalSummary {
  exists: boolean;
  runId?: string;
  evalSetId?: string;
  ranAt?: string;
  threshold?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  accuracy?: number;
  confusion?: { TP: number; FP: number; TN: number; FN: number };
  falsePositiveCount?: number;
  falseNegativeCount?: number;
}

export interface DashboardQueueSummary {
  total: number;
  counts: Partial<Record<CaseStatus, number>>;
}

export interface DashboardSummary {
  schemaVersion: "1.0.0";
  generatedAt: string;
  today: DashboardTodaySummary;
  kpis: DashboardKpi[];
  queue: DashboardQueueSummary;
  topCandidates: DashboardTopCandidate[];
  modules: DashboardModulePerformance[];
  evalMetrics: DashboardEvalSummary;
  scheduler: DashboardSchedulerSummary;
  dedupe: DashboardDedupeSummary;
  feedback: DashboardFeedbackSummary;
  safetyNotice: string;
  autoReport: false;
  humanReviewRequired: true;
}

function todayKey(now: Date): string {
  // UTC 기준 YYYY-MM-DD
  return now.toISOString().slice(0, 10);
}

function isToday(iso: string, today: string): boolean {
  return typeof iso === "string" && iso.slice(0, 10) === today;
}

function clampRate(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export class DashboardService {
  private readonly caseRepo = createCaseRepository();
  private readonly candidateRepo = new CandidateRepository();
  private readonly feedbackRepo = createFeedbackRepository();
  private readonly evalRepo = createEvalRepository();
  private readonly evidence = new EvidenceService();
  private readonly reports = new ReportService();

  async getSummary(): Promise<DashboardSummary> {
    const now = new Date();
    const today = todayKey(now);

    // 1) Cases
    const allCases = await this.caseRepo.list({ limit: 500, offset: 0 });
    const cases = allCases.cases;
    const queueCounts: Partial<Record<CaseStatus, number>> = {
      DRAFT: 0, REVIEW: 0, HOLD: 0, APPROVED: 0,
      REPORT_DRAFT: 0, SUBMITTED: 0, OUTCOME_CHECK: 0, REJECTED: 0
    };
    let newCasesToday = 0;
    let submittedRecords = 0;
    let inReview = 0;
    let reportDrafts = 0;
    let reportDraftsToday = 0;
    let submittedRecordsToday = 0;
    for (const c of cases) {
      const s = c.status as CaseStatus;
      queueCounts[s] = (queueCounts[s] ?? 0) + 1;
      if (isToday(c.createdAt, today)) newCasesToday += 1;
      if (s === "REVIEW" || s === "HOLD") inReview += 1;
      if (s === "REPORT_DRAFT") reportDrafts += 1;
      if (s === "SUBMITTED") submittedRecords += 1;
      // 마지막 상태 전이로 오늘 발생한 흐름 파악
      const lastTransition = c.statusHistory?.[c.statusHistory.length - 1];
      if (lastTransition && isToday(lastTransition.at, today)) {
        if (lastTransition.to === "REPORT_DRAFT") reportDraftsToday += 1;
        if (lastTransition.to === "SUBMITTED") submittedRecordsToday += 1;
      }
    }

    // 2) Candidates
    const candidates = await this.candidateRepo.list({});
    const collectedToday = candidates.filter((c) => isToday(c.foundAt, today)).length;

    // 3) Feedback
    let feedbackStats;
    try {
      feedbackStats = await this.feedbackRepo.stats();
    } catch {
      feedbackStats = {
        total: 0,
        byDecision: {},
        byReasonCategory: {},
        topRuleFalsePositiveIds: [],
        topKeywordFalsePositives: [],
        evidenceIssueCounts: { EVIDENCE_INSUFFICIENT: 0, URL_INACCESSIBLE: 0 }
      };
    }
    const feedbackList = await this.feedbackRepo.list({ limit: 200 });
    const feedbackToday = feedbackList.items.filter((f) => isToday(f.createdAt, today)).length;
    const topReasonCategories = Object.entries(feedbackStats.byReasonCategory)
      .map(([code, count]) => ({ code, count: count as number }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const feedbackSummary: DashboardFeedbackSummary = {
      total: feedbackStats.total,
      falsePositives:
        (feedbackStats.byDecision["FALSE_POSITIVE"] ?? 0) +
        (feedbackStats.byReasonCategory["RULE_FALSE_POSITIVE"] ?? 0),
      evidenceInsufficient: feedbackStats.evidenceIssueCounts.EVIDENCE_INSUFFICIENT,
      duplicates:
        (feedbackStats.byDecision["DUPLICATE"] ?? 0) +
        (feedbackStats.byReasonCategory["DUPLICATE_CANDIDATE"] ?? 0),
      topRuleFalsePositiveIds: feedbackStats.topRuleFalsePositiveIds.slice(0, 5),
      topReasonCategories
    };

    // 4) Eval (latest)
    const latestEval = await this.evalRepo.getLatest();
    const evalSummary: DashboardEvalSummary = latestEval
      ? {
          exists: true,
          runId: latestEval.runId,
          evalSetId: latestEval.evalSetId,
          ranAt: latestEval.ranAt,
          threshold: latestEval.threshold,
          precision: latestEval.metrics.precision,
          recall: latestEval.metrics.recall,
          f1: latestEval.metrics.f1,
          accuracy: latestEval.metrics.accuracy,
          confusion: latestEval.metrics.confusion,
          falsePositiveCount: latestEval.metrics.confusion.FP,
          falseNegativeCount: latestEval.metrics.confusion.FN
        }
      : { exists: false };

    // 5) Scheduler
    const schedulerStatus = await schedulerService.getStatus().catch(() => null);
    const recentRuns = await schedulerService.listRuns(10).catch(() => [] as Array<{ id?: string; runId?: string }>);
    const latestRun = (await schedulerService.getLatestRun().catch(() => null)) as null | {
      runId?: string;
      id?: string;
      status?: string;
      startedAt?: string;
      finishedAt?: string;
      durationMs?: number;
      result?: { totalFound?: number; totalSaved?: number; duplicatesRemoved?: number };
    };
    const schedulerSummary: DashboardSchedulerSummary = {
      enabled: Boolean(schedulerStatus?.enabled),
      cron: schedulerStatus?.cron,
      recentCount: recentRuns.length,
      latestRun: latestRun
        ? {
            runId: latestRun.runId ?? latestRun.id ?? "",
            status: latestRun.status ?? "UNKNOWN",
            startedAt: latestRun.startedAt,
            finishedAt: latestRun.finishedAt,
            totalFound: latestRun.result?.totalFound,
            totalSaved: latestRun.result?.totalSaved,
            duplicatesRemoved: latestRun.result?.duplicatesRemoved,
            durationMs: latestRun.durationMs
          }
        : null
    };

    // 6) Dedupe latest-report.json
    const dedupePath = path.join(config.dataDir, "dedupe", "latest-report.json");
    let dedupeSummary: DashboardDedupeSummary = {
      exists: false, duplicateRate: 0, total: 0, kept: 0, duplicates: 0
    };
    try {
      const rep = await readJson<{
        summary: { total: number; kept: number; duplicates: number; duplicateRate: number };
        generatedAt: string;
      }>(dedupePath);
      dedupeSummary = {
        exists: true,
        duplicateRate: clampRate(rep.summary?.duplicateRate ?? 0),
        total: rep.summary?.total ?? 0,
        kept: rep.summary?.kept ?? 0,
        duplicates: rep.summary?.duplicates ?? 0,
        generatedAt: rep.generatedAt
      };
    } catch {
      // 파일이 없으면 기본값
    }

    // 7) TOP candidates — Case 기준 (우선순위 점수 정렬)
    const topCandidates = await this.buildTopCandidates(cases, 10);

    // 8) Module performance
    const modules: DashboardModulePerformance[] = moduleRegistry.list().map((m) => {
      const inMod = (c: RewardCase) => c.moduleId === m.id;
      const modCases = cases.filter(inMod);
      const modCandidates = candidates.filter((c) => c.moduleId === m.id);
      return {
        moduleId: m.id,
        name: m.name,
        status: m.status,
        active: m.status === "active",
        candidates: modCandidates.length,
        cases: modCases.length,
        reportDrafts: modCases.filter((c) => c.status === "REPORT_DRAFT").length,
        submittedRecords: modCases.filter((c) => c.status === "SUBMITTED").length
      };
    });

    // 9) Today summary
    const todaySummary: DashboardTodaySummary = {
      date: today,
      collectedCandidates: collectedToday,
      newCases: newCasesToday,
      inReview,
      reportDrafts,
      submittedRecords,
      feedbackEntries: feedbackToday
    };

    // 10) KPI 카드
    const kpis: DashboardKpi[] = [
      { key: "candidates_today", label: "오늘 수집 후보", value: collectedToday, cls: "ok", hint: "Scout/수동 등록 합계" },
      { key: "cases_today", label: "오늘 생성 Case", value: newCasesToday, cls: "ok" },
      { key: "in_review", label: "검토 대기", value: inReview, cls: inReview > 0 ? "warn" : "muted" },
      { key: "report_drafts", label: "신고서 초안", value: reportDrafts, cls: "muted" },
      {
        key: "submitted_records",
        label: "제출 기록",
        value: submittedRecords,
        cls: "muted",
        hint: "사람이 외부 공식 창구에서 직접 제출한 뒤 내부 기록으로 표시한 건수입니다. 자동 제출이 아닙니다."
      },
      {
        key: "feedback_fp",
        label: "오탐/피드백",
        value: feedbackSummary.falsePositives,
        cls: feedbackSummary.falsePositives > 0 ? "warn" : "muted"
      },
      {
        key: "eval_f1",
        label: "최신 F1",
        value: evalSummary.exists && typeof evalSummary.f1 === "number" ? evalSummary.f1.toFixed(3) : "—",
        cls: "ok",
        hint: evalSummary.exists ? `runId ${evalSummary.runId}` : "아직 평가 실행 없음"
      },
      {
        key: "dedupe_rate",
        label: "중복률",
        value: dedupeSummary.exists ? (dedupeSummary.duplicateRate * 100).toFixed(1) + "%" : "—",
        cls: "muted"
      }
    ];

    return {
      schemaVersion: "1.0.0",
      generatedAt: now.toISOString(),
      today: todaySummary,
      kpis,
      queue: { total: cases.length, counts: queueCounts },
      topCandidates,
      modules,
      evalMetrics: evalSummary,
      scheduler: schedulerSummary,
      dedupe: dedupeSummary,
      feedback: feedbackSummary,
      safetyNotice: DASHBOARD_SAFETY_NOTICE,
      autoReport: false,
      humanReviewRequired: true
    };
  }

  async getTopCandidates(limit = 10): Promise<DashboardTopCandidate[]> {
    const all = await this.caseRepo.list({ limit: 500, offset: 0 });
    return this.buildTopCandidates(all.cases, limit);
  }

  async getModulePerformance(): Promise<DashboardModulePerformance[]> {
    const all = await this.caseRepo.list({ limit: 500, offset: 0 });
    const candidates = await this.candidateRepo.list({});
    return moduleRegistry.list().map((m) => {
      const modCases = all.cases.filter((c) => c.moduleId === m.id);
      const modCandidates = candidates.filter((c) => c.moduleId === m.id);
      return {
        moduleId: m.id,
        name: m.name,
        status: m.status,
        active: m.status === "active",
        candidates: modCandidates.length,
        cases: modCases.length,
        reportDrafts: modCases.filter((c) => c.status === "REPORT_DRAFT").length,
        submittedRecords: modCases.filter((c) => c.status === "SUBMITTED").length
      };
    });
  }

  async getQuality(): Promise<{
    eval: DashboardEvalSummary;
    feedback: DashboardFeedbackSummary;
    safetyNotice: string;
  }> {
    const summary = await this.getSummary();
    return {
      eval: summary.evalMetrics,
      feedback: summary.feedback,
      safetyNotice: DASHBOARD_SAFETY_NOTICE
    };
  }

  private async buildTopCandidates(
    cases: RewardCase[],
    limit: number
  ): Promise<DashboardTopCandidate[]> {
    const sorted = [...cases].sort((a, b) => {
      const sa = a.riskScore ?? a.score ?? 0;
      const sb = b.riskScore ?? b.score ?? 0;
      if (sb !== sa) return sb - sa;
      return b.createdAt.localeCompare(a.createdAt);
    }).slice(0, Math.max(1, Math.min(50, limit)));

    return Promise.all(
      sorted.map(async (c) => {
        let hasEvidence = false;
        let hasReport = false;
        try {
          const ev = await this.evidence.summarizePackage(c.id);
          hasEvidence = Boolean(ev.exists && (ev.hasHtml || ev.hasScreenshot || ev.hasPdf));
        } catch { /* ignore */ }
        try {
          const rs = await this.reports.summarizeReport(c.id);
          hasReport = Boolean(rs.exists && (rs.hasMarkdown || rs.hasDocx));
        } catch { /* ignore */ }
        return {
          id: c.id,
          title: c.title,
          url: c.url,
          moduleId: c.moduleId,
          status: c.status,
          priorityScore: c.riskScore ?? c.score ?? 0,
          agencyCandidate: c.agencyCandidate,
          hasEvidence,
          hasReport,
          createdAt: c.createdAt
        };
      })
    );
  }
}

export const dashboardService = new DashboardService();
export { DASHBOARD_SAFETY_NOTICE };
