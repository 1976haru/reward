import { readFileSync } from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type {
  AiFinding,
  CollectedDocument,
  RuleHit
} from "../types/core.js";
import { config } from "../utils/config.js";

// ============================================================
// Public types
// ============================================================

export type OverallRisk = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "UNCERTAIN";
export type ViolationLikelihood = "LOW" | "MEDIUM" | "HIGH" | "UNCERTAIN";
export type FindingRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNCERTAIN";
export type SourceSection = "claim" | "review" | "ingredient" | "usage" | "warning" | "seller" | "main";

export interface AnalysisFinding {
  issue: string;
  evidence: string;
  reason: string;
  riskLevel: FindingRiskLevel;
  sourceSection?: SourceSection;
}

export interface AnalysisResult {
  schemaVersion: "1.0.0";
  moduleId: string;
  notLegalConclusion: true;
  rewardGuaranteed: false;
  overallRisk: OverallRisk;
  violationLikelihood: ViolationLikelihood;
  confidence: number; // 0..1
  summary: string;
  findings: AnalysisFinding[];
  missingEvidence: string[];
  recommendedAgency: string;
  agencyCandidates: string[];
  reportDraftSummary: string;
  prohibitedPhrases: string[];
  humanReviewChecklist: string[];
  safetyWarnings: string[];
}

export interface AnalyzeContextInput {
  moduleId: string;
  url?: string;
  title?: string;
  memo?: string;
  extractionResult?: {
    productName?: string;
    claimCandidates?: string[];
    reviewCandidates?: string[];
    mainText?: string;
  };
  ruleDetectionResult?: {
    riskScore?: number;
    score?: number;
    riskLevel?: string;
    counts?: { HIGH?: number; MEDIUM?: number; LOW?: number; combo?: number; total?: number };
    matches?: Array<{
      ruleId?: string;
      keyword?: string;
      riskLevel?: string;
      reason?: string;
      sentence?: string;
      sourceSection?: string;
      category?: string;
    }>;
  };
  evidenceSummary?: {
    productName?: string;
    priceCandidates?: string[];
    hasScreenshot?: boolean;
    hasPdf?: boolean;
    hasHtml?: boolean;
    hasText?: boolean;
    captureStatus?: Record<string, string>;
  };
}

// ============================================================
// Constants
// ============================================================

const PROMPT_PATH = path.join(process.cwd(), "src/modules/false-ad/analysis_prompt.md");
const SCHEMA_PATH = path.join(process.cwd(), "src/modules/false-ad/analysis_schema.json");

const REQUIRED_SAFETY_WARNINGS = [
  "본 결과는 법 위반 확정이 아닙니다.",
  "본 결과는 포상금 지급을 보장하지 않습니다.",
  "사람 검토 없이 외부 신고기관에 제출하지 마십시오."
];

const BANNED_PHRASES_REGEX = [
  /불법\s*확정/g,
  /위반\s*확정/g,
  /포상금\s*확정/g,
  /무조건\s*지급/g,
  /건당\s*[\d,]+\s*원\s*확정/g,
  /범죄자/g,
  /사기꾼/g
];

const REWARD_GUARANTEE_REGEX = /(포상금\s*보장|수령\s*보장|지급\s*보장)/g;

const DEFAULT_AGENCY_CANDIDATES = [
  "식품의약품안전처 (후보)",
  "국민신문고 (후보)",
  "관할 지자체 (후보)"
];

const OVERALL_RISKS: OverallRisk[] = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH", "UNCERTAIN"];
const VIOLATION_LIKELIHOODS: ViolationLikelihood[] = ["LOW", "MEDIUM", "HIGH", "UNCERTAIN"];
const FINDING_RISK_LEVELS: FindingRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "UNCERTAIN"];
const SOURCE_SECTIONS: SourceSection[] = ["claim", "review", "ingredient", "usage", "warning", "seller", "main"];

// ============================================================
// Helpers
// ============================================================

let promptCache: string | null = null;
function loadPrompt(): string {
  if (promptCache) return promptCache;
  promptCache = readFileSync(PROMPT_PATH, "utf8");
  return promptCache;
}

let schemaCache: string | null = null;
export function loadAnalysisSchemaString(): string {
  if (schemaCache) return schemaCache;
  schemaCache = readFileSync(SCHEMA_PATH, "utf8");
  return schemaCache;
}

