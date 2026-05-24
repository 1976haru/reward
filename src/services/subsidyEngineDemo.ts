// Subsidy Engine Demo Aggregator (UI 연결 점검 작업).
//
// 체크리스트 11~25에서 구현한 보조금 탐지 엔진(룰 탐지), 점수 모델(위험점수/보상가능성),
// AI 분석(LLM 설명형 fallback), 근거 검증(citation validation) 결과를 브라우저 UI에서
// 확인할 수 있도록 fixture 기반으로 묶어 안전한 요약을 만든다.
//
// 중요:
// - 실제 외부 API / 실제 LLM API를 호출하지 않는다 (deterministic fallback만 사용).
// - 자동 신고 기능을 만들지 않는다.
// - 개인정보 원문을 요약에 넣지 않는다 (각 모듈이 마스킹/제외).
// - 위법/부정수급을 단정하는 표현을 쓰지 않는다. "검토 후보 / 추가 확인 필요 / fixture 기반 검증"으로 표현한다.
// - rootDir=src 제약으로 tests/fixtures를 import할 수 없어, 데모 트리거용 합성 입력은 이 파일에서 생성한다.

import { BaselineRecord } from "../types/dataQualityBaseline.js";
import { ContractorNetworkEdge } from "../types/contractorNetworkRisk.js";
import { UnifiedRiskInputCandidate } from "../types/riskScoreModel.js";
import { RewardPossibilityInputCandidate } from "../types/rewardPossibilityScore.js";
import { LlmExplanationCandidateInput } from "../types/llmExplanationAnalysis.js";

import { computeBaselineQuality } from "../quality/dataBaselineQuality.js";
import { generateRepeatRiskReport } from "../rules/repeatSubsidyRiskRule.js";
import { generateAddressClusterRiskReport } from "../rules/addressClusterRiskRule.js";
import { generateOutputSettlementRiskReport } from "../rules/outputSettlementRiskRule.js";
import { generateSpendingAnomalyRiskReport } from "../rules/spendingAnomalyRiskRule.js";
import { generateContractorNetworkRiskReport } from "../rules/contractorNetworkRiskRule.js";
import { generateRiskScoreReport } from "../scoring/riskScoreModel.js";
import { generateRewardPossibilityScoreReport } from "../scoring/rewardPossibilityScore.js";
import {
  generateLlmExplanationReport,
  validateLlmExplanationReportCitations
} from "../analysis/llmExplanationAnalysis.js";

export const SUBSIDY_DEMO_SAFETY_NOTICE =
  "본 결과는 fixture 또는 공개자료 기반 검토 후보입니다. 위법 여부를 단정하지 않으며, 신고·보상·포상 가능성을 보장하지 않습니다. " +
  "모든 제출은 사람이 공식 창구에서 직접 검토 후 진행해야 합니다.";

export const SUBSIDY_DEMO_FIXTURE_NOTICE =
  "현재 화면은 fixture 기반 검증 결과를 보여줍니다. 실제 신고 또는 보상금 수령을 보장하지 않습니다.";

// ---------- 엔진 현황 패널 ----------

export interface SubsidyEngineStatus {
  collectors: { name: string; status: string }[];
  rules: { name: string; status: string }[];
  scoring: { name: string; status: string }[];
  aiAnalysis: { name: string; status: string }[];
  fixtureNotice: string;
  safetyNotice: string;
}

export function getSubsidyEngineStatus(): SubsidyEngineStatus {
  return {
    collectors: [
      { name: "공공데이터 API 수집기", status: "구현 완료 · 실제 API 키 필요" },
      { name: "업로드 파서 (CSV/XLSX/PDF)", status: "변환 가능" },
      { name: "정규화 (기관명/주소/사업명)", status: "정규화 가능" },
      { name: "데이터 품질검증", status: "fixture 1,000건 기준선 검증 가능" }
    ],
    rules: [
      { name: "반복 수급 탐지", status: "구현 완료 · fixture 검증" },
      { name: "동일 주소 다수 단체 탐지", status: "구현 완료 · fixture 검증" },
      { name: "결과물 부족/정산 확인 필요 탐지", status: "구현 완료 · fixture 검증" },
      { name: "예산 집행 이상 패턴 탐지", status: "구현 완료 · fixture 검증" },
      { name: "계약업체 연관성 탐지", status: "구현 완료 · fixture 검증" }
    ],
    scoring: [
      { name: "100점 위험점수", status: "구현 완료 · A/B/C 등급" },
      { name: "보상가능성 점수", status: "구현 완료 · High/Medium/Low" }
    ],
    aiAnalysis: [
      { name: "LLM 설명형 분석 (fallback)", status: "구현 완료 · 실제 LLM API 미호출" },
      { name: "근거 검증 (citation validation)", status: "구현 완료 · 원문 URL/파일/행번호/recordId/evidenceId 연결" }
    ],
    fixtureNotice: SUBSIDY_DEMO_FIXTURE_NOTICE,
    safetyNotice: SUBSIDY_DEMO_SAFETY_NOTICE
  };
}

