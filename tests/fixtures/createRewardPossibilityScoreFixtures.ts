import { RewardPossibilityInputCandidate } from "../../src/types/rewardPossibilityScore.js";

export interface RewardPossibilityScoreFixtureResult {
  candidates: RewardPossibilityInputCandidate[];
}

function candidate(
  p: Partial<RewardPossibilityInputCandidate> & {
    candidateId: string;
    sourceType: RewardPossibilityInputCandidate["sourceType"];
    subjectKey: string;
  }
): RewardPossibilityInputCandidate {
  return {
    recordIds: [`record-${p.subjectKey}`],
    rewardSignals: [],
    evidence: { fixture: true, sourceUrl: `https://example.go.kr/source/${p.candidateId}` },
    createdAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    isFixtureBased: true,
    ...p
  };
}

export function createRewardPossibilityScoreFixtures(count = 1000): RewardPossibilityScoreFixtureResult {
  const candidates: RewardPossibilityInputCandidate[] = [];

  const highSubject = "subject:reward-high";
  candidates.push(
    candidate({
      candidateId: "reward-high-output",
      sourceType: "output_settlement",
      subjectKey: highSubject,
      riskScore: 92,
      riskLevel: "high",
      recordIds: ["reward-high-r1"],
      amountInfo: { subsidyAmount: 180000000, returnAmount: 12000000, currency: "KRW" },
      rewardSignals: [
        "returnAmountPresent",
        "settlementIssueSignal",
        "clearSubsidyAmount",
        "sourceUrlPresent",
        "evidenceUrlPresent",
        "attachmentPresent",
        "settlementDocumentPresent",
        "resultReportPresent",
        "multipleIndependentSources"
      ],
      evidence: {
        fixture: true,
        sourceUrl: "https://example.go.kr/source/reward-high-output",
        evidenceUrl: "https://example.go.kr/evidence/reward-high-output",
        attachmentPresent: true
      },
      reason: "정산 확인 필요 신호와 증거 URL이 함께 확인되어 보상/포상 가능성 검토 후보입니다."
    }),
    candidate({
      candidateId: "reward-high-repeat",
      sourceType: "repeat_subsidy",
      subjectKey: highSubject,
      riskScore: 88,
      riskLevel: "high",
      recordIds: ["reward-high-r1", "reward-high-r2"],
      amountInfo: { subsidyAmount: 180000000, currency: "KRW" },
      rewardSignals: ["repeatedRecipientPattern", "repeatedPatternWithAmount", "ongoingOrRecentProject"]
    }),
    candidate({
      candidateId: "reward-high-address",
      sourceType: "address_cluster",
      subjectKey: highSubject,
      riskScore: 82,
      riskLevel: "high",
      recordIds: ["reward-high-r1", "reward-high-r3"],
      amountInfo: { subsidyAmount: 180000000, currency: "KRW" },
      rewardSignals: ["addressClusterPattern", "largeSubsidyAmount"]
    }),
    candidate({
      candidateId: "reward-high-contractor",
      sourceType: "contractor_network",
      subjectKey: highSubject,
      riskScore: 86,
      riskLevel: "high",
      recordIds: ["reward-high-r1"],
      amountInfo: { contractAmount: 73000000, currency: "KRW" },
      rewardSignals: ["contractorNetworkPattern", "evidenceUrlPresent", "sourceUrlPresent"]
    }),
    candidate({
      candidateId: "reward-high-risk-score",
      sourceType: "risk_score",
      subjectKey: highSubject,
      riskScore: 91,
      riskGrade: "A",
      recordIds: ["reward-high-r1"],
      rewardSignals: ["highRiskScoreReference", "officialCriteriaReviewNeeded"]
    })
  );

  const mediumSubject = "subject:reward-medium";
  candidates.push(
    candidate({
      candidateId: "reward-medium-output",
      sourceType: "output_settlement",
      subjectKey: mediumSubject,
      riskScore: 65,
      riskLevel: "medium",
      recordIds: ["reward-mid-r1"],
      amountInfo: { subsidyAmount: 50000000, currency: "KRW" },
      rewardSignals: ["settlementIssueSignal", "sourceUrlPresent"]
    }),
    candidate({
      candidateId: "reward-medium-risk",
      sourceType: "risk_score",
      subjectKey: mediumSubject,
      riskScore: 66,
      riskGrade: "B",
      recordIds: ["reward-mid-r1"],
      rewardSignals: ["mediumRiskScoreReference", "officialCriteriaReviewNeeded"]
    }),
    candidate({
      candidateId: "reward-medium-repeat",
      sourceType: "repeat_subsidy",
      subjectKey: mediumSubject,
      riskScore: 60,
      recordIds: ["reward-mid-r1", "reward-mid-r2"],
      amountInfo: { subsidyAmount: 50000000, currency: "KRW" },
      rewardSignals: ["repeatedPatternWithAmount"]
    })
  );

  const lowSubject = "subject:reward-low";
  candidates.push(
    candidate({
      candidateId: "reward-low-manual",
      sourceType: "manual",
      subjectKey: lowSubject,
      riskScore: 22,
      recordIds: ["reward-low-r1"],
      rewardSignals: ["missingAmountInfo"],
      reason: "금액 또는 증거가 부족하여 기관 기준 확인 필요 상태입니다."
    }),
    candidate({
      candidateId: "reward-low-risk",
      sourceType: "risk_score",
      subjectKey: lowSubject,
      riskScore: 25,
      riskGrade: "C",
      recordIds: ["reward-low-r1"],
      rewardSignals: ["officialCriteriaReviewNeeded"]
    })
  );

  const baseCount = Math.max(0, count - candidates.length);
  for (let i = 0; i < baseCount; i++) {
    candidates.push(
      candidate({
        candidateId: `reward-base-${i}`,
        sourceType: i % 3 === 0 ? "manual" : i % 3 === 1 ? "risk_score" : "repeat_subsidy",
        subjectKey: `subject:reward-base-${i}`,
        riskScore: 10 + (i % 18),
        riskGrade: "C",
        recordIds: [`reward-base-r${i}`],
        rewardSignals: i % 5 === 0 ? ["sourceUrlPresent"] : ["weakReviewSignal"]
      })
    );
  }

  return { candidates: candidates.slice(0, count) };
}
