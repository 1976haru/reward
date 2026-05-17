import type { RuleHit } from "../types/core.js";
import type {
  ComponentKey,
  ScoringComponent,
  ScoringInput,
  ScoringResult
} from "../types/scoring.js";
import {
  COMPONENT_DEFS,
  PRIORITY_MAX_SCORE,
  SCORING_DISCLAIMER,
  SCORING_SAFETY_WARNINGS,
  SCORING_VERSION,
  SCORING_WEIGHTS,
  levelForScore,
  recommendedActionsFor
} from "./scoring_rules.js";

const SHOP_HINT_REGEX = /product|shop|sale|item|goods|store|mall/i;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function makeComponent(key: ComponentKey, score: number, reasons: string[]): ScoringComponent {
  const def = COMPONENT_DEFS[key];
  return {
    key,
    label: def.label,
    maxPoints: def.maxPoints,
    score: clamp(Math.round(score), 0, def.maxPoints),
    reasons
  };
}

// ============================================================
// 개별 컴포넌트 계산기 — 모두 sanitize된 lite 입력만 받는다
// ============================================================

function computeRuleSignal(input: ScoringInput): ScoringComponent {
  const w = SCORING_WEIGHTS.rule;
  const rd = input.ruleDetectionResult ?? {};
  const score = Number(rd.riskScore ?? 0);
  const counts = rd.counts ?? {};
  const matches = Array.isArray(rd.matches) ? rd.matches : [];
  const reasons: string[] = [];

  let v = score * w.baseFactor;
  reasons.push(`RuleAgent score ${Math.round(score)} × ${w.baseFactor}`);

  const highCount = Number(counts.HIGH ?? 0);
  if (highCount >= w.highCountBonus.threshold) {
    v += w.highCountBonus.points;
    reasons.push(`HIGH 매치 ${highCount}건 ≥ ${w.highCountBonus.threshold} → +${w.highCountBonus.points}`);
  }

  const hasCombo = matches.some((m) => m?.matchType === "regex" || m?.matchType === "combo");
  if (hasCombo) {
    v += w.comboPresenceBonus;
    reasons.push(`combo/regex 룰 매치 → +${w.comboPresenceBonus}`);
  }

  if (highCount === 0 && Number(counts.MEDIUM ?? 0) > 0 && Number(counts.LOW ?? 0) === 0) {
    v += w.mediumOnlyPenalty.points;
    reasons.push(`HIGH 없이 MEDIUM만 → ${w.mediumOnlyPenalty.points}`);
  }

  return makeComponent("ruleSignal", v, reasons);
}

function computeLlmSignal(input: ScoringInput): ScoringComponent {
  const w = SCORING_WEIGHTS.llm;
  const llm = input.llmAnalysis ?? {};
  const reasons: string[] = [];

  let v = 0;
  if (llm.overallRisk && llm.overallRisk in w.overallRisk) {
    const pts = w.overallRisk[llm.overallRisk];
    v += pts;
    reasons.push(`overallRisk=${llm.overallRisk} → +${pts}`);
  }
  if (llm.violationLikelihood && llm.violationLikelihood in w.violationLikelihood) {
    const pts = w.violationLikelihood[llm.violationLikelihood];
    v += pts;
    reasons.push(`violationLikelihood=${llm.violationLikelihood} → +${pts}`);
  }
  const conf = Number(llm.confidence ?? 0);
  if (Number.isFinite(conf) && conf > 0) {
    const pts = clamp(conf, 0, 1) * w.confidenceMax;
    v += pts;
    reasons.push(`confidence=${conf.toFixed(2)} × ${w.confidenceMax} → +${pts.toFixed(1)}`);
  }
  return makeComponent("llmSignal", v, reasons);
}

