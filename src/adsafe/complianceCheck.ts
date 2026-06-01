// AdSafe (애드세이프) — 광고 사전점검(Compliance Check) 핵심 서비스.
//
// 용도 전환 원칙: 분석 엔진(RuleAgent 등)은 "남의 광고를 신고하든 내 광고를 점검하든"
// 동일하게 위반 표현을 잡는다. 본 모듈은 기존 RuleAgent.detectDetailed() 결과를
// "신고 후보" 가 아니라 "게시 전 광고 위반 위험 리포트" 관점으로 재구성한다.
//
// 안전 원칙(절대 유지):
//  - AI/룰은 적법성을 단정하지 않는다. "합법/위반 아님 보장" 류 표현은 sanitize 로 차단한다.
//  - 모든 리포트에 면책 푸터를 강제로 포함한다.
//  - 최종 판단은 사람이 한다(사전점검은 정식 자율심의·법적 자문을 대체하지 않는다).

import { ruleAgent, type RuleMatch } from "../agents/RuleAgent.js";

// ============================================================
// 타입
// ============================================================

/** 종합 위험도(통과 가능성) 3단계. */
export type ComplianceRating = "safe" | "caution" | "risk";

export interface ComplianceFinding {
  /** 인용된 원문 구절(증거 추적성) */
  quotedText: string;
  /** 매칭된 위반 의심 표현(키워드/패턴) */
  matchedExpression: string;
  /** 위반 카테고리 코드(keywords.json category) */
  category: string;
  /** 사용자 노출용 한글 카테고리 라벨 (예: "질병 치료·완치 표현") */
  categoryLabel: string;
  /** 위험도 (HIGH/MEDIUM/LOW 또는 combo) */
  riskLevel: string;
  /** 왜 문제인지 — 기존 RuleAgent/keywords.json 근거 재사용 */
  reason: string;
  /** 수정 제안 — 신중한 톤(단정 금지) */
  suggestion: string;
  /** 원문 섹션 */
  sourceSection: string;
}

export interface ComplianceCheckReport {
  productType: string; // moduleId
  rating: ComplianceRating;
  ratingLabel: string; // 안전 / 주의 / 위험
  /** 통과 가능성 안내(신중한 톤) */
  passLikelihood: string;
  /** 0~100 점수 (RuleAgent riskScore 재사용) */
  score: number;
  summary: string;
  findings: ComplianceFinding[];
  counts: { HIGH: number; MEDIUM: number; LOW: number; combo: number; total: number };
  /** C-1: 정식 심의 비교 안내 */
  formalReviewNotice: string;
  /** 면책/신중성 가드 — 모든 리포트 고정 푸터 */
  disclaimerFooter: string;
  /** 안전 단언: AI 는 적법성을 확정하지 않는다 */
  notLegalConclusion: true;
  legalityGuaranteed: false;
  humanReviewRequired: true;
  /** sanitize 과정에서 단정 표현을 중립화했을 때 남는 경고 */
  sanitizeWarnings: string[];
  generatedAtNote: string;
}

export interface RunComplianceCheckInput {
  text?: string;
  title?: string;
  url?: string;
  /** 점검 카테고리(제품 유형). 미지정 시 false_ad(건기식). */
  moduleId?: string;
}

// ============================================================
// 상수 — 카테고리 라벨 / 수정 제안 가이드 / 면책 푸터
// ============================================================

/** keywords.json category → 사용자 노출 한글 라벨 */
const CATEGORY_LABELS: Record<string, string> = {
  disease_cure_claim: "질병 치료·완치 표현",
  disease_prevention_claim: "질병 예방 표현",
  medicine_substitution: "의약품 오인·대체 표현",
  exaggerated_effect: "과장된 효능 표현",
  detox_claim: "디톡스·체내 배출 표현",
  weight_loss_claim: "체중 감량 단정 표현",
  vague_marketing: "모호·과장 마케팅 표현",
  disease_action_combo: "질병명+치료 효능 결합 표현",
  // 확장 모듈에서 등장 가능한 카테고리(있으면 사용, 없으면 기본 라벨)
  counterfeit_claim: "정품 오인·위조 의심 표현",
  origin_mismatch: "원산지 표시 불일치·누락 의심 표현"
};

