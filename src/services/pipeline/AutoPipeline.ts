// AutoPipeline — 자율 발굴 → (중복제거) → 분석/판단/평가 → 사람 검수 대기열 적재 까지를
// 하나의 파이프라인으로 연결하는 오케스트레이터.
//
// 끊겼던 사슬:
//   SchedulerService(cron) → scoutAgent.discover() [여기서 멈춤]
//   OrchestratorAgent.analyze() (추출→Rule→Analyzer(LLM)→score→evidence) 는 사람이 수동 트리거할 때만 실행.
// 이 모듈이 discover 이후 분석~검수 적재 단계를 자동으로 이어준다.
//
// 안전 불변식 (절대 변경 금지):
//   - 제출은 자동화하지 않는다. 이 파이프라인의 끝점은 항상 "human_review_required(검수 대기)" 까지다.
//   - canAutoSubmit() === false, approvalGate / factCheckGate / approvalWorkflow 우회 경로를 만들지 않는다.
//   - 高위험·高신뢰도 → createReviewRequest() 로 검수 대기열에 자동 적재 (status: human_review_required).
//   - 中간/모호 → needs_human_triage(낮은 우선순위) 로 분리 적재.
//   - 低위험/노이즈 → 케이스를 만들지 않고 로그만 남긴다 (대기열 오염 방지).
//   - 임계값·가드는 모두 config(.env) 외부화. 하드코딩 금지.

import { nanoid } from "nanoid";
import { OrchestratorAgent, type AnalyzeOptions } from "../../agents/OrchestratorAgent.js";
import { scoutAgent } from "../scout/ScoutAgent.js";
import { candidateRepository } from "../../repositories/CandidateRepository.js";
import { createCaseRepository, type ICaseRepository } from "../../repositories/CaseRepository.js";
import { dedupeEngine } from "../dedupe/DedupeEngine.js";
import { traceLogger, createRunId, type LogInput } from "../trace/TraceLogger.js";
import { createReviewRequest, type ReviewRequest } from "../../policy/approvalWorkflow.js";
import { config } from "../../utils/config.js";
import type { AnalyzeRequest, CaseStatus, RewardCase } from "../../types/core.js";
import type {
  CandidateStatus,
  DiscoveryCandidate,
  DiscoveryMode
} from "../../types/candidate.js";
import type { ScoutSourceType } from "../scout/SearchSourceAdapter.js";

const SAFETY_NOTICE =
  "AutoPipeline 은 발굴→분석→검수 대기열 적재까지만 자동화하며 외부 신고기관에 자동 제출하지 않습니다. " +
  "모든 케이스는 human_review_required(사람 검수 대기) 상태에서 멈추고, 실제 제출은 사람이 공식 창구에서 직접 수행합니다.";

// ---------- 라우팅 ----------

export type PipelineRoute = "auto_review" | "needs_human_triage" | "noise";

export type PipelineCandidateOutcome =
  | PipelineRoute
  | "duplicate_skipped"   // 이미 동일 대상 케이스가 있어 재분석/중복 케이스 생성 방지
  | "skipped_not_new"     // 멱등성: 이미 처리(ANALYZED/QUEUED/REJECTED)된 후보
  | "limit_skipped"       // 비용 가드(MAX_ANALYSES) 초과 — 다음 run 에서 재시도 (NEW 유지)
  | "failed";             // 분석 실패 — 격리하고 사유 기록 (NEW 유지, 다음 run 재시도)

export interface PipelineCandidateResult {
  candidateId: string;
  url: string;
  outcome: PipelineCandidateOutcome;
  caseId?: string;
  /** 적재된 케이스의 내부 검토 상태 (REVIEW=검수 대기 / DRAFT=triage). 제출 상태(SUBMITTED)는 절대 만들지 않는다. */
  caseStatus?: CaseStatus;
  /** 검수 대기열 게이트 산출물 상태 — 항상 human_review_required (auto_review 일 때만 존재). */
  reviewRequestStatus?: ReviewRequest["status"];
  score?: number;
  confidence?: number;
  reason?: string;
}