function computeEvidenceCompleteness(input: ScoringInput): ScoringComponent {
  const w = SCORING_WEIGHTS.evidence;
  const ev = input.evidenceSummary ?? {};
  const reasons: string[] = [];

  let v = 0;
  if (ev.hasUrl) { v += w.hasUrl; reasons.push(`URL 보존 +${w.hasUrl}`); }
  if (ev.hasHtml) { v += w.hasHtml; reasons.push(`HTML 보존 +${w.hasHtml}`); }
  if (ev.hasText) { v += w.hasText; reasons.push(`텍스트 보존 +${w.hasText}`); }
  if (ev.hasScreenshot) { v += w.hasScreenshot; reasons.push(`스크린샷 +${w.hasScreenshot}`); }
  if (ev.hasPdf) { v += w.hasPdf; reasons.push(`PDF +${w.hasPdf}`); }
  if (ev.hasMetadata) { v += w.hasMetadata; reasons.push(`metadata +${w.hasMetadata}`); }
  if (ev.hasManifest) { v += w.hasManifest; reasons.push(`manifest +${w.hasManifest}`); }
  if (ev.hasSha256) { v += w.hasSha256; reasons.push(`해시 +${w.hasSha256}`); }
  if (reasons.length === 0) reasons.push("증거 패키지가 비어 있어 완성도 0");

  return makeComponent("evidenceCompleteness", Math.min(v, w.cap), reasons);
}

function computeCommercialSignal(input: ScoringInput): ScoringComponent {
  const w = SCORING_WEIGHTS.commercial;
  const ext = input.extractionResult ?? {};
  const url = input.url ?? "";
  const reasons: string[] = [];

  let v = 0;
  if ((ext.priceCandidates ?? []).length > 0) {
    v += w.hasPrice;
    reasons.push(`가격 표기 ${ext.priceCandidates?.length}건 +${w.hasPrice}`);
  }
  if (SHOP_HINT_REGEX.test(url)) {
    v += w.shopUrlHint;
    reasons.push(`URL 경로 상거래 힌트 +${w.shopUrlHint}`);
  }
  const reviews = (ext.reviewCandidates ?? []).length;
  if (reviews >= w.reviewCandidatesThreshold.threshold) {
    v += w.reviewCandidatesThreshold.points;
    reasons.push(`후기 ${reviews}건 ≥ ${w.reviewCandidatesThreshold.threshold} → +${w.reviewCandidatesThreshold.points}`);
  }
  if ((ext.sellerCandidates ?? []).length > 0) {
    v += w.sellerInfo;
    reasons.push(`판매자 표시 +${w.sellerInfo}`);
  }
  if (reasons.length === 0) reasons.push("상업성 신호 없음");

  return makeComponent("commercialSignal", Math.min(v, w.cap), reasons);
}

function computeRepetitionSignal(input: ScoringInput): ScoringComponent {
  const w = SCORING_WEIGHTS.repetition;
  const rd = input.ruleDetectionResult ?? {};
  const ext = input.extractionResult ?? {};
  const cand = input.candidate ?? {};
  const matches = Array.isArray(rd.matches) ? rd.matches : [];
  const reasons: string[] = [];

  let v = 0;
  // 같은 ruleId가 2회 이상 등장하면 반복으로 본다
  const idFreq = new Map<string, number>();
  for (const m of matches) {
    if (!m?.ruleId) continue;
    idFreq.set(m.ruleId, (idFreq.get(m.ruleId) ?? 0) + 1);
  }
  if ([...idFreq.values()].some((n) => n >= 2)) {
    v += w.sameHighKeywordRepeat;
    reasons.push(`동일 룰 반복 매치 +${w.sameHighKeywordRepeat}`);
  }
  const claims = (ext.claimCandidates ?? []).length;
  if (claims >= w.manyClaimCandidates.threshold) {
    v += w.manyClaimCandidates.points;
    reasons.push(`의심 문구 ${claims}건 ≥ ${w.manyClaimCandidates.threshold} → +${w.manyClaimCandidates.points}`);
  }
  const sameDomain = Number(cand.sameDomainCount ?? 0);
  if (sameDomain >= 2) {
    v += w.sameDomainCandidates;
    reasons.push(`동일 도메인 후보 반복 +${w.sameDomainCandidates}`);
  }
  // 후기성 효능 단정 패턴: review 키워드 + 치료/완치/효과
  const reviewClaim = (ext.reviewCandidates ?? []).some((s) =>
    /(치료|완치|효과|좋아졌|사라졌|개선)/.test(s)
  );
  if (reviewClaim) {
    v += w.reviewAsClaim;
    reasons.push(`후기성 효능 단정 패턴 +${w.reviewAsClaim}`);
  }
  if (reasons.length === 0) reasons.push("반복성 신호 없음");

  return makeComponent("repetitionSignal", Math.min(v, w.cap), reasons);
}

