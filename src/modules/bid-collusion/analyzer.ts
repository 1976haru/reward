import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BID_COMPONENT_DEFS,
  BID_PRIORITY_MAX_SCORE,
  BID_SCORING_SAFETY_WARNINGS,
  BID_SIGNAL_TO_COMPONENT,
  BID_SIGNAL_WEIGHTS,
  bidLevelForScore,
  bidRecommendedActionsFor,
  type BidComponentKey
} from "./scoring_rules.js";
import { BID_COLLUSION_SAFETY_NOTICE } from "./config.js";

// ---------- 타입 ----------

export interface BidderEntry {
  companyName: string;
  bidAmount: number;
  bidRate: number;        // 예가 대비 비율 (낙찰률 의미)
  rank: number;
}

export interface BidRecord {
  noticeId: string;
  title: string;
  issuingAuthority: string;
  category: string;
  noticeDate: string;
  openDate: string;
  baseAmount: number;
  estimatedPrice: number;
  awardAmount: number;
  awardRate: number;
  winner: string;
  bidders: BidderEntry[];
}

export interface BidSampleData {
  schemaVersion: string;
  moduleId: string;
  isSyntheticSample: boolean;
  source: string;
  disclaimer: string;
  categories?: Array<{ id: string; label: string }>;
  bidders: string[];
  bids: BidRecord[];
}

export interface DetectedBidSignal {
  code: string;
  label: string;
  weight: number;
  description: string;
  evidence: string[];
}

export interface RiskBidderGroup {
  groupId: string;
  companies: string[];
  bidCount: number;            // 그룹이 함께 참여한 입찰 건수
  relatedBidIds: string[];
  winners: Record<string, number>; // company -> win count within group bids
  avgAwardRate: number;
  avgBidSpread: number;        // 평균 투찰률 spread (낙찰자 - 2위)
  signals: DetectedBidSignal[];
  components: Array<{
    key: BidComponentKey;
    label: string;
    maxPoints: number;
    score: number;
    reasons: string[];
  }>;
  priorityScore: number;
  priorityLabel: string;
  priorityLevel: "LOW" | "REVIEW_NEEDED" | "HIGH_PRIORITY" | "VERY_HIGH_PRIORITY";
  recommendedNextActions: string[];
  safetyWarnings: string[];
}

export interface BidAnalysisResult {
  schemaVersion: "1.0.0";
  moduleId: "bid_collusion";
  analyzedAt: string;
  totalBids: number;
  uniqueBidders: number;
  uniqueIssuers: number;
  categoryFilter?: string;
  riskGroupCount: number;
  suspiciousBidCount: number;
  riskGroups: RiskBidderGroup[];
  safetyNotice: string;
  syntheticOnly: boolean;
  autoReport: false;
  humanReviewRequired: true;
}

// ---------- sample loader ----------

const SAMPLE_PATH = path.join(
  process.cwd(),
  "src/modules/bid-collusion/sample-bids.json"
);

let sampleCache: BidSampleData | null = null;

export function loadBidSampleData(): BidSampleData {
  if (sampleCache) return sampleCache;
  const raw = readFileSync(SAMPLE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.bids)) {
    throw new Error("Invalid bid-collusion sample-bids.json — bids[] required");
  }
  sampleCache = parsed as BidSampleData;
  return sampleCache;
}

export function clearBidSampleCache(): void {
  sampleCache = null;
}

export function listBidRecords(category?: string): BidRecord[] {
  const data = loadBidSampleData();
  if (!category) return data.bids;
  return data.bids.filter((b) => b.category === category);
}

// ---------- 정규화 / 통계 헬퍼 ----------

