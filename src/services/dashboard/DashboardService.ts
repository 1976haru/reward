import path from "node:path";
import { readFileSync } from "node:fs";
import { readJson } from "../../utils/fs.js";
import { config } from "../../utils/config.js";
import { createCaseRepository } from "../../repositories/CaseRepository.js";
import { CandidateRepository } from "../../repositories/CandidateRepository.js";
import { createFeedbackRepository } from "../../repositories/FeedbackRepository.js";
import { createEvalRepository } from "../../repositories/EvalRepository.js";
import { createOutcomeRepository } from "../../repositories/OutcomeRepository.js";
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

export interface DashboardOutcomeSummary {
  total: number;
  submittedCount: number;
  receivedCount: number;
  inReviewCount: number;
  supplementRequestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  rewardReviewCount: number;
  rewardPaidCount: number;
  followUpDueCount: number;
  // 사용자 입력 지급 확인 금액 합계 — 예측이 아님
  rewardPaidAmountTotal: number;
  rewardPaidEntries: number;
}

export type RuntimeMode = "MOCK" | "MIXED" | "REAL_READY";

export type ReadinessStage =
  | "SETUP_REQUIRED"
  | "MOCK_VALIDATION"
  | "MANUAL_URL_TEST"
  | "API_KEY_REQUIRED"
  | "REAL_DATA_TEST"
  | "HUMAN_REVIEW_READY"
  | "OPERATION_READY";

export interface DashboardAppInfo {
  name: string;
  version: string;
  environment: string;
}

export interface DashboardModeInfo {
  mockAi: boolean;
  mockScout: boolean;
  useDb: boolean;
  schedulerEnabled: boolean;
  scoutMode: "mock" | "real";
  runtimeMode: RuntimeMode;
  nodeEnv: string;
  label: string;
}

export interface DashboardApiConnections {
  openai: {
    configured: boolean;
    mock: boolean;
    label: string;
  };
  naver: {
    configured: boolean;
    mock: boolean;
    label: string;
  };
}

export interface DashboardReadiness {
  stage: ReadinessStage;
  label: string;
  canAutoSubmit: false;
  humanReviewRequired: true;
  notes: string[];
}

export interface DashboardGuideLink {
  label: string;
  href: string;
}

export type DashboardNoticeLevel = "info" | "warning" | "danger" | "success";
export type DashboardNoticeCategory =
  | "policy"
  | "api"
  | "safety"
  | "readiness"
  | "privacy"
  | "other";

export interface DashboardNotice {
  id: string;
  level: DashboardNoticeLevel;
  title: string;
  message: string;
  category: DashboardNoticeCategory;
  lastReviewedAt?: string;
  actionLabel?: string;
  actionTarget?: string;
}

export interface DashboardSummary {
  schemaVersion: "1.0.0";
  generatedAt: string;
  todayDate: string;
  today: DashboardTodaySummary;
  app: DashboardAppInfo;
  mode: DashboardModeInfo;
  apiConnections: DashboardApiConnections;
  readiness: DashboardReadiness;
  guideLinks: DashboardGuideLink[];
  homeNotices: string[];
  notices: DashboardNotice[];
  kpis: DashboardKpi[];
  queue: DashboardQueueSummary;
  topCandidates: DashboardTopCandidate[];
  modules: DashboardModulePerformance[];
  evalMetrics: DashboardEvalSummary;
  scheduler: DashboardSchedulerSummary;
  dedupe: DashboardDedupeSummary;
  feedback: DashboardFeedbackSummary;
  outcome: DashboardOutcomeSummary;
  safetyNotice: string;
  autoReport: false;
  humanReviewRequired: true;
}

const FALLBACK_APP_VERSION = "0.1.0";
// 사용자 화면 / API 응답에 표시되는 제품명 — package.json 의 npm name 과 분리.
// package.json.name 은 npm/내부 repo 식별자이며, UI 표시명은 항상 공익레이더(또는 PRODUCT_DISPLAY_NAME env override).
const PRODUCT_DISPLAY_NAME = process.env.PRODUCT_DISPLAY_NAME?.trim() || "애드세이프(AdSafe)";
const PRODUCT_INTERNAL_NAME = "reward-agent-mvp";

