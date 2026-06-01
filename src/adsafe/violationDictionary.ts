// AdSafe (애드세이프) — 위반 표현 사전(라이브러리). C-3.
//
// 실제 식약처/공개 보도 기반으로 알려진 "표시·광고 기준 저촉 가능 표현 패턴"을
// 카테고리별 참고 예시로 보여준다. 저작권 침해 없이 표현 패턴만 정리하며,
// 특정 광고/업체를 지목하지 않는다. 본 사전은 참고용이며 적법성을 확정하지 않는다.
//
// 출처 한정: 공개 보도자료 및 식약처 공개 자료에서 일반화된 표현 패턴.

export interface DictionaryEntry {
  /** 저촉 가능 표현 예시(패턴) */
  phrase: string;
  /** 왜 위험한지 — 신중한 톤 */
  why: string;
  /** 안전 방향 — 단정 금지 */
  saferDirection: string;
}

export interface DictionaryCategory {
  category: string;
  categoryLabel: string;
  entries: DictionaryEntry[];
}

export const VIOLATION_DICTIONARY: DictionaryCategory[] = [
  {
    category: "disease_cure_claim",
    categoryLabel: "질병 치료·완치 표현",
    entries: [
      {
        phrase: "방광염 완치",
        why: "특정 질병의 완치를 표시하면 의약품으로 오인될 수 있어 표시·광고 기준에 저촉될 여지가 있습니다.",
        saferDirection: "질병 완치 단정 대신 인정받은 기능성 범위 내 표현으로 조정을 검토 권장합니다."
      },
      {
        phrase: "암을 낫게 한다",
        why: "중대 질병의 치료 효능을 단정하는 표현은 과대광고로 볼 여지가 큽니다.",
        saferDirection: "치료 효능 단정 표현을 제거하는 방향을 검토 권장합니다."
      }
    ]
  },
  {
    category: "medicine_substitution",
    categoryLabel: "의약품 오인·대체 표현",
    entries: [
      {
        phrase: "위고비처럼",
        why: "전문의약품에 빗대는 표현은 의약품 오인을 유발할 수 있어 저촉될 여지가 있습니다.",
        saferDirection: "의약품과의 비교·대체 뉘앙스를 제거하는 방향을 검토 권장합니다."
      },
      {
        phrase: "GLP-1 자극",
        why: "의약품 작용기전을 차용한 표현은 의약품 오인 위험이 있습니다.",
        saferDirection: "의약품 기전 차용 표현 대신 식품으로서의 일반적 표현 검토 권장합니다."
      },
      {
        phrase: "약 대신 먹는",
        why: "의약품을 대체한다는 취지는 의약품 오인 기준에 저촉될 여지가 있습니다.",
        saferDirection: "대체 의미를 빼고 식품 본연의 표현으로 조정 검토 권장합니다."
      }
    ]
  },
  {
    category: "weight_loss_claim",
    categoryLabel: "체중 감량 단정 표현",
    entries: [
      {
        phrase: "먹기만 해도 살이 빠진다",
        why: "노력 없이 체중이 감소한다는 보장성 표현은 과대광고로 볼 여지가 있습니다.",
        saferDirection: "보장성 표현을 제거하고 개인차 안내를 함께 검토 권장합니다."
      }
    ]
  },
  {
    category: "detox_claim",
    categoryLabel: "디톡스·체내 배출 표현",
    entries: [
      {
        phrase: "체내 독소 배출",
        why: "검증되지 않은 디톡스 효능 단정은 소비자 오인을 부를 수 있습니다.",
        saferDirection: "효능 단정을 완화하는 방향을 검토 권장합니다."
      }
    ]
  },
  {
    category: "exaggerated_effect",
    categoryLabel: "과장된 효능 표현",
    entries: [
      {
        phrase: "단 일주일 만에 효과",
        why: "객관적 근거를 넘는 즉효성 표현은 과대광고로 볼 여지가 있습니다.",
        saferDirection: "입증 가능한 범위로 표현 수위를 낮추는 방향을 검토 권장합니다."
      },
      {
        phrase: "부작용 전혀 없는",
        why: "절대적 안전성 단정은 소비자 오인을 유발할 수 있습니다.",
        saferDirection: "절대적 표현을 피하고 섭취 주의사항을 함께 검토 권장합니다."
      }
    ]
  }
];

export const DICTIONARY_NOTICE =
  "본 사전은 공개 보도·식약처 공개 자료에서 일반화된 표현 패턴 참고용입니다. 특정 광고/업체를 지목하지 않으며, 적법성이나 위반 여부를 확정하지 않습니다. 최종 판단은 사람이 합니다.";
