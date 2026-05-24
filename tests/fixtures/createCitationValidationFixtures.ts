import { ReportClaim } from "../../src/types/citationValidation.js";

// 개인정보 원문 샘플은 리터럴로 적지 않고 조립한다 (스캐너 오탐 방지).
const PHONE_SAMPLE = ["010", "1234", "5678"].join("-");
const EMAIL_SAMPLE = ["test", "example.com"].join("@");
const PUBLIC_URL = "https://www.example.go.kr/notice/2025/subsidy-1.html";
const EVIDENCE_URL = "https://opendata.example.go.kr/evidence/pkg-1001";
const ATTACH_URL = "https://www.example.go.kr/files/result-report-2025.pdf";
const LOGIN_URL = "https://intranet.example.go.kr/login?next=/case/1";
const PRIVATE_URL = "https://192.168.0.10/internal/case/1";

export interface CitationValidationFixtureResult {
  claims: ReportClaim[];
  llmResult: Record<string, unknown>;
  riskResult: Record<string, unknown>;
  rewardResult: Record<string, unknown>;
  publicUrl: string;
  evidenceUrl: string;
  attachmentUrl: string;
  loginUrl: string;
  privateUrl: string;
  phoneSample: string;
  emailSample: string;
}

function claim(p: Partial<ReportClaim> & { claimId: string; text: string; kind: ReportClaim["kind"] }): ReportClaim {
  return {
    section: p.section ?? "keyEvidence",
    citations: p.citations ?? [],
    ...p
  };
}

