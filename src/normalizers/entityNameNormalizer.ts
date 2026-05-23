// 기관명·단체명 정규화 모듈 (체크리스트 13).
//
// 주식회사/(주)/㈜/사단법인/재단법인/사회복지법인/협동조합/영농조합법인 등 법인·단체 표기와
// 띄어쓰기/특수문자/괄호/전각·반각/대소문자 차이를 통합해 "동일 기관 후보"를 만든다.
//
// 안전 원칙:
//   - 동일 기관을 확정하지 않는다. 자동 확정 병합을 하지 않는다. 모든 후보는 reviewRequired=true.
//   - 대표자명/전화번호/상세주소는 단독 병합 기준으로 사용하지 않는다 (본 모듈은 이름만 입력으로 받는다).
//   - 지역명(시군구)은 보조 신호로만 사용한다.
//   - 외부 의존성 없이 구현한다.
//
// 본 모듈은 단체를 부정수급자로 단정하지 않으며, 법률 자문을 대체하지 않는다.

import {
  EntityCandidateGroup,
  EntityKind,
  EntityMatchCandidate,
  EntityMatchDecision,
  EntityMatchOptions,
  EntityNormalizationOptions,
  ENTITY_GENERIC_TOKENS,
  ENTITY_LEGAL_PREFIXES,
  ENTITY_LEGAL_SUFFIXES,
  ENTITY_OPTIONAL_SUFFIXES,
  ENTITY_REGION_TOKENS,
  NormalizedEntityName
} from "../types/entityNormalization.js";

// 제거 대상 법인/단체 표현 — 길이 내림차순 (긴 표현 우선 제거)
const ALL_LEGAL_MARKERS: string[] = Array.from(
  new Set<string>([...ENTITY_LEGAL_PREFIXES, ...ENTITY_LEGAL_SUFFIXES])
).sort((a, b) => b.length - a.length);

const GENERIC_SET = new Set<string>(ENTITY_GENERIC_TOKENS);
const REGION_SET = new Set<string>(ENTITY_REGION_TOKENS);

// compact(공백 제거) 단계에서 안전하게 제거할 수 있는 순수 한글 법인표현 (길이 3+).
// 괄호 약칭((주)/(사)/(재) 등)은 한 글자로 compact 되어 오제거 위험이 있어 제외한다.
const COMPACT_SAFE_MARKERS: string[] = ALL_LEGAL_MARKERS_PUREHANGUL();

function ALL_LEGAL_MARKERS_PUREHANGUL(): string[] {
  const set = new Set<string>([...ENTITY_LEGAL_PREFIXES, ...ENTITY_LEGAL_SUFFIXES]);
  return Array.from(set)
    .filter((m) => /^[가-힣]{3,}$/.test(m))
    .sort((a, b) => b.length - a.length);
}

// ---------- 1. normalizeUnicode ----------

/** 전각/반각, ㈜, 괄호 문자 등을 표준화한다 (NFKC + 약칭 정규화). */
export function normalizeUnicode(text: string): string {
  if (typeof text !== "string") return "";
  let out = text.normalize("NFKC");
  // NFKC 가 ㈜(U+3236) 를 "(株)" 로 바꾸므로 한국식 약칭으로 통일
  out = out.replace(/㈜|\(株\)/g, "(주)");
  out = out.replace(/㈐|\(社\)/g, "(사)");
  // 다양한 괄호류를 표준 괄호로
  out = out.replace(/[〔【［]/g, "(").replace(/[〕】］]/g, ")");
  return out;
}

// ---------- 2. normalizeEntityWhitespace ----------

