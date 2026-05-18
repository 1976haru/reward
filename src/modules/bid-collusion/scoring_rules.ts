// 입찰담합 의심 패턴 검토 우선순위 점수 (체크리스트 26)
//
// 본 점수는 "검토 우선순위" 보조 점수이며, 담합 확정 점수가 아니다.
// 모든 결과는 공정거래위원회 등 관계기관 확인이 필요하다.

export const BID_SCORING_VERSION = "1.0.0";

export const BID_SCORING_DISCLAIMER =
  "이 점수는 입찰담합 의심 후보의 검토 우선순위 산정을 위한 참고 점수이며, 담합 여부 확정 / 공정거래위원회 판단 / 법령 적용을 대체하지 않습니다.";

export const BID_SCORING_SAFETY_WARNINGS: string[] = [
  "본 결과는 담합 확정이 아닙니다.",
  "특정 업체/개인/발주기관을 담합 주체로 단정하지 않습니다.",
  "외부 신고기관 자동 제출 / 자동 로그인은 수행되지 않습니다.",
  "신고포상금은 공정거래위원회 공식 기준·조치 결과·과징금·증거 수준에 따라 달라지며 보장하지 않습니다.",
  "신고 전 사람이 원자료와 공식 안내를 직접 확인해야 합니다."
];

export type BidComponentKey =
  | "rotationSignal"
  | "groupRepetitionSignal"
  | "coverBidSignal"
  | "spreadSignal"
  | "dominanceSignal"
  | "awardRateClusterSignal"
  | "competitionSignal"
  | "extractionQuality";

export interface BidComponentDef {
  label: string;
  maxPoints: number;
}

// 합계 = 25 + 20 + 20 + 15 + 10 + 5 + 3 + 2 = 100
export const BID_COMPONENT_DEFS: Record<BidComponentKey, BidComponentDef> = {
  rotationSignal: { label: "순환 낙찰 패턴", maxPoints: 25 },
  groupRepetitionSignal: { label: "반복 업체군", maxPoints: 20 },
  coverBidSignal: { label: "들러리 후보 패턴", maxPoints: 20 },
  spreadSignal: { label: "투찰 간격 / 순위 안정성", maxPoints: 15 },
  dominanceSignal: { label: "낙찰자 지배", maxPoints: 10 },
  awardRateClusterSignal: { label: "낙찰률 군집", maxPoints: 5 },
  competitionSignal: { label: "낮은 경쟁 / 형식 참여", maxPoints: 3 },
  extractionQuality: { label: "데이터 추출 품질", maxPoints: 2 }
};

export const BID_PRIORITY_MAX_SCORE = 100;

export interface BidPriorityLevel {
  code: "LOW" | "REVIEW_NEEDED" | "HIGH_PRIORITY" | "VERY_HIGH_PRIORITY";
  label: string;
  minScore: number;
}

export const BID_PRIORITY_LEVELS: BidPriorityLevel[] = [
  { code: "VERY_HIGH_PRIORITY", label: "최우선 검토", minScore: 80 },
  { code: "HIGH_PRIORITY", label: "우선 검토", minScore: 60 },
  { code: "REVIEW_NEEDED", label: "검토 필요", minScore: 30 },
  { code: "LOW", label: "낮음", minScore: 0 }
];

export function bidLevelForScore(score: number): BidPriorityLevel {
  for (const l of BID_PRIORITY_LEVELS) {
    if (score >= l.minScore) return l;
  }
  return BID_PRIORITY_LEVELS[BID_PRIORITY_LEVELS.length - 1];
}

export function bidRecommendedActionsFor(
  code: BidPriorityLevel["code"]
): string[] {
  switch (code) {
    case "VERY_HIGH_PRIORITY":
      return [
        "관련 입찰공고/낙찰정보 원문 캡처·PDF 보존",
        "동일 업체군 반복 참여 / 순환 낙찰 / 들러리 후보 정황을 별도 표로 정리",
        "공정거래위원회 신고 절차·증거 요건 공식 안내 확인",
        "발주기관 감사부서 안내 확인",
        "신고 여부는 사람이 공식 채널에서 직접 판단"
      ];
    case "HIGH_PRIORITY":
      return [
        "공개 입찰 데이터 추가 확보 (다른 회차/품목)",
        "업체별 사업자 정보·자격은 공식 등기/사업자 정보로 확인",
        "관계기관 안내 확인"
      ];
    case "REVIEW_NEEDED":
      return [
        "단독 신호로 판단이 어렵습니다. 다른 신호와 결합 여부를 확인하세요.",
        "발주기관/품목별 정상 분포와 비교가 필요합니다."
      ];
    default:
      return [
        "검토 후보로 분류하기에는 신호가 약합니다.",
        "다른 사업·시점과 비교가 필요할 수 있습니다."
      ];
  }
}

// 신호별 가중치 (risk_signals.json 의 weight 와 일치)
export const BID_SIGNAL_WEIGHTS: Record<string, number> = {
  repeated_bidder_group: 20,
  rotating_winner: 25,
  stable_bid_rank_order: 15,
  narrow_bid_spread: 15,
  cover_bid_pattern: 20,
  single_winner_dominance: 15,
  abnormal_award_rate_clustering: 15,
  low_competition_repeated: 10,
  bid_participation_dropout: 10
};

// 신호 → 점수 컴포넌트 매핑
export const BID_SIGNAL_TO_COMPONENT: Record<string, BidComponentKey> = {
  rotating_winner: "rotationSignal",
  repeated_bidder_group: "groupRepetitionSignal",
  cover_bid_pattern: "coverBidSignal",
  narrow_bid_spread: "spreadSignal",
  stable_bid_rank_order: "spreadSignal",
  single_winner_dominance: "dominanceSignal",
  abnormal_award_rate_clustering: "awardRateClusterSignal",
  low_competition_repeated: "competitionSignal",
  bid_participation_dropout: "competitionSignal"
};