export function createCitationValidationFixtures(): CitationValidationFixtureResult {
  const claims: ReportClaim[] = [
    // 1) sourceUrl 근거가 있는 핵심 주장 → pass
    claim({
      claimId: "fx-core-source-url",
      text: "공개 공고 URL에서 동일 사업명 후보가 확인됩니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "source_url", sourceUrl: PUBLIC_URL }]
    }),
    // 2) evidenceUrl 근거가 있는 핵심 주장 → pass
    claim({
      claimId: "fx-core-evidence-url",
      text: "원문 증거 URL에서 정산 자료 공개 항목이 확인됩니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "evidence_url", evidenceUrl: EVIDENCE_URL }]
    }),
    // 3) sourceFileName + sourceRowNumber 근거 → pass
    claim({
      claimId: "fx-core-source-file",
      text: "업로드 자료에서 동일 주소 후보가 확인됩니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "source_file", sourceFileName: "subsidy-2025.xlsx", sourceRowNumber: 42 }]
    }),
    // 4) attachmentUrl 근거 → pass
    claim({
      claimId: "fx-core-attachment-url",
      text: "공개 첨부파일에서 결과보고서 후보가 확인됩니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "attachment_url", attachmentUrl: ATTACH_URL }]
    }),
    // 5) evidenceId 근거 → pass (강한 근거)
    claim({
      claimId: "fx-core-evidence-id",
      text: "증거 패키지에서 계약자료 공개 항목 후보가 확인됩니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "evidence_id", evidenceId: "evp-2025-0001" }]
    }),
    // 6) recordId 보조 근거만 있는 핵심 주장 → strict fail / warning warning
    claim({
      claimId: "fx-core-recordid-only",
      text: "유사 사업명 후보가 존재하는 것으로 보입니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "record_id", recordId: "rec-1001" }]
    }),
    // 7) 근거 없는 핵심 주장 → strict fail / warning warning
    claim({
      claimId: "fx-core-missing",
      text: "성과보고서 URL이 확인되지 않는 것으로 보입니다.",
      kind: "core",
      section: "keyEvidence",
      citations: []
    }),
    // 8) computed_model 근거가 있는 모델 계산 결과 → pass
    claim({
      claimId: "fx-computed-model",
      text: "위험점수 A등급 검토 후보로 분류됨",
      kind: "computed",
      section: "riskGrade",
      citations: [{ type: "computed_model", label: "모델 계산 결과 (검토 신호)" }]
    }),
    // 9) supporting 주장 + recordId → pass
    claim({
      claimId: "fx-supporting-cited",
      text: "공개자료 기준 sourceUrl 확인 항목입니다.",
      kind: "supporting",
      section: "evidenceSummary",
      citations: [{ type: "record_id", recordId: "rec-2001" }]
    }),
    // 10) supporting 주장, 근거 없음 → warning
    claim({
      claimId: "fx-supporting-missing",
      text: "결과보고서 공개 여부 추가 확인 필요.",
      kind: "supporting",
      section: "evidenceSummary",
      citations: []
    }),
    // 11) fixture citation → 인정되지만 fixture 기반으로 표시
    claim({
      claimId: "fx-fixture-citation",
      text: "fixture 기준 공개자료 근거 후보입니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "source_url", sourceUrl: PUBLIC_URL, isFixtureBased: true }]
    }),
    // 12) 로그인 필요 URL → 차단
    claim({
      claimId: "fx-login-url",
      text: "로그인 필요 자료에서 확인되는 후보입니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "source_url", sourceUrl: LOGIN_URL }]
    }),
    // 13) 비공개/내부 URL → 차단
    claim({
      claimId: "fx-private-url",
      text: "내부자료에서 확인되는 후보입니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "evidence_url", evidenceUrl: PRIVATE_URL }]
    }),
    // 14) 개인정보가 포함된 citation → 차단(fail)
    claim({
      claimId: "fx-personal-info",
      text: "공개자료 근거 후보입니다.",
      kind: "core",
      section: "keyEvidence",
      citations: [{ type: "source_url", sourceUrl: `https://www.example.go.kr/case?tel=${PHONE_SAMPLE}&mail=${EMAIL_SAMPLE}` }]
    }),
    // 15) disclaimer → citation 없이도 pass
    claim({
      claimId: "fx-disclaimer",
      text: "본 결과는 공개자료 기준 검토 보조이며 사람 검토가 필요합니다.",
      kind: "disclaimer",
      section: "safetyDisclaimers",
      citations: []
    })
  ];

  const llmResult = {
    explanationId: "explain_fixture_llm",
    candidateId: "llm-fixture-citation",
    isFixtureBased: true,
    sourceCandidateIds: ["risk-1", "reward-1"],
    summary: "공개자료 기준 검토 후보 요약입니다.",
    whyFlagged: ["위험점수가 높아 검토 후보로 분류되었습니다."],
    keyEvidence: [`공개자료 기준 근거 URL: ${PUBLIC_URL}`, "정산 자료 공개 여부 추가 확인 필요"],
    riskSignals: ["repeatedRecipientPattern"],
    rewardPossibilityNote: "보상/포상 가능성 검토 참고 점수입니다. 공식 기준 확인 필요.",
    additionalChecks: ["원문 공고와 선정 결과가 동일 사업인지 확인합니다."],
    limitations: ["공개자료 기준 설명입니다."],
    safetyDisclaimers: ["AI 설명은 기관 심사 판단을 대체하지 않습니다."],
    reviewRequired: true
  };

  const riskResult = {
    scoreId: "risk_fixture_1",
    subjectKey: "subject:risk-1",
    sourceCandidateIds: ["rec-r-1", "rec-r-2"],
    finalRiskScore: 88,
    riskGrade: "A",
    contributingSignals: [
      { component: "repetition", signal: "repeatedRecipientPattern", sourceCandidateId: "rec-r-1" }
    ],
    evidenceSummary: [`공개 공고 URL 확인: ${PUBLIC_URL}`, "정산 자료 공개 항목 일부 확인"],
    reason: "여러 의심 신호가 함께 확인되어 추가 확인 필요 후보입니다.",
    isFixtureBased: true
  };

  const rewardResult = {
    rewardScoreId: "reward_fixture_1",
    subjectKey: "subject:reward-1",
    sourceCandidateIds: ["rec-w-1"],
    rewardPossibilityScore: 80,
    rewardPossibilityLevel: "High",
    contributingSignals: [
      { component: "recovery_possibility", signal: "recoverableAmountSignal", sourceCandidateId: "rec-w-1" }
    ],
    evidenceSummary: ["공개자료 기준 환수 가능성 신호 일부 확인"],
    reason: "보상/포상 가능성 검토 우선순위가 높은 후보입니다. 공식 기준 확인 필요.",
    disclaimers: ["이 점수는 지급 여부 판단이 아니며 공식 기준 확인이 필요합니다."],
    isFixtureBased: true
  };

  return {
    claims,
    llmResult,
    riskResult,
    rewardResult,
    publicUrl: PUBLIC_URL,
    evidenceUrl: EVIDENCE_URL,
    attachmentUrl: ATTACH_URL,
    loginUrl: LOGIN_URL,
    privateUrl: PRIVATE_URL,
    phoneSample: PHONE_SAMPLE,
    emailSample: EMAIL_SAMPLE
  };
}