function sanitizeText(input: string, addedWarnings: string[]): string {
  let out = String(input ?? "");
  for (const re of BANNED_PHRASES_REGEX) {
    if (re.test(out)) {
      addedWarnings.push(`AI 출력에서 금지 표현(${re.source})을 감지해 중립 표현으로 치환했습니다.`);
      out = out.replace(re, "(검토 필요 표현으로 치환됨)");
    }
  }
  if (REWARD_GUARANTEE_REGEX.test(out)) {
    addedWarnings.push("AI 출력에서 '포상금/수령/지급 보장' 표현을 감지해 중립화했습니다.");
    out = out.replace(REWARD_GUARANTEE_REGEX, "(보장 표현 사용 금지)");
  }
  return out;
}

function sanitizeArray(arr: unknown, max: number, addedWarnings: string[]): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => typeof x === "string")
    .slice(0, max)
    .map((s) => sanitizeText(s, addedWarnings).trim())
    .filter((s) => s.length > 0);
}

function ensureEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function clampConfidence(v: unknown): number {
  let n = Number(v);
  if (!Number.isFinite(n)) n = 0;
  if (n > 1) n = n > 100 ? 0 : n / 100; // 모델이 0~100으로 줬을 가능성
  if (n < 0) n = 0;
  if (n > 1) n = 1;
  return Math.round(n * 100) / 100;
}

// ============================================================
// Validator / normalizer — LLM 출력을 절대 그대로 신뢰하지 않는다
// ============================================================

export function validateAnalysisResult(raw: unknown, moduleId: string): AnalysisResult {
  const added: string[] = [];
  const obj = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};

  const findings: AnalysisFinding[] = Array.isArray(obj.findings)
    ? obj.findings.slice(0, 50).map((f) => {
        const fo = (f && typeof f === "object") ? (f as Record<string, unknown>) : {};
        return {
          issue: sanitizeText(typeof fo.issue === "string" ? fo.issue : "검토 필요 항목", added).slice(0, 200),
          evidence: sanitizeText(typeof fo.evidence === "string" ? fo.evidence : "", added).slice(0, 800),
          reason: sanitizeText(typeof fo.reason === "string" ? fo.reason : "추가 확인 필요", added).slice(0, 600),
          riskLevel: ensureEnum(fo.riskLevel, FINDING_RISK_LEVELS, "UNCERTAIN"),
          sourceSection: typeof fo.sourceSection === "string" && (SOURCE_SECTIONS as readonly string[]).includes(fo.sourceSection)
            ? (fo.sourceSection as SourceSection)
            : undefined
        };
      })
    : [];

  const safetyInRaw = Array.isArray(obj.safetyWarnings)
    ? obj.safetyWarnings.filter((s): s is string => typeof s === "string")
    : [];
  const sanitizedSafetyIn = safetyInRaw.map((s) => sanitizeText(s, added).slice(0, 300)).filter(Boolean);

  const result: AnalysisResult = {
    schemaVersion: "1.0.0",
    moduleId,
    notLegalConclusion: true,
    rewardGuaranteed: false,
    overallRisk: ensureEnum(obj.overallRisk, OVERALL_RISKS, "UNCERTAIN"),
    violationLikelihood: ensureEnum(obj.violationLikelihood, VIOLATION_LIKELIHOODS, "UNCERTAIN"),
    confidence: clampConfidence(obj.confidence),
    summary: sanitizeText(typeof obj.summary === "string" ? obj.summary : "AI 분석 요약이 제공되지 않았습니다.", added).slice(0, 2000),
    findings,
    missingEvidence: sanitizeArray(obj.missingEvidence, 30, added).map((s) => s.slice(0, 200)),
    recommendedAgency: sanitizeText(
      typeof obj.recommendedAgency === "string" && obj.recommendedAgency.trim().length > 0
        ? obj.recommendedAgency
        : "식품의약품안전처 (후보)",
      added
    ).slice(0, 200),
    agencyCandidates: (() => {
      const arr = sanitizeArray(obj.agencyCandidates, 20, added).map((s) => s.slice(0, 200));
      return arr.length > 0 ? arr : [...DEFAULT_AGENCY_CANDIDATES];
    })(),
    reportDraftSummary: sanitizeText(
      typeof obj.reportDraftSummary === "string" ? obj.reportDraftSummary : "공개 자료를 바탕으로 본 광고 표현이 건강기능식품 허위·과대광고에 해당할 가능성을 검토 요청드립니다. 본 자료는 위반을 확정하지 않으며, 공식 기준 확인이 필요합니다.",
      added
    ).slice(0, 2000),
    prohibitedPhrases: sanitizeArray(obj.prohibitedPhrases, 30, added).map((s) => s.slice(0, 100)).length > 0
      ? sanitizeArray(obj.prohibitedPhrases, 30, added).map((s) => s.slice(0, 100))
      : ["불법 확정", "위반 확정", "포상금 확정", "무조건 지급", "범죄자", "사기꾼"],
    humanReviewChecklist: (() => {
      const arr = sanitizeArray(obj.humanReviewChecklist, 30, added).map((s) => s.slice(0, 300));
      return arr.length > 0 ? arr : [
        "공개 URL이 접속 가능한가?",
        "광고 문맥이 RuleAgent 탐지 표현과 실제로 일치하는가?",
        "일반적 기능성 표현 가능성을 검토했는가?",
        "캡처/PDF가 원형 보존되었는가?",
        "신고기관 관할이 일치하는가?",
        "동일 위반 행위 중복 신고 가능성을 확인했는가?",
        "공식 기준(법령·고시) 최신본을 사람이 직접 재확인했는가?"
      ];
    })(),
    safetyWarnings: [] // 아래에서 모든 added 누적 이후에 채움
  };

  // 모든 sanitize 호출 이후에 안내+경고를 머지 (added는 sanitizeText 호출 중 채워진다)
  result.safetyWarnings = [...new Set<string>([
    ...REQUIRED_SAFETY_WARNINGS,
    ...sanitizedSafetyIn,
    ...added
  ])];

  return result;
}

