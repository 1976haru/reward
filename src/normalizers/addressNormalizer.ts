// 주소 정규화 모듈 (체크리스트 14).
//
// 도로명/지번/층호수/약칭/괄호/특수문자/전각·반각/공백 차이를 통합해 "동일 주소 후보"를 만든다.
//
// 안전 원칙:
//   - 동일 주소를 확정하지 않는다. 자동 확정 병합을 하지 않는다. 모든 후보는 reviewRequired=true.
//   - 상세주소(동·호수·층)는 키에서 제외하고 removedDetailTokens 로만 보관한다(원문 저장 제한).
//   - 반복수급 분석은 addressRegionKey(지역 단위)를 우선 사용한다.
//   - 대표자명/전화번호/상세주소는 단독 병합 기준으로 사용하지 않는다(본 모듈은 주소 문자열만 입력).
//   - 외부 의존성 없이 구현한다.
//
// 본 모듈은 주소만으로 부정수급을 단정하지 않으며, 법률 자문을 대체하지 않는다.

import { sanitizeForStorage } from "../policy/privacyGuard.js";
import {
  AddressCandidateGroup,
  AddressMatchCandidate,
  AddressMatchDecision,
  AddressMatchOptions,
  AddressNormalizationOptions,
  ADDRESS_DETAIL_PATTERN_SOURCES,
  ADDRESS_SIDO_ALIASES,
  ADDRESS_SIDO_CANONICAL,
  NormalizedAddress
} from "../types/addressNormalization.js";

const DETAIL_RES = ADDRESS_DETAIL_PATTERN_SOURCES.map((s) => new RegExp(s, "g"));
const SIDO_CANON_RE = new RegExp(`^(${ADDRESS_SIDO_CANONICAL.join("|")})`);

// ---------- 1. normalizeAddressUnicode ----------

/** 전각/반각·괄호류·숫자 표준화 (NFKC). */
export function normalizeAddressUnicode(text: string): string {
  if (typeof text !== "string") return "";
  let out = text.normalize("NFKC");
  out = out.replace(/[〔【［]/g, "(").replace(/[〕】］]/g, ")");
  return out;
}

// ---------- 2. normalizeAddressWhitespace ----------