let cachedAppInfo: { name: string; version: string } | null = null;
function readAppInfo(): { name: string; version: string } {
  if (cachedAppInfo) return cachedAppInfo;
  let version = FALLBACK_APP_VERSION;
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      version = parsed.version;
    }
  } catch { /* fallback version */ }
  cachedAppInfo = { name: PRODUCT_DISPLAY_NAME, version };
  return cachedAppInfo;
}

export { PRODUCT_DISPLAY_NAME, PRODUCT_INTERNAL_NAME };

// 공지 카드의 "공식 기준 최근 재확인일" — 기관별 신고처/포상 기준이 바뀔 수 있으므로
// 실전 신고 전 사람이 공식 페이지에서 다시 확인해야 한다. 이 날짜는 자동 확인이 아니라
// "내부적으로 마지막으로 사람이 점검한 날짜"를 의미한다.
const OFFICIAL_RULE_LAST_REVIEWED_AT = "2026-05-19";

function buildNotices(args: {
  runtimeMode: RuntimeMode;
  openaiConfigured: boolean;
  naverConfigured: boolean;
  stage: ReadinessStage;
  stageLabel: string;
  modeLabel: string;
}): DashboardNotice[] {
  const { runtimeMode, openaiConfigured, naverConfigured, stage, stageLabel, modeLabel } = args;
  const apiAllReady = openaiConfigured && naverConfigured;
  const noKeysAtAll = !openaiConfigured && !naverConfigured;

  return [
    {
      id: "official-rule-check",
      level: "info",
      title: "공식 기준 재확인 필요",
      message:
        "신고포상금 지급 기준과 신고처 안내는 기관별로 변경될 수 있으므로 실전 신고 전 공식 페이지를 다시 확인해야 합니다. 본 도구는 공식 기준을 대체하지 않습니다.",
      category: "policy",
      lastReviewedAt: OFFICIAL_RULE_LAST_REVIEWED_AT,
      actionLabel: "공식 기준 확인",
      actionTarget: "#reward-policy-guide"
    },
    {
      id: "api-key-required",
      level: apiAllReady ? "success" : "warning",
      title: apiAllReady
        ? "API 키 연결 확인됨 (실데이터 검증 필요)"
        : "실데이터 수집 전 API 키 필요",
      message: apiAllReady
        ? "OpenAI / Naver Search API 키가 설정되어 있습니다. 다만 실제 후보 수집 결과는 사람 검토가 필요합니다. 자동 신고는 수행되지 않습니다."
        : noKeysAtAll
          ? "현재 Mock 모드입니다. 실제 후보 자동 발굴을 위해서는 Naver Search API 또는 기타 허용된 검색 소스 설정과 OpenAI 키가 필요합니다."
          : "일부 API 키만 설정되어 있어 Mock과 실제 호출이 혼합됩니다. 실데이터 검증 전 누락된 키를 확인하세요.",
      category: "api",
      actionLabel: "설정 확인",
      actionTarget: "#settings"
    },
    {
      id: "approval-gate",
      level: "danger",
      title: "자동 신고 금지",
      message:
        "이 시스템은 외부 신고기관에 자동 제출하지 않습니다. 신고서 초안 복사와 공식 링크 안내만 제공하며, 최종 제출은 사람이 공식 창구에서 직접 수행해야 합니다.",
      category: "safety",
      actionLabel: "승인 게이트 확인",
      actionTarget: "#approval-gate"
    },
    {
      id: "real-data-status",
      level:
        runtimeMode === "REAL_READY"
          ? "success"
          : runtimeMode === "MIXED"
            ? "info"
            : "warning",
      title: "실데이터 검증 상태",
      message:
        runtimeMode === "MOCK"
          ? "현재 상태는 Mock 검증 단계입니다. 실제 URL 10건 수동 테스트와 API 키 연동 테스트를 통과해야 실전 수집 단계로 이동할 수 있습니다."
          : runtimeMode === "MIXED"
            ? "일부 실제 키가 연결된 혼합 모드입니다. 실데이터 검증과 사람 검토를 더 진행해야 실전 단계로 이동할 수 있습니다."
            : "실전 키 설정이 완료된 상태입니다. 다만 자동 실전 신고는 수행되지 않으며, 사람 검토가 필수입니다.",
      category: "readiness",
      lastReviewedAt: OFFICIAL_RULE_LAST_REVIEWED_AT,
      actionLabel: "실전 체크리스트 보기",
      actionTarget: "#practical-checklist"
    },
    {
      id: "human-review-required",
      level: "info",
      title: "사람 검토 필요",
      message:
        "AI 분석과 룰 탐지는 신고지원 도구이며, 검토 후보의 최종 판단은 사람이 수행해야 합니다. 포상금 수령 보장은 없으며, 공식 기준 확인 후 사람이 결정합니다.",
      category: "safety",
      actionLabel: "Review Queue 열기",
      actionTarget: "#caseList"
    },
    {
      id: "privacy-minimization",
      level: "info",
      title: "개인정보 최소화 운영",
      message:
        "본 도구는 신고 후보 탐지·증거정리·신고서 초안 보조 도구입니다. 개인정보를 적극적으로 수집하지 않으며, 저장된 개인정보성 문자열은 정책에 따라 마스킹·삭제 가능합니다.",
      category: "privacy",
      actionLabel: "개인정보 정책 확인",
      actionTarget: "#privacyCard"
    },
    {
      id: "current-readiness-stage",
      level: stage === "HUMAN_REVIEW_READY" ? "success" : "info",
      title: `실전 가능 단계: ${stage}`,
      message: `${stageLabel} · 현재 모드: ${modeLabel}. 단계 전환은 사람이 검증 후 수동으로 진행합니다.`,
      category: "readiness",
      actionLabel: "운영 대시보드",
      actionTarget: "#opsDashboardCard"
    }
  ];
}

