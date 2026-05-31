// 한국어/영문 혼합 제목·상품명 유사도.
// 외부 의존성 없이 normalize → (단어토큰 Jaccard+Dice) 와 (문자 n-gram Dice) 두 성분을 결합해 점수화.
// 숫자/가격/브랜드명을 보존하기 위해 punctuation은 공백으로 치환하고 단어 단위 토큰을 사용한다.
//
// 단어토큰만 쓰면 "혈당 케어" vs "혈당케어" 처럼 띄어쓰기만 다른 동일 표현이 공통 토큰 0개로
// 유사도 0 이 된다. 이를 보완하기 위해 공백을 제거한 사본 위에서 문자 n-gram(bigram) Dice 를
// 추가로 계산하고 두 성분의 max 를 최종 점수로 사용한다(README 가 명시한 "문자 n-gram" 요소).

export function normalizeKoreanText(text: string): string {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    // 영문/숫자/한글/공백 외 문자는 공백
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 공백을 제거한 정규화 문자열 (문자 n-gram 비교용).
function normalizeNoSpace(text: string): string {
  return normalizeKoreanText(text).replace(/\s+/g, "");
}

// 문자 n-gram 집합. 길이가 n 미만이면 문자열 전체를 단일 토큰으로 사용한다.
export function charNgrams(s: string, n = 2): Set<string> {
  const out = new Set<string>();
  if (!s) return out;
  if (s.length < n) {
    out.add(s);
    return out;
  }
  for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n));
  return out;
}

// 두 집합의 Dice 계수.
function diceOfSets(A: Set<string>, B: Set<string>): number {
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

// 공백 제거 사본 위 문자 bigram Dice 유사도. 띄어쓰기 변형에 강하다.
export function charNgramSimilarity(a: string, b: string, n = 2): number {
  const sa = normalizeNoSpace(a);
  const sb = normalizeNoSpace(b);
  if (!sa || !sb) return 0;
  // 둘 다 n 미만으로 짧으면 완전일치 여부로만 판정 (1 또는 0).
  if (sa.length < n && sb.length < n) return sa === sb ? 1 : 0;
  return diceOfSets(charNgrams(sa, n), charNgrams(sb, n));
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
 * 결합 유사도. 단어토큰 성분과 문자 n-gram 성분의 max 를 사용한다.
 * - 단어토큰 성분: Jaccard+Dice 혼합 (짧은 입력은 보수적 페널티 유지).
 * - 문자 n-gram 성분: 공백 제거 후 bigram Dice — "혈당 케어"/"혈당케어" 같은 띄어쓰기 변형을 포착.
 * 빈 입력 → 0, 값 범위 [0,1], 대칭성, 짧은 입력 보수성은 그대로 유지된다.
 */
export function similarity(a: string, b: string): number {
  // 단어토큰이 한쪽이라도 없을 때도, 공백을 제거하면 비교 가능한 한글/영문이 있으면
  // 문자 n-gram 성분으로 평가한다(예: "혈당케어" 는 length≥2 토큰이 1개뿐일 수 있음).
  const tA = tokenize(a);
  const tB = tokenize(b);

  // 문자 n-gram 성분 (공백 변형에 강함). 토큰 유무와 무관하게 계산.
  const charScore = charNgramSimilarity(a, b, 2);

  if (tA.length === 0 || tB.length === 0) {
    // 단어토큰이 없으면 문자 n-gram 성분만으로 판정. 둘 다 비면 charScore=0.
    return charScore;
  }

  const j = jaccardSimilarity(a, b);
  const d = diceCoefficient(a, b);
  let tokenScore = j * 0.5 + d * 0.5;
  // 두 입력 모두 토큰 ≤2 인 경우 신뢰도 페널티 (기존 보수적 동작 유지)
  if (tA.length <= 2 && tB.length <= 2) tokenScore = tokenScore * 0.7;

  // 두 성분의 max — 띄어쓰기 변형은 charScore 로 구제하되, 토큰 일치는 그대로 인정.
  const combined = Math.max(tokenScore, charScore);
  return combined > 1 ? 1 : combined < 0 ? 0 : combined;
}
