// 건강기능식품 허위·과대광고 판단을 위한 텍스트 추출기.
// - cheerio로 HTML을 정리하고 boilerplate를 제거한다.
// - 광고성 핵심 문구 / 후기 / 성분 / 섭취방법 / 주의사항 / 판매자 정보를 분리 추출한다.
// - 본 모듈은 법 위반을 확정하지 않는다. RuleAgent·AnalyzerAgent·사람 검토의 입력 자료를 만든다.
// - 개인정보(전화·이메일·주민번호 등)는 마스킹 또는 제거한다.

import * as cheerio from "cheerio";
import { normalizeText } from "../utils/text.js";

export const EXTRACTION_LIMITS = {
  maxHtmlBytes: 2_000_000,      // 2 MB
  maxSectionItems: 30,
  maxCandidatesPerCategory: 30,
  maxPriceCandidates: 20,
  maxMainTextChars: 12_000,
  productNameMaxLen: 120
} as const;

export interface ExtractedSection {
  name: string;
  text: string;
}

export interface ExtractionResult {
  title?: string;
  productName?: string;
  priceCandidates: string[];
  claimCandidates: string[];
  reviewCandidates: string[];
  ingredientCandidates: string[];
  usageCandidates: string[];
  warningCandidates: string[];
  sellerCandidates: string[];
  mainText: string;
  sections: ExtractedSection[];
  textLength: number;
  removedBoilerplateHints: string[];
  extractionWarnings: string[];
}

// boilerplate로 추정되는 요소 (무조건 제거)
const STRIP_TAGS = [
  "script", "style", "noscript", "svg", "canvas", "iframe",
  "nav", "header", "footer", "aside",
  "form", "button", "input", "select", "textarea"
];

// class/id에 이 문자열이 보이면 boilerplate 후보 — 단, 텍스트가 너무 길면(컨텐츠 가능성) 보존한다.
const BOILERPLATE_HINTS = [
  "nav", "footer", "header", "menu", "sidebar", "banner",
  "popup", "modal", "cookie", "cart", "login", "search",
  "pagination", "recommend", "related", "recent",
  "delivery", "refund", "exchange"
];

const BOILERPLATE_PRESERVE_THRESHOLD = 600; // 글자 이상이면 보존

// 가격 후보 정규식
const PRICE_REGEX = /(₩\s?\d[\d,]*|\d[\d,]{2,}\s*원|\d[\d,]{2,}\s*KRW)/g;

// 질병/증상 키워드
const DISEASE_KEYWORDS = [
  "암", "당뇨", "혈당", "고혈압", "혈압", "콜레스테롤", "동맥경화",
  "관절염", "관절", "연골", "치매", "알츠하이머", "우울증", "불면증",
  "아토피", "비염", "간염", "위염", "역류성 식도염", "염증",
  "면역질환", "면역", "코로나", "종양", "갱년기", "전립선", "통풍"
];

// 위반 의심 표현 (단정·과장·의약품 오인)
const CLAIM_KEYWORDS = [
  "치료", "완치", "예방", "개선", "제거", "억제",
  "약 대신", "약 대체", "병원 갈 필요", "병원 안 가도",
  "처방 없이", "부작용 없", "근본 치료", "재발 방지",
  "하루 만에", "즉시 효과", "기적", "독소 배출",
  "혈관 청소", "지방 분해", "체지방 제거", "100% 효과", "보장"
];

const REVIEW_KEYWORDS = [
  "후기", "리뷰", "구매평", "체험", "실제 경험",
  "먹어보니", "효과 봤어요", "좋아졌어요", "완화됐어요",
  "재구매", "별점", "평점"
];

const INGREDIENT_KEYWORDS = [
  "원료", "성분", "함량", "영양정보", "기능성 원료",
  "부원료", "주요성분", "원재료명", "주요 성분"
];

const USAGE_KEYWORDS = [
  "섭취 방법", "복용 방법", "먹는 방법",
  "1일", "1회", "권장량", "섭취량"
];

const WARNING_KEYWORDS = [
  "주의사항", "섭취 시 주의", "부작용", "알레르기",
  "임산부", "수유부", "질환자", "의약품 복용",
  "전문가와 상담", "복용 중", "치료 중"
];

