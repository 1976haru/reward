import type { RuleHit } from "../types/core.js";
import {
  loadFalseAdKeywordsSync,
  type KeywordConfig,
  type KeywordRule,
  type RiskLevel
} from "../modules/false-ad/keywordLoader.js";
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

export interface RuleDetectionResult {
  schemaVersion: string;
  moduleId: string;
  matches: RuleMatch[];
  ruleHits: RuleHit[];               // legacy compat (AnalyzerAgent 등)
  riskScore: number;                 // 0~100 (RuleAgent가 직접 산출)
  riskLevel: "낮음" | "검토 필요" | "높음" | "매우 높음";
  counts: { HIGH: number; MEDIUM: number; LOW: number; combo: number; total: number };
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

export class RuleAgent {
  private config: KeywordConfig;
  private compiledRegex: Map<string, RegExp>;

  constructor() {
    this.config = loadFalseAdKeywordsSync();
    this.compiledRegex = new Map();
    for (const r of this.config.rules) {
      if ((r.matchType === "regex" || r.matchType === "combo") && r.pattern) {
        this.compiledRegex.set(r.id, new RegExp(r.pattern, "gi"));
      }
    }
  }

  getConfig(): KeywordConfig {
    return this.config;
  }

  /** 레거시 호환: 평문 텍스트 → RuleHit[] */
  detect(moduleId: string, text: string): RuleHit[] {
    if (moduleId !== "false_ad") {
      throw new Error(`지원하지 않는 모듈입니다: ${moduleId}`);
    }
    return this.detectDetailed({ text }).ruleHits;
  }

  /**
   * 섹션 인지 탐지.
   * 우선순위: claimCandidates > reviewCandidates > mainText > text(fallback)
   */
  detectDetailed(input: DetectInput): RuleDetectionResult {
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
    const phraseFreq = new Map<string, number>();
    for (const m of matches) {
      raw += m.weight;
      if (m.matchType === "keyword") counts[m.riskLevel]++;
      else counts.combo++;
      const k = `${m.ruleId}|${m.keyword}`;
      phraseFreq.set(k, (phraseFreq.get(k) ?? 0) + 1);
    }
    // 반복 가산: 같은 룰/키워드가 2회 이상 매치되면 +10
    for (const [, freq] of phraseFreq) {
      if (freq >= 2) raw += weights.repeatedPhrase;
    }
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
