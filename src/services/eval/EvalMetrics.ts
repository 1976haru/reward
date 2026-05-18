// 분류 품질 지표 계산 (체크리스트 22)
// 이번 단계의 평가는 RuleAgent + ScoringAgent 기반 binary classification 이다.
// label: VIOLATION_CANDIDATE → positive, NORMAL → negative.
// prediction: priorityScore >= threshold → POSITIVE, 미만 → NEGATIVE.

import type {
  ConfusionMatrix,
  EvalMetrics,
  EvalSampleResult
} from "../../types/eval.js";

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
  return numerator / denominator;
}

export function calculatePrecision(tp: number, fp: number): number {
  return safeDivide(tp, tp + fp);
}

export function calculateRecall(tp: number, fn: number): number {
  return safeDivide(tp, tp + fn);
}

export function calculateF1(precision: number, recall: number): number {
  return safeDivide(2 * precision * recall, precision + recall);
}

export function calculateAccuracy(tp: number, tn: number, total: number): number {
  return safeDivide(tp + tn, total);
}

export function calculateConfusionMatrix(results: EvalSampleResult[]): ConfusionMatrix {
  const m: ConfusionMatrix = { TP: 0, FP: 0, TN: 0, FN: 0 };
  for (const r of results) {
    if (r.outcome === "TP") m.TP += 1;
    else if (r.outcome === "FP") m.FP += 1;
    else if (r.outcome === "TN") m.TN += 1;
    else if (r.outcome === "FN") m.FN += 1;
  }
  return m;
}

export function classifyOutcome(
  label: "VIOLATION_CANDIDATE" | "NORMAL",
  predicted: "POSITIVE" | "NEGATIVE"
): EvalSampleResult["outcome"] {
  const isPositiveLabel = label === "VIOLATION_CANDIDATE";
  const isPositivePred = predicted === "POSITIVE";
  if (isPositiveLabel && isPositivePred) return "TP";
  if (isPositiveLabel && !isPositivePred) return "FN";
  if (!isPositiveLabel && isPositivePred) return "FP";
  return "TN";
}

export function buildMetrics(
  results: EvalSampleResult[],
  threshold: number
): EvalMetrics {
  const confusion = calculateConfusionMatrix(results);
  const total = results.length;
  const positive = results.filter((r) => r.label === "VIOLATION_CANDIDATE").length;
  const negative = total - positive;
  const precision = calculatePrecision(confusion.TP, confusion.FP);
  const recall = calculateRecall(confusion.TP, confusion.FN);
  const f1 = calculateF1(precision, recall);
  const accuracy = calculateAccuracy(confusion.TP, confusion.TN, total);

  const summary =
    `total=${total} threshold=${threshold} ` +
    `precision=${precision.toFixed(3)} recall=${recall.toFixed(3)} ` +
    `f1=${f1.toFixed(3)} accuracy=${accuracy.toFixed(3)}`;

  return {
    total,
    positive,
    negative,
    threshold,
    confusion,
    precision: round3(precision),
    recall: round3(recall),
    f1: round3(f1),
    accuracy: round3(accuracy),
    notLegalConclusion: true,
    summary
  };
}

function round3(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}