const SELLER_KEYWORDS = [
  "판매자", "사업자", "상호", "대표자", "통신판매업",
  "고객센터", "제조원", "유통전문판매원", "제조사", "유통사"
];

const HEADLINE_NOISE_WORDS = [
  "상품상세", "상품 상세", "구매하기", "쇼핑", "쇼핑몰", "장바구니"
];

export interface ExtractOptions {
  url?: string;
  title?: string;
  moduleId?: string;
}

export class TextExtractor {
  extract(html: string, options: ExtractOptions = {}): ExtractionResult {
    const warnings: string[] = [];
    const removedHints: string[] = [];

    if (typeof html !== "string" || html.length === 0) {
      throw new Error("html must be a non-empty string");
    }
    if (Buffer.byteLength(html, "utf8") > EXTRACTION_LIMITS.maxHtmlBytes) {
      throw new Error(
        `html exceeds maximum size of ${EXTRACTION_LIMITS.maxHtmlBytes} bytes`
      );
    }

    const $ = cheerio.load(html);

    // 1) 무조건 제거 태그
    for (const tag of STRIP_TAGS) {
      const found = $(tag);
      if (found.length > 0) removedHints.push(`tag:${tag}(${found.length})`);
      found.remove();
    }

    // 2) class/id 힌트 기반 제거 — 단, 충분히 긴 텍스트는 보존
    $("[class],[id]").each((_, el) => {
      const node = $(el);
      const attrs = `${node.attr("class") ?? ""} ${node.attr("id") ?? ""}`.toLowerCase();
      const hit = BOILERPLATE_HINTS.find((h) => attrs.includes(h));
      if (!hit) return;
      const textLen = normalizeText(node.text()).length;
      if (textLen >= BOILERPLATE_PRESERVE_THRESHOLD) {
        // 컨텐츠일 가능성 — 제거하지 않고 힌트만 기록
        removedHints.push(`preserved:${hit}(len=${textLen})`);
        return;
      }
      removedHints.push(`hint:${hit}(len=${textLen})`);
      node.remove();
    });

    // 3) Title 후보
    const ogTitle = $('meta[property="og:title"]').attr("content")
      ?? $('meta[name="og:title"]').attr("content");
    const h1 = normalizeText($("h1").first().text());
    const htmlTitle = normalizeText($("title").first().text());
    const productClassText = normalizeText(
      $('[class*="product" i],[id*="product" i],[class*="goods" i],[id*="goods" i]')
        .first()
        .find("h1,h2,strong")
        .first()
        .text()
    );

    const title = options.title?.trim() || ogTitle?.trim() || htmlTitle || undefined;
    const productNameRaw =
      h1 || productClassText || ogTitle?.trim() || htmlTitle || "";
    const productName = cleanProductName(productNameRaw);

    // 4) 본문 텍스트 — body가 있으면 body, 없으면 root
    const rootText = $("body").length > 0 ? $("body").text() : $.root().text();
    const mainTextRaw = normalizeText(rootText);

    // 5) 가격 후보 — 마스킹 전에 추출 (전화번호와 혼동될 수 있어 가격 패턴이 우선)
    const priceCandidates = dedupe(
      Array.from(mainTextRaw.matchAll(PRICE_REGEX)).map((m) => m[0].trim())
    ).slice(0, EXTRACTION_LIMITS.maxPriceCandidates);

    // 6) 본문/문장 PII 마스킹 + 길이 제한
    const masked = maskPII(mainTextRaw);
    const mainText = masked.slice(0, EXTRACTION_LIMITS.maxMainTextChars);
    if (masked.length > EXTRACTION_LIMITS.maxMainTextChars) {
      warnings.push(`mainText truncated to ${EXTRACTION_LIMITS.maxMainTextChars} chars`);
    }
    const sentences = splitSentences(mainText);

    // 7) 카테고리별 후보 — 키워드 매칭 (claim은 ±1 문장 컨텍스트)
    const claimCandidates = pickContextual(sentences, CLAIM_KEYWORDS.concat(DISEASE_KEYWORDS));
    const reviewCandidates = pickByKeywords(sentences, REVIEW_KEYWORDS);
    const ingredientCandidates = pickByKeywords(sentences, INGREDIENT_KEYWORDS);
    const usageCandidates = pickByKeywords(sentences, USAGE_KEYWORDS);
    const warningCandidates = pickByKeywords(sentences, WARNING_KEYWORDS);
    const sellerCandidates = pickByKeywords(sentences, SELLER_KEYWORDS);

    // 8) sections 묶음 — UI/디버깅용
    const sections: ExtractedSection[] = [
      { name: "claim", text: joinTop(claimCandidates) },
      { name: "review", text: joinTop(reviewCandidates) },
      { name: "ingredient", text: joinTop(ingredientCandidates) },
      { name: "usage", text: joinTop(usageCandidates) },
      { name: "warning", text: joinTop(warningCandidates) },
      { name: "seller", text: joinTop(sellerCandidates) }
    ].filter((s) => s.text.length > 0);

    if (priceCandidates.length === 0) warnings.push("no price candidates");
    if (claimCandidates.length === 0) warnings.push("no claim candidates");
    if (mainText.length < 200) warnings.push("very short body text");

    return {
      title,
      productName: productName || undefined,
      priceCandidates,
      claimCandidates,
      reviewCandidates,
      ingredientCandidates,
      usageCandidates,
      warningCandidates,
      sellerCandidates,
      mainText,
      sections,
      textLength: mainText.length,
      removedBoilerplateHints: dedupe(removedHints).slice(0, 50),
      extractionWarnings: warnings
    };
  }
}

