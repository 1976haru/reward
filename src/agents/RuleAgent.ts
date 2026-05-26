import type { RuleHit } from "../types/core.js";
import {
  loadFalseAdKeywordsSync,
  type KeywordConfig,
  type KeywordRule,
  type RiskLevel
} from "../modules/false-ad/keywordLoader.js";
import { loadCounterfeitKeywordsSync } from "../modules/counterfeit-goods/keywordLoader.js";
import { loadGeneralFoodKeywordsSync } from "../modules/general-food-false-ad/keywordLoader.js";
import { loadCosmeticKeywordsSync } from "../modules/cosmetic-false-ad/keywordLoader.js";
import { splitSentences } from "../services/TextExtractor.js";

export type SectionName = "claim" | "review" | "ingredient" | "usage" | "warning" | "seller" | "main";

export interface RuleMatch {
  ruleId: string;
  keyword: string;
  riskLevel: RiskLevel;
  weight: number;
  category: string;
  reason: string;
  matchType: KeywordRule["matchType"];
  sentence: string;
  excerpt: string;
  sourceSection: SectionName;
}

export interface HighlightedSegment {
  sentence: string;
  riskLevel: RiskLevel;
  keywords: string[];
  sourceSection: SectionName;
}

export interface RepeatedPhrase {
  keyword: string;
  ruleId: string;
  count: number;
}

export interface CooccurrenceFlags {
  // 상품(군) 표현과 질병명이 함께 등장 (mvp_scope: +15)
  productAndDisease: boolean;
  // 치료/완치/예방 표현과 질병명이 함께 등장 (mvp_scope: +25, combo 룰로 가산)
  treatmentAndDisease: boolean;
}

export interface RuleDetectionResult {
  schemaVersion: string;
  moduleId: string;
  matches: RuleMatch[];
  ruleHits: RuleHit[];               // legacy compat (AnalyzerAgent 등)
  riskScore: number;                 // 0~100 (RuleAgent가 직접 산출)
  riskLevel: "낮음" | "검토 필요" | "높음" | "매우 높음";
  counts: { HIGH: number; MEDIUM: number; LOW: number; combo: number; total: number };
  repeatedPhrases: RepeatedPhrase[]; // 동일 문구(룰) 2회 이상 반복
  cooccurrence: CooccurrenceFlags;   // 상품명/질병명·치료표현/질병명 동시 등장 여부
  highlightedSegments: HighlightedSegment[];
  safetyNotice: string;
}

export interface DetectInput {
  text?: string;
  claimCandidates?: string[];
  reviewCandidates?: string[];
  mainText?: string;
}

const SAFETY_NOTICE =
  "탐지 결과는 위반 의심 또는 검토 필요 문구이며, 법 위반 여부를 확정하지 않습니다. 최종 신고는 사람이 직접 검토한 뒤 진행해야 합니다.";

function riskLevelFromScore(score: number): RuleDetectionResult["riskLevel"] {
  if (score >= 80) return "매우 높음";
  if (score >= 60) return "높음";
  if (score >= 30) return "검토 필요";
  return "낮음";
}

function legacySeverityFromRiskLevel(level: RiskLevel): RuleHit["severity"] {
  if (level === "HIGH") return "high";
  if (level === "MEDIUM") return "medium";
  return "low";
}

function excerptAround(haystack: string, needle: string, radius = 60): string {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return haystack.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(haystack.length, idx + needle.length + radius);
  return haystack.slice(start, end).trim();
}

// 모듈별 keywords.json 로더 — 새 모듈을 추가할 때 이 맵에 등록한다.
const KEYWORD_LOADERS: Record<string, () => KeywordConfig> = {
  false_ad: () => loadFalseAdKeywordsSync() as KeywordConfig,
  // 일반식품 허위·과대광고 (2차 확장) — false-ad 와 동일 KeywordConfig 스키마
  general_food_false_ad: () => loadGeneralFoodKeywordsSync() as KeywordConfig,
  // 화장품 허위·과대광고 (3차 확장) — false-ad 와 동일 KeywordConfig 스키마
  cosmetic_false_ad: () => loadCosmeticKeywordsSync() as KeywordConfig,
  // counterfeit_goods 의 KeywordConfig는 brandTerms 등 추가 필드를 가지지만,
  // RuleAgent 가 사용하는 필드(rules, riskWeights, schemaVersion, moduleId)는 동일하므로
  // KeywordConfig 로 안전하게 cast 한다.
  counterfeit_goods: () => loadCounterfeitKeywordsSync() as unknown as KeywordConfig
};