/** 카테고리별 "수정 제안" — 단정적 법적 결론을 피하고 검토 방향만 제시한다. */
const CATEGORY_SUGGESTIONS: Record<string, string> = {
  disease_cure_claim:
    "특정 질병의 치료·완치를 암시하는 표현은 의약품 오인 기준에 저촉될 수 있어, 효능을 단정하지 않는 일반적 표현(예: 건강 관리에 도움을 줄 수 있음)으로 완화하는 방향을 검토 권장합니다.",
  disease_prevention_claim:
    "질병 예방을 단정하는 표현은 표시·광고 기준에 저촉될 수 있어, 예방 단정 대신 인정받은 기능성 범위 내 표현으로 조정하는 방향을 검토 권장합니다.",
  medicine_substitution:
    "의약품을 대체한다는 취지의 표현은 의약품 오인 기준에 저촉될 수 있어, 의약품과의 비교·대체 뉘앙스를 제거하는 방향을 검토 권장합니다.",
  exaggerated_effect:
    "객관적 근거를 넘는 과장 효능 표현은 과대광고 기준에 저촉될 수 있어, 입증 가능한 범위로 표현 수위를 낮추는 방향을 검토 권장합니다.",
  detox_claim:
    "체내 독소 배출·디톡스 단정 표현은 검증되지 않은 효능으로 볼 여지가 있어, 단정 표현을 완화하는 방향을 검토 권장합니다.",
  weight_loss_claim:
    "체중 감량을 보장·단정하는 표현은 과대광고로 볼 여지가 있어, 보장성 표현을 제거하고 개인차 안내를 함께 검토 권장합니다.",
  vague_marketing:
    "근거가 모호한 강조 표현은 소비자 오인을 부를 수 있어, 구체적 근거를 함께 제시하거나 표현 수위를 조정하는 방향을 검토 권장합니다.",
  disease_action_combo:
    "질병명과 치료 효능을 함께 쓰는 표현은 의약품 오인 위험이 높아 보여, 질병명과 효능 단정의 결합을 분리·완화하는 방향을 검토 권장합니다.",
  counterfeit_claim:
    "정품임을 단정하거나 위조 의심을 부르는 표현은 권리자 확인이 필요할 수 있어, 출처·정품 근거를 명확히 하는 방향을 검토 권장합니다.",
  origin_mismatch:
    "원산지 표시가 불일치·누락된 것으로 보일 수 있어, 표시 기준에 맞춰 원산지 정보를 명확히 하는 방향을 검토 권장합니다."
};

const DEFAULT_SUGGESTION =
  "해당 표현이 표시·광고 기준에 저촉될 수 있어, 표현 수위를 낮추거나 근거를 함께 제시하는 방향을 검토 권장합니다.";

/** C-1: 정식 자율심의 비교 안내. */
export const FORMAL_REVIEW_NOTICE =
  "정식 자율심의(한국식품산업협회 등)는 통상 건당 약 16.5만원의 비용이 들 수 있습니다. 본 사전점검은 그 전에 통과 가능성을 미리 살펴보는 참고용 도구이며, 정식 자율심의나 법적 자문을 대체하지 않습니다.";

/** F-5: 모든 리포트 고정 면책 푸터. */
export const DISCLAIMER_FOOTER =
  "본 결과는 참고용이며, 최종 광고 적법성은 정식 자율심의·법률 자문으로 확인하십시오. 애드세이프(AdSafe)는 적법성이나 위반 여부를 확정하지 않으며, 최종 판단은 사람이 합니다.";

// ============================================================
// No-assertion sanitize — "합법/위반 아님 보장" 류 단정 차단·중립화
// ============================================================

// AnalyzerAgent.sanitizeText 의 접근을 광고 점검 맥락으로 확장한다.
// 적법성을 단정하거나 통과를 보장하는 표현을 신중 표현으로 치환한다.
const LEGALITY_ASSERTION_REGEX: RegExp[] = [
  /합법\s*입니다/g,
  /합법\s*임/g,
  /적법\s*합니다/g,
  /적법\s*함/g,
  /위반\s*(이)?\s*아닙니다/g,
  /위반\s*(이)?\s*아님/g,
  /문제\s*없습니다/g,
  /문제\s*없음/g,
  /통과\s*보장/g,
  /승인\s*보장/g,
  /합격\s*보장/g,
  /100\s*%\s*안전/g
];

const NEUTRAL_REPLACEMENT = "(적법성 단정 대신 사람 검토 필요)";

/**
 * 적법성 단정·통과 보장 표현을 중립 표현으로 치환한다.
 * @returns 치환된 문자열과 경고 누적
 */
export function sanitizeNoAssertion(input: string, warnings: string[]): string {
  let out = String(input ?? "");
  for (const re of LEGALITY_ASSERTION_REGEX) {
    if (re.test(out)) {
      warnings.push("적법성 단정/통과 보장 표현을 감지해 중립 표현으로 치환했습니다.");
      out = out.replace(re, NEUTRAL_REPLACEMENT);
    }
  }
  return out;
}