// ---------- 데모 트리거용 합성 입력 (fixture) ----------

function baseRecord(p: Partial<BaselineRecord> & { id: string; projectName: string }): BaselineRecord {
  return {
    sourceType: "fixture",
    sourceName: "fixture-synthetic",
    collectedAt: new Date(Date.UTC(p.fiscalYear ?? 2024, 0, 1)).toISOString(),
    documentType: "subsidy_notice",
    privacyDetectedTypes: [],
    ...p
  } as BaselineRecord;
}

// 반복 수급 + 동일 주소 트리거: 동일 기관/주소 클러스터 + 동일 주소 다수 단체 클러스터.
function buildRepeatAndAddressRecords(): BaselineRecord[] {
  const records: BaselineRecord[] = [];
  const addrA = "경기도수원시팔달구효원로1";
  for (let k = 0; k < 5; k++) {
    records.push(
      baseRecord({
        id: `demoA_${k}`,
        fiscalYear: 2023 + (k % 3),
        localGovName: "경기도 수원시 팔달구",
        projectName: `${2023 + (k % 3)}년 청년 문화활동 지원사업`,
        projectNameCompactKey: "청년문화활동지원사업",
        recipientName: "행복나눔 협동조합",
        normalizedRecipientName: "행복나눔",
        normalizedAddressKey: addrA,
        addressRegionKey: "경기도수원시팔달구효원로",
        subsidyAmount: 5_000_000 + (k % 2) * 100_000,
        sourceUrl: `https://example.go.kr/a/${k}`,
        evidenceUrl: `https://example.go.kr/ae/${k}`
      })
    );
  }
  const addrB = "경기도성남시분당구정자로5";
  const recipsB = ["미래복지", "두드림", "새빛", "다온누리"];
  for (let k = 0; k < recipsB.length; k++) {
    records.push(
      baseRecord({
        id: `demoB_${k}`,
        fiscalYear: 2024,
        localGovName: "경기도 성남시 분당구",
        projectName: `${recipsB[k]} 돌봄 지원사업`,
        projectNameCompactKey: `돌봄지원사업${k}`,
        recipientName: `${recipsB[k]} 협동조합`,
        normalizedRecipientName: recipsB[k],
        normalizedAddressKey: addrB,
        addressRegionKey: "경기도성남시분당구정자로",
        subsidyAmount: 3_000_000 + k * 400_000,
        documentType: "settlement",
        sourceUrl: `https://example.go.kr/b/${k}`
      })
    );
  }
  return records;
}

// 결과물/정산 누락 트리거.
function buildOutputSettlementRecords(): BaselineRecord[] {
  const records: BaselineRecord[] = [];
  for (let k = 0; k < 6; k++) {
    records.push(
      baseRecord({
        id: `demoMissAll_${k}`,
        fiscalYear: 2022,
        localGovName: "경기도 수원시 팔달구",
        projectName: `청년 문화활동 지원사업 ${k}`,
        projectNameCompactKey: `청년문화활동지원사업누락${k}`,
        recipientName: `누락단체${k}`,
        normalizedRecipientName: `누락단체키${k}`,
        documentType: "settlement"
      })
    );
  }
  for (let k = 0; k < 6; k++) {
    records.push(
      baseRecord({
        id: `demoMissSettle_${k}`,
        fiscalYear: 2022,
        localGovName: "경기도 성남시 분당구",
        projectName: `아동 돌봄 지원사업 ${k}`,
        projectNameCompactKey: `아동돌봄지원사업정산${k}`,
        recipientName: `정산미확인단체${k}`,
        normalizedRecipientName: `정산미확인키${k}`,
        documentType: "settlement",
        subsidyAmount: 8_000_000,
        executionAmount: 7_500_000,
        sourceUrl: `https://example.go.kr/ss/${k}`,
        evidenceUrl: `https://example.go.kr/se/${k}`,
        performanceReportUrl: `https://example.go.kr/sp/${k}`,
        resultReportUrl: `https://example.go.kr/sr/${k}`,
        resultUrl: `https://example.go.kr/so/${k}`,
        attachmentCount: 1,
        hasPerformanceReport: true,
        hasResultReport: true,
        hasResultUrl: true,
        hasAttachment: true
      })
    );
  }
  return records;
}

