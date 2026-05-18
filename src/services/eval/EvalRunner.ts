import { nanoid } from "nanoid";
import { RuleAgent } from "../../agents/RuleAgent.js";
import { ScoringAgent } from "../../agents/ScoringAgent.js";
import { config } from "../../utils/config.js";
import { buildMetrics, classifyOutcome } from "./EvalMetrics.js";
import type {
  EvalRunResult,
  EvalSample,
  EvalSampleResult,
  EvalSet,
  FeedbackCandidate
} from "../../types/eval.js";
import { EVAL_SAFETY_NOTICE } from "../../types/eval.js";

export interface EvalRunOptions {
  threshold?: number;
  useLlm?: boolean;
  maxSamples?: number;
}

// 평가 입력 검증
function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export class EvalRunner {
  private readonly rule: RuleAgent;
  private readonly scoring: ScoringAgent;

  constructor() {
    this.rule = new RuleAgent();
    this.scoring = new ScoringAgent();
  }

  private predictOne(sample: EvalSample, threshold: number): EvalSampleResult {
    const detection = this.rule.detectDetailed({
      claimCandidates: [sample.text],
      mainText: sample.text
    });
    const scoring = this.scoring.computePriority({
      moduleId: "false_ad",
      extractionResult: {
        productName: sample.productName,
        textLength: sample.text.length,
        claimCandidates: [sample.text]
      },
      ruleDetectionResult: {
        riskScore: detection.riskScore,
        riskLevel: detection.riskLevel,
        counts: detection.counts,
        matches: detection.matches as Array<{
          ruleId: string;
          keyword?: string;
          riskLevel: "HIGH" | "MEDIUM" | "LOW";
          matchType: "keyword" | "regex" | "combo";
        }>
      },
      evidenceSummary: { hasUrl: true, hasText: true }
    });

    const priorityScore = scoring.priorityScore;
    // LLM/Evidence/Seller 신호가 없는 평가에서는 priorityScore가 낮게 나오므로,
    // RuleAgent 자체 riskScore도 함께 임계값 비교한다 (OR semantics).
    // 룰 신호가 임계값을 넘기면 양성으로 예측한다. 이 정책은 docs/eval_set.md 에 기록.
    const predictedAsPositive = priorityScore >= threshold || detection.riskScore >= threshold;
    const prediction: "POSITIVE" | "NEGATIVE" = predictedAsPositive ? "POSITIVE" : "NEGATIVE";
    const outcome = classifyOutcome(sample.label, prediction);

    const matchedKeywords = Array.from(
      new Set(detection.matches.map((m) => m.keyword).filter((k): k is string => Boolean(k)))
    );
    const matchedRuleIds = Array.from(
      new Set(detection.matches.map((m) => m.ruleId).filter((k): k is string => Boolean(k)))
    );

    return {
      sampleId: sample.id,
      label: sample.label,
      category: sample.category,
      productName: sample.productName,
      text: sample.text,
      priorityScore,
      ruleRiskScore: detection.riskScore,
      matchedKeywords,
      matchedRuleIds,
      matchCount: detection.matches.length,
      threshold,
      prediction,
      predictedAsPositive,
      outcome
    };
  }

  async run(evalSet: EvalSet, opts: EvalRunOptions = {}): Promise<EvalRunResult> {
    const start = Date.now();
    const threshold = clamp(opts.threshold ?? config.eval.threshold, 0, 100);
    const useLlm = opts.useLlm === true;
    const maxSamples = clamp(opts.maxSamples ?? config.eval.maxSamples ?? evalSet.samples.length, 1, 2000);
    const samples = evalSet.samples.slice(0, maxSamples);

    if (useLlm) {
      // 명시적으로 차단 — 이번 단계에서 EvalRunner 내부에서 LLM을 호출하지 않는다.
      // (옵션은 받지만 실제 호출은 비활성. 향후 별도 체크리스트에서 연결한다.)
      console.warn("[EvalRunner] useLlm=true 지정되었지만 이번 단계에서는 LLM 평가를 비활성화합니다. RuleAgent + ScoringAgent로 평가합니다.");
    }

    const results: EvalSampleResult[] = samples.map((s) => this.predictOne(s, threshold));
    const metrics = buildMetrics(results, threshold);

    const falsePositives = results.filter((r) => r.outcome === "FP");
    const falseNegatives = results.filter((r) => r.outcome === "FN");
    const feedbackCandidates = this.buildFeedbackCandidates(falsePositives, falseNegatives);

    const runId = `run_${new Date().toISOString().replace(/[:.]/g, "-")}_${nanoid(6)}`;

    return {
      schemaVersion: "1.0.0",
      runId,
      evalSetId: evalSet.evalSetId,
      moduleId: evalSet.moduleId,
      ranAt: new Date().toISOString(),
      threshold,
      useLlm: false, // 실제로는 LLM 미사용
      maxSamples,
      metrics,
      // 응답 전송 시에는 상위 N개만 노출 — 라우터에서 잘라낸다
      falsePositives,
      falseNegatives,
      results,
      feedbackCandidates,
      safetyNotice: EVAL_SAFETY_NOTICE,
      llmCallCount: 0,
      durationMs: Date.now() - start
    };
  }

  private buildFeedbackCandidates(
    fps: EvalSampleResult[],
    fns: EvalSampleResult[]
  ): FeedbackCandidate[] {
    const out: FeedbackCandidate[] = [];
    for (const r of fps) {
      out.push({
        sampleId: r.sampleId,
        text: r.text,
        score: r.priorityScore,
        matchedKeywords: r.matchedKeywords,
        matchedRuleIds: r.matchedRuleIds,
        category: r.category,
        feedbackReasonCategories:
          r.matchedRuleIds.length > 0
            ? ["RULE_FALSE_POSITIVE", "SCORE_TOO_HIGH"]
            : ["SCORE_TOO_HIGH"],
        suggestedImprovement:
          r.matchedRuleIds.length > 0
            ? `정상 샘플에서 rule(${r.matchedRuleIds.join(",")})이 매칭되었습니다. keywords.json의 ${r.matchedKeywords.join(",")} 항목에 문맥 예외 추가를 검토하세요.`
            : "정상 샘플이 임계값을 넘었습니다. scoring_rules.ts 의 가중치를 보수적으로 재조정하세요.",
        notes: "사람 검토 후 Feedback DB에 반영해야 합니다. 자동 저장하지 않습니다."
      });
    }
    for (const r of fns) {
      out.push({
        sampleId: r.sampleId,
        text: r.text,
        score: r.priorityScore,
        matchedKeywords: r.matchedKeywords,
        matchedRuleIds: r.matchedRuleIds,
        category: r.category,
        feedbackReasonCategories:
          r.matchedKeywords.length === 0
            ? ["RULE_FALSE_POSITIVE"] // RULE_MISSED 의미로 동일 카테고리 재활용
            : ["SCORE_TOO_HIGH"], // 매치는 있는데 점수 부족
        suggestedImprovement:
          r.matchCount === 0
            ? `위반 의심 샘플인데 어떤 룰도 매칭되지 않았습니다. 카테고리=${r.category} 텍스트의 핵심 표현을 keywords.json에 보강 후보로 검토하세요.`
            : `매치는 있었으나 점수(${r.priorityScore})가 임계값(${r.threshold}) 미만입니다. ruleSignal/llmSignal 가중치 조정을 검토하세요.`,
        notes: "사람 검토 후 Feedback DB에 반영해야 합니다. 자동 저장하지 않습니다."
      });
    }
    return out;
  }
}

export const evalRunner = new EvalRunner();
