// 신고 후보 우선순위 점수 규칙 (가중치·등급·다음 행동·금지 표현 정리).
// 본 점수는 법 위반 확정이 아니며 포상금 지급 가능성을 의미하지 않는다.

import type {
  ComponentKey,
  PriorityLevelCode,
  ScoringLevel
} from "../types/scoring.js";

export const SCORING_VERSION = "1.0.0";

export const COMPONENT_DEFS: Record<
  ComponentKey,
  { label: string; maxPoints: number }
> = {
  ruleSignal:           { label: "금지표현/의심표현 강도",        maxPoints: 40 },
  llmSignal:            { label: "AI 문맥 판단",                   maxPoints: 20 },
  evidenceCompleteness: { label: "증거 완성도",                    maxPoints: 15 },
  commercialSignal:     { label: "판매 활성도/상업성",             maxPoints: 10 },
  repetitionSignal:     { label: "반복성/패턴성",                  maxPoints: 10 },
  extractionQuality:    { label: "수집·추출 품질",                 maxPoints:  5 }
};

export const PRIORITY_LEVELS: ScoringLevel[] = [
  { min:  0, max: 29,  label: "낮음",          code: "LOW" },
  { min: 30, max: 59,  label: "검토 필요",     code: "REVIEW_NEEDED" },
  { min: 60, max: 79,  label: "우선 검토",     code: "HIGH_PRIORITY" },
  { min: 80, max: 100, label: "최우선 검토",   code: "VERY_HIGH_PRIORITY" }
];

export const PRIORITY_MAX_SCORE = 100;

export const SCORING_DISCLAIMER =
  "이 점수는 법 위반 확정 또는 포상금 지급 가능성을 의미하지 않으며, 사람이 먼저 검토할 후보의 우선순위를 정하기 위한 참고 점수입니다.";

export const SCORING_SAFETY_WARNINGS = [
  "본 점수는 법 위반 확정이 아닙니다.",
  "본 점수는 포상금 지급을 보장하지 않습니다.",
  "사람 검토 없이 외부 신고기관에 제출하지 마십시오."
];

// 점수 산정 시 사용하는 가중치/임계값 — 한 곳에서 관리한다.
export const SCORING_WEIGHTS = {
  rule: {
    // RuleAgent.riskScore(0..100)를 40점 만점으로 정규화
    baseFactor: 0.4,
    highCountBonus: { threshold: 3, points: 4 },
    comboPresenceBonus: 3,
    mediumOnlyPenalty: { threshold: 1, points: -2 }, // HIGH 0건 + MEDIUM만 있을 때 약간 감점
    capWarn: 40
  },
  llm: {
    overallRisk: { VERY_HIGH: 12, HIGH: 9, MEDIUM: 5, LOW: 2, UNCERTAIN: 0 } as Record<string, number>,
    violationLikelihood: { HIGH: 4, MEDIUM: 2, LOW: 1, UNCERTAIN: 0 } as Record<string, number>,
    confidenceMax: 4
  },
  evidence: {
    hasUrl: 2,
    hasHtml: 2,
    hasText: 2,
    hasScreenshot: 3,
    hasPdf: 3,
    hasMetadata: 1,
    hasManifest: 1,
    hasSha256: 1,
    cap: 15
  },
  commercial: {
    hasPrice: 3,
    shopUrlHint: 2,
    reviewCandidatesThreshold: { threshold: 3, points: 3 },
    sellerInfo: 2,
    cap: 10
  },
  repetition: {
    sameHighKeywordRepeat: 3,           // 같은 ruleId 매치가 2회 이상
    manyClaimCandidates: { threshold: 5, points: 3 },
    sameDomainCandidates: 2,
    reviewAsClaim: 2,
    cap: 10
  },
  extraction: {
    textLengthGood: { threshold: 500, points: 2 },
    hasClaim: 2,
    warningsFewBonus: { thresholdMax: 2, points: 1 },
    warningsManyPenalty: { thresholdMin: 5, points: -2 },
    collectorWarningsPenalty: -1,
    cap: 5,
    floor: 0
  }
} as const;

export function levelForScore(score: number): ScoringLevel {
  const s = Math.max(0, Math.min(PRIORITY_MAX_SCORE, Math.round(score)));
  for (const lv of PRIORITY_LEVELS) {
    if (s >= lv.min && s <= lv.max) return lv;
  }
  return PRIORITY_LEVELS[0];
}

export function recommendedActionsFor(level: PriorityLevelCode): string[] {
  switch (level) {
    case "LOW":
      return [
        "현재 자료만으로는 신고 후보 우선순위가 낮습니다.",
        "추가 증거가 있으면 재분석하세요. 본 결과는 사람 검토 보조용 참고치입니다."
      ];
    case "REVIEW_NEEDED":
      return [
        "의심 문구가 일부 있어 사람이 검토해 보시기를 권장합니다.",
        "스크린샷·PDF 등 증거를 보강하고 광고 문맥을 직접 확인하세요.",
        "공식 기준(법령·기관 안내) 확인이 필요합니다."
      ];
    case "HIGH_PRIORITY":
      return [
        "우선 검토 후보입니다.",
        "원본 URL, 캡처, PDF, 판매자 표시 정보, 의심 문구 위치를 사람이 확인하세요.",
        "공식 기준과 관할 기관을 사람이 직접 확인한 뒤 검토하세요."
      ];
    case "VERY_HIGH_PRIORITY":
      return [
        "최우선 검토 후보입니다.",
        "증거 패키지 완성도(스크린샷·PDF·텍스트·해시)와 광고 문맥의 일치 여부를 사람이 최종 확인하세요.",
        "외부 신고 전 공식 기준(법령·고시·기관 안내 최신본)을 사람이 직접 재확인하세요."
      ];
  }
}

export const SCORING_PROHIBITED_PHRASES = [
  "위험도 확정",
  "위반 확률",
  "포상금 가능성 높음",
  "수익 가능성",
  "불법 확정",
  "신고 추천",
  "법 위반 가능성 90%"
];