function computeExtractionQuality(input: ScoringInput): ScoringComponent {
  const w = SCORING_WEIGHTS.extraction;
  const ext = input.extractionResult;
  const col = input.collectorSummary ?? {};
  const reasons: string[] = [];

  if (!ext) {
    return makeComponent("extractionQuality", 0, ["수집·추출 결과 없음 → 0"]);
  }
  let v = 0;
  if ((ext.textLength ?? 0) >= w.textLengthGood.threshold) {
    v += w.textLengthGood.points;
    reasons.push(`본문 길이 ${ext.textLength} ≥ ${w.textLengthGood.threshold} → +${w.textLengthGood.points}`);
  }
  if ((ext.claimCandidates ?? []).length > 0) {
    v += w.hasClaim;
    reasons.push(`의심 문구 후보 존재 +${w.hasClaim}`);
  }
  const warnings = (ext.extractionWarnings ?? []).length;
  if (warnings <= w.warningsFewBonus.thresholdMax) {
    v += w.warningsFewBonus.points;
    reasons.push(`추출 경고 ${warnings}건 ≤ ${w.warningsFewBonus.thresholdMax} → +${w.warningsFewBonus.points}`);
  }
  if (warnings >= w.warningsManyPenalty.thresholdMin) {
    v += w.warningsManyPenalty.points;
    reasons.push(`추출 경고 ${warnings}건 ≥ ${w.warningsManyPenalty.thresholdMin} → ${w.warningsManyPenalty.points}`);
  }
  if ((col.warnings ?? []).length > 0) {
    v += w.collectorWarningsPenalty;
    reasons.push(`Collector 경고 ${(col.warnings ?? []).length}건 → ${w.collectorWarningsPenalty}`);
  }
  if (reasons.length === 0) reasons.push("수집·추출 신호 없음");

  return makeComponent("extractionQuality", clamp(v, w.floor, w.cap), reasons);
}

// ============================================================
// ScoringAgent
// ============================================================

export class ScoringAgent {
  /** 신규: 통합 우선순위 점수 계산 */
  computePriority(input: ScoringInput): ScoringResult {
    const components: ScoringComponent[] = [
      computeRuleSignal(input),
      computeLlmSignal(input),
      computeEvidenceCompleteness(input),
      computeCommercialSignal(input),
      computeRepetitionSignal(input),
      computeExtractionQuality(input)
    ];
    const sum = components.reduce((acc, c) => acc + c.score, 0);
    const priorityScore = clamp(sum, 0, PRIORITY_MAX_SCORE);
    const level = levelForScore(priorityScore);
    const recommendedNextActions = recommendedActionsFor(level.code);

    return {
      schemaVersion: SCORING_VERSION as "1.0.0",
      moduleId: input.moduleId,
      priorityScore,
      priorityLabel: level.label,
      priorityLevel: level.code,
      components,
      recommendedNextActions,
      notLegalConclusion: true,
      rewardGuaranteed: false,
      disclaimer: SCORING_DISCLAIMER,
      safetyWarnings: [...SCORING_SAFETY_WARNINGS]
    };
  }

  /**
   * 레거시 호환: RuleHit[]만 받아 0..100 점수 반환.
   * (체크리스트 11 이전 스모크/외부 호출 호환용)
   */
  score(ruleHits: RuleHit[]): number {
    if (!Array.isArray(ruleHits) || ruleHits.length === 0) return 0;
    const severityScore: Record<RuleHit["severity"], number> = {
      low: 10,
      medium: 25,
      high: 45,
      critical: 70
    };
    const raw = ruleHits.reduce((s, h) => s + (severityScore[h.severity] ?? 0), 0);
    const diversity = new Set(ruleHits.map((h) => h.category)).size * 5;
    return Math.min(100, raw + diversity);
  }
}

export const scoringAgent = new ScoringAgent();