function buildRuntimeStatus(): {
  app: DashboardAppInfo;
  mode: DashboardModeInfo;
  apiConnections: DashboardApiConnections;
  readiness: DashboardReadiness;
  guideLinks: DashboardGuideLink[];
  homeNotices: string[];
  notices: DashboardNotice[];
} {
  const appInfo = readAppInfo();
  const mockAi = config.mockAi === true;
  const mockScout = config.scout.mock === true;
  const openAiKey = (config.openaiApiKey || "").trim();
  const naverId = (config.scout.naverClientId || "").trim();
  const naverSecret = (config.scout.naverClientSecret || "").trim();
  const openaiConfigured = !mockAi && openAiKey.length > 0;
  const naverConfigured = !mockScout && naverId.length > 0 && naverSecret.length > 0;

  let runtimeMode: RuntimeMode;
  if (openaiConfigured && naverConfigured) runtimeMode = "REAL_READY";
  else if (openaiConfigured || naverConfigured) runtimeMode = "MIXED";
  else runtimeMode = "MOCK";

  const modeLabel =
    runtimeMode === "REAL_READY"
      ? "실전 키 설정 완료 (실제 신고 전 사람 검증 필요)"
      : runtimeMode === "MIXED"
        ? "일부 실제 키 + Mock 혼합 (사람 검증 필요)"
        : "Mock 검증 단계";

  let stage: ReadinessStage;
  if (runtimeMode === "REAL_READY") {
    stage = "HUMAN_REVIEW_READY";
  } else if (runtimeMode === "MIXED") {
    stage = "REAL_DATA_TEST";
  } else if (!openAiKey && !naverId && !naverSecret) {
    stage = "API_KEY_REQUIRED";
  } else {
    stage = "MOCK_VALIDATION";
  }

  const stageLabel = {
    SETUP_REQUIRED: "초기 설정 필요",
    MOCK_VALIDATION: "Mock 검증 단계 — 실제 신고 전 검증 필요",
    MANUAL_URL_TEST: "수동 URL 테스트 단계 — 사람 검토 필요",
    API_KEY_REQUIRED: "API 키 설정 필요 — Mock으로 먼저 검증하세요",
    REAL_DATA_TEST: "실제 데이터 일부 검증 단계 — 사람 검토 필요",
    HUMAN_REVIEW_READY: "사람 검토 단계 — 모든 제출은 사람이 공식 창구에서 직접 수행",
    OPERATION_READY: "운영 단계 — 자동 제출 없음, 사람 검토 필수"
  }[stage];

  const readinessNotes = [
    "이 시스템은 자동 신고를 수행하지 않으며, 모든 제출은 사람이 공식 창구에서 직접 진행해야 합니다.",
    "포상금 지급 여부는 공식기관 기준과 조사 결과에 따라 달라집니다.",
    "처음이면 Mock 검증부터 진행하세요.",
    "실제 신고 전 Evidence Package와 Report Draft를 사람이 확인하세요."
  ];

  const guideLinks: DashboardGuideLink[] = [
    { label: "원스톱 프로세스", href: "#processBar" },
    { label: "후보 자동 발굴", href: "#discoveryStatus" },
    { label: "Human Review Queue", href: "#caseList" },
    { label: "품질 평가 (Eval Set)", href: "#evalDashboardCard" },
    { label: "검토 피드백 통계", href: "#feedbackStatsCard" },
    { label: "개인정보 보호 / 삭제", href: "#privacyCard" },
    { label: "Outcome Tracker", href: "#outcomeCard" },
    { label: "운영 대시보드", href: "#opsDashboardCard" }
  ];

  const homeNotices = [
    "처음이면 Mock 검증부터 진행하세요.",
    "실제 신고 전 Evidence Package와 Report Draft를 사람이 확인하세요.",
    "포상금 지급 여부는 공식기관 기준과 조사 결과에 따라 달라집니다.",
    "현재 상태: " + modeLabel,
    "실전 가능 단계: " + stageLabel
  ];

  const notices = buildNotices({
    runtimeMode,
    openaiConfigured,
    naverConfigured,
    stage,
    stageLabel,
    modeLabel
  });

  return {
    app: {
      name: appInfo.name,
      version: appInfo.version,
      environment: config.env
    },
    mode: {
      mockAi,
      mockScout,
      useDb: config.useDb === true,
      schedulerEnabled: config.scheduler.enabled === true,
      scoutMode: mockScout ? "mock" : "real",
      runtimeMode,
      nodeEnv: config.env,
      label: modeLabel
    },
    apiConnections: {
      openai: {
        configured: openaiConfigured,
        mock: mockAi || openAiKey.length === 0,
        label: openaiConfigured ? "연결됨 (실제 키)" : "미연결 또는 Mock"
      },
      naver: {
        configured: naverConfigured,
        mock: mockScout || naverId.length === 0 || naverSecret.length === 0,
        label: naverConfigured ? "연결됨 (실제 키)" : "미연결 또는 Mock"
      }
    },
    readiness: {
      stage,
      label: stageLabel,
      canAutoSubmit: false,
      humanReviewRequired: true,
      notes: readinessNotes
    },
    guideLinks,
    homeNotices,
    notices
  };
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
  private readonly outcomeRepo = createOutcomeRepository();
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

    // 11) Outcome
    let outcomeStats;
    try {
      outcomeStats = await this.outcomeRepo.getStats();
    } catch {
      outcomeStats = null;
    }
    const outcomeSummary: DashboardOutcomeSummary = outcomeStats
      ? {
          total: outcomeStats.total,
          submittedCount: outcomeStats.submittedCount,
          receivedCount: outcomeStats.receivedCount,
          inReviewCount: outcomeStats.inReviewCount,
          supplementRequestedCount: outcomeStats.supplementRequestedCount,
          acceptedCount: outcomeStats.acceptedCount,
          rejectedCount: outcomeStats.rejectedCount,
          rewardReviewCount: outcomeStats.rewardReviewCount,
          rewardPaidCount: outcomeStats.rewardPaidCount,
          followUpDueCount: outcomeStats.followUpDueCount,
          rewardPaidAmountTotal: outcomeStats.rewardPaidAmountTotal,
          rewardPaidEntries: outcomeStats.rewardPaidEntries
        }
      : {
          total: 0, submittedCount: 0, receivedCount: 0, inReviewCount: 0,
          supplementRequestedCount: 0, acceptedCount: 0, rejectedCount: 0,
          rewardReviewCount: 0, rewardPaidCount: 0, followUpDueCount: 0,
          rewardPaidAmountTotal: 0, rewardPaidEntries: 0
        };

    const runtime = buildRuntimeStatus();

    return {
      schemaVersion: "1.0.0",
      generatedAt: now.toISOString(),
      todayDate: today,
      today: todaySummary,
      app: runtime.app,
      mode: runtime.mode,
      apiConnections: runtime.apiConnections,
      readiness: runtime.readiness,
      guideLinks: runtime.guideLinks,
      homeNotices: runtime.homeNotices,
      notices: runtime.notices,
      kpis,
      queue: { total: cases.length, counts: queueCounts },
      topCandidates,
      modules,
      evalMetrics: evalSummary,
      scheduler: schedulerSummary,
      dedupe: dedupeSummary,
      feedback: feedbackSummary,
      outcome: outcomeSummary,
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
