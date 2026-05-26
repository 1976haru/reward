// 보조금 신고 전 사실점검 11항목 합성 fixture (체크리스트 65).
//
// 합성 데이터이며 실제 단체·개인과 무관하다. 개인정보 원문은 포함하지 않는다.
// PASS / PASS_WITH_WARNINGS / NEEDS_FIX / BLOCKED 케이스를 모두 만든다.

import type { SubsidyFactCheckInput } from "../../src/types/subsidyFactCheck.js";

export interface SubsidyFactCheckFixtureSet {
  cases: SubsidyFactCheckInput[];
}

/** 모든 항목 충족 — PASS, canGenerateReportDraft=true. */
function fullyReadyCase(): SubsidyFactCheckInput {
  return {
    candidateId: "fx-pass-001",
    evidenceIsPublic: true,
    sourceUrl: "https://example.org/notice/1",
    sourceFileName: "subsidy_2024.csv",
    sourceRowNumber: 12,
    collectedAt: "2026-05-01T00:00:00.000Z",
    parsedAt: "2026-05-01T00:10:00.000Z",
    normalizedRecipientName: "정상검토대상협회",
    normalizedProjectName: "청년지원사업",
    amount: 30_000_000,
    fiscalYear: 2024,
    agencyName: "가상시청",
    ruleHits: ["repeat_recipient", "similar_project_repeat"],
    finalRiskScore: 72,
    rewardPossibilityScore: 55,
    explanation: {
      summary: "공개자료 기준 검토 후보 설명.",
      whyFlagged: ["반복수급 검토 후보"],
      keyEvidence: ["공시URL:https://example.org/notice/1"],
      additionalChecks: ["동일 기관 여부 확인"]
    },
    citationStrictPassed: true,
    privacyScanPassed: true,
    reviewerName: "검토자A",
    reviewStatus: "approved",
    reviewMemo: "공개자료 근거 확인 후 승인",
    isFixtureBased: true
  };
}

/** 일부 보강 필요(WARNING) — 점수/룰 없음, 그러나 차단 사유 없음 → PASS_WITH_WARNINGS, 초안 가능. */
function warningCase(): SubsidyFactCheckInput {
  return {
    candidateId: "fx-warn-002",
    evidenceIsPublic: true,
    sourceUrl: "https://example.org/notice/2",
    collectedAt: "2026-05-02T00:00:00.000Z",
    normalizedRecipientName: "검토대상단체",
    normalizedProjectName: "마을공동체사업",
    fiscalYear: 2024,
    // amount/agency 일부 누락 → WARNING
    // ruleHits 없음 → WARNING, finalRiskScore만 → WARNING
    finalRiskScore: 60,
    explanation: {
      summary: "설명 요약만 있음."
      // 일부 누락 → WARNING
    },
    citationStrictPassed: true,
    privacyScanPassed: true,
    reviewerName: "검토자B",
    reviewStatus: "approved",
    isFixtureBased: true
  };
}

/** strict citation 실패 → BLOCKED, 초안 불가. */
function citationFailCase(): SubsidyFactCheckInput {
  return {
    candidateId: "fx-cite-fail-003",
    evidenceIsPublic: true,
    sourceUrl: "https://example.org/notice/3",
    collectedAt: "2026-05-03T00:00:00.000Z",
    normalizedRecipientName: "검토대상단체",
    normalizedProjectName: "홍보영상사업",
    amount: 20_000_000,
    fiscalYear: 2024,
    agencyName: "가상군청",
    ruleHits: ["missing_output_settlement"],
    finalRiskScore: 65,
    rewardPossibilityScore: 40,
    explanation: {
      summary: "설명",
      whyFlagged: ["정산 누락 검토 후보"],
      keyEvidence: ["공시URL:https://example.org/notice/3"],
      additionalChecks: ["정산 공시 시점 확인"]
    },
    citationStrictPassed: false, // 차단 사유
    privacyScanPassed: true,
    reviewerName: "검토자C",
    reviewStatus: "approved",
    isFixtureBased: true
  };
}

/** 개인정보 스캔 실패 → BLOCKED, 초안 불가. */
function privacyFailCase(): SubsidyFactCheckInput {
  return {
    candidateId: "fx-privacy-fail-004",
    evidenceIsPublic: true,
    sourceUrl: "https://example.org/notice/4",
    collectedAt: "2026-05-04T00:00:00.000Z",
    normalizedRecipientName: "검토대상단체",
    normalizedProjectName: "축제운영사업",
    amount: 800_000_000,
    fiscalYear: 2024,
    agencyName: "가상시청",
    ruleHits: ["budget_anomaly"],
    finalRiskScore: 85,
    rewardPossibilityScore: 60,
    explanation: {
      summary: "설명",
      whyFlagged: ["예산집행 이상치 검토 후보"],
      keyEvidence: ["공시URL:https://example.org/notice/4"],
      additionalChecks: ["사업 규모 적정성 확인"]
    },
    citationStrictPassed: true,
    privacyScanPassed: false, // 차단 사유
    privacyScanFindings: ["계좌번호 패턴 의심"],
    reviewerName: "검토자D",
    reviewStatus: "approved",
    isFixtureBased: true
  };
}

/** 사람 검토 없음 + 비공개 자료 → BLOCKED, 초안 불가. */
function noReviewCase(): SubsidyFactCheckInput {
  return {
    candidateId: "fx-noreview-005",
    hasLoginRequiredSource: true, // 공개자료 아님 → 차단
    // 출처 없음 → FAIL
    normalizedProjectName: "사업명만 있음",
    citationStrictPassed: false, // 차단
    privacyScanPassed: false, // 차단
    // 사람 검토 기록 없음 → 차단
    isFixtureBased: true
  };
}

export function createSubsidyFactCheckFixtures(): SubsidyFactCheckFixtureSet {
  return {
    cases: [fullyReadyCase(), warningCase(), citationFailCase(), privacyFailCase(), noReviewCase()]
  };
}