export interface PipelineSummary {
  runId: string;
  moduleId: string;
  totalCandidates: number;
  analyzed: number;
  autoReviewQueued: number;
  needsTriageQueued: number;
  noiseDropped: number;
  duplicatesSkipped: number;
  skippedNotNew: number;
  failed: number;
  limitReached: boolean;
  maxAnalyses: number;
  results: PipelineCandidateResult[];
  // === 안전 불변식 — 출력에 항상 명시 (테스트/감사에서 "제출 자동화 부재" 단언 근거) ===
  autoSubmitted: false;
  humanReviewRequired: true;
  terminalState: "human_review_required";
  safetyNotice: string;
  generatedAt: string;
}

export interface PipelineRunResult {
  runId: string;
  moduleId: string;
  discovery: {
    totalFound: number;
    totalAdded: number;
    usedSources: ScoutSourceType[];
    sourceFallbacks: ScoutSourceType[];
  };
  pipeline: PipelineSummary;
  autoSubmitted: false;
  humanReviewRequired: true;
  safetyNotice: string;
}

// 파이프라인이 케이스에 부여할 수 있는 상태 — 제출/금지 상태는 포함하지 않는다 (스트레스 테스트가 단언).
export const PIPELINE_ASSIGNABLE_CASE_STATUSES: readonly CaseStatus[] = ["REVIEW", "DRAFT", "REJECTED"];

export const PIPELINE_SAFETY = {
  autoSubmitted: false as const,
  humanReviewRequired: true as const,
  terminalReviewStatus: "human_review_required" as const,
  assignableCaseStatuses: PIPELINE_ASSIGNABLE_CASE_STATUSES
} as const;

// ---------- DI 인터페이스 (테스트 주입용) ----------

export interface PipelineOrchestrator {
  analyze(request: AnalyzeRequest, options?: AnalyzeOptions): Promise<RewardCase>;
  commitCase(draft: RewardCase, options?: { statusOverride?: CaseStatus; statusNote?: string }): Promise<RewardCase>;
}

export interface PipelineCandidateRepo {
  getById(id: string): Promise<DiscoveryCandidate>;
  updateStatus(id: string, status: CandidateStatus, extra?: { caseId?: string }): Promise<DiscoveryCandidate>;
}

export interface PipelineScout {
  discover(input: {
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
  }>;
}

export interface PipelineTrace {
  log(input: LogInput): Promise<unknown>;
}

export interface PipelineConfig {
  maxAnalyses: number;
  minScore: number;
  minConfidence: number;
  triageMinScore: number;
  requestDelayMs: number;
}

export interface AutoPipelineDeps {
  scout?: PipelineScout;
  orchestrator?: PipelineOrchestrator;
  candidateRepo?: PipelineCandidateRepo;
  caseRepo?: Pick<ICaseRepository, "list">;
  trace?: PipelineTrace;
  config?: Partial<PipelineConfig>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/** 신뢰도 기반 라우팅 — 자동 판단의 핵심. 자동 "제출"이 아니라 자동 "검수 적재 분류"다. */
export function decideRoute(score: number, confidence: number, cfg: PipelineConfig): PipelineRoute {
  if (score >= cfg.minScore && confidence >= cfg.minConfidence) return "auto_review";
  if (score >= cfg.triageMinScore) return "needs_human_triage";
  return "noise";
}

export class AutoPipeline {
  private scout: PipelineScout;
  private orchestrator: PipelineOrchestrator;
  private candidateRepo: PipelineCandidateRepo;
  private caseRepo: Pick<ICaseRepository, "list">;
  private trace: PipelineTrace;
  private cfg: PipelineConfig;

  constructor(deps: AutoPipelineDeps = {}) {
    this.scout = deps.scout ?? scoutAgent;
    this.orchestrator = deps.orchestrator ?? new OrchestratorAgent();
    this.candidateRepo = deps.candidateRepo ?? candidateRepository;
    this.caseRepo = deps.caseRepo ?? createCaseRepository();
    this.trace = deps.trace ?? traceLogger;
    this.cfg = {
      maxAnalyses: config.pipeline.maxAnalyses,
      minScore: config.pipeline.minScore,
      minConfidence: config.pipeline.minConfidence,
      triageMinScore: config.pipeline.triageMinScore,
      requestDelayMs: config.pipeline.requestDelayMs,
      ...(deps.config ?? {})
    };
  }

