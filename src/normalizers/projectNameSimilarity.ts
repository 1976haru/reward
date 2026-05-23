// 사업명 정규화 및 유사도 계산 모듈 (체크리스트 15).
//
// 유사 사업명 반복 신청을 검토하기 위해 사업명 표기 차이를 정규화하고 유사도를 계산한다.
//
// 안전 원칙:
//   - 반복 신청/부정수급을 확정하지 않는다. 자동 확정 병합을 하지 않는다. 모든 후보는 reviewRequired=true.
//   - 결과는 "유사 사업명 후보 / 반복 신청 검토 후보 / 추가 확인 필요"로만 표현한다.
//   - 형태소 분석기 의존성을 추가하지 않는다(문자열 정규화 + 토큰 Dice + 문자 bigram + 편집거리).
//   - 연도·차수·공모/지원/사업 등 일반 표현은 낮은 가중치, 지역명은 보조 신호로만 사용.
//   - 외부 의존성 없이 구현한다.
//
// 본 모듈은 사업명 유사도만으로 부정수급을 단정하지 않으며, 법률 자문을 대체하지 않는다.

import {
  NormalizedProjectName,
  ProjectMatchOptions,
  ProjectSimilarityCandidate,
  ProjectSimilarityDecision,
  ProjectSimilarityOptions,
  PROJECT_GENERIC_TOKENS,
  PROJECT_IMPORTANT_TOKENS,
  PROJECT_REGION_TOKENS,
  SimilarProjectPair
} from "../types/projectNameSimilarity.js";

const IMPORTANT_SET = new Set<string>(PROJECT_IMPORTANT_TOKENS);
// 핵심(core) 생성 시 제거할 토큰(일반 + 지역), 길이 내림차순.
const CORE_REMOVAL_TOKENS = Array.from(
  new Set<string>([...PROJECT_GENERIC_TOKENS, ...PROJECT_REGION_TOKENS])
).sort((a, b) => b.length - a.length);
// compactCore 분절용 중요 토큰(사전), 길이 내림차순.
const IMPORTANT_SPLIT_TOKENS = Array.from(new Set<string>(PROJECT_IMPORTANT_TOKENS)).sort(
  (a, b) => b.length - a.length
);

// ---------- 1. normalizeProjectNameUnicode ----------

export function normalizeProjectNameUnicode(text: string): string {
  if (typeof text !== "string") return "";
  let out = text.normalize("NFKC");
  out = out.replace(/[〔【［]/g, "(").replace(/[〕】］]/g, ")");
  return out;
}

// ---------- 2. normalizeProjectNameWhitespace ----------