// 예산 집행 이상 패턴 트리거: 항목 비중 과다 + 증빙 부족.
function buildSpendingRecords(): BaselineRecord[] {
  const records: BaselineRecord[] = [];
  const groups: Array<{ cat: string; label: string; amount: number; key: string; proj: string }> = [
    { cat: "labor", label: "인건비", amount: 8_000_000, key: "인건비단체키", proj: "청년 활동 지원사업" },
    { cat: "promotion", label: "홍보비", amount: 6_500_000, key: "홍보비단체키", proj: "지역 홍보 캠페인" },
    { cat: "service", label: "용역비", amount: 7_000_000, key: "용역비단체키", proj: "정책 연구 용역" }
  ];
  for (const g of groups) {
    for (let k = 0; k < 6; k++) {
      records.push(
        baseRecord({
          id: `demoSpend_${g.cat}_${k}`,
          fiscalYear: 2024,
          localGovName: "경기도 수원시 팔달구",
          projectName: `${g.proj} ${k}`,
          projectNameCompactKey: `${g.cat}데모${k}`,
          normalizedRecipientName: `${g.key}${k}`,
          documentType: "settlement",
          executionAmount: 10_000_000,
          hasSpendingBreakdown: true,
          spendingLineItems: [
            { category: g.cat, label: g.label, amount: g.amount, vendorNameMasked: "지급처-***" },
            { category: "other", label: "기타", amount: 10_000_000 - g.amount }
          ]
        })
      );
    }
  }
  return records;
}

// 계약업체 연관성 트리거: 동일 수급-계약업체 쌍 반복 + 사업자번호 해시 일치.
function buildContractorEdges(): ContractorNetworkEdge[] {
  const edges: ContractorNetworkEdge[] = [];
  for (let i = 0; i < 12; i++) {
    edges.push({
      edgeId: `demoPair_${i}`,
      subsidyRecordId: `demo_subsidy_${i}`,
      contractRecordId: `demo_contract_${i}`,
      recipientKey: "recipient:demo-planted-a",
      contractorKey: "bizhash:demo-vendor-a",
      recipientName: "데모 수급단체A",
      normalizedRecipientName: "demorecipienta",
      contractorName: "데모 용역업체A",
      normalizedContractorName: "demovendora",
      subsidyProjectName: `청년 교육 운영 사업 ${i % 3}`,
      projectNameCompactKey: `청년교육운영사업${i % 3}`,
      contractTitle: `청년 교육 운영 용역 ${i % 3}`,
      contractTitleCompactKey: `청년교육운영용역${i % 3}`,
      contractAmount: 12_000_000 + (i % 3) * 50_000,
      subsidyAmount: 20_000_000,
      fiscalYear: 2023 + (i % 2),
      contractDate: `${2023 + (i % 2)}-04-01`,
      orderingAgencyName: "데모발주기관A",
      recipientAddressRegionKey: "gg-suwon",
      contractorAddressRegionKey: "gg-suwon",
      businessRegistrationNumberHash: "hash-demo-vendor-a",
      corporateRegistrationNumberHash: "corp-hash-demo-vendor-a",
      sourceUrl: `https://example.go.kr/source/demo-${i}`,
      evidenceUrl: `https://example.go.kr/evidence/demo-${i}`
    });
  }
  return edges;
}

