// 후보 1차 점수화 — 본문을 열기 전 단계에서 title/snippet/url만 보고 우선순위를 매긴다.
// 본문 기반 정밀 분석은 OrchestratorAgent가 별도로 수행한다.

import { clampRiskScore } from "../../utils/validation.js";

const HEALTH_FUNCTIONAL_FOOD_TERMS = [
  "영양제", "건강기능식품", "건기식", "보조제", "보충제", "프로바이오틱스",
  "효소", "오메가", "비타민", "유산균", "콜라겐"
];

const DISEASE_TERMS = [
  "암", "당뇨", "혈당", "혈압", "고혈압", "콜레스테롤", "동맥경화",
  "관절염", "류마티스", "치매", "알츠하이머", "우울증", "불면증",
  "아토피", "비염", "간염", "위염", "역류성 식도염", "코로나", "갱년기",
  "전립선", "통풍"
];

const TREATMENT_CLAIM_TERMS = [
  "치료", "완치", "예방", "근본 치료", "재발 방지", "약 없이", "약 대체",
  "처방 없이", "병원 안 가도", "의약품 대체", "100% 효과", "기적의",
  "즉시 효과", "먹기만 하면", "재생", "회춘"
];

const COMMERCE_TERMS = [
  "구매", "후기", "가격", "할인", "판매", "쇼핑", "최저가",
  "상품", "리뷰", "쿠폰", "정품"
];

// 공식 기관/뉴스/학술 도메인 → 신고 후보 우선순위 낮춤
const LOW_PRIORITY_HOST_PATTERNS = [
  /\.go\.kr$/i,
  /\.or\.kr$/i,
  /\.gov$/i,
  /(^|\.)mfds\.go\.kr$/i,
  /(^|\.)law\.go\.kr$/i,
  /(^|\.)acrc\.go\.kr$/i,
  /(^|\.)epeople\.go\.kr$/i,
  /(^|\.)foodsafetykorea\.go\.kr$/i,
  /(^|\.)kipo\.go\.kr$/i,
  /(^|\.)nih\.gov$/i,
  /(^|\.)who\.int$/i,
  /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i,
  // 주요 언론 도메인 (예시)
  /(^|\.)yna\.co\.kr$/i,
  /(^|\.)yonhapnews\.co\.kr$/i,
  /(^|\.)chosun\.com$/i,
  /(^|\.)joongang\.co\.kr$/i,
  /(^|\.)hani\.co\.kr$/i,
  /(^|\.)kbs\.co\.kr$/i,
  /(^|\.)mbc\.co\.kr$/i,
  /(^|\.)sbs\.co\.kr$/i
];

export interface ScoreInput {
  title: string;
  snippet?: string;
  url: string;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

function containsAny(haystack: string, needles: string[]): string[] {
  const lower = haystack.toLowerCase();
  return needles.filter((n) => lower.includes(n.toLowerCase()));
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function scoreCandidate(input: ScoreInput): ScoreResult {
  const text = `${input.title} ${input.snippet ?? ""}`;
  const reasons: string[] = [];
  let score = 0;

  const health = containsAny(text, HEALTH_FUNCTIONAL_FOOD_TERMS);
  if (health.length > 0) {
    score += 20;
    reasons.push(`건강기능식품 관련 표현: ${health.slice(0, 3).join(", ")}`);
  }

  const diseases = containsAny(text, DISEASE_TERMS);
  if (diseases.length > 0) {
    score += 20;
    reasons.push(`질병명 포함: ${diseases.slice(0, 3).join(", ")}`);
  }

  const claims = containsAny(text, TREATMENT_CLAIM_TERMS);
  if (claims.length > 0) {
    score += 25;
    reasons.push(`치료·완치·예방·약 대체 단정 표현: ${claims.slice(0, 3).join(", ")}`);
  }

  const commerce = containsAny(text, COMMERCE_TERMS);
  if (commerce.length > 0) {
    score += 15;
    reasons.push(`상품·구매·후기 표현: ${commerce.slice(0, 3).join(", ")}`);
  }

  const host = hostFromUrl(input.url);
  if (host && LOW_PRIORITY_HOST_PATTERNS.some((re) => re.test(host))) {
    score -= 20;
    reasons.push(`공식기관/언론/학술 도메인은 신고 후보 우선순위 낮춤: ${host}`);
  }

  // 추가 약한 신호: URL 경로에 product/shop/sale 등 상거래 힌트가 있으면 가산
  if (/product|shop|sale|item|goods|store/i.test(input.url)) {
    score += 5;
    reasons.push("URL 경로에 상거래 힌트(product/shop/...)");
  }

  return { score: clampRiskScore(score), reasons };
}