export function normalizeCompanyName(name: string): string {
  if (!name) return "";
  return name
    .replace(/\s+/g, "")
    .replace(/[()㈜（）「」"'`]/g, "")
    .toLowerCase();
}

export function calculateBidSpread(bidders: BidderEntry[]): number {
  if (!Array.isArray(bidders) || bidders.length < 2) return 0;
  const sorted = [...bidders].sort((a, b) => a.rank - b.rank);
  const w = sorted[0]?.bidRate ?? 0;
  const second = sorted[1]?.bidRate ?? 0;
  return Math.max(0, Math.round((second - w) * 100) / 100);
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function groupKey(companies: string[]): string {
  return [...companies].map(normalizeCompanyName).sort().join("|");
}

// ---------- 패턴 탐지 ----------

// 동일 업체군이 2회 이상 함께 참여한 그룹을 찾는다 (정렬된 업체명 키 기준)
export function findRepeatedBidderGroups(bids: BidRecord[], minRepeats = 2): Array<{
  key: string;
  companies: string[];
  bidIds: string[];
}> {
  const map = new Map<string, { key: string; companies: string[]; bidIds: string[] }>();
  for (const bid of bids) {
    if (!Array.isArray(bid.bidders) || bid.bidders.length < 2) continue;
    const names = bid.bidders.map((b) => b.companyName);
    const k = groupKey(names);
    if (!k) continue;
    const cur = map.get(k);
    if (cur) {
      cur.bidIds.push(bid.noticeId);
    } else {
      map.set(k, { key: k, companies: names, bidIds: [bid.noticeId] });
    }
  }
  return [...map.values()].filter((g) => g.bidIds.length >= minRepeats);
}

// 그룹이 함께 참여한 입찰들에서 낙찰자가 2개 이상으로 순환하는지 확인
export function findRotatingWinners(bids: BidRecord[], groupBidIds: string[]): {
  rotates: boolean;
  winners: Record<string, number>;
  uniqueWinners: string[];
} {
  const winners: Record<string, number> = {};
  for (const id of groupBidIds) {
    const bid = bids.find((b) => b.noticeId === id);
    if (!bid) continue;
    winners[bid.winner] = (winners[bid.winner] ?? 0) + 1;
  }
  const uniqueWinners = Object.keys(winners);
  // 그룹 내에서 낙찰자가 2명 이상이고, 각각 최소 1회 이상 낙찰 → 순환 후보
  return {
    rotates: uniqueWinners.length >= 2 && groupBidIds.length >= uniqueWinners.length,
    winners,
    uniqueWinners
  };
}

// 낙찰률이 좁은 구간(예: ±2%p)에 비정상적으로 집중되어 있는지 확인
export function findAwardRateClustering(rates: number[], windowPct = 2): {
  clustered: boolean;
  rangePct: number;
  mean: number;
  min: number;
  max: number;
} {
  if (rates.length < 3) {
    return { clustered: false, rangePct: 0, mean: 0, min: 0, max: 0 };
  }
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min;
  return {
    clustered: range <= windowPct,
    rangePct: Math.round(range * 100) / 100,
    mean: Math.round(average(rates) * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100
  };
}

// 단일 낙찰자 지배 여부 (그룹/카테고리/발주기관 기준으로 winner의 점유율 >= threshold)
export function findSingleWinnerDominance(
  bids: BidRecord[],
  threshold = 0.6
): Array<{ winner: string; count: number; total: number; ratio: number }> {
  const counts = new Map<string, number>();
  for (const b of bids) counts.set(b.winner, (counts.get(b.winner) ?? 0) + 1);
  const total = bids.length;
  const out: Array<{ winner: string; count: number; total: number; ratio: number }> = [];
  for (const [w, c] of counts) {
    const r = c / Math.max(1, total);
    if (r >= threshold && c >= 2) out.push({ winner: w, count: c, total, ratio: Math.round(r * 100) / 100 });
  }
  return out;
}

// 좁은 투찰 간격 — 그룹 입찰들의 평균 spread 가 임계 이하이면 신호
function isNarrowSpread(spreads: number[], thresholdPct = 1.0): boolean {
  if (spreads.length === 0) return false;
  const avg = average(spreads);
  return avg <= thresholdPct;
}

// 들러리 후보 — 그룹 입찰들에서 낙찰자가 항상 가장 낮고, 다른 멤버들이 항상 그 위로 좁게 투찰
function isCoverBidPattern(bids: BidRecord[], bidIds: string[]): boolean {
  let n = 0;
  let coverCount = 0;
  for (const id of bidIds) {
    const bid = bids.find((b) => b.noticeId === id);
    if (!bid || !Array.isArray(bid.bidders) || bid.bidders.length < 2) continue;
    n += 1;
    const sorted = [...bid.bidders].sort((a, b) => a.rank - b.rank);
    const w = sorted[0];
    const others = sorted.slice(1);
    // 다른 모든 업체가 낙찰자보다 0.1 ~ 3.0%p 사이로 좁게 위에 있으면 들러리 후보로 본다
    const allCover = others.every((o) => o.bidRate - w.bidRate >= 0.1 && o.bidRate - w.bidRate <= 3.0);
    if (allCover) coverCount += 1;
  }
  // 최소 3회 중 2회 이상이면 패턴으로 간주
  return n >= 3 && coverCount / n >= 0.7;
}

// 투찰 순위 안정성 — 그룹 멤버들의 (멤버명 → rank) 분포가 입찰마다 매우 비슷한가
function isStableRankOrder(bids: BidRecord[], bidIds: string[]): boolean {
  if (bidIds.length < 2) return false;
  // 멤버별 평균 순위 표준편차가 낮으면 안정 (멤버 1명당 std < 0.6 정도)
  const memberRanks = new Map<string, number[]>();
  for (const id of bidIds) {
    const bid = bids.find((b) => b.noticeId === id);
    if (!bid) continue;
    for (const b of bid.bidders) {
      const key = normalizeCompanyName(b.companyName);
      const arr = memberRanks.get(key) ?? [];
      arr.push(b.rank);
      memberRanks.set(key, arr);
    }
  }
  let totalStd = 0;
  let cnt = 0;
  for (const ranks of memberRanks.values()) {
    if (ranks.length < 2) continue;
    const m = average(ranks);
    const variance = average(ranks.map((r) => (r - m) ** 2));
    totalStd += Math.sqrt(variance);
    cnt += 1;
  }
  if (cnt === 0) return false;
  return totalStd / cnt < 0.6;
}

// 낮은 경쟁 반복 — 그룹 입찰들의 평균 참여 업체 수가 ≤ 2
function isLowCompetitionRepeated(bids: BidRecord[], bidIds: string[]): boolean {
  const sizes: number[] = [];
  for (const id of bidIds) {
    const bid = bids.find((b) => b.noticeId === id);
    if (bid) sizes.push(bid.bidders.length);
  }
  return sizes.length >= 2 && average(sizes) <= 2;
}

// ---------- 그룹별 신호 + 점수 계산 ----------

export function calculateBidCollusionRiskSignals(
  bids: BidRecord[],
  group: { key: string; companies: string[]; bidIds: string[] }
): DetectedBidSignal[] {
  const out: DetectedBidSignal[] = [];

  // repeated_bidder_group — 정의상 그룹이면 항상 포함되지만 횟수에 따라 가중
  out.push({
    code: "repeated_bidder_group",
    label: "반복 업체군 참여",
    weight: BID_SIGNAL_WEIGHTS.repeated_bidder_group,
    description: "동일 업체군이 여러 입찰에서 반복적으로 함께 참여한 공개 정황 (확정 아님)",
    evidence: [`${group.companies.join(", ")} — ${group.bidIds.length}회 동반 참여`]
  });

  // rotating_winner
  const rot = findRotatingWinners(bids, group.bidIds);
  if (rot.rotates) {
    out.push({
      code: "rotating_winner",
      label: "순환 낙찰",
      weight: BID_SIGNAL_WEIGHTS.rotating_winner,
      description: "동일 업체군 내에서 낙찰자가 회차마다 순환한 공개 정황 (확정 아님)",
      evidence: [
        `낙찰자 분포: ${Object.entries(rot.winners).map(([w, c]) => `${w}=${c}회`).join(", ")}`
      ]
    });
  }

  // cover_bid_pattern
  if (isCoverBidPattern(bids, group.bidIds)) {
    out.push({
      code: "cover_bid_pattern",
      label: "들러리 후보 패턴",
      weight: BID_SIGNAL_WEIGHTS.cover_bid_pattern,
      description: "그룹 입찰에서 다른 업체들이 반복적으로 낙찰자보다 좁게 위에 투찰한 공개 정황 (들러리 확정 아님)",
      evidence: [`그룹 입찰 ${group.bidIds.length}회 중 다수에서 좁은 cover-bid 후보 정황`]
    });
  }

  // narrow_bid_spread (그룹 입찰의 평균 spread)
  const spreads = group.bidIds.map((id) => {
    const bid = bids.find((b) => b.noticeId === id);
    return bid ? calculateBidSpread(bid.bidders) : 0;
  });
  if (isNarrowSpread(spreads, 1.0)) {
    out.push({
      code: "narrow_bid_spread",
      label: "좁은 투찰 간격",
      weight: BID_SIGNAL_WEIGHTS.narrow_bid_spread,
      description: "그룹 입찰의 평균 1·2위 투찰률 간격이 1%p 이하로 좁음 (확정 아님)",
      evidence: [`평균 spread ${average(spreads).toFixed(2)}%p`]
    });
  }

  // stable_bid_rank_order
  if (isStableRankOrder(bids, group.bidIds)) {
    out.push({
      code: "stable_bid_rank_order",
      label: "투찰 순위 안정성",
      weight: BID_SIGNAL_WEIGHTS.stable_bid_rank_order,
      description: "그룹 멤버들의 투찰 순위 분포가 회차별로 매우 유사 (확정 아님)",
      evidence: [`그룹 입찰 ${group.bidIds.length}회의 멤버 순위 std 평균 < 0.6`]
    });
  }

  // single_winner_dominance (그룹 입찰 범위 내)
  const groupBids = group.bidIds.map((id) => bids.find((b) => b.noticeId === id)!).filter(Boolean);
  const dom = findSingleWinnerDominance(groupBids, 0.6);
  if (dom.length > 0) {
    out.push({
      code: "single_winner_dominance",
      label: "단일 낙찰자 지배",
      weight: BID_SIGNAL_WEIGHTS.single_winner_dominance,
      description: "그룹 입찰 범위에서 특정 업체가 과도하게 반복 낙찰 (확정 아님)",
      evidence: dom.map((d) => `${d.winner} ${d.count}/${d.total}회 낙찰 (${Math.round(d.ratio * 100)}%)`)
    });
  }

  // abnormal_award_rate_clustering
  const rates = group.bidIds
    .map((id) => bids.find((b) => b.noticeId === id)?.awardRate)
    .filter((x): x is number => typeof x === "number");
  const cluster = findAwardRateClustering(rates, 2);
  if (cluster.clustered) {
    out.push({
      code: "abnormal_award_rate_clustering",
      label: "낙찰률 군집",
      weight: BID_SIGNAL_WEIGHTS.abnormal_award_rate_clustering,
      description: `그룹 입찰 낙찰률이 ${cluster.min}% ~ ${cluster.max}% (rangePct ${cluster.rangePct}) 범위에 집중 (확정 아님)`,
      evidence: [`낙찰률 범위 ${cluster.min}% ~ ${cluster.max}%, 평균 ${cluster.mean}%`]
    });
  }

  // low_competition_repeated
  if (isLowCompetitionRepeated(bids, group.bidIds)) {
    out.push({
      code: "low_competition_repeated",
      label: "낮은 경쟁 반복",
      weight: BID_SIGNAL_WEIGHTS.low_competition_repeated,
      description: "그룹 입찰의 평균 참여 업체 수가 매우 적음 (확정 아님)",
      evidence: [`그룹 입찰 평균 참여 ${(average(group.bidIds.map((id) => bids.find((b) => b.noticeId === id)?.bidders.length ?? 0))).toFixed(1)}개`]
    });
  }

  // bid_participation_dropout — 그룹에 매번 참여하지만 1위가 한번도 아닌 멤버
  const memberWins = new Map<string, number>();
  const memberParticip = new Map<string, number>();
  for (const id of group.bidIds) {
    const bid = bids.find((b) => b.noticeId === id);
    if (!bid) continue;
    for (const b of bid.bidders) {
      const k = b.companyName;
      memberParticip.set(k, (memberParticip.get(k) ?? 0) + 1);
      if (b.rank === 1) memberWins.set(k, (memberWins.get(k) ?? 0) + 1);
    }
  }
  const dropouts: string[] = [];
  for (const [k, p] of memberParticip) {
    if (p >= 3 && (memberWins.get(k) ?? 0) === 0) {
      dropouts.push(`${k} ${p}회 참여 0회 낙찰`);
    }
  }
  if (dropouts.length > 0) {
    out.push({
      code: "bid_participation_dropout",
      label: "형식 참여 패턴",
      weight: BID_SIGNAL_WEIGHTS.bid_participation_dropout,
      description: "그룹 입찰에 반복 참여하지만 낙찰 사례가 없는 업체 정황 (확정 아님)",
      evidence: dropouts
    });
  }

  return out;
}

function buildComponentsFromSignals(
  signals: DetectedBidSignal[],
  extractionQualityHint = 2
): RiskBidderGroup["components"] {
  const buckets: Record<BidComponentKey, { score: number; reasons: string[] }> = {
    rotationSignal: { score: 0, reasons: [] },
    groupRepetitionSignal: { score: 0, reasons: [] },
    coverBidSignal: { score: 0, reasons: [] },
    spreadSignal: { score: 0, reasons: [] },
    dominanceSignal: { score: 0, reasons: [] },
    awardRateClusterSignal: { score: 0, reasons: [] },
    competitionSignal: { score: 0, reasons: [] },
    extractionQuality: { score: extractionQualityHint, reasons: ["sample-data 기반 추출 — 기본 점수"] }
  };

  for (const s of signals) {
    const compKey = BID_SIGNAL_TO_COMPONENT[s.code];
    if (!compKey) continue;
    buckets[compKey].score += s.weight;
    buckets[compKey].reasons.push(`${s.label} (+${s.weight})`);
  }

  const out: RiskBidderGroup["components"] = [];
  for (const key of Object.keys(buckets) as BidComponentKey[]) {
    const def = BID_COMPONENT_DEFS[key];
    const bucket = buckets[key];
    out.push({
      key,
      label: def.label,
      maxPoints: def.maxPoints,
      score: Math.max(0, Math.min(def.maxPoints, Math.round(bucket.score))),
      reasons: bucket.reasons.length ? bucket.reasons : ["해당 신호 없음"]
    });
  }
  return out;
}

export interface AnalyzeBidsOptions {
  useSampleData?: boolean;
  category?: string;
  minGroupRepeats?: number;
}

export function analyzeBidDataset(opts: AnalyzeBidsOptions = {}): BidAnalysisResult {
  const useSample = opts.useSampleData !== false;
  if (!useSample) {
    throw new Error(
      "bid_collusion module supports only sample-data analysis in the prototype stage."
    );
  }
  const data = loadBidSampleData();
  const allBids = data.bids;
  const filteredBids = opts.category ? allBids.filter((b) => b.category === opts.category) : allBids;

  const uniqueBidders = new Set<string>();
  const uniqueIssuers = new Set<string>();
  for (const b of filteredBids) {
    uniqueIssuers.add(b.issuingAuthority);
    for (const x of b.bidders) uniqueBidders.add(x.companyName);
  }

  const groups = findRepeatedBidderGroups(filteredBids, opts.minGroupRepeats ?? 2);

  const riskGroups: RiskBidderGroup[] = groups.map((g, idx) => {
    const signals = calculateBidCollusionRiskSignals(filteredBids, g);
    const components = buildComponentsFromSignals(signals, 2);
    const priorityScore = Math.max(0, Math.min(
      BID_PRIORITY_MAX_SCORE,
      components.reduce((s, c) => s + c.score, 0)
    ));
    const level = bidLevelForScore(priorityScore);

    const groupBidObjects = g.bidIds.map((id) => filteredBids.find((b) => b.noticeId === id)!).filter(Boolean);
    const winnersMap: Record<string, number> = {};
    for (const b of groupBidObjects) winnersMap[b.winner] = (winnersMap[b.winner] ?? 0) + 1;
    const avgAwardRate = Math.round(average(groupBidObjects.map((b) => b.awardRate)) * 100) / 100;
    const spreads = groupBidObjects.map((b) => calculateBidSpread(b.bidders));
    const avgBidSpread = Math.round(average(spreads) * 100) / 100;

    return {
      groupId: `group_${idx + 1}_${g.key.slice(0, 24)}`,
      companies: g.companies,
      bidCount: g.bidIds.length,
      relatedBidIds: g.bidIds,
      winners: winnersMap,
      avgAwardRate,
      avgBidSpread,
      signals,
      components,
      priorityScore,
      priorityLabel: level.label,
      priorityLevel: level.code,
      recommendedNextActions: bidRecommendedActionsFor(level.code),
      safetyWarnings: [...BID_SCORING_SAFETY_WARNINGS]
    };
  });

  // 점수 내림차순 정렬
  riskGroups.sort((a, b) => b.priorityScore - a.priorityScore);

  // 의심 입찰 수 — REVIEW_NEEDED 이상 그룹에 속한 고유 bid id 수
  const suspiciousIds = new Set<string>();
  for (const g of riskGroups) {
    if (g.priorityLevel === "LOW") continue;
    for (const id of g.relatedBidIds) suspiciousIds.add(id);
  }

  return {
    schemaVersion: "1.0.0",
    moduleId: "bid_collusion",
    analyzedAt: new Date().toISOString(),
    totalBids: filteredBids.length,
    uniqueBidders: uniqueBidders.size,
    uniqueIssuers: uniqueIssuers.size,
    categoryFilter: opts.category,
    riskGroupCount: riskGroups.length,
    suspiciousBidCount: suspiciousIds.size,
    riskGroups,
    safetyNotice: BID_COLLUSION_SAFETY_NOTICE,
    syntheticOnly: data.isSyntheticSample === true,
    autoReport: false,
    humanReviewRequired: true
  };
}

export function getRiskGroupById(
  groupId: string,
  result?: BidAnalysisResult
): RiskBidderGroup | undefined {
  const r = result ?? analyzeBidDataset();
  return r.riskGroups.find((g) => g.groupId === groupId);
}

// ---------- 리포트 마크다운 ----------

export function buildBidCollusionReportMarkdown(
  group: RiskBidderGroup,
  result?: BidAnalysisResult
): string {
  const r = result ?? analyzeBidDataset();
  const groupBids = group.relatedBidIds
    .map((id) => r.riskGroups.length, () => undefined); // placeholder no-op
  void groupBids;
  const allBids = loadBidSampleData().bids;
  const bids = group.relatedBidIds.map((id) => allBids.find((b) => b.noticeId === id)).filter((b): b is BidRecord => Boolean(b));

  const lines: string[] = [];
  lines.push(`# 입찰담합 의심 패턴 검토 요청서 초안`);
  lines.push("");
  lines.push(`> 본 문서는 **자동 신고서가 아닙니다.** 사람이 검토·수정 후 공식 신고 창구에 직접 제출하는 보조 자료입니다.`);
  lines.push(`> 본 문서는 **담합 여부를 확정하지 않습니다.** 공개 입찰 데이터 기반 검토 후보일 뿐이며, 조사·과징금·신고포상금 여부는 공정거래위원회 공식 기준과 처리 결과에 따라 달라집니다.`);
  lines.push(`> 포상금 지급을 보장하지 않습니다.`);
  lines.push("");
  lines.push(`## 1. 분석 대상 요약`);
  lines.push("");
  lines.push(`- 분석 유형: 입찰담합 의심 패턴 (검토 후보)`);
  lines.push(`- 데이터 출처: sample-bids.json (synthetic)`);
  lines.push(`- 발주기관: ${[...new Set(bids.map((b) => b.issuingAuthority))].join(", ") || "(미기록)"}`);
  lines.push(`- 품목/업종: ${[...new Set(bids.map((b) => b.category))].join(", ") || "(미기록)"}`);
  lines.push(`- 입찰 건수: ${group.bidCount}`);
  lines.push(`- 참여 업체: ${group.companies.join(", ")}`);
  lines.push("");
  lines.push(`## 2. 위험 업체군 요약`);
  lines.push("");
  lines.push(`- 업체군: ${group.companies.join(", ")}`);
  lines.push(`- 반복 참여 횟수: ${group.bidCount}`);
  lines.push(`- 순환 낙찰 정황: ${Object.entries(group.winners).map(([w, c]) => `${w}=${c}회`).join(", ")}`);
  lines.push(`- 평균 낙찰률: ${group.avgAwardRate}%`);
  lines.push(`- 평균 투찰 간격(1·2위): ${group.avgBidSpread}%p`);
  lines.push(`- 우선순위 점수: ${group.priorityScore}/100 (${group.priorityLabel})`);
  lines.push("");
  lines.push(`## 3. 의심 패턴`);
  lines.push("");
  if (group.signals.length === 0) {
    lines.push(`- 탐지된 의심 신호 없음`);
  } else {
    lines.push(`| No | 신호 | 설명 | 근거 |`);
    lines.push(`|---|---|---|---|`);
    group.signals.forEach((s, i) => {
      const ev = s.evidence.join("<br/>") || "(근거 메모 없음)";
      lines.push(`| ${i + 1} | ${s.label} (+${s.weight}) | ${s.description} | ${ev} |`);
    });
  }
  lines.push("");
  lines.push(`## 4. 관련 입찰 목록`);
  lines.push("");
  lines.push(`| No | 공고번호 | 공고명 | 발주기관 | 낙찰자 | 낙찰률 | 참여업체 |`);
  lines.push(`|----|----------|--------|----------|--------|--------|----------|`);
  bids.forEach((b, i) => {
    const bidders = b.bidders.map((x) => x.companyName).join(", ");
    lines.push(`| ${i + 1} | ${b.noticeId} | ${b.title} | ${b.issuingAuthority} | ${b.winner} | ${b.awardRate}% | ${bidders} |`);
  });
  lines.push("");
  lines.push(`## 5. 추가 확인 필요자료`);
  lines.push("");
  lines.push(`- 원본 입찰공고 / 개찰결과 / 업체별 투찰금액 / 개찰순위 / 계약정보`);
  lines.push(`- 반복 참여 업체군 여부 (다른 회차/품목 포함)`);
  lines.push(`- 발주기관/품목별 정상 분포와 비교`);
  lines.push(`- 공정거래위원회 신고 기준 / 신고포상금 안내 확인`);
  lines.push("");
  lines.push(`## 6. 신고처 후보`);
  lines.push("");
  lines.push(`- 공정거래위원회 (https://www.ftc.go.kr/www/contents.do?key=368)`);
  lines.push(`- 공정거래위원회 신고포상금 안내 (https://www.ftc.go.kr/www/contents.do?key=402)`);
  lines.push(`- 발주기관 감사부서`);
  lines.push(`- 국민신문고 / 국민권익위원회`);
  lines.push("");
  lines.push(`## 7. 중립 검토 요청 문구`);
  lines.push("");
  lines.push(`공개 입찰 데이터에서 동일 업체군 반복 참여, 순환 낙찰, 좁은 투찰 간격 등 검토가 필요한 패턴이 확인되어 관계기관의 확인을 요청드립니다.`);
  lines.push("");
  lines.push(`본 문서는 담합을 단정하는 것이 아니라, 공개자료 기반의 패턴 분석 결과를 바탕으로 한 검토 요청 초안입니다.`);
  lines.push("");
  lines.push(`### 다음 행동 추천`);
  lines.push("");
  for (const a of group.recommendedNextActions) lines.push(`- ${a}`);
  lines.push("");
  lines.push(`---`);
  lines.push(`자동 신고는 수행하지 않습니다. ${BID_COLLUSION_SAFETY_NOTICE}`);
  return lines.join("\n");
}

export const BID_REPORT_SAFETY_NOTICE = BID_COLLUSION_SAFETY_NOTICE;