export function normalizeProjectNameWhitespace(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

// ---------- 3. stripProjectNameOuterNoise ----------

export function stripProjectNameOuterNoise(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/^[\s"'“”‘’`,.\-_/\\|]+/, "")
    .replace(/[\s"'“”‘’`,.\-_/\\|]+$/, "")
    .trim();
}

// ---------- 4. removeProjectParentheticalNotes ----------

export interface ParenResult {
  text: string;
  removed: string[];
}

export function removeProjectParentheticalNotes(
  text: string,
  options: ProjectSimilarityOptions = {}
): ParenResult {
  if (typeof text !== "string") return { text: "", removed: [] };
  if (options.removeParentheses === false) return { text, removed: [] };
  const removed: string[] = [];
  const out = text
    .replace(/\(([^)]*)\)/g, (_m, inner: string) => {
      const c = inner.trim();
      if (c) removed.push(c);
      return " ";
    })
    .replace(/\[[^\]]*\]/g, " ");
  return { text: out.replace(/\s+/g, " ").trim(), removed };
}

// ---------- 5. extractProjectYearTokens ----------

export interface ExtractResult {
  text: string;
  tokens: string[];
}

/** 2023, 2024년, '24년, ’24년 같은 연도 토큰 분리. */
export function extractProjectYearTokens(text: string): ExtractResult {
  if (typeof text !== "string") return { text: "", tokens: [] };
  const tokens: string[] = [];
  let out = text.replace(/['’]?\s*(19|20)\d{2}\s*년도?|['’]\d{2}\s*년/g, (m) => {
    tokens.push(m.trim());
    return " ";
  });
  // 단독 4자리 연도(앞뒤 공백)
  out = out.replace(/(?<![0-9])(19|20)\d{2}(?![0-9])/g, (m) => {
    tokens.push(m.trim());
    return " ";
  });
  return { text: out.replace(/\s+/g, " ").trim(), tokens };
}

// ---------- 6. extractProjectRoundTokens ----------

/** 1차, 제2차, 3차, 상반기/하반기, N분기, N회 같은 차수/회차 토큰 분리. */
export function extractProjectRoundTokens(text: string): ExtractResult {
  if (typeof text !== "string") return { text: "", tokens: [] };
  const tokens: string[] = [];
  const patterns = [
    /제?\s*\d+\s*차/g,
    /\d+\s*회차?/g,
    /[1-4]\s*분기/g,
    /상반기|하반기|상\/하반기/g
  ];
  let out = text;
  for (const re of patterns) {
    out = out.replace(re, (m) => {
      tokens.push(m.trim());
      return " ";
    });
  }
  return { text: out.replace(/\s+/g, " ").trim(), tokens };
}

// ---------- 7. normalizeProjectPunctuation ----------

export function normalizeProjectPunctuation(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[-_/\\|·•,.~!@#$%^&*+=:;'"“”‘’`<>?{}()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- 8. tokenizeProjectName ----------

export function tokenizeProjectName(text: string): string[] {
  if (typeof text !== "string") return [];
  return text.match(/[가-힣]+|[A-Za-z]+|\d+/g) ?? [];
}

// ---------- 9. splitCompactKoreanHints ----------

/**
 * 띄어쓰기 없이 붙은 한글 문자열을 사전(중요 토큰) 기준으로 분절한다.
 * 사전에 없는 잔여 구간은 하나의 토큰(고유 중요 토큰)으로 본다.
 * 형태소 분석기를 사용하지 않는 단순 사전 기반 분절이다.
 */
export function splitCompactKoreanHints(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const out: string[] = [];
  let buffer = "";
  let i = 0;
  while (i < text.length) {
    let matched = "";
    for (const tok of IMPORTANT_SPLIT_TOKENS) {
      if (text.startsWith(tok, i)) {
        matched = tok;
        break;
      }
    }
    if (matched) {
      if (buffer) {
        out.push(buffer);
        buffer = "";
      }
      out.push(matched);
      i += matched.length;
    } else {
      buffer += text[i];
      i++;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

// ---------- compact / core ----------

export function compactProjectName(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/[^가-힣A-Za-z0-9]/g, "");
}

function buildCompactCore(compactName: string): string {
  let core = compactName;
  for (const tok of CORE_REMOVAL_TOKENS) {
    if (core.includes(tok)) core = core.split(tok).join("");
  }
  return core;
}

// ---------- 토큰 분류 ----------

function classifyTokens(tokens: string[]): {
  important: string[];
  generic: string[];
  region: string[];
} {
  const important: string[] = [];
  const generic: string[] = [];
  const region: string[] = [];
  const genericSet = new Set<string>(PROJECT_GENERIC_TOKENS);
  const regionSet = new Set<string>(PROJECT_REGION_TOKENS);
  for (const t of tokens) {
    if (regionSet.has(t)) region.push(t);
    else if (genericSet.has(t)) generic.push(t);
    else important.push(t);
  }
  return { important, generic, region };
}

// ---------- 12. normalizeProjectName ----------

export function normalizeProjectName(
  name: string,
  options: ProjectSimilarityOptions = {}
): NormalizedProjectName {
  const lowercase = options.lowercase !== false;
  const warnings: string[] = [];
  const original = typeof name === "string" ? name : "";

  if (!original || original.trim().length === 0) {
    warnings.push("빈 사업명입니다.");
    return {
      originalName: original,
      normalizedName: "",
      compactName: "",
      compactCore: "",
      tokens: [],
      importantTokens: [],
      genericTokens: [],
      yearTokens: [],
      roundTokens: [],
      regionTokens: [],
      removedTokens: [],
      warnings
    };
  }

  let text = stripProjectNameOuterNoise(
    normalizeProjectNameWhitespace(normalizeProjectNameUnicode(original))
  );
  const paren = removeProjectParentheticalNotes(text, options);
  text = paren.text;
  const yearR = extractProjectYearTokens(text);
  text = yearR.text;
  const roundR = extractProjectRoundTokens(text);
  text = roundR.text;
  text = normalizeProjectPunctuation(text);

  let normalizedName = normalizeProjectNameWhitespace(text);
  if (lowercase) normalizedName = normalizedName.toLowerCase();

  const rawTokens = tokenizeProjectName(normalizedName);
  const { important, generic, region } = classifyTokens(rawTokens);

  const compactName = compactProjectName(normalizedName);
  // compactCore: 일반토큰/지역토큰 제거 후, 중요 토큰을 사전 기준으로 분절해 재구성
  const compactCore = buildCompactCore(compactName);
  const coreTokens = splitCompactKoreanHints(compactCore).filter((t) => t.length > 0);

  if (compactCore.length === 0) {
    warnings.push("일반 표현만 남아 식별력이 낮습니다(ambiguous 가능).");
  } else if (compactCore.length < 2) {
    warnings.push("핵심 사업명이 너무 짧아 식별력이 낮습니다(ambiguous 가능).");
  }

  // importantTokens: 토큰 분류 결과 + core 분절(고유 토큰 포함) 합집합
  const importantTokens = Array.from(
    new Set([...important, ...coreTokens.filter((t) => !PROJECT_GENERIC_TOKENS.includes(t) && !PROJECT_REGION_TOKENS.includes(t))])
  );

  return {
    originalName: original,
    normalizedName,
    compactName,
    compactCore,
    tokens: rawTokens,
    importantTokens,
    genericTokens: generic,
    yearTokens: yearR.tokens,
    roundTokens: roundR.tokens,
    regionTokens: region,
    removedTokens: paren.removed,
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
  const countB = new Map<string, number>();
  for (const g of b) countB.set(g, (countB.get(g) ?? 0) + 1);
  let inter = 0;
  for (const [g, cb] of countB) inter += Math.min(countA.get(g) ?? 0, cb);
  return (2 * inter) / (a.length + b.length);
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
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
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

// ---------- 13. calculateProjectNameSimilarity ----------

/**
 * 사업명 유사도 0~1.
 * - compactName(전체) 완전 일치 또는 compactCore(핵심) 완전 일치는 1.
 * - 그 외에는 핵심(core) 기준 문자 bigram + 편집거리 + 토큰 Dice 조합.
 * 연도/차수는 정규화에서 제거되어 큰 감점이 되지 않는다.
 */
export function calculateProjectNameSimilarity(
  left: NormalizedProjectName,
  right: NormalizedProjectName
): number {
  if (left.compactName.length === 0 || right.compactName.length === 0) return 0;
  if (left.compactName === right.compactName) return 1;
  if (left.compactCore.length === 0 || right.compactCore.length === 0) return 0;
  if (left.compactCore === right.compactCore) return 1;

  const bigram = diceCoefficient(charBigrams(left.compactCore), charBigrams(right.compactCore));
  const edit = editSimilarity(left.compactCore, right.compactCore);
  const token = diceCoefficient(left.importantTokens, right.importantTokens);

  const score = 0.4 * bigram + 0.25 * edit + 0.35 * token;
  return Math.max(0, Math.min(1, score));
}

// ---------- ambiguous ----------

function isAmbiguousProject(n: NormalizedProjectName): boolean {
  if (n.compactCore.length < 2) return true;
  if (n.importantTokens.length === 0) return true;
  return false;
}

// ---------- 14. classifyProjectSimilarity ----------

export function classifyProjectSimilarity(
  left: NormalizedProjectName,
  right: NormalizedProjectName,
  options: ProjectMatchOptions = {}
): { decision: ProjectSimilarityDecision; similarityScore: number; reasons: string[] } {
  const strong = options.strongThreshold ?? 0.9;
  const similar = options.similarThreshold ?? 0.85;
  const possible = options.possibleThreshold ?? 0.7;
  const reasons: string[] = [];
  const score = calculateProjectNameSimilarity(left, right);

  if (isAmbiguousProject(left) || isAmbiguousProject(right)) {
    reasons.push("일반 표현만 있거나 핵심 사업명이 너무 짧아 식별력이 낮습니다 — 추가 확인 필요.");
    return { decision: "ambiguous", similarityScore: score, reasons };
  }

  if (score >= strong) {
    reasons.push(`핵심 사업명 유사도 매우 높음(${score.toFixed(2)}) — 유사 사업명 후보(사람 검토).`);
    return { decision: "strong_similar", similarityScore: score, reasons };
  }
  if (score >= similar) {
    reasons.push(`핵심 사업명 유사도 높음(${score.toFixed(2)}) — 반복 신청 검토 후보.`);
    return { decision: "similar_candidate", similarityScore: score, reasons };
  }
  if (score >= possible) {
    reasons.push(`일부 핵심 토큰 유사(${score.toFixed(2)}) — 보조 검토 후보(추가 확인 필요).`);
    return { decision: "possible_candidate", similarityScore: score, reasons };
  }
  reasons.push(`핵심 사업명 불일치(${score.toFixed(2)}) — 후보 제외.`);
  return { decision: "no_match", similarityScore: score, reasons };
}

// ---------- 15. createProjectSimilarityCandidate ----------

export function createProjectSimilarityCandidate(
  leftName: string,
  rightName: string,
  options: ProjectMatchOptions = {}
): ProjectSimilarityCandidate {
  const left = normalizeProjectName(leftName, options);
  const right = normalizeProjectName(rightName, options);
  const { decision, similarityScore, reasons } = classifyProjectSimilarity(left, right, options);
  return {
    left,
    right,
    similarityScore,
    decision,
    reasons,
    reviewRequired: true // 유사 사업명 후보는 확정이 아니라 항상 사람 검토 대상
  };
}

// ---------- 16. normalizeProjectBatch ----------

export function normalizeProjectBatch(
  names: string[],
  options: ProjectSimilarityOptions = {}
): NormalizedProjectName[] {
  return (names ?? []).map((n) => normalizeProjectName(n, options));
}

// ---------- 17. findSimilarProjectNameCandidates ----------

/**
 * 사업명 목록에서 유사도 임계값(기본 0.85) 이상인 쌍을 "유사 사업명 후보"로 만든다.
 * 결과는 후보 목록이며 자동 확정이 아니다(reviewRequired=true).
 */
export function findSimilarProjectNameCandidates(
  names: string[],
  options: ProjectMatchOptions = {}
): SimilarProjectPair[] {
  const threshold = options.similarThreshold ?? 0.85;
  const normalized = normalizeProjectBatch(names, options);
  const out: SimilarProjectPair[] = [];

  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const { decision, similarityScore } = classifyProjectSimilarity(
        normalized[i],
        normalized[j],
        options
      );
      if (
        similarityScore >= threshold &&
        (decision === "strong_similar" || decision === "similar_candidate")
      ) {
        out.push({
          leftName: normalized[i].originalName,
          rightName: normalized[j].originalName,
          similarityScore,
          decision,
          reviewRequired: true
        });
      }
    }
  }
  // 점수 내림차순
  out.sort((a, b) => b.similarityScore - a.similarityScore);
  return out;
}
