import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SUBSIDY_COMPONENT_DEFS,
  SUBSIDY_PRIORITY_MAX_SCORE,
  SUBSIDY_SCORING_DISCLAIMER,
  SUBSIDY_SCORING_SAFETY_WARNINGS,
  SUBSIDY_SCORING_VERSION,
  SUBSIDY_SIGNAL_TO_COMPONENT,
  SUBSIDY_SIGNAL_WEIGHTS,
  subsidyLevelForScore,
  subsidyRecommendedActionsFor,
  type SubsidyComponentKey
} from "./scoring_rules.js";
import { SUBSIDY_FRAUD_SAFETY_NOTICE } from "./config.js";

// ---------- 타입 ----------

export interface ExecutionItem {
  category: string;
  amount: number;
}

export interface VendorInfo {
  name: string;
  address: string;
  representative: string;
}

export interface SubsidyRecord {
  id: string;
  fiscalYear: number;
  managingAgency: string;
  projectTitle: string;
  recipientName: string;
  recipientId?: string;
  recipientAddress: string;
  representative: string;
  grantAmount: number;
  executionItems?: ExecutionItem[];
  settlementSubmitted?: boolean;
  resultEvidenceUrls?: string[];
  vendorInfo?: VendorInfo | null;
  publicListingUrl?: string;
  capturedAt?: string;
  syntheticNotes?: string;
}

export interface SubsidySampleData {
  schemaVersion: string;
  moduleId: string;
  pilotRegion: string;
  pilotRegionId: string;
  synthetic: boolean;
  source: string;
  disclaimer: string;
  publicDataPortalNotes?: string[];
  records: SubsidyRecord[];
}

export interface DetectedSignal {
  code: string;
  label: string;
  weight: number;
  description: string;
  evidence: string[];
}

export interface SubsidyAnalyzedCandidate {
  recordId: string;
  fiscalYear: number;
  managingAgency: string;
  projectTitle: string;
  recipientName: string;
  recipientAddress: string;
  representative: string;
  grantAmount: number;
  publicListingUrl?: string;
  capturedAt?: string;
  signals: DetectedSignal[];
  components: Array<{
    key: SubsidyComponentKey;
    label: string;
    maxPoints: number;
    score: number;
    reasons: string[];
  }>;
  priorityScore: number;
  priorityLabel: string;
  priorityLevel: "LOW" | "REVIEW_NEEDED" | "HIGH_PRIORITY" | "VERY_HIGH_PRIORITY";
  recommendedNextActions: string[];
  evidenceRequirements: string[];
  safetyWarnings: string[];
}

export interface SubsidyAnalysisResult {
  schemaVersion: "1.0.0";
  moduleId: "subsidy_fraud";
  pilotRegion: string;
  pilotRegionId: string;
  analyzedAt: string;
  recordCount: number;
  candidates: SubsidyAnalyzedCandidate[];
  safetyNotice: string;
  syntheticOnly: boolean;
  autoReport: false;
  humanReviewRequired: true;
}

// ---------- sample-data 로더 ----------

const SAMPLE_DATA_PATH = path.join(
  process.cwd(),
  "src/modules/subsidy-fraud/sample-data.json"
);

let sampleDataCache: SubsidySampleData | null = null;

export function loadSubsidySampleDataSync(): SubsidySampleData {
  if (sampleDataCache) return sampleDataCache;
  const raw = readFileSync(SAMPLE_DATA_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error("Invalid subsidy sample-data.json — records[] required");
  }
  sampleDataCache = parsed as SubsidySampleData;
  return sampleDataCache;
}

export function clearSubsidySampleCache(): void {
  sampleDataCache = null;
}

// ---------- 유사도 / 정규화 ----------