// 위험점수/보상가능성/LLM 입력 후보 (검토 후보 신호 기반).
function buildScoreInputCandidates(): UnifiedRiskInputCandidate[] {
  const subject = "subject:demo-high";
  const mk = (
    candidateId: string,
    ruleType: UnifiedRiskInputCandidate["ruleType"],
    riskScore: number,
    signals: string[]
  ): UnifiedRiskInputCandidate => ({
    candidateId,
    ruleType,
    subjectKey: subject,
    riskScore,
    recordIds: ["demoA_0", "demoA_1"],
    signals,
    evidence: { fixture: true, evidenceUrl: `https://example.go.kr/evidence/${candidateId}` },
    reason: "여러 의심 신호가 함께 확인되어 추가 확인 필요 후보입니다.",
    createdAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    isFixtureBased: true
  });
  return [
    mk("demo-repeat", "repeat_subsidy", 92, ["RECIPIENT_KEY_MATCH", "PROJECT_SIMILAR", "AMOUNT_SIMILAR", "EVIDENCE_PRESENT"]),
    mk("demo-address", "address_cluster", 85, ["ADDRESS_KEY_GROUP", "DISTINCT_RECIPIENTS", "REPEATED_YEARS"]),
    mk("demo-output", "output_settlement", 90, ["missingPerformanceReport", "missingSettlementDocument", "missingResultReport"]),
    mk("demo-contractor", "contractor_network", 88, ["recipientVendorPairRepeated", "similarContractAmount", "evidenceUrlPresent"])
  ];
}

function buildRewardInputCandidates(): RewardPossibilityInputCandidate[] {
  return [
    {
      candidateId: "demo-reward-high",
      sourceType: "risk_score",
      subjectKey: "subject:demo-high",
      riskScore: 90,
      riskGrade: "A",
      rewardSignals: ["recoverableAmountSignal", "lossPreventionSignal", "evidenceClaritySignal"],
      recordIds: ["demoA_0", "demoA_1"],
      amountInfo: { subsidyAmount: 20_000_000, executionAmount: 18_000_000 },
      evidence: { fixture: true, evidenceUrl: "https://example.go.kr/evidence/demo-reward" },
      reason: "환수 가능성과 손실방지 가능성 신호가 함께 확인된 보상/포상 가능성 검토 후보입니다.",
      createdAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
      isFixtureBased: true
    }
  ];
}

function buildLlmInputCandidates(): LlmExplanationCandidateInput[] {
  return [
    {
      candidateId: "demo-llm-high",
      subjectKey: "subject:demo-high",
      riskScore: 90,
      riskGrade: "A",
      rewardPossibilityScore: 80,
      rewardPossibilityLevel: "High",
      sourceCandidateIds: ["demo-repeat", "demo-address", "demo-output", "demo-contractor"],
      ruleSummaries: ["반복 수급 탐지 결과", "동일 주소 다수 단체 탐지 결과", "계약업체 연관성 탐지 결과"],
      signals: ["repeatedRecipientPattern", "addressClusterPattern", "contractorNetworkPattern", "evidenceUrlPresent"],
      evidenceSummary: [
        "공개자료 기준 근거 URL: https://example.go.kr/a/0",
        "정산 자료 공개 여부 추가 확인 필요"
      ],
      reasons: ["여러 의심 신호가 함께 확인되어 추가 확인 필요 후보입니다."],
      isFixtureBased: true
    }
  ];
}

// ---------- 데모 결과 타입 ----------

export interface DemoRuleResult {
  ruleType: string;
  label: string;
  totalCandidates: number;
  topCount: number;
  examples: Array<{
    title: string;
    riskScore: number;
    riskLevel: string;
    reason: string;
    reviewRequired: boolean;
    isFixtureBased: boolean;
  }>;
}

export interface SubsidyEngineDemo {
  engineStatus: SubsidyEngineStatus;
  baseline: {
    kind: string;
    totalRecords: number;
    status: string;
    collectedCount: number;
    duplicateRate: number;
    missingRate: number;
  };
  rules: DemoRuleResult[];
  riskScore: {
    finalRiskScore: number;
    riskGrade: string;
    reason: string;
    reviewRequired: boolean;
    scoreBreakdown: Record<string, number>;
    gradeSummary: Record<string, number>;
  } | null;
  rewardScore: {
    rewardPossibilityScore: number;
    rewardPossibilityLevel: string;
    reason: string;
    reviewRequired: boolean;
    scoreBreakdown: Record<string, number>;
    disclaimers: string[];
    levelSummary: Record<string, number>;
  } | null;
  llmExplanation: {
    summary: string;
    whyFlagged: string[];
    keyEvidence: string[];
    additionalChecks: string[];
    rewardPossibilityNote?: string;
    reviewRequired: boolean;
  } | null;
  citationValidation: {
    status: string;
    mode: string;
    totalClaims: number;
    citedClaims: number;
    missingClaims: number;
    coreClaims: number;
    blockedPersonalInfoCount: number;
    blockedPrivateUrlCount: number;
    acceptedCitationTypes: string[];
  } | null;
  reportHints: { engine: string; command: string; outputDir: string }[];
  isFixtureBased: boolean;
  fixtureNotice: string;
  safetyNotice: string;
  generatedAt: string;
}