// ---------- 헬퍼 ----------

function cleanProductName(raw: string): string {
  if (!raw) return "";
  let s = raw;
  for (const noise of HEADLINE_NOISE_WORDS) {
    s = s.split(noise).join(" ");
  }
  s = normalizeText(s);
  // 사이트명 분리자(보통 "|", "-", ":", "·")로 첫 토큰을 우선
  const parts = s.split(/\s[|\-:·]\s/).filter(Boolean);
  if (parts.length > 1) s = parts[0];
  if (s.length > EXTRACTION_LIMITS.productNameMaxLen) {
    s = s.slice(0, EXTRACTION_LIMITS.productNameMaxLen);
  }
  return s.trim();
}

export function splitSentences(text: string): string[] {
  if (!text) return [];
  // 한국어 종결 부호 + 영문 마침표 + 줄바꿈 분리 (간이판)
  const raw = text
    .replace(/[​-‍﻿]/g, "")
    .split(/(?<=[\.!\?。…])\s+|\n+/);
  return raw
    .map((s) => normalizeText(s))
    .filter((s) => s.length >= 6 && s.length <= 500);
}

export function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function pickByKeywords(sentences: string[], keywords: string[]): string[] {
  const hits: string[] = [];
  for (const s of sentences) {
    if (keywords.some((k) => s.includes(k))) hits.push(s);
  }
  return dedupe(hits).slice(0, EXTRACTION_LIMITS.maxCandidatesPerCategory);
}

// claim은 해당 문장 + 앞뒤 1문장 컨텍스트까지 후보로 둔다.
function pickContextual(sentences: string[], keywords: string[]): string[] {
  const picked = new Set<number>();
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (keywords.some((k) => s.includes(k))) {
      picked.add(i);
      if (i > 0) picked.add(i - 1);
      if (i < sentences.length - 1) picked.add(i + 1);
    }
  }
  const ordered = [...picked].sort((a, b) => a - b);
  const out = ordered.map((i) => sentences[i]);
  return dedupe(out).slice(0, EXTRACTION_LIMITS.maxCandidatesPerCategory);
}

function joinTop(items: string[], n = 5): string {
  return items.slice(0, n).join(" / ");
}

// 개인정보 마스킹 — 전화/이메일/주민번호 형태
export function maskPII(text: string): string {
  return text
    // 이메일
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email-masked]")
    // 전화번호 (010-1234-5678 / 02-123-4567 / 010 1234 5678)
    .replace(/\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[phone-masked]")
    // 주민등록번호 형태
    .replace(/\b\d{6}[-]\d{7}\b/g, "[rrn-masked]");
}

export const textExtractor = new TextExtractor();
