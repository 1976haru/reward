import path from "node:path";
import { writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";
import { normalizeEntityName } from "../normalizers/entityNameNormalizer.js";
import { calculateProjectNameSimilarity, normalizeProjectName } from "../normalizers/projectNameSimilarity.js";
import type { G2bContractLinkageCandidate } from "../types/g2bContractLinkage.js";
import {
  CONTRACTOR_NETWORK_RISK_NOTICE,
  CONTRACTOR_NETWORK_RISK_THRESHOLDS,
  CONTRACTOR_NETWORK_SIGNAL_WEIGHTS,
  ContractorNetworkEdge,
  ContractorNetworkRiskCandidate,
  ContractorNetworkRiskEvidence,
  ContractorNetworkRiskLevel,
  ContractorNetworkRiskOptions,
  ContractorNetworkRiskReport,
  ContractorNetworkSignal,
  ContractorNetworkSignalCode
} from "../types/contractorNetworkRisk.js";

type EdgeInput = Partial<ContractorNetworkEdge> &
  Partial<G2bContractLinkageCandidate> & {
    id?: string;
    contractCounterpartyName?: string;
    vendorName?: string;
    serviceProviderName?: string;
    projectName?: string;
    localGovName?: string;
    agencyName?: string;
    addressRegion?: string;
    addressRegionKey?: string;
  };

export function createContractorNetworkRiskRunId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `contractor_network_${stamp}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getContractorNetworkRiskLevel(score: number): ContractorNetworkRiskLevel {
  if (score >= CONTRACTOR_NETWORK_RISK_THRESHOLDS.high) return "high";
  if (score >= CONTRACTOR_NETWORK_RISK_THRESHOLDS.medium) return "medium";
  if (score >= CONTRACTOR_NETWORK_RISK_THRESHOLDS.low) return "low";
  return "minimal";
}

export function clampContractorNetworkRiskScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function safeText(v?: string): string | undefined {
  if (!v) return undefined;
  const sanitized = sanitizeForStorage(String(v)).sanitizedText.trim();
  return sanitized.length > 0 ? sanitized : undefined;
}

function compactFallback(v?: string): string {
  return (v ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
}

export function normalizeContractorName(name?: string): string {
  if (!name) return "";
  return normalizeEntityName(name).compactName || compactFallback(name);
}

export function normalizeContractTitle(title?: string): string {
  if (!title) return "";
  return normalizeProjectName(title).compactCore || normalizeProjectName(title).compactName || compactFallback(title);
}

function yearFromDate(v?: string): number | undefined {
  const m = String(v ?? "").match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : undefined;
}

export function buildContractorKey(edge: Pick<ContractorNetworkEdge, "businessRegistrationNumberHash" | "corporateRegistrationNumberHash" | "normalizedContractorName" | "contractorName">): string {
  if (edge.businessRegistrationNumberHash) return `bizhash:${edge.businessRegistrationNumberHash}`;
  if (edge.corporateRegistrationNumberHash) return `corphash:${edge.corporateRegistrationNumberHash}`;
  const normalized = edge.normalizedContractorName || normalizeContractorName(edge.contractorName);
  return `name:${normalized || "unknown-contractor"}`;
}

export function buildRecipientVendorPairKey(edge: ContractorNetworkEdge): string {
  return `pair:${edge.recipientKey}|${edge.contractorKey}`;
}

export function normalizeContractorNetworkEdge(input: EdgeInput): ContractorNetworkEdge {
  const recipientName = input.recipientName;
  const contractorName =
    input.contractorName ??
    input.contractCounterpartyName ??
    input.vendorName ??
    input.serviceProviderName ??
    input.normalizedContractorName ??
    input.recipientName;
  const normalizedRecipientName =
    input.normalizedRecipientName ?? (recipientName ? normalizeEntityName(recipientName).compactName : undefined);
  const normalizedContractorName =
    input.normalizedContractorName ?? (contractorName ? normalizeContractorName(contractorName) : undefined);
  const subsidyProjectName = input.subsidyProjectName ?? input.projectName;
  const projectNameCompactKey = input.projectNameCompactKey ?? normalizeContractTitle(subsidyProjectName);
  const contractTitleCompactKey = input.contractTitleCompactKey ?? normalizeContractTitle(input.contractTitle);
  const recipientKey =
    input.recipientKey ??
    `recipient:${normalizedRecipientName || compactFallback(recipientName) || input.subsidyRecordId || input.id || "unknown-recipient"}`;
  const base: ContractorNetworkEdge = {
    edgeId: input.edgeId ?? input.id ?? `${input.subsidyRecordId ?? "subsidy"}_${input.contractRecordId ?? Math.random().toString(36).slice(2, 8)}`,
    subsidyRecordId: input.subsidyRecordId ?? input.id ?? "unknown-subsidy-record",
    contractRecordId: input.contractRecordId,
    recipientKey,
    contractorKey: input.contractorKey ?? "pending",
    recipientName: safeText(recipientName),
    normalizedRecipientName: safeText(normalizedRecipientName),
    contractorName: safeText(contractorName),
    normalizedContractorName: safeText(normalizedContractorName),
    subsidyProjectName: safeText(subsidyProjectName),
    projectNameCompactKey: safeText(projectNameCompactKey),
    contractTitle: safeText(input.contractTitle),
    contractTitleCompactKey: safeText(contractTitleCompactKey),
    contractAmount: Number.isFinite(input.contractAmount) ? Number(input.contractAmount) : undefined,
    subsidyAmount: Number.isFinite(input.subsidyAmount) ? Number(input.subsidyAmount) : undefined,
    fiscalYear: input.fiscalYear ?? yearFromDate(input.contractDate) ?? yearFromDate(input.collectedAt),
    contractDate: safeText(input.contractDate),
    orderingAgencyName: safeText(input.orderingAgencyName ?? input.agencyName ?? input.localGovName),
    recipientAddressRegionKey: safeText(input.recipientAddressRegionKey ?? input.addressRegionKey ?? input.addressRegion),
    contractorAddressRegionKey: safeText(input.contractorAddressRegionKey),
    businessRegistrationNumberHash: safeText(input.businessRegistrationNumberHash),
    corporateRegistrationNumberHash: safeText(input.corporateRegistrationNumberHash),
    sourceUrl: safeText(input.sourceUrl),
    evidenceUrl: safeText(input.evidenceUrl)
  };
  return { ...base, contractorKey: input.contractorKey ?? buildContractorKey(base) };
}

export function edgeFromG2bLinkageCandidate(input: G2bContractLinkageCandidate): ContractorNetworkEdge {
  return normalizeContractorNetworkEdge({
    ...input,
    edgeId: input.id,
    contractorName: (input as EdgeInput).contractorName ?? input.recipientName,
    recipientAddressRegionKey: input.addressRegion,
    evidenceUrl: input.sourceUrl
  });
}

export function groupEdgesByRecipientVendorPair(edges: ContractorNetworkEdge[]): Map<string, ContractorNetworkEdge[]> {
  const groups = new Map<string, ContractorNetworkEdge[]>();
  for (const edge of edges) {
    const key = buildRecipientVendorPairKey(edge);
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  return groups;
}

export function groupEdgesByContractor(edges: ContractorNetworkEdge[]): Map<string, ContractorNetworkEdge[]> {
  const groups = new Map<string, ContractorNetworkEdge[]>();
  for (const edge of edges) groups.set(edge.contractorKey, [...(groups.get(edge.contractorKey) ?? []), edge]);
  return groups;
}

export function calculateContractAmountSimilarity(a?: number, b?: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const aa = Math.abs(Number(a));
  const bb = Math.abs(Number(b));
  const max = Math.max(aa, bb);
  if (max === 0) return aa === bb ? 1 : 0;
  return Math.max(0, 1 - Math.abs(aa - bb) / max);
}

function addSignal(list: ContractorNetworkSignal[], code: ContractorNetworkSignalCode): void {
  const def = CONTRACTOR_NETWORK_SIGNAL_WEIGHTS[code];
  list.push({ code, label: def.label, score: def.score });
}

function hasRepeatedHash(edges: ContractorNetworkEdge[], field: "businessRegistrationNumberHash" | "corporateRegistrationNumberHash"): boolean {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const v = edge[field];
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.values()].some((n) => n >= 2);
}

function hasTitleSimilarity(edges: ContractorNetworkEdge[], threshold: number): boolean {
  return edges.some((edge) => {
    if (!edge.subsidyProjectName || !edge.contractTitle) return false;
    const a = normalizeProjectName(edge.subsidyProjectName);
    const b = normalizeProjectName(edge.contractTitle);
    return calculateProjectNameSimilarity(a, b) >= threshold;
  });
}

function hasSameOrAdjacentYear(edges: ContractorNetworkEdge[]): boolean {
  const years = edges.map((e) => e.fiscalYear).filter((y): y is number => Number.isFinite(y));
  for (let i = 0; i < years.length; i++) {
    for (let j = i + 1; j < years.length; j++) {
      if (Math.abs(years[i] - years[j]) <= 1) return true;
    }
  }
  return false;
}

function hasSimilarAmounts(edges: ContractorNetworkEdge[], threshold: number): boolean {
  const amounts = edges.map((e) => e.contractAmount).filter((n): n is number => Number.isFinite(n));
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      if (calculateContractAmountSimilarity(amounts[i], amounts[j]) >= threshold) return true;
    }
  }
  return false;
}

export function evaluateContractorNetworkSignals(
  group: ContractorNetworkEdge[],
  allEdges: ContractorNetworkEdge[],
  options: ContractorNetworkRiskOptions = {}
): { networkSignals: ContractorNetworkSignal[]; rawScore: number } {
  const signals: ContractorNetworkSignal[] = [];
  const first = group[0];
  const contractorEdges = allEdges.filter((e) => e.contractorKey === first.contractorKey);
  const distinctProjects = new Set(contractorEdges.map((e) => e.projectNameCompactKey).filter(Boolean));
  const distinctRecipients = new Set(contractorEdges.map((e) => e.recipientKey).filter(Boolean));
  const distinctPairKeys = new Set(group.map((e) => buildRecipientVendorPairKey(e)));

  if (group.length >= 2 && distinctPairKeys.size === 1) addSignal(signals, "recipientVendorPairRepeated");
  if (distinctProjects.size >= 2) addSignal(signals, "vendorRepeatedAcrossProjects");
  if (distinctRecipients.size >= 2) addSignal(signals, "vendorRepeatedAcrossRecipients");
  if (hasTitleSimilarity(group, options.titleSimilarityThreshold ?? 0.7)) addSignal(signals, "projectContractTitleSimilar");
  if (hasSameOrAdjacentYear(group)) addSignal(signals, "sameOrAdjacentFiscalYear");
  if (hasSimilarAmounts(group, options.amountSimilarityThreshold ?? 0.9)) addSignal(signals, "similarContractAmount");
  if (group.some((e) => e.recipientAddressRegionKey && e.contractorAddressRegionKey && e.recipientAddressRegionKey === e.contractorAddressRegionKey)) {
    addSignal(signals, "addressKeyRelated");
  }
  const agencies = group.map((e) => e.orderingAgencyName).filter(Boolean);
  if (new Set(agencies).size < agencies.length && agencies.length >= 2) addSignal(signals, "orderingAgencyRepeated");
  if (group.some((e) => e.evidenceUrl || e.sourceUrl)) addSignal(signals, "evidenceUrlPresent");
  if (hasRepeatedHash(group, "businessRegistrationNumberHash")) addSignal(signals, "businessNumberHashMatch");
  if (hasRepeatedHash(group, "corporateRegistrationNumberHash")) addSignal(signals, "corporateNumberHashMatch");

  return { networkSignals: signals, rawScore: signals.reduce((sum, s) => sum + s.score, 0) };
}

export function extractContractorNetworkEvidence(edge: ContractorNetworkEdge): ContractorNetworkRiskEvidence {
  return {
    edgeId: edge.edgeId,
    subsidyRecordId: edge.subsidyRecordId,
    contractRecordId: edge.contractRecordId,
    recipientName: safeText(edge.recipientName),
    normalizedRecipientName: safeText(edge.normalizedRecipientName),
    contractorName: safeText(edge.contractorName),
    normalizedContractorName: safeText(edge.normalizedContractorName),
    subsidyProjectName: safeText(edge.subsidyProjectName),
    contractTitle: safeText(edge.contractTitle),
    contractAmount: edge.contractAmount,
    subsidyAmount: edge.subsidyAmount,
    fiscalYear: edge.fiscalYear,
    contractDate: safeText(edge.contractDate),
    orderingAgencyName: safeText(edge.orderingAgencyName),
    sourceUrl: safeText(edge.sourceUrl),
    evidenceUrl: safeText(edge.evidenceUrl)
  };
}

function buildReason(signals: ContractorNetworkSignal[]): string {
  const codes = new Set(signals.map((s) => s.code));
  const reasons: string[] = [];
  if (codes.has("recipientVendorPairRepeated")) reasons.push("같은 수급단체와 계약업체 조합이 반복되어 계약정산 근거 확인이 필요합니다.");
  if (codes.has("vendorRepeatedAcrossProjects")) reasons.push("특정 계약업체가 여러 보조사업과 반복 연결되어 추가 확인이 필요합니다.");
  if (codes.has("vendorRepeatedAcrossRecipients")) reasons.push("특정 계약업체가 여러 수급단체와 반복 연결되어 반복 연결 검토 후보로 분류되었습니다.");
  if (codes.has("projectContractTitleSimilar")) reasons.push("보조사업명과 계약명이 유사하여 연관성 검토 후보로 분류되었습니다.");
  if (codes.has("sameOrAdjacentFiscalYear") || codes.has("similarContractAmount") || codes.has("orderingAgencyRepeated") || codes.has("addressKeyRelated")) {
    reasons.push("계약일자, 계약금액, 기관명 또는 주소 키 신호가 함께 확인되어 추가 확인이 필요합니다.");
  }
  if (reasons.length === 0) reasons.push("공개자료 기준 일부 반복 연결 신호가 있어 추가 확인이 필요합니다.");
  reasons.push("장기계약전문용역지역 공급망 등 합리적 사유 가능성을 함께 검토해야 합니다.");
  return reasons.join(" ");
}

export function createContractorNetworkRiskCandidate(
  group: ContractorNetworkEdge[],
  allEdges: ContractorNetworkEdge[],
  options: ContractorNetworkRiskOptions = {}
): ContractorNetworkRiskCandidate | null {
  if (group.length === 0) return null;
  const { networkSignals, rawScore } = evaluateContractorNetworkSignals(group, allEdges, options);
  const riskScore = clampContractorNetworkRiskScore(rawScore);
  const minScore = options.minScore ?? 40;
  if (riskScore < minScore && getContractorNetworkRiskLevel(riskScore) === "minimal") return null;
  const first = group[0];
  const pairKeys = new Set(group.map((e) => buildRecipientVendorPairKey(e)));
  const networkKey = pairKeys.size === 1 ? buildRecipientVendorPairKey(first) : `contractor:${first.contractorKey}`;
  const runId = options.runId ?? "run";
  return {
    candidateId: `${runId}_${networkKey.replace(/[^a-zA-Z0-9_-]+/g, "_")}`,
    networkKey,
    recipientKey: pairKeys.size === 1 ? first.recipientKey : undefined,
    contractorKey: first.contractorKey,
    involvedRecordIds: Array.from(new Set(group.map((e) => e.subsidyRecordId))).sort(),
    involvedContractIds: Array.from(new Set(group.map((e) => e.contractRecordId).filter((v): v is string => !!v))).sort(),
    riskScore,
    riskLevel: getContractorNetworkRiskLevel(riskScore),
    networkSignals,
    evidence: group.slice(0, 20).map(extractContractorNetworkEvidence),
    reason: buildReason(networkSignals),
    cautionNotes: [
      "반복 연결은 장기계약, 전문용역, 유지보수, 지역 공급망, 단가계약 구조일 수 있습니다.",
      "본 결과는 계약업체 연관성 후보이며 사실관계 점검과 사람 검토가 필요합니다."
    ],
    reviewRequired: true,
    createdAt: new Date().toISOString()
  };
}

export function dedupeContractorNetworkCandidates(candidates: ContractorNetworkRiskCandidate[]): ContractorNetworkRiskCandidate[] {
  const best = new Map<string, ContractorNetworkRiskCandidate>();
  for (const candidate of candidates) {
    const cur = best.get(candidate.networkKey);
    if (!cur || candidate.riskScore > cur.riskScore) best.set(candidate.networkKey, candidate);
  }
  return Array.from(best.values());
}

export function sortContractorNetworkCandidates(candidates: ContractorNetworkRiskCandidate[]): ContractorNetworkRiskCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    if (b.networkSignals.length !== a.networkSignals.length) return b.networkSignals.length - a.networkSignals.length;
    return a.networkKey.localeCompare(b.networkKey);
  });
}

export function selectTopContractorNetworkCandidates(candidates: ContractorNetworkRiskCandidate[], limit = 50): ContractorNetworkRiskCandidate[] {
  return sortContractorNetworkCandidates(candidates).slice(0, limit);
}

export function generateContractorNetworkRiskReport(
  inputs: EdgeInput[],
  options: ContractorNetworkRiskOptions = {}
): ContractorNetworkRiskReport {
  const runId = options.runId ?? createContractorNetworkRiskRunId();
  const edges = inputs.map(normalizeContractorNetworkEdge);
  const candidates: ContractorNetworkRiskCandidate[] = [];
  const candidateOptions = { ...options, runId };

  for (const group of groupEdgesByRecipientVendorPair(edges).values()) {
    const candidate = createContractorNetworkRiskCandidate(group, edges, candidateOptions);
    if (candidate) candidates.push(candidate);
  }
  for (const group of groupEdgesByContractor(edges).values()) {
    if (group.length < 2) continue;
    const candidate = createContractorNetworkRiskCandidate(group, edges, candidateOptions);
    if (candidate) candidates.push(candidate);
  }

  const deduped = dedupeContractorNetworkCandidates(candidates);
  const topCandidates = selectTopContractorNetworkCandidates(deduped, options.limit ?? 50);
  const signalSummary: Record<string, number> = {};
  for (const candidate of deduped) {
    for (const signal of candidate.networkSignals) signalSummary[signal.code] = (signalSummary[signal.code] ?? 0) + 1;
  }
  const isRealData = options.isRealData ?? false;
  const notes = [
    "결과는 계약업체 연관성 후보, 반복 연결 검토 후보, 추가 확인 필요 후보로만 해석합니다.",
    "동일 업체 반복 등장만으로 문제라고 단정하지 않으며 사람 검토가 필요합니다.",
    "사업자등록번호와 법인등록번호 원문은 저장하지 않고 해시만 사용할 수 있습니다.",
    "대표자명, 전화번호, 상세주소, 개인정보 원문, 로그인 필요 자료, 비공개자료는 탐지 근거로 사용하지 않습니다."
  ];
  if (!isRealData) notes.push("fixture 기반 검증이며 실제 탐지 완료로 표현하지 않습니다.");

  return {
    runId,
    totalEdges: edges.length,
    totalCandidates: deduped.length,
    topCandidates,
    signalSummary,
    createdAt: new Date().toISOString(),
    notes,
    isRealData,
    sourceNote: options.sourceNote ?? (isRealData ? "real-data" : "fixture-synthetic")
  };
}

export function renderContractorNetworkRiskReportMarkdown(report: ContractorNetworkRiskReport): string {
  const lines: string[] = [];
  lines.push(`# 계약업체 연관성 후보 TOP ${Math.min(report.topCandidates.length, 50)} - ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.createdAt}`);
  lines.push(`- 데이터 구분: ${report.isRealData ? "입력 데이터" : "fixture(검증용, 실제 탐지 완료 아님)"} / ${report.sourceNote}`);
  lines.push(`- edge: ${report.totalEdges} / 후보: ${report.totalCandidates}`);
  lines.push("");
  lines.push("> 본 결과는 업체-사업 반복 네트워크 후보 또는 반복 연결 검토 후보이며 확정 판단이 아닙니다. 모든 후보는 사람 검토가 필요합니다.");
  lines.push("");
  lines.push("## 신호 요약");
  lines.push("");
  for (const [code, count] of Object.entries(report.signalSummary)) lines.push(`- ${code}: ${count}`);
  lines.push("");
  lines.push("## 업체-사업 반복 네트워크 후보");
  lines.push("");
  lines.push("| 순위 | riskScore | riskLevel | networkKey | networkSignals | reason |");
  lines.push("|---:|---:|---|---|---|---|");
  report.topCandidates.forEach((candidate, i) => {
    const signals = candidate.networkSignals.map((s) => s.code).join(", ");
    lines.push(`| ${i + 1} | ${candidate.riskScore} | ${candidate.riskLevel} | ${candidate.networkKey} | ${signals} | ${candidate.reason} |`);
  });
  lines.push("");
  lines.push("## 주의");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${note}`);
  return lines.join("\n");
}

export async function writeContractorNetworkRiskReport(
  outputDir: string,
  report: ContractorNetworkRiskReport
): Promise<{ reportJsonFile: string; reportMdFile: string }> {
  const runDir = path.join(outputDir, "runs", report.runId);
  await ensureDir(runDir);
  const reportJsonFile = path.join(runDir, "contractor-network-risk-report.json");
  const reportMdFile = path.join(runDir, "contractor-network-risk-report.md");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = reportMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(reportMdFile, renderContractorNetworkRiskReportMarkdown(report), "utf8");
  return { reportJsonFile, reportMdFile };
}

export { CONTRACTOR_NETWORK_RISK_NOTICE };