function normalizeAddress(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

function normalizeRecipientKey(name: string, recipientId?: string): string {
  if (recipientId) return recipientId;
  return name.replace(/\s+/g, "").toLowerCase();
}

function normalizeProjectTitle(title: string): string {
  return title
    .replace(/[(){}\[\]<>·•・,\.!?'"`~\-_/\\]/g, " ")
    .replace(/(사업|운영|행사|캠페인|지원|지원사업|프로그램)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardTokens(a: string, b: string): number {
  const ta = new Set(normalizeProjectTitle(a).split(/\s+/).filter(Boolean));
  const tb = new Set(normalizeProjectTitle(b).split(/\s+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter += 1;
  const union = new Set([...ta, ...tb]).size;
  return inter / union;
}

// ---------- 신호 탐지 ----------

interface Index {
  byAddress: Map<string, SubsidyRecord[]>;
  byRecipient: Map<string, SubsidyRecord[]>;
}

function buildIndex(records: SubsidyRecord[]): Index {
  const byAddress = new Map<string, SubsidyRecord[]>();
  const byRecipient = new Map<string, SubsidyRecord[]>();
  for (const r of records) {
    const addr = normalizeAddress(r.recipientAddress);
    if (addr) {
      const arr = byAddress.get(addr) ?? [];
      arr.push(r);
      byAddress.set(addr, arr);
    }
    const recKey = normalizeRecipientKey(r.recipientName, r.recipientId);
    const arr2 = byRecipient.get(recKey) ?? [];
    arr2.push(r);
    byRecipient.set(recKey, arr2);
  }
  return { byAddress, byRecipient };
}

function detectSignalsForRecord(
  record: SubsidyRecord,
  records: SubsidyRecord[],
  index: Index
): DetectedSignal[] {
  const out: DetectedSignal[] = [];

  // A. repeated_recipient — 동일 단체가 다른 회계연도에 등장
  const recKey = normalizeRecipientKey(record.recipientName, record.recipientId);
  const sameRecipient = (index.byRecipient.get(recKey) ?? []).filter((r) => r.id !== record.id);
  if (sameRecipient.length >= 1) {
    out.push({
      code: "repeated_recipient",
      label: "반복 수급 패턴",
      weight: SUBSIDY_SIGNAL_WEIGHTS.repeated_recipient,
      description: "동일 또는 유사 단체가 다른 회계연도에서 보조금 교부를 받은 공개 정황 (확정 아님)",
      evidence: sameRecipient.map(
        (r) => `${r.fiscalYear}년 ${r.projectTitle} (record ${r.id})`
      )
    });
  }

  // B. same_address_multiple_entities — 동일 주소에 다른 사업자
  const addr = normalizeAddress(record.recipientAddress);
  const sameAddr = (index.byAddress.get(addr) ?? []).filter((r) => {
    if (r.id === record.id) return false;
    const k1 = normalizeRecipientKey(r.recipientName, r.recipientId);
    const k2 = normalizeRecipientKey(record.recipientName, record.recipientId);
    return k1 !== k2;
  });
  if (sameAddr.length >= 1) {
    out.push({
      code: "same_address_multiple_entities",
      label: "동일 주소 다단체",
      weight: SUBSIDY_SIGNAL_WEIGHTS.same_address_multiple_entities,
      description: "동일 주소에 다른 보조사업자가 공개 정보상 함께 존재 (확정 아님)",
      evidence: sameAddr.map(
        (r) => `${r.recipientName} (record ${r.id}) — 주소 ${addr}`
      )
    });
  }

  // C. similar_project_titles — 사업명 유사도 (자신 제외, jaccard >= 0.5)
  const similar: string[] = [];
  for (const r of records) {
    if (r.id === record.id) continue;
    const sim = jaccardTokens(record.projectTitle, r.projectTitle);
    if (sim >= 0.5) {
      similar.push(`${r.projectTitle} (${r.fiscalYear}, record ${r.id}, similarity ${sim.toFixed(2)})`);
    }
  }
  if (similar.length > 0) {
    out.push({
      code: "similar_project_titles",
      label: "유사 사업명 반복",
      weight: SUBSIDY_SIGNAL_WEIGHTS.similar_project_titles,
      description: "사업명이 매우 유사한 보조사업이 반복된 공개 정황 (확정 아님)",
      evidence: similar
    });
  }

  // D. missing_result_evidence
  const evidenceUrls = record.resultEvidenceUrls ?? [];
  if (evidenceUrls.length === 0) {
    out.push({
      code: "missing_result_evidence",
      label: "결과물 증빙 부족",
      weight: SUBSIDY_SIGNAL_WEIGHTS.missing_result_evidence,
      description: "공개 결과물/홍보물/결과보고 자료가 공개자료에서 확인되지 않음",
      evidence: ["resultEvidenceUrls 비어 있음 (공개 영역 기준)"]
    });
  }

  // E. high_amount_low_output — 5천만원 이상인데 결과물 1건 이하
  if ((record.grantAmount ?? 0) >= 50_000_000 && evidenceUrls.length <= 1) {
    out.push({
      code: "high_amount_low_output",
      label: "교부금액 대비 산출물 부족",
      weight: SUBSIDY_SIGNAL_WEIGHTS.high_amount_low_output,
      description: "교부금액 대비 공개 결과물이 부족해 보임 (확정 아님)",
      evidence: [`교부금액 ${record.grantAmount.toLocaleString()}원 / 공개 결과물 ${evidenceUrls.length}건`]
    });
  }

  // F. related_vendor_signal — 용역업체 주소 또는 대표자가 수급단체와 동일
  if (record.vendorInfo) {
    const vAddr = normalizeAddress(record.vendorInfo.address);
    const sameAddrVendor = vAddr && vAddr === addr;
    const sameRepVendor = record.vendorInfo.representative && record.vendorInfo.representative === record.representative;
    if (sameAddrVendor || sameRepVendor) {
      const ev: string[] = [];
      if (sameAddrVendor) ev.push(`용역업체 주소 동일: ${vAddr}`);
      if (sameRepVendor) ev.push(`용역업체 대표자 동일: ${record.vendorInfo.representative}`);
      out.push({
        code: "related_vendor_signal",
        label: "특수관계 의심 (용역업체)",
        weight: SUBSIDY_SIGNAL_WEIGHTS.related_vendor_signal,
        description: "수급단체와 용역업체의 주소 또는 대표자가 동일해 보이는 공개 정황 (확정 아님)",
        evidence: ev
      });
    }
  }

  // G. execution_pattern_anomaly — 특정 비목이 전체의 50% 초과
  const total = (record.executionItems ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
  if (total > 0) {
    const maxItem = (record.executionItems ?? []).reduce(
      (m, e) => ((e.amount ?? 0) > (m.amount ?? 0) ? e : m),
      { category: "", amount: 0 }
    );
    const ratio = total > 0 ? maxItem.amount / total : 0;
    if (ratio >= 0.5) {
      out.push({
        code: "execution_pattern_anomaly",
        label: "집행 패턴 이상",
        weight: SUBSIDY_SIGNAL_WEIGHTS.execution_pattern_anomaly,
        description: "집행내역이 특정 비목에 과도하게 집중된 공개 정황 (확정 아님)",
        evidence: [`${maxItem.category} 비목이 전체 집행의 ${(ratio * 100).toFixed(1)}% 차지`]
      });
    }
  }

  // H. disclosure_missing — 정산 미제출 + 결과물 0건
  if (record.settlementSubmitted === false && evidenceUrls.length === 0) {
    out.push({
      code: "disclosure_missing",
      label: "공시 누락 의심",
      weight: SUBSIDY_SIGNAL_WEIGHTS.disclosure_missing,
      description: "공시 대상처럼 보이지만 정산자료와 결과물이 공개자료에서 모두 확인되지 않음",
      evidence: ["settlementSubmitted=false 또는 공시 자료 부재"]
    });
  }

  // I. duplicate_content — 동일 결과물 URL이 다른 record에도 등장
  if (evidenceUrls.length > 0) {
    const dup: string[] = [];
    for (const r of records) {
      if (r.id === record.id) continue;
      const otherUrls = r.resultEvidenceUrls ?? [];
      for (const u of evidenceUrls) {
        if (otherUrls.includes(u)) dup.push(`${u} ← also in record ${r.id}`);
      }
    }
    if (dup.length > 0) {
      out.push({
        code: "duplicate_content",
        label: "결과보고 콘텐츠 중복",
        weight: SUBSIDY_SIGNAL_WEIGHTS.duplicate_content,
        description: "다른 사업과 결과물 URL이 중복되는 공개 정황 (확정 아님)",
        evidence: dup
      });
    }
  }

  return out;
}

// ---------- 점수 계산 ----------

function buildComponents(signals: DetectedSignal[], extractionQualityHint = 5): SubsidyAnalyzedCandidate["components"] {
  // 모든 컴포넌트를 0으로 시작
  const buckets: Record<SubsidyComponentKey, { score: number; reasons: string[] }> = {
    recipientPatternSignal: { score: 0, reasons: [] },
    addressSimilaritySignal: { score: 0, reasons: [] },
    projectSimilaritySignal: { score: 0, reasons: [] },
    evidenceCompleteness: { score: 0, reasons: [] },
    amountOutputImbalance: { score: 0, reasons: [] },
    disclosureSignal: { score: 0, reasons: [] },
    extractionQuality: { score: extractionQualityHint, reasons: ["sample-data 기반 추출 — 기본 점수"] }
  };

  for (const s of signals) {
    const compKey = SUBSIDY_SIGNAL_TO_COMPONENT[s.code];
    if (!compKey) continue;
    buckets[compKey].score += s.weight;
    buckets[compKey].reasons.push(`${s.label} (+${s.weight})`);
  }

  // 각 컴포넌트는 maxPoints 로 클램프
  const out: SubsidyAnalyzedCandidate["components"] = [];
  for (const key of Object.keys(buckets) as SubsidyComponentKey[]) {
    const def = SUBSIDY_COMPONENT_DEFS[key];
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

// ---------- 분석 진입점 ----------

export interface AnalyzeOptions {
  regionId?: string;
  useSampleData?: boolean;
}

export function analyzeSubsidySample(opts: AnalyzeOptions = {}): SubsidyAnalysisResult {
  const useSample = opts.useSampleData !== false;
  if (!useSample) {
    // 이번 단계에서는 sample 만 지원 — 외부 API 호출 금지
    throw new Error(
      "subsidy_fraud module supports only sample-data analysis in the prototype stage."
    );
  }
  const sample = loadSubsidySampleDataSync();
  const regionId = opts.regionId ?? sample.pilotRegionId;
  if (regionId !== sample.pilotRegionId) {
    throw new Error(
      `Region not supported in prototype: ${regionId}. Available: ${sample.pilotRegionId}`
    );
  }

  const records = sample.records;
  const index = buildIndex(records);

  const candidates: SubsidyAnalyzedCandidate[] = records.map((r) => {
    const signals = detectSignalsForRecord(r, records, index);
    const components = buildComponents(signals, 5);
    const priorityScore = Math.max(0, Math.min(
      SUBSIDY_PRIORITY_MAX_SCORE,
      components.reduce((s, c) => s + c.score, 0)
    ));
    const level = subsidyLevelForScore(priorityScore);
    return {
      recordId: r.id,
      fiscalYear: r.fiscalYear,
      managingAgency: r.managingAgency,
      projectTitle: r.projectTitle,
      recipientName: r.recipientName,
      recipientAddress: r.recipientAddress,
      representative: r.representative,
      grantAmount: r.grantAmount,
      publicListingUrl: r.publicListingUrl,
      capturedAt: r.capturedAt,
      signals,
      components,
      priorityScore,
      priorityLabel: level.label,
      priorityLevel: level.code,
      recommendedNextActions: subsidyRecommendedActionsFor(level.code),
      evidenceRequirements: [
        "보조사업명",
        "보조사업자명 (공시 영역)",
        "교부기관",
        "회계연도",
        "교부금액",
        "집행내역 (공개)",
        "정산/결과보고 자료 (공개)",
        "결과물 URL 또는 증빙 (공개)",
        "원본 공고/공시 URL",
        "캡처/PDF"
      ],
      safetyWarnings: [...SUBSIDY_SCORING_SAFETY_WARNINGS]
    };
  });

  // 점수 내림차순 정렬
  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    schemaVersion: "1.0.0",
    moduleId: "subsidy_fraud",
    pilotRegion: sample.pilotRegion,
    pilotRegionId: sample.pilotRegionId,
    analyzedAt: new Date().toISOString(),
    recordCount: records.length,
    candidates,
    safetyNotice: SUBSIDY_FRAUD_SAFETY_NOTICE,
    syntheticOnly: true,
    autoReport: false,
    humanReviewRequired: true
  };
}

export function getSubsidyCandidate(
  recordId: string,
  result?: SubsidyAnalysisResult
): SubsidyAnalyzedCandidate | undefined {
  const r = result ?? analyzeSubsidySample();
  return r.candidates.find((c) => c.recordId === recordId);
}

// ---------- 보조금 후보 리포트 마크다운 생성 ----------

export function buildSubsidyReportMarkdown(c: SubsidyAnalyzedCandidate): string {
  const lines: string[] = [];
  lines.push(`# 보조금 부정수급 의심 후보 검토 요청서 초안`);
  lines.push("");
  lines.push(`> 본 문서는 **자동 신고서가 아닙니다.** 사람이 검토·수정 후 공식 신고 창구에 직접 제출하는 보조 자료입니다.`);
  lines.push(`> 본 문서는 **부정수급 여부를 확정하지 않습니다.** 공개자료 기반 검토 후보일 뿐이며, 환수·처분·법령 적용은 공식기관 판단이 필요합니다.`);
  lines.push(`> 포상금/보상 지급을 보장하지 않습니다.`);
  lines.push("");
  lines.push(`## 1. 신고 후보 요약`);
  lines.push("");
  lines.push(`- 보조사업명: ${c.projectTitle}`);
  lines.push(`- 보조사업자: ${c.recipientName}`);
  lines.push(`- 교부기관: ${c.managingAgency}`);
  lines.push(`- 회계연도: ${c.fiscalYear}`);
  lines.push(`- 교부금액: ${c.grantAmount.toLocaleString()}원`);
  lines.push(`- 원본 공고/공시 URL: ${c.publicListingUrl ?? "(미기록)"}`);
  lines.push(`- 수집일시: ${c.capturedAt ?? "(미기록)"}`);
  lines.push(`- 우선순위 점수: ${c.priorityScore}/100 (${c.priorityLabel})`);
  lines.push("");
  lines.push(`## 2. 의심 신호`);
  lines.push("");
  if (c.signals.length === 0) {
    lines.push(`- 탐지된 의심 신호 없음`);
  } else {
    lines.push(`| No | 신호 | 설명 | 근거 |`);
    lines.push(`|---|---|---|---|`);
    c.signals.forEach((s, i) => {
      const ev = s.evidence.join("<br/>") || "(근거 메모 없음)";
      lines.push(`| ${i + 1} | ${s.label} (+${s.weight}) | ${s.description} | ${ev} |`);
    });
  }
  lines.push("");
  lines.push(`## 3. 공공자료 근거`);
  lines.push("");
  lines.push(`- 공고 / 교부정보 / 집행내역 / 정산·결과 / 보조사업자 정보공시 / 결과물 URL (공개 영역만)`);
  lines.push("");
  lines.push(`## 4. 추가 확인 필요자료`);
  lines.push("");
  lines.push(`- 정산보고서, 집행증빙, 행사/사업 결과물`);
  lines.push(`- 용역업체 계약자료 (공개 영역만)`);
  lines.push(`- 동일 주소/대표 여부 공식 확인 (등기/사업자 정보)`);
  lines.push(`- 보조금 관리기관 확인`);
  lines.push("");
  lines.push(`## 5. 신고처 후보`);
  lines.push("");
  lines.push(`- 국민권익위원회 / 국민신문고 (https://www.epeople.go.kr/)`);
  lines.push(`- 청렴포털 (https://www.clean.go.kr/)`);
  lines.push(`- 보조금 관리기관`);
  lines.push(`- 관할 지자체 감사부서`);
  lines.push("");
  lines.push(`## 6. 사람 검토 체크리스트`);
  lines.push("");
  lines.push(`- [ ] 단체명/대표/주소 공식 등기·사업자 정보와 일치 여부 확인`);
  lines.push(`- [ ] 정산/결과보고 자료 비공개 영역 확인 요청`);
  lines.push(`- [ ] 동일 주소·대표·용역업체 정황 재확인`);
  lines.push(`- [ ] 사업 성격에 따른 집행 패턴 비교`);
  lines.push(`- [ ] 민감정보 포함되지 않도록 점검`);
  lines.push(`- [ ] 신고 채널 공식 안내 확인`);
  lines.push(`- [ ] 포상금/보상 지급을 단정·약속하는 표현이 없는지 확인`);
  lines.push("");
  lines.push(`## 7. 중립 검토 요청 문구`);
  lines.push("");
  lines.push(`공개자료 기준으로 일부 반복 수급, 동일 주소, 결과물 부족 등 검토가 필요한 정황이 있어 관계기관의 확인을 요청드립니다.`);
  lines.push("");
  lines.push(`본 문서는 부정수급을 단정하는 것이 아니라, 공개자료에 기반한 검토 요청 초안입니다.`);
  lines.push("");
  lines.push(`### 다음 행동 추천`);
  lines.push("");
  for (const a of c.recommendedNextActions) lines.push(`- ${a}`);
  lines.push("");
  lines.push(`---`);
  lines.push(`자동 신고는 수행하지 않습니다. ${SUBSIDY_FRAUD_SAFETY_NOTICE}`);
  return lines.join("\n");
}

export const SUBSIDY_REPORT_SAFETY_NOTICE = SUBSIDY_FRAUD_SAFETY_NOTICE;
export { SUBSIDY_SCORING_VERSION, SUBSIDY_SCORING_DISCLAIMER };
