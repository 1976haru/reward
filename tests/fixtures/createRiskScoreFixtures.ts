import { UnifiedRiskInputCandidate } from "../../src/types/riskScoreModel.js";

export interface RiskScoreFixtureResult {
  candidates: UnifiedRiskInputCandidate[];
}

function candidate(p: Partial<UnifiedRiskInputCandidate> & { candidateId: string; ruleType: UnifiedRiskInputCandidate["ruleType"]; subjectKey: string }): UnifiedRiskInputCandidate {
  return {
    riskScore: 40,
    recordIds: [`record-${p.subjectKey}`],
    signals: [],
    evidence: { fixture: true, evidenceUrl: `https://example.go.kr/evidence/${p.candidateId}` },
    createdAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
    isFixtureBased: true,
    ...p
  };
}

export function createRiskScoreFixtures(count = 1000): RiskScoreFixtureResult {
  const candidates: UnifiedRiskInputCandidate[] = [];

  const highSubject = "subject:fixture-high";
  candidates.push(
    candidate({
      candidateId: "high-repeat",
      ruleType: "repeat_subsidy",
      subjectKey: highSubject,
      riskScore: 92,
      recordIds: ["high-r1", "high-r2"],
      signals: ["RECIPIENT_KEY_MATCH", "PROJECT_SIMILAR", "FISCAL_YEAR_ADJACENT", "AMOUNT_SIMILAR", "EVIDENCE_PRESENT"],
      reason: "반복성과 금액 유사 신호가 함께 확인되어 우선 검토 후보입니다."
    }),
    candidate({
      candidateId: "high-address",
      ruleType: "address_cluster",
      subjectKey: highSubject,
      riskScore: 85,
      recordIds: ["high-r1", "high-r3"],
      signals: ["ADDRESS_KEY_GROUP", "DISTINCT_RECIPIENTS", "REPEATED_YEARS", "TOTAL_AMOUNT", "EVIDENCE_COVERAGE"]
    }),
    candidate({
      candidateId: "high-output",
      ruleType: "output_settlement",
      subjectKey: highSubject,
      riskScore: 90,
      recordIds: ["high-r1"],
      signals: ["missingPerformanceReport", "missingSettlementDocument", "missingResultReport", "missingEvidenceUrl", "missingSettlementAmount"]
    }),
    candidate({
      candidateId: "high-spending",
      ruleType: "spending_anomaly",
      subjectKey: highSubject,
      riskScore: 82,
      recordIds: ["high-r1"],
      signals: ["highServiceCostRatio", "repeatedSimilarAmount", "repeatedVendor"]
    }),
    candidate({
      candidateId: "high-contractor",
      ruleType: "contractor_network",
      subjectKey: highSubject,
      riskScore: 88,
      recordIds: ["high-r1"],
      signals: ["recipientVendorPairRepeated", "similarContractAmount", "sameOrAdjacentFiscalYear", "addressKeyRelated", "evidenceUrlPresent"]
    })
  );

  const midSubject = "subject:fixture-medium";
  candidates.push(
    candidate({
      candidateId: "medium-repeat",
      ruleType: "repeat_subsidy",
      subjectKey: midSubject,
      riskScore: 75,
      recordIds: ["mid-r1", "mid-r2"],
      signals: ["PROJECT_SIMILAR", "FISCAL_YEAR_SAME", "AMOUNT_SIMILAR"]
    }),
    candidate({
      candidateId: "medium-output",
      ruleType: "output_settlement",
      subjectKey: midSubject,
      riskScore: 64,
      recordIds: ["mid-r1"],
      signals: ["missingSettlementDocument", "missingExecutionAmount"]
    }),
    candidate({
      candidateId: "medium-spending",
      ruleType: "spending_anomaly",
      subjectKey: midSubject,
      riskScore: 61,
      recordIds: ["mid-r1"],
      signals: ["repeatedSimilarAmount"]
    })
  );

  const lowSubject = "subject:fixture-low";
  candidates.push(
    candidate({
      candidateId: "low-evidence",
      ruleType: "data_quality",
      subjectKey: lowSubject,
      riskScore: 30,
      recordIds: ["low-r1"],
      signals: ["sourceCoverage"]
    }),
    candidate({
      candidateId: "low-manual",
      ruleType: "manual",
      subjectKey: lowSubject,
      riskScore: 25,
      recordIds: ["low-r1"],
      signals: ["weak_review_signal"]
    })
  );

  const baseCount = Math.max(0, count - candidates.length);
  for (let i = 0; i < baseCount; i++) {
    candidates.push(
      candidate({
        candidateId: `base-${i}`,
        ruleType: i % 2 === 0 ? "manual" : "data_quality",
        subjectKey: `subject:base-${i}`,
        riskScore: 10 + (i % 15),
        recordIds: [`base-r${i}`],
        signals: ["weak_signal"]
      })
    );
  }

  return { candidates: candidates.slice(0, count) };
}