/** 공백/줄바꿈/탭을 단일 공백으로 정리하고 앞뒤 공백 제거. */
export function normalizeEntityWhitespace(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

// ---------- 3. stripOuterNoise ----------

/** 앞뒤 공백/따옴표/불필요한 구두점 제거. */
export function stripOuterNoise(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/^[\s"'“”‘’`·,.\-_/\\|]+/, "")
    .replace(/[\s"'“”‘’`·,.\-_/\\|]+$/, "")
    .trim();
}

// ---------- 4. removeParentheticalBranches ----------

/** 괄호 안 지부/지점/지역 표현 제거 (옵션으로 보존 가능). */
export function removeParentheticalBranches(
  text: string,
  options: EntityNormalizationOptions = {}
): string {
  if (typeof text !== "string") return "";
  const remove = options.removeBranches !== false; // 기본 제거
  if (!remove) return text;
  // (), [], 〈〉 류 괄호 블록 제거
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- 5. normalizeLegalEntityMarkers ----------

export interface LegalMarkerResult {
  text: string;
  removedTokens: string[];
}

/**
 * 주식회사/(주)/㈜/사단법인/재단법인/사회복지법인/협동조합 등 접두·접미 표현을 제거한다.
 * 제거된 표현은 removedTokens 에 기록한다. 옵션으로 보조 접미어도 제거할 수 있다.
 */
export function normalizeLegalEntityMarkers(
  text: string,
  options: EntityNormalizationOptions = {}
): LegalMarkerResult {
  if (typeof text !== "string") return { text: "", removedTokens: [] };
  let out = text;
  const removed: string[] = [];

  for (const marker of ALL_LEGAL_MARKERS) {
    if (out.includes(marker)) {
      // 괄호 약칭(예: "(주)")은 그대로, 일반 표현은 단어 경계 없이 제거 (한글은 경계 개념이 약함)
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "g");
      if (re.test(out)) {
        out = out.replace(re, " ");
        removed.push(marker);
      }
    }
  }

  if (options.removeOptionalSuffixes) {
    for (const suf of ENTITY_OPTIONAL_SUFFIXES) {
      const escaped = suf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`${escaped}$`);
      const trimmed = out.trim();
      if (re.test(trimmed)) {
        out = trimmed.replace(re, " ");
        removed.push(suf);
      }
    }
  }

  out = out.replace(/\s+/g, " ").trim();
  return { text: out, removedTokens: removed };
}

// ---------- 6. normalizePunctuation ----------

/** 하이픈/언더스코어/점/쉼표/슬래시/중점 등 구두점 정리(공백으로 치환). */
export function normalizePunctuation(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[-_.,/\\|·•~!@#$%^&*+=:;'"“”‘’`<>?{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- 7. tokenizeEntityName ----------

/** 한글/영문/숫자 토큰화. */
export function tokenizeEntityName(text: string): string[] {
  if (typeof text !== "string") return [];
  const matches = text.match(/[가-힣]+|[A-Za-z]+|\d+/g);
  return matches ?? [];
}

// ---------- 8. compactEntityName ----------

/** 띄어쓰기와 특수문자를 제거한 비교용 이름 생성. */
export function compactEntityName(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/[^가-힣A-Za-z0-9]/g, "");
}

// ---------- 9. inferEntityKind ----------

export function inferEntityKind(originalName: string, removedTokens: string[]): EntityKind {
  const removed = new Set(removedTokens);
  const o = originalName ?? "";

  // 지자체
  if (/(특별시|광역시|특별자치시|특별자치도|도청|시청|군청|구청)$/.test(o.trim()) || /지방자치단체/.test(o)) {
    return "local_government";
  }
  // 부서 (담당부서명은 보조 필드 — 과/팀/계/국/실 로 끝나는 짧은 명칭)
  if (/(과|팀|계|국|실)$/.test(o.trim()) && o.trim().length <= 8 && !/회$/.test(o.trim())) {
    return "department";
  }
  if (
    removed.has("협동조합") ||
    removed.has("사회적협동조합") ||
    removed.has("영농조합법인") ||
    removed.has("농업회사법인")
  ) {
    return "cooperative";
  }
  if (
    removed.has("주식회사") ||
    removed.has("(주)") ||
    removed.has("㈜") ||
    removed.has("유한회사") ||
    removed.has("유한책임회사") ||
    removed.has("합자회사") ||
    removed.has("합명회사")
  ) {
    return "corporation";
  }
  if (
    removed.has("사단법인") ||
    removed.has("재단법인") ||
    removed.has("사회복지법인") ||
    removed.has("학교법인") ||
    removed.has("의료법인") ||
    removed.has("종교법인") ||
    removed.has("비영리민간단체") ||
    removed.has("민간단체") ||
    removed.has("(사)") ||
    removed.has("(재)")
  ) {
    return "nonprofit";
  }
  return o.trim().length > 0 ? "organization" : "unknown";
}

// ---------- 10. normalizeEntityName ----------

export function normalizeEntityName(
  name: string,
  options: EntityNormalizationOptions = {}
): NormalizedEntityName {
  const lowercase = options.lowercase !== false;
  const warnings: string[] = [];
  const original = typeof name === "string" ? name : "";

  if (!original || original.trim().length === 0) {
    warnings.push("빈 기관명입니다.");
    return {
      originalName: original,
      normalizedName: "",
      compactName: "",
      tokens: [],
      removedTokens: [],
      entityKind: "unknown",
      warnings
    };
  }

  const base = stripOuterNoise(normalizeEntityWhitespace(normalizeUnicode(original)));

  // --- normalizedName/tokens 트랙: 띄어쓴 형태를 보존하며 법인표현 제거 ---
  const legal = normalizeLegalEntityMarkers(base, options);
  let text = removeParentheticalBranches(legal.text, options);
  text = normalizePunctuation(text);
  let normalizedName = normalizeEntityWhitespace(text);
  if (lowercase) normalizedName = normalizedName.toLowerCase();
  const tokens = tokenizeEntityName(normalizedName);

  // --- compactName 트랙: base 에서 괄호/구두점/공백을 모두 제거 후, 띄어쓴 법인표현까지 제거 ---
  // (예: "사회적 협동조합" 처럼 띄어쓴 표현도 compact 단계에서 안전하게 제거)
  const baseNoAbbrev = base.replace(/\(\s*(주|사|재|유|합)\s*\)/g, " ");
  let compactName = compactEntityName(removeParentheticalBranches(baseNoAbbrev, options));
  const compactRemoved: string[] = [];
  for (const marker of COMPACT_SAFE_MARKERS) {
    if (compactName.includes(marker)) {
      compactName = compactName.split(marker).join("");
      compactRemoved.push(marker);
    }
  }
  if (lowercase) compactName = compactName.toLowerCase();
  const removedTokens = Array.from(new Set([...legal.removedTokens, ...compactRemoved]));

  // 경고: 너무 짧거나 일반명사/지역명만 남음
  if (compactName.length === 0) {
    warnings.push("정규화 후 비교 가능한 이름이 남지 않았습니다.");
  } else if (compactName.length < 2) {
    warnings.push("정규화명이 너무 짧아 식별력이 낮습니다(ambiguous 가능).");
  }
  if (tokens.length > 0 && tokens.every((t) => GENERIC_SET.has(t) || REGION_SET.has(t))) {
    warnings.push("일반명사/지역명만 남아 식별력이 낮습니다(ambiguous 가능).");
  }

  return {
    originalName: original,
    normalizedName,
    compactName,
    tokens,
    removedTokens,
    entityKind: inferEntityKind(original, removedTokens),
    warnings
  };
}

// ---------- 유사도 헬퍼 ----------

function charBigrams(s: string): string[] {
  if (s.length < 2) return s.length === 1 ? [s] : [];
  const grams: string[] = [];
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
  return grams;
}

function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const countA = new Map<string, number>();
  for (const g of a) countA.set(g, (countA.get(g) ?? 0) + 1);
  let intersection = 0;
  const countB = new Map<string, number>();
  for (const g of b) countB.set(g, (countB.get(g) ?? 0) + 1);
  for (const [g, cb] of countB) {
    const ca = countA.get(g) ?? 0;
    intersection += Math.min(ca, cb);
  }
  return (2 * intersection) / (a.length + b.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

function editSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ---------- 11. calculateEntityNameSimilarity ----------

/**
 * compact match / token Dice / character bigram Dice / edit distance 를 조합해 0~1 점수.
 * 외부 의존성 없음.
 */
export function calculateEntityNameSimilarity(
  left: NormalizedEntityName,
  right: NormalizedEntityName
): number {
  const lc = left.compactName;
  const rc = right.compactName;
  if (lc.length === 0 || rc.length === 0) return 0;
  if (lc === rc) return 1;

  const bigram = diceCoefficient(charBigrams(lc), charBigrams(rc));
  const token = diceCoefficient(left.tokens, right.tokens);
  const edit = editSimilarity(lc, rc);

  // 가중 조합 — 문자 bigram 과 edit 를 주로, 토큰은 보조
  const score = 0.5 * bigram + 0.3 * edit + 0.2 * token;
  return Math.max(0, Math.min(1, score));
}

// ---------- ambiguous 판정 ----------

function isAmbiguous(n: NormalizedEntityName): boolean {
  if (n.compactName.length < 2) return true;
  if (n.tokens.length === 0) return true;
  if (n.tokens.every((t) => GENERIC_SET.has(t) || REGION_SET.has(t))) return true;
  return false;
}

// ---------- 12. classifyEntityMatch ----------

export function classifyEntityMatch(
  left: NormalizedEntityName,
  right: NormalizedEntityName,
  options: EntityMatchOptions = {}
): { decision: EntityMatchDecision; similarityScore: number; reasons: string[] } {
  const likely = options.likelyThreshold ?? 0.88;
  const possible = options.possibleThreshold ?? 0.72;
  const reasons: string[] = [];

  const score = calculateEntityNameSimilarity(left, right);

  if (isAmbiguous(left) || isAmbiguous(right)) {
    reasons.push("한쪽 이상이 너무 짧거나 일반명사/지역명만 남아 식별력이 낮습니다.");
    return { decision: "ambiguous", similarityScore: score, reasons };
  }

  if (left.compactName === right.compactName) {
    reasons.push("정규화 compactName 완전 일치 — 동일 기관 후보(strong).");
    return { decision: "strong_match", similarityScore: 1, reasons };
  }

  // 지역/기관유형 보조 신호 (likely 보강용 — 단독 기준 아님)
  const sameKind = left.entityKind === right.entityKind && left.entityKind !== "unknown";

  if (score >= likely) {
    reasons.push(`정규화명 유사도 높음(${score.toFixed(2)}).${sameKind ? " 기관 유형 보조 신호 일치." : ""}`);
    return { decision: "likely_match", similarityScore: score, reasons };
  }
  if (score >= possible) {
    reasons.push(`일부 단어/약칭 유사(${score.toFixed(2)}) — 보조 검토 후보.`);
    return { decision: "possible_match", similarityScore: score, reasons };
  }
  reasons.push(`핵심 토큰 불일치(${score.toFixed(2)}) — 병합하지 않음.`);
  return { decision: "no_match", similarityScore: score, reasons };
}

// ---------- 13. createEntityMatchCandidate ----------

/**
 * 양쪽 이름을 정규화하고 유사도·판정·사유를 담은 후보를 만든다.
 * strong_match 도 최종 확정이 아니므로 reviewRequired 는 항상 true.
 */
export function createEntityMatchCandidate(
  leftName: string,
  rightName: string,
  options: EntityMatchOptions = {}
): EntityMatchCandidate {
  const left = normalizeEntityName(leftName, options);
  const right = normalizeEntityName(rightName, options);
  const { decision, similarityScore, reasons } = classifyEntityMatch(left, right, options);
  return {
    left,
    right,
    similarityScore,
    decision,
    reasons,
    reviewRequired: true // 동일 기관 확정이 아니라 후보 — 항상 사람 검토
  };
}

// ---------- 14. normalizeEntityBatch ----------

export function normalizeEntityBatch(
  names: string[],
  options: EntityNormalizationOptions = {}
): NormalizedEntityName[] {
  return (names ?? []).map((n) => normalizeEntityName(n, options));
}

// ---------- 15. groupEntityCandidates ----------

/**
 * compactName 완전 일치 또는 높은 유사도로 병합 "후보" 그룹을 만든다.
 * 출력은 후보 그룹이며 자동 확정 병합이 아니다 (reviewRequired=true).
 */
export function groupEntityCandidates(
  names: string[],
  options: EntityMatchOptions = {}
): EntityCandidateGroup[] {
  const likely = options.likelyThreshold ?? 0.88;
  const normalized = normalizeEntityBatch(names, options);

  const groups: Array<{
    key: string;
    basis: "exact_compact" | "high_similarity";
    rep: NormalizedEntityName;
    members: NormalizedEntityName[];
  }> = [];

  for (const n of normalized) {
    if (n.compactName.length === 0 || isAmbiguous(n)) {
      // 식별력이 낮은 항목은 단독 그룹으로 둔다 (오병합 방지)
      groups.push({ key: n.compactName || n.originalName, basis: "high_similarity", rep: n, members: [n] });
      continue;
    }
    // 기존 그룹과 비교
    let placed = false;
    for (const g of groups) {
      if (g.rep.compactName.length === 0) continue;
      if (g.rep.compactName === n.compactName) {
        g.members.push(n);
        placed = true;
        break;
      }
      const score = calculateEntityNameSimilarity(g.rep, n);
      if (score >= likely && !isAmbiguous(g.rep)) {
        g.members.push(n);
        g.basis = g.basis === "exact_compact" ? "exact_compact" : "high_similarity";
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({
        key: n.compactName,
        basis: "exact_compact",
        rep: n,
        members: [n]
      });
    }
  }

  return groups.map((g) => ({
    groupKey: g.key,
    members: g.members.map((m) => m.originalName),
    basis: g.basis,
    representative: g.rep,
    reviewRequired: true
  }));
}
