// 보조금 부정수급 의심 후보 우선순위 점수 (체크리스트 25)
//
// 본 점수는 "검토 우선순위"를 위한 보조 점수이며, 부정수급 확정 점수가 아니다.
// 모든 결과는 공식기관 확인이 필요하다.

export const SUBSIDY_SCORING_VERSION = "1.0.0";

export const SUBSIDY_SCORING_DISCLAIMER =
  "이 점수는 보조금 부정수급 의심 후보의 검토 우선순위 산정을 위한 참고 점수이며, 부정수급 여부 확정 / 기관 판단 / 법령 적용을 대체하지 않습니다.";

export const SUBSIDY_SCORING_SAFETY_WARNINGS: string[] = [
  "본 결과는 부정수급 확정이 아닙니다.",
  "특정 단체/개인/사업자를 부정수급자로 단정하지 않습니다.",
  "외부 신고기관 자동 제출 / 자동 로그인은 수행되지 않습니다.",
  "포상금/보상 지급을 보장하지 않습니다.",
  "신고 전 사람이 원자료/기관 기준/법령/실제 사업 수행 여부를 확인해야 합니다."
];

export type SubsidyComponentKey =
  | "recipientPatternSignal"
  | "addressSimilaritySignal"
  | "projectSimilaritySignal"
  | "evidenceCompleteness"
  | "amountOutputImbalance"
  | "disclosureSignal"
  | "extractionQuality";

export interface SubsidyComponentDef {
  label: string;
  maxPoints: number;
}

// 합계 = 25 + 20 + 15 + 15 + 10 + 10 + 5 = 100
export const SUBSIDY_COMPONENT_DEFS: Record<SubsidyComponentKey, SubsidyComponentDef> = {
  recipientPatternSignal: { label: "수급 패턴 (반복/특수관계)", maxPoints: 25 },
  addressSimilaritySignal: { label: "주소 유사성", maxPoints: 20 },
  projectSimilaritySignal: { label: "사업명 유사성", maxPoints: 15 },
  evidenceCompleteness: { label: "증거 완성도", maxPoints: 15 },
  amountOutputImbalance: { label: "금액 대비 산출물 불균형", maxPoints: 10 },
  disclosureSignal: { label: "공시/공개 정보 누락", maxPoints: 10 },
  extractionQuality: { label: "자료 추출 품질", maxPoints: 5 }
};

export const SUBSIDY_PRIORITY_MAX_SCORE = 100;

export interface SubsidyPriorityLevel {
  code: "LOW" | "REVIEW_NEEDED" | "HIGH_PRIORITY" | "VERY_HIGH_PRIORITY";
  label: string;
  minScore: number;
}

export const SUBSIDY_PRIORITY_LEVELS: SubsidyPriorityLevel[] = [
  { code: "VERY_HIGH_PRIORITY", label: "최우선 검토", minScore: 80 },
  { code: "HIGH_PRIORITY", label: "우선 검토", minScore: 60 },
  { code: "REVIEW_NEEDED", label: "검토 필요", minScore: 30 },
  { code: "LOW", label: "낮음", minScore: 0 }
];

export function subsidyLevelForScore(score: number): SubsidyPriorityLevel {
  for (const l of SUBSIDY_PRIORITY_LEVELS) {
    if (score >= l.minScore) return l;
  }
  return SUBSIDY_PRIORITY_LEVELS[SUBSIDY_PRIORITY_LEVELS.length - 1];
}

export function subsidyRecommendedActionsFor(
  code: SubsidyPriorityLevel["code"]
): string[] {
  switch (code) {
    case "VERY_HIGH_PRIORITY":
      return [
        "관련 공시/공고/교부정보 원문을 캡처·PDF로 보존",
        "보조금 관리기관에 공식 자료 확인 요청 검토",
        "동일 주소/대표 여부는 공식 등기/사업자 정보로 확인",
        "신고 여부는 사람이 공식 채널에서 직접 판단"
      ];
    case "HIGH_PRIORITY":
      return [
        "공개 정산/결과 보고 자료 확보 시도",
        "유사 사업명·동일 주소·반복 수급 정황 추가 검토",
        "관할 지자체 감사부서 안내 확인"
      ];
    case "REVIEW_NEEDED":
      return [
        "단독 신호로는 판단이 어렵습니다. 다른 신호와 결합 여부를 확인하세요.",
        "공개 결과물 추가 확인을 시도하세요."
      ];
    default:
      return [
        "검토 후보로 분류하기에는 신호가 약합니다.",
        "다른 사업·연도와 비교가 필요한 경우 다시 검토하세요."
      ];
  }
}

// 신호별 가중치 (risk_signals.json 의 weight 와 일치)
export const SUBSIDY_SIGNAL_WEIGHTS: Record<string, number> = {
  repeated_recipient: 20,
  same_address_multiple_entities: 20,
  similar_project_titles: 15,
  missing_result_evidence: 15,
  high_amount_low_output: 15,
  related_vendor_signal: 20,
  execution_pattern_anomaly: 10,
  disclosure_missing: 10,
  duplicate_content: 15
};

// 신호 카테고리 → 점수 컴포넌트 매핑
export const SUBSIDY_SIGNAL_TO_COMPONENT: Record<string, SubsidyComponentKey> = {
  repeated_recipient: "recipientPatternSignal",
  related_vendor_signal: "recipientPatternSignal",
  same_address_multiple_entities: "addressSimilaritySignal",
  similar_project_titles: "projectSimilaritySignal",
  missing_result_evidence: "evidenceCompleteness",
  duplicate_content: "evidenceCompleteness",
  high_amount_low_output: "amountOutputImbalance",
  execution_pattern_anomaly: "amountOutputImbalance",
  disclosure_missing: "disclosureSignal"
};
