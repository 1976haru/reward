// 위험점수 설명 빌더 (체크리스트 15).
// 사람이 점수를 이해할 수 있도록, RuleAgent 위험점수(mvp_scope 위험도 정책)와
// ScoringAgent 우선순위 점수를 사람이 읽을 수 있는 요소로 풀어 설명한다.
//
// 이 점수는 법 위반 확정·포상금 가능성을 의미하지 않으며, 사람 검토 우선순위 정렬용 참고치다.

import type { RuleDetectionResult } from "./RuleAgent.js";
import type { ScoringResult } from "../types/scoring.js";

export interface ScoreExplanation {
  // ScoringAgent 우선순위 점수(헤드라인)
  total: number;
  grade: string;
  gradeLevel: string;
  components: { key: string; label: string; score: number; maxPoints: number; reasons: string[] }[];
  // RuleAgent 위험점수(mvp_scope 위험도 정책)
  ruleRiskScore: number;
  ruleRiskGrade: string;
  keywordCounts: { HIGH: number; MEDIUM: number; LOW: number; combo: number; total: number };
  repeatedPhrase: boolean;
  repeatedPhrases: { keyword: string; count: number }[];
  productAndDisease: boolean;
  treatmentAndDisease: boolean;
  // 사람이 읽을 수 있는 가산 요소 설명
  factors: string[];
  notes: string[];
  disclaimer: string;
}

const NOTES = [
  "이 점수는 사람이 먼저 검토할 후보를 정렬하기 위한 참고 점수입니다.",
  "점수가 높아도 위법 확정은 아니며, 신고 전 원문과 증거를 반드시 확인해야 합니다.",
  "이 점수는 신고 적합성이나 포상금 가능성을 보장하지 않습니다."
];

export function buildScoreExplanation(
  detection: RuleDetectionResult,
  scoring: ScoringResult
): ScoreExplanation {
  const counts = detection.counts;
  const repeated = Array.isArray(detection.repeatedPhrases) ? detection.repeatedPhrases : [];
  const cooc = detection.cooccurrence ?? { productAndDisease: false, treatmentAndDisease: false };

  const factors: string[] = [];
  if (counts.HIGH > 0) factors.push(`High 키워드 ${counts.HIGH}개 (개당 +25점)`);
  if (counts.MEDIUM > 0) factors.push(`Medium 키워드 ${counts.MEDIUM}개 (개당 +12점)`);
  if (counts.LOW > 0) factors.push(`Low 키워드 ${counts.LOW}개 (개당 +5점)`);
  if (counts.combo > 0) factors.push(`조합(문맥) 룰 ${counts.combo}건`);
  if (repeated.length > 0) {
    factors.push(`동일 문구 반복 발견 (+10점): ${repeated.map((r) => `${r.keyword}×${r.count}`).join(", ")}`);
  }
  if (cooc.productAndDisease) factors.push("상품(군) 표현과 질병명이 함께 등장 (+15점)");
  if (cooc.treatmentAndDisease) factors.push("치료/완치/예방 표현과 질병명이 함께 등장 (+25점)");

  // 증거/본문 추출 품질 참고점 — ScoringAgent 구성요소에서 가져온다
  const extractionComp = scoring.components.find((c) => c.key === "extractionQuality");
  const evidenceComp = scoring.components.find((c) => c.key === "evidenceCompleteness");
  if (extractionComp) factors.push(`본문 추출 품질 참고: ${extractionComp.score}/${extractionComp.maxPoints}점`);
  if (evidenceComp) factors.push(`증거 완성도 참고: ${evidenceComp.score}/${evidenceComp.maxPoints}점`);

  if (factors.length === 0) {
    factors.push("점수에 크게 영향을 준 의심 신호가 없습니다. 그래도 최종 판단은 사람이 합니다.");
  }

  return {
    total: scoring.priorityScore,
    grade: scoring.priorityLabel,
    gradeLevel: scoring.priorityLevel,
    components: scoring.components.map((c) => ({
      key: c.key,
      label: c.label,
      score: c.score,
      maxPoints: c.maxPoints,
      reasons: c.reasons
    })),
    ruleRiskScore: detection.riskScore,
    ruleRiskGrade: detection.riskLevel,
    keywordCounts: counts,
    repeatedPhrase: repeated.length > 0,
    repeatedPhrases: repeated.map((r) => ({ keyword: r.keyword, count: r.count })),
    productAndDisease: cooc.productAndDisease,
    treatmentAndDisease: cooc.treatmentAndDisease,
    factors,
    notes: [...NOTES],
    disclaimer: scoring.disclaimer
  };
}