// ============================================================
// Mock generator (deterministic)
// ============================================================

function mockAnalyze(input: AnalyzeContextInput): AnalysisResult {
  const rd = input.ruleDetectionResult ?? {};
  const score = Number(rd.riskScore ?? rd.score ?? 0);
  const matches = Array.isArray(rd.matches) ? rd.matches : [];
  const ev = input.evidenceSummary ?? {};

  let overallRisk: OverallRisk;
  let violationLikelihood: ViolationLikelihood;
  let confidence: number;
  if (matches.length === 0 && score === 0) {
    overallRisk = "UNCERTAIN";
    violationLikelihood = "UNCERTAIN";
    confidence = 0.2;
  } else if (score >= 80) {
    overallRisk = "VERY_HIGH";
    violationLikelihood = "HIGH";
    confidence = 0.75;
  } else if (score >= 60) {
    overallRisk = "HIGH";
    violationLikelihood = "MEDIUM";
    confidence = 0.65;
  } else if (score >= 30) {
    overallRisk = "MEDIUM";
    violationLikelihood = "MEDIUM";
    confidence = 0.5;
  } else {
    overallRisk = "LOW";
    violationLikelihood = "LOW";
    confidence = 0.35;
  }

  const findings: AnalysisFinding[] = matches.slice(0, 8).map((m) => ({
    issue: m.keyword ? `${m.keyword} 표현 검토 필요` : "검토 필요 표현",
    evidence: typeof m.sentence === "string" ? m.sentence.slice(0, 600) : "",
    reason: typeof m.reason === "string" ? m.reason : "광고 문맥에서 의약품 영역 효능 또는 과장 표현으로 오인될 가능성 검토 필요",
    riskLevel: mapRiskLevel(m.riskLevel),
    sourceSection: (SOURCE_SECTIONS as readonly string[]).includes(String(m.sourceSection))
      ? (m.sourceSection as SourceSection)
      : undefined
  }));

  const missingEvidence: string[] = [];
  if (!input.url) missingEvidence.push("원본 URL 캡처 필요");
  if (ev.hasScreenshot === false) missingEvidence.push("스크린샷 재캡처 필요");
  if (ev.hasPdf === false) missingEvidence.push("PDF 저장본 필요");
  if (!input.extractionResult?.productName) missingEvidence.push("상품명/광고 제목 확인 필요");
  if (matches.length === 0) missingEvidence.push("RuleAgent 매치가 없어 수동 확인 필요");
  missingEvidence.push("관련 법령·고시 최신본을 사람이 직접 재확인");

  const productName = input.extractionResult?.productName ?? input.title ?? "(상품명 미식별)";
  const summary = matches.length > 0
    ? `[${productName}] 광고에서 ${matches.length}건의 의심 표현이 탐지되었습니다. 위반 가능성은 ${violationLikelihood} 수준으로 추정되며 본 결과는 검토 후보일 뿐 법 위반 확정이 아닙니다.`
    : `[${productName}] RuleAgent 매치가 없거나 부족합니다. 추가 확인이 필요하며 본 결과는 법 위반 확정이 아닙니다.`;

  const reportDraftSummary = `공개 자료를 바탕으로 ${productName} 관련 광고 표현이 건강기능식품 허위·과대광고에 해당할 가능성을 검토 요청드립니다. 탐지된 의심 표현은 ${matches.slice(0, 3).map((m) => m.keyword).filter(Boolean).join(", ") || "(없음)"} 등이며, 본 자료는 위반을 확정하지 않습니다. 공식 기준은 사람이 직접 재확인해야 합니다.`;

  return {
    schemaVersion: "1.0.0",
    moduleId: input.moduleId,
    notLegalConclusion: true,
    rewardGuaranteed: false,
    overallRisk,
    violationLikelihood,
    confidence,
    summary,
    findings,
    missingEvidence,
    recommendedAgency: "식품의약품안전처 (후보)",
    agencyCandidates: [...DEFAULT_AGENCY_CANDIDATES],
    reportDraftSummary,
    prohibitedPhrases: ["불법 확정", "위반 확정", "포상금 확정", "무조건 지급", "범죄자", "사기꾼"],
    humanReviewChecklist: [
      "공개 URL이 접속 가능한가?",
      "광고 문맥이 RuleAgent 탐지 표현과 실제로 일치하는가?",
      "일반적 기능성 표현(인정된 표시·광고 범위) 가능성을 검토했는가?",
      "캡처/PDF가 원형 보존되었는가?",
      "신고기관 관할이 일치하는가?",
      "동일 위반 행위 중복 신고 가능성을 확인했는가?",
      "공식 기준(법령·고시) 최신본을 사람이 직접 재확인했는가?"
    ],
    safetyWarnings: [...REQUIRED_SAFETY_WARNINGS]
  };
}

