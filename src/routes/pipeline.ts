import { Router } from "express";
import { ZodError, z } from "zod";
import { autoPipeline, PIPELINE_STOP_AFTERS } from "../services/pipeline/AutoPipeline.js";
import { moduleRegistry } from "../modules/index.js";
import { config } from "../utils/config.js";
import { DISCOVERY_MODES } from "../types/candidate.js";
import { traceLogger } from "../services/trace/TraceLogger.js";

export const pipelineRouter = Router();

const SAFETY_NOTICE =
  "AutoPipeline 은 발굴→분석→검수 대기열 적재까지만 자동화합니다. 외부 신고기관 자동 제출은 수행하지 않으며, 모든 케이스는 사람 검수 대기(human_review_required) 에서 멈춥니다.";

// 서버측 상한 — config(.env) 기본값을 신뢰 경계로 사용한다. 클라이언트 값은 이 상한을 넘을 수 없다(clamp).
const LIMIT_MAX = Math.max(1, config.discovery.maxCandidates);     // 수집 건수 상한 (DISCOVERY_MAX_CANDIDATES)
const ANALYSES_MAX = Math.max(1, config.pipeline.maxAnalyses);     // 분석 호출 상한 (AUTO_PIPELINE_MAX_ANALYSES)

function zodErrorMessage(err: ZodError): string {
  const issues = (err as unknown as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
    ?? (err as unknown as { errors?: Array<{ path: (string | number)[]; message: string }> }).errors
    ?? [];
  return issues.map((e) => `${(e.path ?? []).join(".") || "body"}: ${e.message}`).join("; ");
}

// limit/maxAnalyses 는 양의 정수만 허용(음수·0·문자열·소수 → 400). 과대값은 아래에서 상한으로 clamp.
const RunBodySchema = z.object({
  stopAfter: z.enum(PIPELINE_STOP_AFTERS as unknown as [string, ...string[]]).optional(),
  moduleId: z.string().max(80).optional(),
  topics: z.array(z.string().max(80)).max(50).optional(),
  mode: z.enum(DISCOVERY_MODES).optional(),
  sources: z.array(z.enum(["mock", "naver", "openai_web_search", "rss", "manual"])).max(10).optional(),
  // limit = 수집 건수 (scout maxCandidates). maxCandidates 도 호환용으로 허용.
  limit: z.number().int().positive().optional(),
  maxCandidates: z.number().int().positive().optional(),
  maxAnalyses: z.number().int().positive().optional(),
  reason: z.string().max(200).optional()
});

// POST /api/pipeline/run — 단계 범위(stopAfter)를 골라 1회 실행.
//   collect : 수집까지만 (LLM 분석/케이스/큐 적재 없음)
//   analyze : 수집 + 분석/점수 (미리보기, 저장 안 함)
//   queue   : 수집 + 분석 + 신뢰도 라우팅 + 검수 대기열 적재 (기본값)
// 제출/외부 신고기관 호출은 어떤 stopAfter 값으로도 수행하지 않는다 (기존 정책 불변).
pipelineRouter.post("/run", async (req, res) => {
  try {
    const input = RunBodySchema.parse(req.body ?? {});
    const traceId = req.traceContext?.traceId;

    const stopAfter = (input.stopAfter ?? "queue") as (typeof PIPELINE_STOP_AFTERS)[number];

    // 모듈 화이트리스트 — 등록된 모듈만 허용. 미등록 → 400.
    const moduleId = input.moduleId ?? moduleRegistry.getDefault().id;
    if (!moduleRegistry.has(moduleId)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_MODULE",
        message: `등록되지 않은 모듈입니다: ${moduleId}`,
        allowedModuleIds: moduleRegistry.list().map((m) => m.id)
      });
    }

    // 상한 clamp — 양수임은 zod 가 보장. 과대값은 서버 상한으로 낮춘다.
    const requestedLimit = input.limit ?? input.maxCandidates;
    const limit = typeof requestedLimit === "number" ? Math.min(requestedLimit, LIMIT_MAX) : undefined;
    const maxAnalyses = typeof input.maxAnalyses === "number" ? Math.min(input.maxAnalyses, ANALYSES_MAX) : undefined;
    const limitClamped = typeof requestedLimit === "number" && requestedLimit > LIMIT_MAX;
    const maxAnalysesClamped = typeof input.maxAnalyses === "number" && input.maxAnalyses > ANALYSES_MAX;

    const result = await autoPipeline.run({
      moduleId,
      topics: input.topics,
      mode: input.mode,
      sourceTypes: input.sources,
      maxCandidates: limit,
      maxAnalyses,
      stopAfter,
      reason: `manual:${input.reason ?? "ad-hoc"}:${stopAfter}`
    });

    void traceLogger.log({
      eventType: "human_action",
      severity: "info",
      traceId,
      runId: result.runId,
      moduleId: result.moduleId,
      agentName: "AutoPipeline",
      actor: "anonymous",
      message: `수동 트리거: 파이프라인 1회 실행 (stopAfter=${stopAfter})`,
      meta: {
        stopAfter,
        discovered: result.execSummary.discovered,
        analyzed: result.execSummary.analyzed,
        queued: result.execSummary.queued,
        autoSubmitted: false
      }
    });

    res.json({
      ok: true,
      ...result,
      // 적용된 상한/clamp 결과를 알려 UI 가 "상한으로 조정됨" 을 표시할 수 있게 한다.
      applied: {
        stopAfter,
        moduleId,
        limit: limit ?? null,
        maxAnalyses: maxAnalyses ?? null,
        limitMax: LIMIT_MAX,
        analysesMax: ANALYSES_MAX,
        limitClamped,
        maxAnalysesClamped
      },
      message: stopAfter === "collect"
        ? "수집까지 실행 완료. 분석/적재는 수행하지 않았습니다 (후보만 수집)."
        : stopAfter === "analyze"
          ? "분석까지 실행 완료. 결과는 미리보기이며 저장(케이스/큐 적재)되지 않았습니다."
          : "파이프라인 1회 실행 완료. 高위험·高신뢰도 후보는 검수 대기열에 적재되었고, 외부 신고 자동 제출은 수행되지 않았습니다.",
      notLegalConclusion: true,
      autoReport: false,
      humanReviewRequired: true,
      safetyNotice: SAFETY_NOTICE
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "VALIDATION_ERROR", message: zodErrorMessage(error) });
    }
    res.status(500).json({ ok: false, error: "PIPELINE_RUN_FAILED", message: (error as Error).message });
  }
});
