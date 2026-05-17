import type { RuleHit } from "../../types/core.js";
import { excerptAround } from "../../utils/text.js";

export const falseAdModule = {
  id: "false_ad" as const,
  name: "건강기능식품 온라인 허위·과대광고 탐지",
  recommendedAgency: "식품의약품안전처 또는 관할 기관",
  description: "1차 MVP는 건강기능식품 온라인 상품/광고 페이지에 한정합니다. 질병 치료·예방·완치 표현, 의약품 오인 표현, 과장 효능 표현을 탐지합니다. 일반 식품·화장품·의료기기는 후속 모듈로 확장합니다."
};

export interface FalseAdRule {
  id: string;
  category: string;
  severity: RuleHit["severity"];
  keywords: string[];
  reason: string;
}

export const falseAdRules: FalseAdRule[] = [
  {
    id: "FA-DISEASE-CURE",
    category: "질병 치료·완치 오인",
    severity: "critical",
    keywords: ["암 치료", "암 완치", "당뇨 완치", "고혈압 치료", "아토피 완치", "관절염 치료", "치매 예방", "우울증 치료"],
    reason: "식품·건강기능식품·화장품 광고에서 질병의 예방 또는 치료 효과를 단정하는 표현은 신고 검토 대상이 될 수 있습니다."
  },
  {
    id: "FA-MEDICINE-LIKE",
    category: "의약품 오인 표현",
    severity: "high",
    keywords: ["약 없이 치료", "병원 안 가도", "처방 없이", "부작용 없이 치료", "천연 항생제", "스테로이드 대체"],
    reason: "일반 상품을 의약품처럼 인식하게 하는 표현은 위반 가능성이 있습니다."
  },
  {
    id: "FA-EXAGGERATED-EFFICACY",
    category: "과장 효능 표현",
    severity: "medium",
    keywords: ["100% 효과", "즉시 효과", "기적의", "독소 제거", "지방 분해", "체지방 녹임", "면역력 1000%", "간 재생"],
    reason: "소비자를 오인시킬 수 있는 절대적·과장적 효능 표현입니다."
  },
  {
    id: "FA-ILLEGAL-DRUG-SALE",
    category: "불법 의약품 판매 의심",
    severity: "critical",
    keywords: ["처방약 판매", "전문의약품 판매", "스테로이드 판매", "수면제 판매", "다이어트약 판매", "비아그라 판매"],
    reason: "전문의약품 또는 의약품 불법 유통은 별도 신고 검토 대상입니다."
  }
];

export function detectFalseAdRules(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const unique = new Set<string>();
  for (const rule of falseAdRules) {
    for (const keyword of rule.keywords) {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        const key = `${rule.id}:${keyword}`;
        if (unique.has(key)) continue;
        unique.add(key);
        hits.push({
          ruleId: rule.id,
          category: rule.category,
          keyword,
          severity: rule.severity,
          excerpt: excerptAround(text, keyword),
          reason: rule.reason
        });
      }
    }
  }
  return hits;
}
