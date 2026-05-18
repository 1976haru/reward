// 위조상품 모듈용 점수 가중치 (체크리스트 24)
//
// 본 점수는 "위조상품 의심 후보의 사람 검토 우선순위"를 위한 보조 점수다.
// 위조 확정 점수가 아니며, 위반/침해 단정 지표가 아니다.
// 권리자 감정/관계기관 판단을 대체하지 않는다.

export const COUNTERFEIT_SCORING_VERSION = "1.0.0";

export const COUNTERFEIT_SCORING_DISCLAIMER =
  "이 점수는 위조상품 의심 후보의 검토 우선순위 산정을 위한 참고 점수이며, 위조 여부 확정 / 권리자 감정 / 기관 판단을 대체하지 않습니다.";

export const COUNTERFEIT_SCORING_SAFETY_WARNINGS: string[] = [
  "본 결과는 위조 확정이 아닙니다.",
  "외부 신고기관 자동 제출 / 자동 로그인은 수행되지 않습니다.",
  "포상금 지급을 보장하지 않습니다.",
  "공식 기준은 각 기관 공식 안내를 직접 확인해야 합니다.",
  "비공개 채팅방 / 판매자 개인정보 추적은 수행하지 않습니다."
];

export type CounterfeitComponentKey =
  | "counterfeitExpressionSignal"
  | "brandSignal"
  | "commercialSignal"
  | "evidenceCompleteness"
  | "sellerPatternSignal"
  | "extractionQuality";

export interface CounterfeitComponentDef {
  label: string;
  maxPoints: number;
}

// 합계 100 — 사양 그대로
export const COUNTERFEIT_COMPONENT_DEFS: Record<CounterfeitComponentKey, CounterfeitComponentDef> = {
  counterfeitExpressionSignal: { label: "위조 의심 표현", maxPoints: 35 },
  brandSignal: { label: "브랜드 신호", maxPoints: 15 },
  commercialSignal: { label: "판매 신호", maxPoints: 15 },
  evidenceCompleteness: { label: "증거 완성도", maxPoints: 20 },
  sellerPatternSignal: { label: "판매 방식 신호", maxPoints: 10 },
  extractionQuality: { label: "본문 추출 품질", maxPoints: 5 }
};

export const COUNTERFEIT_PRIORITY_MAX_SCORE = 100;

export interface CounterfeitPriorityLevel {
  code: "LOW" | "REVIEW_NEEDED" | "HIGH_PRIORITY" | "VERY_HIGH_PRIORITY";
  label: string;
  minScore: number;
}

export const COUNTERFEIT_PRIORITY_LEVELS: CounterfeitPriorityLevel[] = [
  { code: "VERY_HIGH_PRIORITY", label: "매우 높은 우선순위", minScore: 80 },
  { code: "HIGH_PRIORITY", label: "높은 우선순위", minScore: 60 },
  { code: "REVIEW_NEEDED", label: "검토 필요", minScore: 30 },
  { code: "LOW", label: "낮음", minScore: 0 }
];

export function counterfeitLevelForScore(score: number): CounterfeitPriorityLevel {
  for (const l of COUNTERFEIT_PRIORITY_LEVELS) {
    if (score >= l.minScore) return l;
  }
  return COUNTERFEIT_PRIORITY_LEVELS[COUNTERFEIT_PRIORITY_LEVELS.length - 1];
}

export function counterfeitRecommendedActionsFor(
  code: CounterfeitPriorityLevel["code"]
): string[] {
  switch (code) {
    case "VERY_HIGH_PRIORITY":
      return [
        "공개 캡처/PDF로 증거 보강 후 사람 검토 진행 권장",
        "판매자 표시 정보(공개 영역) 확인",
        "권리자 감정/관계기관 확인 절차 안내 검토",
        "신고 여부는 사람이 공식 채널에서 직접 판단"
      ];
    case "HIGH_PRIORITY":
      return [
        "위조 의심 문구 위치 캡처 보강",
        "동일 판매자 추정 게시글 검토",
        "공식 신고 채널 안내 확인 (특허청/원스톱 신고상담센터)"
      ];
    case "REVIEW_NEEDED":
      return [
        "추가 증거 확보가 가능한지 검토",
        "브랜드/상표 표시 명확성 재확인"
      ];
    default:
      return [
        "단독으로는 위조 후보로 판단하기 어렵습니다.",
        "다른 신호와 결합되는지 확인하세요."
      ];
  }
}

// ScoringAgent 가 컴포넌트별 점수를 계산할 때 참조하는 가중치
export const COUNTERFEIT_SCORING_WEIGHTS = {
  rule: {
    // RuleAgent score (0..100) → counterfeitExpressionSignal (0..35)
    baseFactor: 0.35,
    highCountBonus: { threshold: 2, points: 5 },
    comboPresenceBonus: 5,
    mediumOnlyPenalty: { points: -3 }
  },
  brand: {
    // brand keyword 매치(예: 샤넬/루이비통/롤렉스 등) 가산
    perBrandPoint: 5,
    maxPoints: 15
  },
  commerce: {
    // url에 product/shop/mall/sale/store/item 포함 또는 price 신호
    urlHintPoint: 8,
    priceHintPoint: 7,
    maxPoints: 15
  },
  evidence: {
    perItem: 4, // 6항목 × 4 = 24 → cap 20
    maxPoints: 20
  },
  seller: {
    secretContactPoint: 5, // 카톡/텔레/DM 등
    evasionPoint: 5,       // 단속/세관 피해
    maxPoints: 10
  },
  extraction: {
    base: 3,
    warningPenalty: -1, // warning 1건당
    maxPoints: 5
  }
} as const;