// ============================================================
// 핵심: 단건 광고 점검
// ============================================================

function ratingFromScore(score: number, hasHigh: boolean): ComplianceRating {
  // RuleAgent riskLevel 임계값과 정렬(낮음<30 / 검토필요 30~59 / 높음 60+).
  // HIGH 매칭이 하나라도 있으면 최소 "주의" 로 올린다(안전으로 단정하지 않음).
  if (score >= 60) return "risk";
  if (score >= 30 || hasHigh) return "caution";
  return "safe";
}

function ratingLabel(rating: ComplianceRating): string {
  if (rating === "risk") return "위험";
  if (rating === "caution") return "주의";
  return "안전";
}

function passLikelihood(rating: ComplianceRating): string {
  if (rating === "risk")
    return "현재 표현으로는 정식 심의 통과가 어려울 수 있습니다. 위반 의심 표현을 수정한 뒤 재점검을 검토 권장합니다.";
  if (rating === "caution")
    return "일부 표현이 기준에 저촉될 여지가 있어 통과를 장담하기 어렵습니다. 해당 표현 수정 후 재점검을 검토 권장합니다.";
  return "명백한 위반 의심 표현은 발견되지 않았습니다. 다만 본 점검은 참고용이며 통과를 보장하지 않습니다. 최종 판단은 사람이 합니다.";
}

function categoryLabelFor(category: string): string {
  return CATEGORY_LABELS[category] ?? "표시·광고 기준 검토 표현";
}

function suggestionFor(category: string): string {
  return CATEGORY_SUGGESTIONS[category] ?? DEFAULT_SUGGESTION;
}

