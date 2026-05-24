import { CitationReference } from "./citationValidation.js";

export interface LlmExplanationCandidateInput {
  candidateId: string;
  subjectKey?: string;
  riskScore?: number;
  riskGrade?: string;
  rewardPossibilityScore?: number;
  rewardPossibilityLevel?: string;
  sourceCandidateIds?: string[];
  ruleSummaries?: string[];
  signals?: string[];
  evidenceSummary?: string[];
  reasons?: string[];
  isFixtureBased?: boolean;
  createdAt?: string;
}

export interface LlmExplanationInput {
  candidates: LlmExplanationCandidateInput[];
  sourceNote?: string;
  isFixtureBased?: boolean;
}

export interface LlmExplanationResult {
  explanationId: string;
  candidateId: string;
  subjectKey?: string;
  summary: string;
  whyFlagged: string[];
  keyEvidence: string[];
  riskSignals: string[];
  rewardPossibilityNote?: string;
  additionalChecks: string[];
  limitations: string[];
  safetyDisclaimers: string[];
  reviewRequired: boolean;
  createdAt: string;
  isFixtureBased?: boolean;
  // 체크리스트 25: 근거 검증용 citation. 섹션별(claimCitations) 또는 공통(citations)으로 연결한다.
  sourceCandidateIds?: string[];
  citations?: CitationReference[];
  claimCitations?: Record<string, CitationReference[]>;
}

export interface LlmExplanationReport {
  runId: string;
  totalInputCandidates: number;
  totalExplanations: number;
  explanations: LlmExplanationResult[];
  createdAt: string;
  notes: string[];
  isFixtureBased: boolean;
  sourceNote?: string;
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface LlmExplanationOptions {
  runId?: string;
  limit?: number;
  isFixtureBased?: boolean;
  sourceNote?: string;
  promptVersion?: string;
  // 체크리스트 25: 리포트 저장 전 근거 검증 게이트. 기본은 비강제(non-strict)로 시작한다.
  strictCitationValidation?: boolean;
}

export interface SafeLlmPromptPayload {
  promptVersion: string;
  systemInstruction: string;
  userPayload: string;
  safetyRules: string[];
  deterministicFallbackOnly: boolean;
}

export const LLM_EXPLANATION_FORBIDDEN_PHRASES = [
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"],
  ["횡령", "확정"],
  ["담합", "확정"],
  ["유착", "확정"],
  ["환수", "대상", "확정"],
  ["신고", "확정"],
  ["보상금", "지급", "확정"],
  ["포상금", "지급", "확정"],
  ["보상금", "받을", "수", "있음"],
  ["무조건", "신고"],
  ["반드시", "신고"]
].map((parts) => parts.join(" "));

export const LLM_EXPLANATION_RECOMMENDED_PHRASES = [
  "의심 신호",
  "검토 후보",
  "추가 확인 필요",
  "공개자료 기준",
  "사실관계 확인 필요",
  "정산 자료 확인 필요",
  "증빙 보완 여부 확인 필요",
  "사람 검토 필요",
  "기관 기준 확인 필요",
  "보상/포상 가능성 검토"
] as const;

export const LLM_EXPLANATION_SAFETY_DISCLAIMERS = [
  "AI 설명은 법률 자문, 수사 판단, 기관 심사 판단을 대체하지 않습니다.",
  "본 결과는 공개자료 기준의 검토 보조 자료이며 사실관계 확인이 필요합니다.",
  "보상/포상 가능성 검토는 공식 기준과 기관 심사 절차 확인이 필요합니다.",
  "자동 신고를 수행하지 않으며 사람 검토가 필요합니다."
] as const;

export const LLM_EXPLANATION_NOTICE =
  "LLM 설명형 분석 모듈은 위험점수, 보상가능성 점수, 룰 기반 탐지 결과를 사람이 이해할 수 있는 중립 설명으로 정리하는 보조 모듈입니다. " +
  "이번 단계에서는 실제 LLM API를 호출하지 않고 deterministic fallback 분석기로 검증합니다. " +
  "개인정보민감정보비공개자료는 prompt, explanation, report에 포함하지 않습니다.";
