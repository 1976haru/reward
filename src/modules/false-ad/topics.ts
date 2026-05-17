import type { DiscoveryTopic } from "../../types/candidate.js";

/**
 * 건강기능식품 모듈의 탐색 주제 + 시드 키워드.
 *
 * 주의:
 * - 본 키워드는 광고 작성용이 아니라 "허위·과대광고 의심 후보를 찾기 위한 검색 시드"다.
 * - 검색 결과를 자동으로 신고하지 않는다. 사람이 본문을 확인한 뒤 판단한다.
 * - 키워드 자체가 위반은 아니며, 광고 문맥과 결합되어 의심도가 결정된다.
 */
export const falseAdTopics: DiscoveryTopic[] = [
  {
    id: "blood-sugar",
    label: "혈당/당뇨",
    description: "혈당 조절·당뇨 관련 건강기능식품 광고에서 질병 치료·완치 표현 의심",
    seedKeywords: [
      "혈당 영양제 당뇨 개선",
      "당뇨 건강기능식품 후기",
      "혈당 낮추는 영양제",
      "당뇨 완치 광고",
      "혈당 관리 보조제"
    ],
    diseaseHints: ["당뇨", "혈당"]
  },
  {
    id: "joint-cartilage",
    label: "관절/연골",
    description: "관절·연골 영양제에서 관절염 치료·통증 완치 의심",
    seedKeywords: [
      "관절염 영양제 치료",
      "연골 건강기능식품 후기",
      "무릎 통증 보스웰리아",
      "관절 통증 개선 영양제",
      "관절 재생 보조제"
    ],
    diseaseHints: ["관절염", "연골"]
  },
  {
    id: "diet-body-fat",
    label: "다이어트/체지방",
    description: "다이어트·체지방 보조제에서 즉시 효과·먹기만 하면 등 단정 표현 의심",
    seedKeywords: [
      "체지방 분해 영양제",
      "지방 제거 건강기능식품",
      "먹기만 하면 살 빠지는",
      "다이어트 보조제 후기",
      "복부 지방 즉시 제거 영양제"
    ],
    diseaseHints: ["비만", "체지방"]
  },
  {
    id: "liver-detox",
    label: "간 건강/해독",
    description: "간 해독·간염 치료 등 의약품 영역 표현 의심",
    seedKeywords: [
      "간 해독 영양제",
      "간염 치료 보조제",
      "간 재생 건강기능식품",
      "간수치 낮추는 영양제"
    ],
    diseaseHints: ["간염", "간 손상"]
  },
  {
    id: "immunity",
    label: "면역력",
    description: "면역력 1000% 등 정량적 과장 표현 의심",
    seedKeywords: [
      "면역력 1000% 영양제",
      "면역 보조제 후기",
      "감기 예방 영양제",
      "면역 밸런스 보조제"
    ],
    diseaseHints: ["감염", "감기", "코로나"]
  },
  {
    id: "sleep-insomnia",
    label: "수면/불면",
    description: "불면증 치료 등 의약품 영역 표현 의심",
    seedKeywords: [
      "불면증 치료 영양제",
      "수면제 대체 건강기능식품",
      "잠 잘 오는 영양제 후기"
    ],
    diseaseHints: ["불면증"]
  },
  {
    id: "menopause",
    label: "갱년기",
    description: "갱년기 호르몬 정상화 등 의약품 오인 표현 의심",
    seedKeywords: [
      "갱년기 호르몬 정상화 영양제",
      "갱년기 증상 완치 보조제",
      "갱년기 영양제 후기"
    ],
    diseaseHints: ["갱년기"]
  },
  {
    id: "prostate",
    label: "전립선",
    description: "전립선 비대 치료 등 표현 의심",
    seedKeywords: [
      "전립선 영양제 치료",
      "전립선 건강기능식품 후기",
      "전립선 비대 완화 보조제"
    ],
    diseaseHints: ["전립선"]
  },
  {
    id: "gut-health",
    label: "장 건강",
    description: "장 완전 해독·과민성 대장 치료 등 표현 의심",
    seedKeywords: [
      "장 완전 해독 영양제",
      "과민성 대장 치료 보조제",
      "장 컨디션 회복 후기"
    ],
    diseaseHints: ["과민성 대장", "장 질환"]
  },
  {
    id: "cholesterol",
    label: "콜레스테롤",
    description: "콜레스테롤 치료·동맥경화 치료 등 표현 의심",
    seedKeywords: [
      "콜레스테롤 치료 영양제",
      "동맥경화 치료 보조제",
      "혈관 청소 건강기능식품"
    ],
    diseaseHints: ["콜레스테롤", "동맥경화"]
  },
  {
    id: "blood-pressure",
    label: "혈압",
    description: "고혈압 치료·혈압약 대체 등 표현 의심",
    seedKeywords: [
      "고혈압 치료 영양제",
      "혈압약 대체 보조제",
      "혈압 낮추는 건강기능식품"
    ],
    diseaseHints: ["고혈압"]
  },
  {
    id: "skin-atopy",
    label: "피부/아토피",
    description: "아토피 완치·피부 재생 등 의약품 오인 표현 의심",
    seedKeywords: [
      "아토피 완치 영양제",
      "피부 재생 건강기능식품",
      "아토피 치료 보조제 후기"
    ],
    diseaseHints: ["아토피"]
  }
];

export function getTopicById(id: string): DiscoveryTopic | undefined {
  return falseAdTopics.find((t) => t.id === id || t.label === id);
}

export function generateSeedKeywords(topicIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of topicIds) {
    const topic = getTopicById(t);
    if (!topic) continue;
    for (const k of topic.seedKeywords) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
