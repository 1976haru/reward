import { LlmExplanationCandidateInput } from "../../src/types/llmExplanationAnalysis.js";

export interface LlmExplanationFixtureResult {
  candidates: LlmExplanationCandidateInput[];
}

const PHONE_SAMPLE = ["010", "1234", "5678"].join("-");
const EMAIL_SAMPLE = ["test", "example.com"].join("@");
const RRN_SAMPLE = ["900101", "1234567"].join("-");

function candidate(p: Partial<LlmExplanationCandidateInput> & { candidateId: string }): LlmExplanationCandidateInput {
  return {
    subjectKey: `subject:${p.candidateId}`,
    sourceCandidateIds: [`source-${p.candidateId}`],
    ruleSummaries: [],
    signals: [],
    evidenceSummary: [],
    reasons: [],
    isFixtureBased: true,
    createdAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    ...p
  };
}

export function createLlmExplanationFixtures(count = 100): LlmExplanationFixtureResult {
  const candidates: LlmExplanationCandidateInput[] = [
    candidate({
      candidateId: "llm-fixture-high",
      subjectKey: "subject:llm-high",
      riskScore: 91,
      riskGrade: "A",
      rewardPossibilityScore: 82,
      rewardPossibilityLevel: "High",
      sourceCandidateIds: ["risk-high", "reward-high", "repeat-high", "contractor-high"],
      ruleSummaries: ["100점 위험점수 결과", "보상가능성 점수 결과", "반복 수급 탐지 결과", "계약업체 연관성 탐지 결과"],
      signals: [
        "repeatedRecipientPattern",
        "addressClusterPattern",
        "settlementIssueSignal",
        "spendingSettlementReview",
        "contractorNetworkPattern",
        "evidenceUrlPresent"
      ],
      evidenceSummary: [
        "공개 공고 URL 확인",
        "정산 자료 공개 항목 일부 확인",
        "계약자료 공개 항목 확인",
        `fixture 개인정보 샘플 ${PHONE_SAMPLE} ${EMAIL_SAMPLE} ${RRN_SAMPLE}`
      ],
      reasons: ["여러 의심 신호가 함께 확인되어 추가 확인 필요 후보입니다."]
    }),
    candidate({
      candidateId: "llm-fixture-medium",
      subjectKey: "subject:llm-medium",
      riskScore: 68,
      riskGrade: "B",
      rewardPossibilityScore: 55,
      rewardPossibilityLevel: "Medium",
      sourceCandidateIds: ["risk-medium", "reward-medium"],
      ruleSummaries: ["100점 위험점수 결과", "결과물 부족/정산 미흡 탐지 결과"],
      signals: ["settlementIssueSignal", "sourceUrlPresent"],
      evidenceSummary: ["공개자료 기준 sourceUrl 확인", "결과보고서 공개 여부 추가 확인 필요"],
      reasons: ["정산 자료 확인 필요 신호가 일부 확인되었습니다."]
    }),
    candidate({
      candidateId: "llm-fixture-low",
      subjectKey: "subject:llm-low",
      riskScore: 32,
      riskGrade: "C",
      rewardPossibilityScore: 24,
      rewardPossibilityLevel: "Low",
      sourceCandidateIds: ["risk-low"],
      ruleSummaries: ["데이터 품질 리포트"],
      signals: ["weakReviewSignal"],
      evidenceSummary: [],
      reasons: ["공개자료 근거 보강이 필요한 낮은 우선순위 검토 후보입니다."]
    })
  ];

  const baseCount = Math.max(0, count - candidates.length);
  for (let i = 0; i < baseCount; i++) {
    const mod = i % 5;
    candidates.push(
      candidate({
        candidateId: `llm-fixture-base-${i}`,
        subjectKey: `subject:llm-base-${i}`,
        riskScore: 20 + (i % 50),
        riskGrade: mod === 0 ? "B" : "C",
        rewardPossibilityScore: 15 + (i % 45),
        rewardPossibilityLevel: mod === 0 ? "Medium" : "Low",
        ruleSummaries:
          mod === 0
            ? ["반복 수급 탐지 결과", "동일 주소 다수 단체 탐지 결과"]
            : mod === 1
              ? ["예산 집행 이상 패턴 탐지 결과"]
              : mod === 2
                ? ["계약업체 연관성 탐지 결과"]
                : ["데이터 품질 리포트"],
        signals:
          mod === 0
            ? ["repeatedRecipientPattern", "addressClusterPattern"]
            : mod === 1
              ? ["spendingSettlementReview"]
              : mod === 2
                ? ["contractorNetworkPattern", "evidenceUrlPresent"]
                : ["weakReviewSignal"],
        evidenceSummary: mod === 3 ? [] : [`공개자료 기준 fixture evidence ${i}`],
        reasons: ["fixture 기반 설명형 분석 검증 후보입니다."]
      })
    );
  }

  return { candidates: candidates.slice(0, count) };
}