  /** 1회 전체 실행: discover → 분석~검수 적재. 수동 트리거 라우트 / 스케줄러 full 모드에서 사용. */
  async run(opts: {
    moduleId?: string;
    topics?: string[];
    mode?: DiscoveryMode;
    sourceTypes?: ScoutSourceType[];
    maxCandidates?: number;
    reason?: string;
  } = {}): Promise<PipelineRunResult> {
    const runId = createRunId("pipeline");
    const moduleId = opts.moduleId ?? "false_ad";

    const discovery = await this.scout.discover({
      moduleId,
      topics: opts.topics ?? [],
      mode: opts.mode ?? "standard",
      sourceTypes: opts.sourceTypes,
      maxCandidates: opts.maxCandidates
    });

    const pipeline = await this.processCandidates(discovery.added, {
      runId,
      moduleId,
      reason: opts.reason ?? "pipeline:run"
    });

    return {
      runId,
      moduleId,
      discovery: {
        totalFound: discovery.candidates.length,
        totalAdded: discovery.added.length,
        usedSources: discovery.usedSources,
        sourceFallbacks: discovery.sourceFallbacks
      },
      pipeline,
      autoSubmitted: false,
      humanReviewRequired: true,
      safetyNotice: SAFETY_NOTICE
    };
  }