function mapRiskLevel(value: unknown): FindingRiskLevel {
  if (typeof value !== "string") return "UNCERTAIN";
  const v = value.toUpperCase();
  if (v === "HIGH" || v === "VERY_HIGH" || v === "CRITICAL") return "HIGH";
  if (v === "MEDIUM" || v === "MED") return "MEDIUM";
  if (v === "LOW") return "LOW";
  return "UNCERTAIN";
}

// ============================================================
// Build user prompt (context to LLM)
// ============================================================

function buildUserPrompt(input: AnalyzeContextInput): string {
  const ext = input.extractionResult ?? {};
  const rd = input.ruleDetectionResult ?? {};
  const ev = input.evidenceSummary ?? {};

  const claimList = (ext.claimCandidates ?? []).slice(0, 20);
  const reviewList = (ext.reviewCandidates ?? []).slice(0, 10);
  const mainSnippet = (ext.mainText ?? "").slice(0, 3000);
  const matchList = (rd.matches ?? []).slice(0, 20).map((m) => ({
    ruleId: m.ruleId,
    keyword: m.keyword,
    riskLevel: m.riskLevel,
    sourceSection: m.sourceSection,
    sentence: typeof m.sentence === "string" ? m.sentence.slice(0, 300) : "",
    reason: m.reason,
    category: m.category
  }));

  return [
    "다음 입력에 대해 분석 프롬프트에 정의된 JSON Schema를 따르는 단일 JSON 객체만 출력하세요.",
    "",
    `moduleId: ${input.moduleId}`,
    `url: ${input.url ?? "(없음)"}`,
    `title: ${input.title ?? "(없음)"}`,
    `productName: ${ext.productName ?? "(없음)"}`,
    `memo: ${input.memo ?? "(없음)"}`,
    "",
    "## RuleAgent 결과",
    `riskScore: ${rd.riskScore ?? rd.score ?? 0}`,
    `riskLevel: ${rd.riskLevel ?? "(없음)"}`,
    `counts: ${JSON.stringify(rd.counts ?? {})}`,
    `matches (상위 20):`,
    JSON.stringify(matchList, null, 2),
    "",
    "## TextExtractor claimCandidates (상위 20)",
    JSON.stringify(claimList, null, 2),
    "",
    "## TextExtractor reviewCandidates (상위 10)",
    JSON.stringify(reviewList, null, 2),
    "",
    "## TextExtractor mainText (앞부분 3000자)",
    mainSnippet,
    "",
    "## Evidence 요약",
    JSON.stringify({
      productName: ev.productName,
      priceCandidates: ev.priceCandidates,
      hasHtml: ev.hasHtml,
      hasText: ev.hasText,
      hasScreenshot: ev.hasScreenshot,
      hasPdf: ev.hasPdf,
      captureStatus: ev.captureStatus
    }, null, 2),
    "",
    "## 신고처 후보 (모두 '후보'임을 유지)",
    "- 식품의약품안전처",
    "- 국민신문고 / 국민권익위원회",
    "- 관할 지자체",
    "",
    "지정된 JSON 객체만 출력합니다."
  ].join("\n");
}