export class RuleAgent {
  private config: KeywordConfig;
  private compiledRegex: Map<string, RegExp>;
  private readonly moduleConfigs: Map<string, KeywordConfig> = new Map();
  private readonly moduleRegex: Map<string, Map<string, RegExp>> = new Map();

  constructor() {
    // 기본 모듈은 false_ad (기존 동작 유지)
    this.config = loadFalseAdKeywordsSync();
    this.compiledRegex = this.compileRegex(this.config);
    this.moduleConfigs.set("false_ad", this.config);
    this.moduleRegex.set("false_ad", this.compiledRegex);
  }

  private compileRegex(config: KeywordConfig): Map<string, RegExp> {
    const m = new Map<string, RegExp>();
    for (const r of config.rules) {
      if ((r.matchType === "regex" || r.matchType === "combo") && r.pattern) {
        m.set(r.id, new RegExp(r.pattern, "gi"));
      }
    }
    return m;
  }

  /** 모듈별 keywords.json 을 lazy load한다. 미등록 모듈이면 false_ad 로 fallback 하지 않고 예외를 던진다. */
  private getConfigFor(moduleId: string): { config: KeywordConfig; regex: Map<string, RegExp> } {
    const cached = this.moduleConfigs.get(moduleId);
    if (cached) return { config: cached, regex: this.moduleRegex.get(moduleId)! };
    const loader = KEYWORD_LOADERS[moduleId];
    if (!loader) {
      throw new Error(`지원하지 않는 모듈입니다: ${moduleId}`);
    }
    const config = loader();
    const regex = this.compileRegex(config);
    this.moduleConfigs.set(moduleId, config);
    this.moduleRegex.set(moduleId, regex);
    return { config, regex };
  }

  getConfig(moduleId: string = "false_ad"): KeywordConfig {
    return this.getConfigFor(moduleId).config;
  }

  /** 레거시 호환: 평문 텍스트 → RuleHit[]. moduleId 지정 가능 (기본 false_ad). */
  detect(moduleId: string, text: string): RuleHit[] {
    // 미지원 모듈은 getConfigFor 에서 예외 발생
    this.getConfigFor(moduleId);
    return this.detectDetailed({ text }, moduleId).ruleHits;
  }

  /**
   * 섹션 인지 탐지. moduleId 지정 가능 (기본 false_ad — 기존 호출 호환).
   * 우선순위: claimCandidates > reviewCandidates > mainText > text(fallback)
   */
  detectDetailed(input: DetectInput, moduleId: string = "false_ad"): RuleDetectionResult {
    const { config, regex } = this.getConfigFor(moduleId);
    // 인스턴스 단위 캐시도 갱신 (기존 코드 호환)
    this.config = config;
    this.compiledRegex = regex;
    const matches: RuleMatch[] = [];

    const sectionInputs: Array<{ name: SectionName; sentences: string[] }> = [];
    if (input.claimCandidates && input.claimCandidates.length > 0) {
      sectionInputs.push({ name: "claim", sentences: input.claimCandidates });
    }
    if (input.reviewCandidates && input.reviewCandidates.length > 0) {
      sectionInputs.push({ name: "review", sentences: input.reviewCandidates });
    }
    if (input.mainText && input.mainText.length > 0) {
      sectionInputs.push({ name: "main", sentences: splitSentences(input.mainText) });
    }
    if (sectionInputs.length === 0 && input.text && input.text.length > 0) {
      sectionInputs.push({ name: "main", sentences: splitSentences(input.text) });
    }

    // 중복 방지 키: ruleId + sentence (한 문장에 같은 룰 중복 방지)
    const seen = new Set<string>();

    for (const section of sectionInputs) {
      for (const sentence of section.sentences) {
        if (!sentence || sentence.length < 4) continue;
        // 키워드 룰
        for (const rule of this.config.rules) {
          if (rule.matchType === "keyword") {
            if (sentence.includes(rule.keyword)) {
              const key = `${rule.id}|${sentence}`;
              if (seen.has(key)) continue;
              seen.add(key);
              matches.push({
                ruleId: rule.id,
                keyword: rule.keyword,
                riskLevel: rule.riskLevel,
                weight: rule.weight,
                category: rule.category,
                reason: rule.reason,
                matchType: rule.matchType,
                sentence,
                excerpt: excerptAround(sentence, rule.keyword),
                sourceSection: section.name
              });
            }
          } else {
            const re = this.compiledRegex.get(rule.id);
            if (!re) continue;
            re.lastIndex = 0;
            const m = re.exec(sentence);
            if (m) {
              const key = `${rule.id}|${sentence}`;
              if (seen.has(key)) continue;
              seen.add(key);
              matches.push({
                ruleId: rule.id,
                keyword: rule.keyword,
                riskLevel: rule.riskLevel,
                weight: rule.weight,
                category: rule.category,
                reason: rule.reason,
                matchType: rule.matchType,
                sentence,
                excerpt: excerptAround(sentence, m[0]),
                sourceSection: section.name
              });
            }
          }
        }
      }
    }

    // 점수 산정
    const weights = this.config.riskWeights;
    let raw = 0;
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, combo: 0, total: matches.length };
    const phraseFreq = new Map<string, { keyword: string; ruleId: string; count: number }>();
    for (const m of matches) {
      raw += m.weight;
      if (m.matchType === "keyword") counts[m.riskLevel]++;
      else counts.combo++;
      const k = `${m.ruleId}|${m.keyword}`;
      const cur = phraseFreq.get(k);
      if (cur) cur.count++;
      else phraseFreq.set(k, { keyword: m.keyword, ruleId: m.ruleId, count: 1 });
    }
    // 반복 가산: 같은 룰/키워드가 2회 이상 매치되면 +10
    const repeatedPhrases: RepeatedPhrase[] = [];
    for (const v of phraseFreq.values()) {
      if (v.count >= 2) {
        raw += weights.repeatedPhrase;
        repeatedPhrases.push({ keyword: v.keyword, ruleId: v.ruleId, count: v.count });
      }
    }