  /**
   * 주어진 후보들을 (멱등성/중복 필터) → 분석 → 신뢰도 라우팅 → 케이스 적재 한다.
   * SchedulerService.executeScoutRun(full) 가 자체 discover 후 added 후보를 그대로 넘긴다 (중복 발굴 방지).
   */
  async processCandidates(
    candidates: DiscoveryCandidate[],
    ctx: { runId?: string; moduleId?: string; reason?: string } = {}
  ): Promise<PipelineSummary> {
    const runId = ctx.runId ?? createRunId("pipeline");
    const moduleId = ctx.moduleId ?? "false_ad";
    const results: PipelineCandidateResult[] = [];
    let limitReached = false;

    await this.trace.log({
      eventType: "agent_start",
      severity: "info",
      runId,
      moduleId,
      agentName: "AutoPipeline",
      message: `자율 파이프라인 시작 (후보 ${candidates.length}건, maxAnalyses=${this.cfg.maxAnalyses})`,
      meta: { reason: ctx.reason, total: candidates.length, autoSubmitted: false }
    });

    // 1) 멱등성: 저장소 현재 상태 재확인 → NEW 만 처리. 이미 처리된 후보는 재실행해도 건너뛴다.
    const fresh: DiscoveryCandidate[] = [];
    for (const cand of candidates) {
      let current: DiscoveryCandidate;
      try {
        current = await this.candidateRepo.getById(cand.id);
      } catch {
        results.push({ candidateId: cand.id, url: cand.url, outcome: "failed", reason: "후보를 저장소에서 찾을 수 없음" });
        continue;
      }
      if (current.status !== "NEW") {
        results.push({ candidateId: current.id, url: current.url, outcome: "skipped_not_new", caseId: current.caseId, reason: `상태=${current.status}` });
        continue;
      }
      fresh.push(current);
    }

    // 2) 분석 전 중복제거: 기존 케이스(동일 대상)와 비교 + 배치 내부 비교. 기존 dedupe 모듈 재사용.
    const existingCases = (await this.caseRepo.list({ moduleId, limit: 500 })).cases.map((c) => ({
      id: c.id,
      url: c.url,
      title: c.title
    }));
    const dedupeReport = dedupeEngine.dedupeBatch(
      fresh.map((c) => ({ id: c.id, url: c.url, title: c.title, moduleId: c.moduleId })),
      existingCases
    );
    const duplicateOf = new Map<string, string | undefined>();
    for (const r of dedupeReport.results) {
      if (r.status === "DUPLICATE" && r.inputId) duplicateOf.set(r.inputId, r.duplicateOf);
    }

    const survivors: DiscoveryCandidate[] = [];
    for (const cand of fresh) {
      if (duplicateOf.has(cand.id)) {
        const dupCaseId = duplicateOf.get(cand.id);
        // 이미 동일 대상 케이스가 있으므로 재분석하지 않고 후보를 ANALYZED 로 연결 (멱등성 + 대기열 오염 방지).
        await this.candidateRepo.updateStatus(cand.id, "ANALYZED", dupCaseId ? { caseId: dupCaseId } : undefined);
        results.push({ candidateId: cand.id, url: cand.url, outcome: "duplicate_skipped", caseId: dupCaseId, reason: "기존 케이스와 중복" });
        await this.trace.log({
          eventType: "guardrail",
          severity: "info",
          runId,
          moduleId,
          candidateId: cand.id,
          agentName: "AutoPipeline",
          message: "중복 후보 — 재분석/중복 케이스 생성 생략",
          meta: { duplicateOf: dupCaseId }
        });
        continue;
      }
      survivors.push(cand);
    }

    // 3) 분석 + 라우팅 (비용/레이트/실패격리 가드)
    let analysesUsed = 0;
    for (const cand of survivors) {
      // 비용 가드: 상한 초과 시 남은 후보는 NEW 로 두고 다음 run 으로 미룬다.
      if (analysesUsed >= this.cfg.maxAnalyses) {
        limitReached = true;
        results.push({ candidateId: cand.id, url: cand.url, outcome: "limit_skipped", reason: `MAX_ANALYSES(${this.cfg.maxAnalyses}) 초과` });
        continue;
      }

      // 레이트 가드: 외부 수집 호출 간 최소 간격.
      if (this.cfg.requestDelayMs > 0 && analysesUsed > 0) await sleep(this.cfg.requestDelayMs);

      try {
        analysesUsed++;
        // 출처·수집시각·검색어를 메타로 남겨 증거 추적성 확보.
        const memo = `auto-pipeline run=${runId}; candidate=${cand.id}; source=${cand.source}; foundAt=${cand.foundAt}; topic=${cand.topic}; keyword=${cand.keyword}`;
        // persist:false — 라우팅으로 케이스 유지 여부를 먼저 판단 (노이즈는 케이스를 만들지 않음).
        const draft = await this.orchestrator.analyze({ url: cand.url, moduleId, memo }, { persist: false });
        const score = typeof draft.score === "number" ? draft.score : 0;
        const confidence = typeof draft.llmAnalysis?.confidence === "number"
          ? draft.llmAnalysis.confidence
          : (typeof draft.aiFinding?.confidence === "number" ? draft.aiFinding.confidence / 100 : 0);
        const route = decideRoute(score, confidence, this.cfg);

        if (route === "noise") {
          // 低위험/노이즈 → 케이스 생성하지 않고 로그만. 후보는 REJECTED 로 마감 (멱등성).
          await this.candidateRepo.updateStatus(cand.id, "REJECTED");
          results.push({ candidateId: cand.id, url: cand.url, outcome: "noise", score, confidence, reason: "임계값 미만 — 케이스 미생성" });
          await this.trace.log({
            eventType: "guardrail",
            severity: "info",
            runId,
            moduleId,
            candidateId: cand.id,
            agentName: "AutoPipeline",
            message: "노이즈 후보 — 케이스 미생성 (대기열 오염 방지)",
            meta: { score, confidence }
          });
          continue;
        }

        // 高위험·高신뢰도 → REVIEW(검수 대기) / 中간·모호 → DRAFT(needs_human_triage 낮은 우선순위)
        const caseStatus: CaseStatus = route === "auto_review" ? "REVIEW" : "DRAFT";
        const statusNote = route === "auto_review"
          ? "AutoPipeline: 高위험·高신뢰도 → 검수 대기열 자동 적재"
          : "AutoPipeline: 中간/모호 → needs_human_triage (낮은 우선순위)";
        const committed = await this.orchestrator.commitCase(draft, { statusOverride: caseStatus, statusNote });
        await this.candidateRepo.updateStatus(cand.id, "ANALYZED", { caseId: committed.id });

        let reviewRequestStatus: ReviewRequest["status"] | undefined;
        if (route === "auto_review") {
          // 검수 대기열 게이트 산출물 — status 는 항상 human_review_required 로 고정된다 (자동 제출 아님).
          const reviewRequest = createReviewRequest({
            caseId: committed.id,
            evidencePackageId: committed.id,
            draftReportId: committed.id
          });
          reviewRequestStatus = reviewRequest.status;
        }

        results.push({
          candidateId: cand.id,
          url: cand.url,
          outcome: route,
          caseId: committed.id,
          caseStatus: committed.status,
          reviewRequestStatus,
          score,
          confidence
        });

        await this.trace.log({
          eventType: "state_change",
          severity: "info",
          runId,
          moduleId,
          candidateId: cand.id,
          caseId: committed.id,
          agentName: "AutoPipeline",
          message: route === "auto_review"
            ? "검수 대기열 자동 적재 (human_review_required)"
            : "needs_human_triage 분리 적재 (낮은 우선순위)",
          meta: { route, caseStatus: committed.status, reviewRequestStatus, score, confidence, autoSubmitted: false }
        });
      } catch (error) {
        // 실패 격리: 후보 1건 실패가 전체 run 을 죽이지 않는다. 후보는 NEW 로 두고 사유 기록.
        const reason = (error as Error).message;
        results.push({ candidateId: cand.id, url: cand.url, outcome: "failed", reason });
        await this.trace.log({
          eventType: "agent_error",
          severity: "error",
          runId,
          moduleId,
          candidateId: cand.id,
          agentName: "AutoPipeline",
          message: `후보 분석 실패 — 건너뜀: ${reason}`
        });
      }
    }

    const summary: PipelineSummary = {
      runId,
      moduleId,
      totalCandidates: candidates.length,
      analyzed: analysesUsed,
      autoReviewQueued: results.filter((r) => r.outcome === "auto_review").length,
      needsTriageQueued: results.filter((r) => r.outcome === "needs_human_triage").length,
      noiseDropped: results.filter((r) => r.outcome === "noise").length,
      duplicatesSkipped: results.filter((r) => r.outcome === "duplicate_skipped").length,
      skippedNotNew: results.filter((r) => r.outcome === "skipped_not_new").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      limitReached,
      maxAnalyses: this.cfg.maxAnalyses,
      results,
      autoSubmitted: false,
      humanReviewRequired: true,
      terminalState: "human_review_required",
      safetyNotice: SAFETY_NOTICE,
      generatedAt: new Date().toISOString()
    };

    await this.trace.log({
      eventType: "agent_end",
      severity: "info",
      runId,
      moduleId,
      agentName: "AutoPipeline",
      message: `자율 파이프라인 종료 (적재 ${summary.autoReviewQueued + summary.needsTriageQueued}건, 노이즈 ${summary.noiseDropped}건, 실패 ${summary.failed}건)`,
      meta: {
        autoReviewQueued: summary.autoReviewQueued,
        needsTriageQueued: summary.needsTriageQueued,
        noiseDropped: summary.noiseDropped,
        duplicatesSkipped: summary.duplicatesSkipped,
        failed: summary.failed,
        limitReached,
        autoSubmitted: false,
        terminalState: "human_review_required"
      }
    });

    return summary;
  }
}

/** 파이프라인 출력에 어떤 자동 제출/제출 상태도 없는지 단언하는 순수 검증기 (스트레스/테스트용). */
export function assertNoSubmissionAutomation(summary: PipelineSummary): boolean {
  if (summary.autoSubmitted !== false) return false;
  if (summary.humanReviewRequired !== true) return false;
  if (summary.terminalState !== "human_review_required") return false;
  for (const r of summary.results) {
    // 파이프라인은 SUBMITTED/제출 게이트 상태를 절대 만들지 않는다.
    if (r.caseStatus === "SUBMITTED") return false;
    if (r.reviewRequestStatus && r.reviewRequestStatus !== "human_review_required") return false;
  }
  return true;
}

export { SAFETY_NOTICE as AUTO_PIPELINE_SAFETY_NOTICE };
export const autoPipeline = new AutoPipeline();