/** 동일 (룰 표현 + 문장) 중복 finding 제거 + 위험도순 정렬. */
function buildFindings(matches: RuleMatch[], warnings: string[]): ComplianceFinding[] {
  const seen = new Set<string>();
  const findings: ComplianceFinding[] = [];
  for (const m of matches) {
    const key = `${m.ruleId}|${m.sentence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      quotedText: sanitizeNoAssertion(m.excerpt || m.sentence, warnings),
      matchedExpression: m.keyword,
      category: m.category,
      categoryLabel: categoryLabelFor(m.category),
      riskLevel: m.matchType === "keyword" ? m.riskLevel : "combo",
      reason: sanitizeNoAssertion(m.reason, warnings),
      suggestion: sanitizeNoAssertion(suggestionFor(m.category), warnings),
      sourceSection: m.sourceSection
    });
  }
  const rank: Record<string, number> = { HIGH: 4, combo: 3, MEDIUM: 2, LOW: 1 };
  return findings.sort((a, b) => (rank[b.riskLevel] ?? 0) - (rank[a.riskLevel] ?? 0));
}

function buildSummary(rating: ComplianceRating, count: number, productType: string): string {
  const head =
    rating === "risk"
      ? "위반 의심 표현이 다수 발견되었습니다."
      : rating === "caution"
        ? "검토가 필요한 표현이 발견되었습니다."
        : "명백한 위반 의심 표현은 발견되지 않았습니다.";
  return `[${productType}] 광고 사전점검 결과: ${head} (위반 의심 표현 ${count}건) 본 결과는 참고용이며 적법성을 확정하지 않습니다.`;
}

/**
 * 광고 문구 1건을 점검해 Compliance Check Report 를 만든다.
 * 입력은 text/title/url 중 text(또는 title) 가 핵심이다.
 */
export function runComplianceCheck(input: RunComplianceCheckInput): ComplianceCheckReport {
  const moduleId = input.moduleId && input.moduleId.trim() ? input.moduleId.trim() : "false_ad";
  const warnings: string[] = [];

  // 광고 문구를 claim 후보로 우선 입력 — RuleAgent 가 광고 문구를 먼저 분석한다.
  const claimCandidates: string[] = [];
  if (input.title && input.title.trim()) claimCandidates.push(input.title.trim());
  const detection = ruleAgent.detectDetailed(
    {
      claimCandidates: claimCandidates.length ? claimCandidates : undefined,
      mainText: input.text && input.text.trim() ? input.text.trim() : undefined
    },
    moduleId
  );

  const hasHigh = detection.counts.HIGH > 0 || detection.counts.combo > 0;
  const rating = ratingFromScore(detection.riskScore, hasHigh);
  const findings = buildFindings(detection.matches, warnings);

  return {
    productType: moduleId,
    rating,
    ratingLabel: ratingLabel(rating),
    passLikelihood: passLikelihood(rating),
    score: detection.riskScore,
    summary: buildSummary(rating, findings.length, moduleId),
    findings,
    counts: detection.counts,
    formalReviewNotice: FORMAL_REVIEW_NOTICE,
    disclaimerFooter: DISCLAIMER_FOOTER,
    notLegalConclusion: true,
    legalityGuaranteed: false,
    humanReviewRequired: true,
    sanitizeWarnings: [...new Set(warnings)],
    generatedAtNote: "점검 결과는 참고용입니다. 최종 판단은 사람이 합니다."
  };
}

// ============================================================
// C-4: 배치 점검 (여러 광고 문구를 한 번에) — 비용 가드 적용
// ============================================================

export interface BatchCheckItem {
  id?: string;
  text?: string;
  title?: string;
  url?: string;
}

export interface BatchCheckEntry {
  id: string;
  report: ComplianceCheckReport;
}

export interface BatchCheckResult {
  moduleId: string;
  requested: number;
  processed: number;
  skipped: number;
  /** 비용 가드 상한 (config.pipeline.maxAnalyses 재사용) */
  maxChecks: number;
  guardApplied: boolean;
  guardNote: string;
  results: BatchCheckEntry[];
  disclaimerFooter: string;
}

/**
 * 여러 광고 문구를 한 번에 점검한다.
 * 비용 가드: maxChecks(기본 config.pipeline.maxAnalyses) 초과분은 처리하지 않는다.
 */
export function runBatchComplianceCheck(
  items: BatchCheckItem[],
  options: { moduleId?: string; maxChecks: number }
): BatchCheckResult {
  const moduleId = options.moduleId && options.moduleId.trim() ? options.moduleId.trim() : "false_ad";
  const maxChecks = Math.max(1, options.maxChecks);
  const requested = items.length;
  const toProcess = items.slice(0, maxChecks);
  const guardApplied = requested > maxChecks;

  const results: BatchCheckEntry[] = toProcess.map((item, idx) => ({
    id: item.id && String(item.id).trim() ? String(item.id) : `item-${idx + 1}`,
    report: runComplianceCheck({ text: item.text, title: item.title, url: item.url, moduleId })
  }));

  return {
    moduleId,
    requested,
    processed: results.length,
    skipped: Math.max(0, requested - results.length),
    maxChecks,
    guardApplied,
    guardNote: guardApplied
      ? `비용 가드로 인해 ${requested}건 중 상한 ${maxChecks}건만 점검했습니다. 나머지 ${requested - maxChecks}건은 처리하지 않았습니다.`
      : `요청 ${requested}건을 모두 점검했습니다(상한 ${maxChecks}건 이내).`,
    results,
    disclaimerFooter: DISCLAIMER_FOOTER
  };
}

// ============================================================
// C-2: 변경 이력 / 재점검 비교
// ============================================================

export interface ComplianceComparison {
  previousScore: number;
  currentScore: number;
  scoreDelta: number;
  previousFindings: number;
  currentFindings: number;
  /** 위험 표현이 몇 개 줄었는지(양수면 감소) */
  findingsReduced: number;
  previousRating: ComplianceRating;
  currentRating: ComplianceRating;
  improved: boolean;
  message: string;
  disclaimerFooter: string;
}

/** 이전 리포트 대비 재점검 리포트의 위험 표현 감소량을 비교한다. */
export function compareReports(
  previous: ComplianceCheckReport,
  current: ComplianceCheckReport
): ComplianceComparison {
  const findingsReduced = previous.findings.length - current.findings.length;
  const scoreDelta = current.score - previous.score;
  const improved = scoreDelta < 0 || findingsReduced > 0;
  const message = improved
    ? `이전 대비 위반 의심 표현이 ${findingsReduced > 0 ? findingsReduced + "개 줄었" : "변동 없으나 점수가 낮아졌"}습니다. 다만 통과를 보장하지는 않습니다.`
    : findingsReduced < 0 || scoreDelta > 0
      ? `이전 대비 위반 의심 표현이 늘었거나 점수가 높아졌습니다. 표현을 다시 검토 권장합니다.`
      : `이전 대비 변동이 없습니다.`;
  return {
    previousScore: previous.score,
    currentScore: current.score,
    scoreDelta,
    previousFindings: previous.findings.length,
    currentFindings: current.findings.length,
    findingsReduced,
    previousRating: previous.rating,
    currentRating: current.rating,
    improved,
    message,
    disclaimerFooter: DISCLAIMER_FOOTER
  };
}