    // 동시 등장(co-occurrence) 판정 — mvp_scope 위험도 정책 정렬용.
    //  - 상품(군) 표현 + 질병명 함께 등장 → +productAndDiseaseCombo(기본 15)
    //  - 치료/완치/예방 등 표현 + 질병명 함께 등장 → combo 룰(C001/C002, +25)이 이미 가산
    const cfg = this.config as unknown as Record<string, unknown>;
    const diseaseTerms = Array.isArray(cfg.diseaseTerms) ? (cfg.diseaseTerms as string[]) : [];
    const productTerms = Array.isArray(cfg.productTerms) ? (cfg.productTerms as string[]) : [];
    const actionTerms = Array.isArray(cfg.actionTerms) ? (cfg.actionTerms as string[]) : [];
    const allText = sectionInputs.flatMap((s) => s.sentences).join(" ");
    const hasDisease = diseaseTerms.some((t) => allText.includes(t));
    const productAndDisease = hasDisease && productTerms.some((t) => allText.includes(t));
    const treatmentAndDisease =
      matches.some((m) => m.category === "disease_action_combo") ||
      (hasDisease && actionTerms.some((t) => allText.includes(t)));
    if (productAndDisease) {
      raw += Number(weights.productAndDiseaseCombo ?? 0);
    }
    const cooccurrence: CooccurrenceFlags = { productAndDisease, treatmentAndDisease };

    const riskScore = Math.max(0, Math.min(weights.maxScore, raw));

    // 하이라이트 — 문장 단위로 묶기 (가장 높은 riskLevel 채택)
    const bySentence = new Map<string, HighlightedSegment>();
    for (const m of matches) {
      const cur = bySentence.get(m.sentence);
      if (!cur) {
        bySentence.set(m.sentence, {
          sentence: m.sentence,
          riskLevel: m.riskLevel,
          keywords: [m.keyword],
          sourceSection: m.sourceSection
        });
      } else {
        if (!cur.keywords.includes(m.keyword)) cur.keywords.push(m.keyword);
        if (riskRank(m.riskLevel) > riskRank(cur.riskLevel)) cur.riskLevel = m.riskLevel;
      }
    }
    const highlightedSegments = [...bySentence.values()].sort(
      (a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel)
    );

    // 레거시 RuleHit[] 매핑 (AnalyzerAgent 등 호환)
    const ruleHits: RuleHit[] = matches.map((m) => ({
      ruleId: m.ruleId,
      category: m.category,
      keyword: m.keyword,
      severity: legacySeverityFromRiskLevel(m.riskLevel),
      excerpt: m.excerpt,
      reason: m.reason
    }));

    return {
      schemaVersion: this.config.schemaVersion,
      moduleId: this.config.moduleId,
      matches,
      ruleHits,
      riskScore,
      riskLevel: riskLevelFromScore(riskScore),
      counts,
      repeatedPhrases,
      cooccurrence,
      highlightedSegments,
      safetyNotice: SAFETY_NOTICE
    };
  }
}

function riskRank(level: RiskLevel): number {
  if (level === "HIGH") return 3;
  if (level === "MEDIUM") return 2;
  return 1;
}

export const ruleAgent = new RuleAgent();
