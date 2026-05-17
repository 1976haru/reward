// 한국어/영문 혼합 제목·상품명 유사도.
// 외부 의존성 없이 normalize → token → Jaccard + Dice 혼합으로 점수화.
// 숫자/가격/브랜드명을 보존하기 위해 punctuation은 공백으로 치환하고 단어 단위 토큰을 사용한다.

export function normalizeKoreanText(text: string): string {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    // 영문/숫자/한글/공백 외 문자는 공백
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  const norm = normalizeKoreanText(text);
  if (!norm) return [];
  // 길이 1짜리는 노이즈로 보고 제거 (한글 단일 음절은 의미 약함)
  return norm.split(" ").filter((t) => t.length >= 2);
}

function toSet(arr: string[]): Set<string> {
  return new Set(arr);
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = toSet(tokenize(a));
  const B = toSet(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function diceCoefficient(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.length === 0 || B.length === 0) return 0;
  const Aset = toSet(A);
  const Bset = toSet(B);
  let inter = 0;
  for (const x of Aset) if (Bset.has(x)) inter++;
  return (2 * inter) / (Aset.size + Bset.size);
}

/**
 * 결합 유사도. 매우 짧은 입력은 보수적으로 낮춘다.
 */
export function similarity(a: string, b: string): number {
  const tA = tokenize(a);
  const tB = tokenize(b);
  if (tA.length === 0 || tB.length === 0) return 0;
  const j = jaccardSimilarity(a, b);
  const d = diceCoefficient(a, b);
  const base = j * 0.5 + d * 0.5;
  // 두 입력 모두 토큰 ≤2 인 경우 신뢰도 페널티
  if (tA.length <= 2 && tB.length <= 2) return base * 0.7;
  return base;
}