function topExamples(report: { topCandidates?: unknown[] }): DemoRuleResult["examples"] {
  const list = Array.isArray(report.topCandidates) ? report.topCandidates : [];
  return list.slice(0, 2).map((raw) => {
    const c = raw as Record<string, unknown>;
    const title =
      (typeof c.subjectKey === "string" && c.subjectKey) ||
      (typeof c.networkKey === "string" && c.networkKey) ||
      (typeof c.groupKey === "string" && c.groupKey) ||
      (typeof c.candidateId === "string" && c.candidateId) ||
      "검토 후보";
    return {
      title: String(title),
      riskScore: Number(c.riskScore ?? 0),
      riskLevel: String(c.riskLevel ?? ""),
      reason: String(c.reason ?? ""),
      reviewRequired: c.reviewRequired !== false,
      isFixtureBased: c.isRealData === true ? false : true
    };
  });
}

export function buildSubsidyEngineDemo(): SubsidyEngineDemo {
  // 1) 데이터 기준선 (fixture 1,000건)
  const baselineRecords: BaselineRecord[] = [];
  for (let i = 0; i < 1000; i++) {
    baselineRecords.push(
      baseRecord({
        id: `baseline_${i}`,
        fiscalYear: 2023 + (i % 3),
        localGovName: `표본시 ${i % 9}구`,
        projectName: `보조사업 ${i}`,
        projectNameCompactKey: `보조사업키${i}`,
        recipientName: `단체 ${i}`,
        normalizedRecipientName: `단체키${i}`,
        subsidyAmount: 1_000_000 + i * 137,
        sourceUrl: i % 7 === 0 ? undefined : `https://example.go.kr/s/${i}`,
        evidenceUrl: i % 5 === 0 ? undefined : `https://example.go.kr/e/${i}`
      })
    );
  }
  const quality = computeBaselineQuality(baselineRecords);

  // 2) 룰 탐지 (실제 룰 엔진을 fixture 트리거 입력으로 구동)
  const repeatAddrRecords = buildRepeatAndAddressRecords();
  const repeatReport = generateRepeatRiskReport(repeatAddrRecords);
  const addressReport = generateAddressClusterRiskReport(repeatAddrRecords);
  const outputReport = generateOutputSettlementRiskReport(buildOutputSettlementRecords());
  const spendingReport = generateSpendingAnomalyRiskReport(buildSpendingRecords());
  const contractorReport = generateContractorNetworkRiskReport(buildContractorEdges());

  const rules: DemoRuleResult[] = [
    { ruleType: "repeat_subsidy", label: "반복 수급 탐지", report: repeatReport },
    { ruleType: "address_cluster", label: "동일 주소 다수 단체 탐지", report: addressReport },
    { ruleType: "output_settlement", label: "결과물 부족/정산 확인 필요 탐지", report: outputReport },
    { ruleType: "spending_anomaly", label: "예산 집행 이상 패턴 탐지", report: spendingReport },
    { ruleType: "contractor_network", label: "계약업체 연관성 탐지", report: contractorReport }
  ].map(({ ruleType, label, report }) => {
    const r = report as { topCandidates?: unknown[]; totalCandidates?: number };
    return {
      ruleType,
      label,
      totalCandidates: Number(r.totalCandidates ?? (Array.isArray(r.topCandidates) ? r.topCandidates.length : 0)),
      topCount: Array.isArray(r.topCandidates) ? r.topCandidates.length : 0,
      examples: topExamples(r)
    };
  });

  // 3) 100점 위험점수
  const riskReport = generateRiskScoreReport(buildScoreInputCandidates(), { isFixtureBased: true });
  const riskTop = riskReport.topScores[0];
  const riskScore = riskTop
    ? {
        finalRiskScore: riskTop.finalRiskScore,
        riskGrade: riskTop.riskGrade,
        reason: riskTop.reason,
        reviewRequired: riskTop.reviewRequired,
        scoreBreakdown: riskTop.scoreBreakdown as unknown as Record<string, number>,
        gradeSummary: riskReport.gradeSummary as unknown as Record<string, number>
      }
    : null;

  // 4) 보상가능성 점수
  const rewardReport = generateRewardPossibilityScoreReport(buildRewardInputCandidates(), { isFixtureBased: true });
  const rewardTop = rewardReport.topScores[0];
  const rewardScore = rewardTop
    ? {
        rewardPossibilityScore: rewardTop.rewardPossibilityScore,
        rewardPossibilityLevel: rewardTop.rewardPossibilityLevel,
        reason: rewardTop.reason,
        reviewRequired: rewardTop.reviewRequired,
        scoreBreakdown: rewardTop.scoreBreakdown as unknown as Record<string, number>,
        disclaimers: rewardTop.disclaimers,
        levelSummary: rewardReport.levelSummary as unknown as Record<string, number>
      }
    : null;

  // 5) LLM 설명형 분석 (deterministic fallback)
  const llmReport = generateLlmExplanationReport(buildLlmInputCandidates(), { isFixtureBased: true });
  const llmTop = llmReport.explanations[0];
  const llmExplanation = llmTop
    ? {
        summary: llmTop.summary,
        whyFlagged: llmTop.whyFlagged,
        keyEvidence: llmTop.keyEvidence,
        additionalChecks: llmTop.additionalChecks,
        rewardPossibilityNote: llmTop.rewardPossibilityNote,
        reviewRequired: llmTop.reviewRequired
      }
    : null;

  // 6) 근거 검증 (citation validation)
  const citationReport = validateLlmExplanationReportCitations(llmReport, "warning");
  const acceptedTypes = Array.from(
    new Set(citationReport.claimResults.flatMap((c) => c.acceptedCitationTypes))
  );
  const citationValidation = {
    status: citationReport.status,
    mode: citationReport.mode,
    totalClaims: citationReport.totalClaims,
    citedClaims: citationReport.citedClaims,
    missingClaims: citationReport.missingClaims,
    coreClaims: citationReport.coreClaims,
    blockedPersonalInfoCount: citationReport.blockedPersonalInfoCount,
    blockedPrivateUrlCount: citationReport.blockedPrivateUrlCount,
    acceptedCitationTypes: acceptedTypes
  };

  return {
    engineStatus: getSubsidyEngineStatus(),
    baseline: {
      kind: "fixture",
      totalRecords: quality.totalRecords,
      status: "실데이터 기준선 구축 전 · fixture 기반 검증",
      collectedCount: quality.totalRecords,
      duplicateRate: quality.duplicateRate,
      missingRate: quality.missingRate
    },
    rules,
    riskScore,
    rewardScore,
    llmExplanation,
    citationValidation,
    reportHints: [
      { engine: "반복 수급", command: "npm run risk:repeat -- --fixture 1000", outputDir: "data/risk/repeat/runs/" },
      { engine: "동일 주소", command: "npm run risk:address-cluster -- --fixture 1000", outputDir: "data/risk/address-cluster/runs/" },
      { engine: "결과물/정산", command: "npm run risk:output-settlement -- --fixture 1000", outputDir: "data/risk/output-settlement/runs/" },
      { engine: "예산 집행 이상", command: "npm run risk:spending -- --fixture 1000", outputDir: "data/risk/spending/runs/" },
      { engine: "계약업체 연관성", command: "npm run risk:contractor-network -- --fixture 1000", outputDir: "data/risk/contractor-network/runs/" },
      { engine: "위험점수", command: "npm run risk:score -- --fixture 1000", outputDir: "data/risk/score/runs/" },
      { engine: "보상가능성", command: "npm run reward:score -- --fixture 1000", outputDir: "data/reward/score/runs/" },
      { engine: "LLM 설명형 분석", command: "npm run analysis:llm-explain -- --fixture 100", outputDir: "data/analysis/llm-explanation/runs/" },
      { engine: "근거 검증", command: "npm run validate:citations -- --fixture", outputDir: "data/analysis/citation-validation/runs/" }
    ],
    isFixtureBased: true,
    fixtureNotice: SUBSIDY_DEMO_FIXTURE_NOTICE,
    safetyNotice: SUBSIDY_DEMO_SAFETY_NOTICE,
    generatedAt: new Date().toISOString()
  };
}