// ============================================================
// AnalyzerAgent
// ============================================================

export class AnalyzerAgent {
  private client: OpenAI | null;
  private prompt: string;

  constructor() {
    const useReal = !config.mockAi && Boolean(config.openaiApiKey);
    this.client = useReal ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
    try {
      this.prompt = loadPrompt();
    } catch {
      this.prompt = "당신은 신고 후보 검토를 돕는 분석 보조자입니다. 출력은 단일 JSON 객체로 합니다.";
    }
  }

  isMockMode(): boolean {
    return this.client === null;
  }

  /**
   * 새 진입점: 문맥(추출/룰/증거/메모)을 받아 구조화 분석 결과 반환.
   * LLM 호출 실패 시 mock으로 안전 폴백한다.
   */
  async analyzeWithContext(input: AnalyzeContextInput): Promise<AnalysisResult> {
    if (!this.client) return mockAnalyze(input);
    try {
      const completion = await this.client.chat.completions.create({
        model: config.openaiModel,
        temperature: config.llmTemperature,
        messages: [
          { role: "system", content: this.prompt },
          { role: "user", content: buildUserPrompt(input) }
        ],
        response_format: { type: "json_object" }
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch {
        return validateAnalysisResult({ summary: "LLM 응답을 JSON으로 파싱하지 못해 mock 결과를 반환합니다." }, input.moduleId);
      }
      return validateAnalysisResult(parsed, input.moduleId);
    } catch (error) {
      const fallback = mockAnalyze(input);
      fallback.safetyWarnings = [
        ...fallback.safetyWarnings,
        `LLM 호출 실패로 mock 결과를 사용합니다: ${(error as Error).message}`
      ];
      return fallback;
    }
  }

  // ============================================================
  // Legacy 인터페이스 (OrchestratorAgent 이전 코드 호환)
  // ============================================================

  async analyze(doc: CollectedDocument, ruleHits: RuleHit[], score: number): Promise<AiFinding> {
    const adapted: AnalyzeContextInput = {
      moduleId: "false_ad",
      url: doc.url,
      title: doc.title,
      extractionResult: { mainText: doc.text },
      ruleDetectionResult: {
        riskScore: score,
        matches: ruleHits.map((h) => ({
          ruleId: h.ruleId,
          keyword: h.keyword,
          riskLevel: h.severity === "high" || h.severity === "critical" ? "HIGH" : h.severity === "medium" ? "MEDIUM" : "LOW",
          sentence: h.excerpt,
          reason: h.reason,
          category: h.category,
          sourceSection: "main"
        }))
      }
    };
    const result = await this.analyzeWithContext(adapted);
    return analysisResultToAiFinding(result, score);
  }
}

export function analysisResultToAiFinding(result: AnalysisResult, fallbackScore: number): AiFinding {
  const confidence0to100 = Math.round(result.confidence * 100);
  return {
    suspicious: result.violationLikelihood !== "LOW" && result.violationLikelihood !== "UNCERTAIN",
    confidence: Number.isFinite(confidence0to100) ? confidence0to100 : fallbackScore,
    violationType: result.findings[0]?.issue ?? "온라인 허위·과대광고 의심",
    summary: result.summary,
    reasons: result.findings.slice(0, 5).map((f) => `${f.issue}: ${f.evidence}`).filter(Boolean),
    requiredHumanChecks: result.humanReviewChecklist,
    recommendedAgency: result.recommendedAgency,
    safeWording: result.reportDraftSummary
  };
}

export const analyzerAgent = new AnalyzerAgent();