export function normalizeAddressWhitespace(text: string): string {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

// ---------- 3. stripAddressOuterNoise ----------

export function stripAddressOuterNoise(text: string): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/^[\s"'“”‘’`,.\-_/\\|]+/, "")
    .replace(/[\s"'“”‘’`,.\-_/\\|]+$/, "")
    .trim();
}

// ---------- 4. normalizeSidoAlias ----------

/** 선두 시도 약칭(경기→경기도, 서울→서울특별시 등)을 표준 명칭으로 정규화. */
export function normalizeSidoAlias(text: string): string {
  if (typeof text !== "string") return "";
  const t = text.trim();
  if (SIDO_CANON_RE.test(t)) return t; // 이미 표준 명칭
  const m = t.match(/^(\S+?)(?:\s|$)/);
  if (!m) return t;
  const head = m[1];
  const canon = ADDRESS_SIDO_ALIASES[head];
  if (canon) {
    return canon + t.slice(head.length);
  }
  return t;
}

// ---------- 5. removeZipCode ----------

export interface ZipResult {
  text: string;
  zipCode?: string;
}

/** 선두/말미의 우편번호(5자리 신우편 또는 6자리 구우편 NNN-NNN)를 분리. */
export function removeZipCode(text: string): ZipResult {
  if (typeof text !== "string") return { text: "" };
  let zipCode: string | undefined;
  let out = text;
  // 선두 우편번호
  const lead = out.match(/^\s*\(?(\d{5}|\d{3}-\d{3})\)?\s+/);
  if (lead) {
    zipCode = lead[1];
    out = out.slice(lead[0].length);
  } else {
    // 말미 우편번호
    const tail = out.match(/\s+\(?(\d{5}|\d{3}-\d{3})\)?\s*$/);
    if (tail) {
      zipCode = tail[1];
      out = out.slice(0, tail.index).trim();
    }
  }
  return { text: out.trim(), zipCode };
}

// ---------- 6. removeAddressParentheses ----------

export interface ParenResult {
  text: string;
  warnings: string[];
  parentheticals: string[];
}

/** 괄호 메모 제거. 읍면동 후보일 수 있으면 경고로 남긴다. */
export function removeAddressParentheses(
  text: string,
  options: AddressNormalizationOptions = {}
): ParenResult {
  if (typeof text !== "string") return { text: "", warnings: [], parentheticals: [] };
  const remove = options.removeParentheses !== false;
  const warnings: string[] = [];
  const parentheticals: string[] = [];
  if (!remove) return { text, warnings, parentheticals };

  const out = text.replace(/\(([^)]*)\)/g, (_m, inner: string) => {
    const content = inner.trim();
    if (content) {
      parentheticals.push(content);
      if (/(동|읍|면|리)$/.test(content)) {
        warnings.push(`괄호 내용이 읍면동 후보일 수 있습니다: (${content})`);
      }
    }
    return " ";
  });
  return { text: out.replace(/\s+/g, " ").trim(), warnings, parentheticals };
}

// ---------- 7. removeDetailedAddress ----------

export interface DetailResult {
  text: string;
  removedDetailTokens: string[];
}

/** 층/호/동호수 등 상세주소를 제거하고 removedDetailTokens 에 기록. */
export function removeDetailedAddress(text: string): DetailResult {
  if (typeof text !== "string") return { text: "", removedDetailTokens: [] };
  let out = text;
  const removed: string[] = [];
  for (const re of DETAIL_RES) {
    out = out.replace(re, (m) => {
      const t = m.trim();
      if (t) removed.push(t);
      return " ";
    });
  }
  // "상세주소" 키워드 이후 토막은 안전하게 제거
  return { text: out.replace(/\s+/g, " ").trim(), removedDetailTokens: removed };
}

// ---------- 8. normalizeAddressPunctuation ----------

/** 특수문자 정리. 도로명/번지의 하이픈은 보존한다. */
export function normalizeAddressPunctuation(text: string): string {
  if (typeof text !== "string") return "";
  let out = text;
  // 도로명/한글-번지 사이 하이픈은 구분자 → 공백 (효원로-1 → 효원로 1)
  out = out.replace(/([가-힣])\s*-\s*(\d)/g, "$1 $2");
  // 번지 하이픈(숫자-숫자)은 보존하되 주변 공백 제거 (1 - 1 → 1-1)
  out = out.replace(/(\d)\s*-\s*(\d)/g, "$1-$2");
  // 언더스코어/슬래시/중점/콤마는 공백으로
  out = out.replace(/[_/\\·•,]/g, " ");
  // 그 외 하이픈(숫자 사이가 아닌)은 공백으로
  out = out.replace(/(?<![0-9])-(?![0-9])/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

// ---------- 9~11. 행정구역 추출 ----------

export function extractSido(text: string): { sido?: string; rest: string } {
  const m = text.match(SIDO_CANON_RE);
  if (m) return { sido: m[1], rest: text.slice(m[1].length).trim() };
  return { rest: text.trim() };
}

export function extractSigungu(text: string): { sigungu?: string; rest: string } {
  const m = text.match(/^\s*(\S+?(?:시|군|구))(?:\s+(\S+?(?:구|군)))?/);
  if (m) {
    const parts = [m[1], m[2]].filter(Boolean) as string[];
    return { sigungu: parts.join(" "), rest: text.slice(m[0].length).trim() };
  }
  return { rest: text.trim() };
}

export function extractEupmyeondong(text: string): { eupmyeondong?: string; rest: string } {
  const m = text.match(/^\s*(\S+?(?:동|읍|면|리))(?=\s|$)/);
  if (m) return { eupmyeondong: m[1], rest: text.slice(m[0].length).trim() };
  return { rest: text.trim() };
}

export interface RoadJibunResult {
  roadName?: string;
  jibun?: string;
  baseNumber?: string;
  rest: string;
}

/** 도로명(+기본번지) 또는 지번을 추출. */
export function extractRoadOrJibun(text: string): RoadJibunResult {
  const t = text.trim();
  // 도로명: ...로/길 (+숫자/가)  +  기본번지
  const road = t.match(/^(\S*?(?:로|길)\d*가?)\s*(\d+(?:-\d+)?)?/);
  if (road && /(로|길)/.test(road[1])) {
    return {
      roadName: road[1],
      baseNumber: road[2],
      rest: t.slice(road[0].length).trim()
    };
  }
  // 지번: (산) 번지 숫자
  const jibun = t.match(/^(?:산\s*)?(\d+(?:-\d+)?)/);
  if (jibun) {
    return { jibun: jibun[1], baseNumber: jibun[1], rest: t.slice(jibun[0].length).trim() };
  }
  return { rest: t };
}

// ---------- 키 생성 ----------

function compact(s: string): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

export function buildNormalizedAddressKey(parts: {
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
  roadName?: string;
  jibun?: string;
  baseNumber?: string;
}): string {
  const seg: string[] = [parts.sido ?? "", parts.sigungu ?? "", parts.eupmyeondong ?? ""];
  if (parts.roadName) {
    seg.push(parts.roadName);
    if (parts.baseNumber) seg.push(parts.baseNumber);
  } else if (parts.jibun) {
    seg.push(parts.jibun);
  }
  return compact(seg.join(""));
}

export function buildAddressRegionKey(parts: {
  sido?: string;
  sigungu?: string;
  eupmyeondong?: string;
  roadName?: string;
  jibun?: string;
}): string {
  const seg: string[] = [parts.sido ?? "", parts.sigungu ?? "", parts.eupmyeondong ?? ""];
  if (parts.roadName) {
    seg.push(parts.roadName); // 기본번지 미포함
  } else if (parts.jibun) {
    seg.push(parts.jibun.split("-")[0]); // 지번 본번만
  }
  return compact(seg.join(""));
}

function dongKeyOf(n: NormalizedAddress): string {
  return compact([n.sido ?? "", n.sigungu ?? "", n.eupmyeondong ?? ""].join(""));
}

// ---------- 16. tokenizeAddress ----------

export function tokenizeAddress(text: string): string[] {
  if (typeof text !== "string") return [];
  return text.match(/[가-힣]+|[A-Za-z]+|\d+(?:-\d+)?/g) ?? [];
}

// ---------- 17. normalizeAddress ----------

export function normalizeAddress(
  address: string,
  options: AddressNormalizationOptions = {}
): NormalizedAddress {
  const warnings: string[] = [];
  const original = typeof address === "string" ? address : "";
  const sanitizedOriginalAddress = original ? sanitizeForStorage(original).sanitizedText : "";

  const empty: NormalizedAddress = {
    originalAddress: original,
    sanitizedOriginalAddress,
    normalizedAddressKey: "",
    addressRegionKey: "",
    removedDetailTokens: [],
    tokens: [],
    warnings
  };
  if (!original || original.trim().length === 0) {
    warnings.push("빈 주소입니다.");
    return empty;
  }

  // 전처리
  let text = stripAddressOuterNoise(normalizeAddressWhitespace(normalizeAddressUnicode(original)));
  const zip = removeZipCode(text);
  text = zip.text;
  text = normalizeSidoAlias(text);
  const paren = removeAddressParentheses(text, options);
  text = paren.text;
  warnings.push(...paren.warnings);
  const detail = removeDetailedAddress(text);
  text = detail.text;
  text = normalizeAddressPunctuation(text);
  // 도로명 분절 결합 (효원 로 1 → 효원로 1)
  text = text.replace(/([가-힣])\s+(로|길)(?=\s|\d|$)/g, "$1$2");

  // 행정구역 추출
  const sidoR = extractSido(text);
  const sigunguR = extractSigungu(sidoR.rest);
  const dongR = extractEupmyeondong(sigunguR.rest);
  const roadR = extractRoadOrJibun(dongR.rest);

  const buildingName =
    options.keepBuildingName !== false && roadR.rest.trim().length > 0 ? roadR.rest.trim() : undefined;

  const parts = {
    sido: sidoR.sido,
    sigungu: sigunguR.sigungu,
    eupmyeondong: dongR.eupmyeondong,
    roadName: roadR.roadName,
    jibun: roadR.jibun,
    baseNumber: roadR.baseNumber
  };

  const normalizedAddressKey = buildNormalizedAddressKey(parts);
  const addressRegionKey = buildAddressRegionKey(parts);

  if (!parts.sigungu) {
    warnings.push("시군구를 추출하지 못했습니다(ambiguous 가능).");
  } else if (!parts.eupmyeondong && !parts.roadName && !parts.jibun) {
    warnings.push("시군구 외 식별 토큰이 없어 식별력이 낮습니다(ambiguous 가능).");
  }

  return {
    originalAddress: original,
    sanitizedOriginalAddress,
    sido: parts.sido,
    sigungu: parts.sigungu,
    eupmyeondong: parts.eupmyeondong,
    roadName: parts.roadName,
    jibun: parts.jibun,
    baseNumber: parts.baseNumber,
    buildingName,
    zipCode: zip.zipCode,
    normalizedAddressKey,
    addressRegionKey,
    removedDetailTokens: detail.removedDetailTokens,
    tokens: tokenizeAddress(text),
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

// ---------- 18. calculateAddressSimilarity ----------

export function calculateAddressSimilarity(left: NormalizedAddress, right: NormalizedAddress): number {
  const lk = left.normalizedAddressKey;
  const rk = right.normalizedAddressKey;
  if (lk.length === 0 || rk.length === 0) return 0;
  if (lk === rk) return 1;
  return diceCoefficient(charBigrams(lk), charBigrams(rk));
}

// ---------- ambiguous 판정 ----------

function isAmbiguousAddress(n: NormalizedAddress): boolean {
  if (!n.sigungu) return true;
  if (!n.eupmyeondong && !n.roadName && !n.jibun) return true; // 시군구만
  if (n.normalizedAddressKey.length < 4) return true;
  return false;
}

// ---------- 19. classifyAddressMatch ----------

export function classifyAddressMatch(
  left: NormalizedAddress,
  right: NormalizedAddress,
  options: AddressMatchOptions = {}
): { decision: AddressMatchDecision; similarityScore: number; reasons: string[] } {
  const possible = options.possibleThreshold ?? 0.72;
  const reasons: string[] = [];
  const score = calculateAddressSimilarity(left, right);

  if (isAmbiguousAddress(left) || isAmbiguousAddress(right)) {
    reasons.push("한쪽 이상이 시군구만 있거나 너무 짧아 식별력이 낮습니다.");
    return { decision: "ambiguous", similarityScore: score, reasons };
  }

  if (left.normalizedAddressKey === right.normalizedAddressKey) {
    reasons.push("normalizedAddressKey 완전 일치 — 동일 주소 후보(strong).");
    return { decision: "strong_match", similarityScore: 1, reasons };
  }

  if (left.addressRegionKey === right.addressRegionKey && left.addressRegionKey.length > 0) {
    // 지역 키(시군구+읍면동+도로명/지번 본번) 일치 — 기본번지만 다름
    reasons.push("addressRegionKey 일치(시군구+도로명/지번 일치, 기본번지 차이) — 검토 필요 후보(likely).");
    return { decision: "likely_match", similarityScore: Math.max(score, 0.9), reasons };
  }

  if (dongKeyOf(left) === dongKeyOf(right) && left.eupmyeondong) {
    reasons.push("시군구+읍면동 일치, 도로명/지번 차이 — 보조 검토 후보(possible).");
    return { decision: "possible_match", similarityScore: Math.max(score, possible), reasons };
  }

  if (left.sigungu && left.sigungu === right.sigungu && score >= possible) {
    reasons.push(`시군구 일치 + 주소 토큰 일부 유사(${score.toFixed(2)}) — 보조 검토 후보(possible).`);
    return { decision: "possible_match", similarityScore: score, reasons };
  }

  reasons.push(`지역/핵심 주소 토큰 불일치(${score.toFixed(2)}) — 병합하지 않음.`);
  return { decision: "no_match", similarityScore: score, reasons };
}

// ---------- 20. createAddressMatchCandidate ----------

export function createAddressMatchCandidate(
  leftAddress: string,
  rightAddress: string,
  options: AddressMatchOptions = {}
): AddressMatchCandidate {
  const left = normalizeAddress(leftAddress, options);
  const right = normalizeAddress(rightAddress, options);
  const { decision, similarityScore, reasons } = classifyAddressMatch(left, right, options);
  return {
    left,
    right,
    similarityScore,
    decision,
    reasons,
    reviewRequired: true // 동일 주소 확정이 아니라 후보 — 항상 사람 검토
  };
}

// ---------- 21. normalizeAddressBatch ----------

export function normalizeAddressBatch(
  addresses: string[],
  options: AddressNormalizationOptions = {}
): NormalizedAddress[] {
  return (addresses ?? []).map((a) => normalizeAddress(a, options));
}

// ---------- 22. groupAddressCandidates ----------

/**
 * normalizedAddressKey(우선) 또는 addressRegionKey 기준으로 동일 주소 "후보" 그룹을 만든다.
 * 결과는 후보 그룹이며 자동 확정 병합이 아니다(reviewRequired=true).
 */
export function groupAddressCandidates(
  addresses: string[],
  options: AddressMatchOptions = {}
): AddressCandidateGroup[] {
  const normalized = normalizeAddressBatch(addresses, options);
  const groups: Array<{
    key: string;
    basis: "normalized_key" | "region_key";
    rep: NormalizedAddress;
    members: NormalizedAddress[];
  }> = [];

  for (const n of normalized) {
    if (n.normalizedAddressKey.length === 0 || isAmbiguousAddress(n)) {
      groups.push({
        key: n.normalizedAddressKey || n.sanitizedOriginalAddress,
        basis: "region_key",
        rep: n,
        members: [n]
      });
      continue;
    }
    let placed = false;
    for (const g of groups) {
      if (g.rep.normalizedAddressKey.length === 0) continue;
      if (g.rep.normalizedAddressKey === n.normalizedAddressKey) {
        g.members.push(n);
        placed = true;
        break;
      }
      if (
        g.rep.addressRegionKey.length > 0 &&
        g.rep.addressRegionKey === n.addressRegionKey &&
        !isAmbiguousAddress(g.rep)
      ) {
        g.members.push(n);
        g.basis = "region_key";
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({ key: n.normalizedAddressKey, basis: "normalized_key", rep: n, members: [n] });
    }
  }

  return groups.map((g) => ({
    groupKey: g.key,
    members: g.members.map((m) => m.sanitizedOriginalAddress || m.originalAddress),
    basis: g.basis,
    representative: g.rep,
    reviewRequired: true
  }));
}
