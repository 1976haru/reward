// 결과물 부족·정산 확인 필요 탐지 룰 표준 타입 (체크리스트 19).
//
// 본 모듈은 보조사업 기준선 데이터에서 성과보고서/정산서/결과보고서/결과물 URL/증빙 URL/첨부파일 등
// 공개 근거가 부족한 "결과물 누락 후보 / 정산 확인 필요 후보 / 증빙 보완 필요 후보"를
// 찾기 위한 타입/상수를 정의한다.
//
// 중요:
//   - 위법 여부를 판단하지 않는다. "정산 미이행 확정/결과물 미제출 확정/부정수급 확정/불법/사기" 같은 단정 표현을 쓰지 않는다.
//   - 공개자료에 없다는 것은 "확인 필요"일 뿐 실제 미제출 확정이 아니다.
//   - 로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않는다.
//   - 개인정보 원문은 evidence/reason/report 에 넣지 않는다.
//
// 운영 기준: docs/OUTPUT_SETTLEMENT_RISK_RULE.md
// 본 모듈은 법률 자문을 대체하지 않으며, 결과는 사실관계 점검과 사람 검토가 필요하다.

// ---------- enum ----------

export const OUTPUT_SETTLEMENT_RISK_LEVELS = ["high", "medium", "low", "minimal"] as const;
export type OutputSettlementRiskLevel = (typeof OUTPUT_SETTLEMENT_RISK_LEVELS)[number];

/** 누락/근거 신호 코드와 점수(Runbook §3). 음수는 근거 신뢰도 보조(감점). */
export const OUTPUT_SETTLEMENT_SIGNALS = {
  missingPerformanceReport: { label: "성과보고서/성과자료 URL·첨부파일 없음", score: 20 },
  missingSettlementDocument: { label: "정산서/정산 결과 자료 없음", score: 25 },
  missingResultReport: { label: "결과보고서/결과물 URL 없음", score: 20 },
  missingEvidenceUrl: { label: "evidenceUrl/sourceUrl 없음", score: 15 },
  missingAttachment: { label: "첨부파일 메타데이터 없음", score: 10 },
  missingSettlementAmount: { label: "settlementAmount 없음", score: 10 },
  missingExecutionAmount: { label: "executionAmount 없음", score: 5 },
  missingReturnAmountAfterIssue: { label: "환수/반납 문맥은 있으나 금액 없음", score: 10 },
  projectEndedLongAgo: { label: "사업 종료 후 일정 기간 경과", score: 10 },
  publicSourceConfirmed: { label: "공개자료 원문 확인됨(근거 신뢰도 보조)", score: -5 }
} as const;
export type OutputSettlementSignalCode = keyof typeof OUTPUT_SETTLEMENT_SIGNALS;

/** projectEndedLongAgo 판정 기준 — 사업 종료(또는 회계연도) 후 경과 연수. */
export const OUTPUT_SETTLEMENT_ENDED_YEARS = 2;

// ---------- 인터페이스 ----------

export interface MissingSignal {
  code: OutputSettlementSignalCode;
  label: string;
  score: number;
}

/** 증거용 레코드 요약 — 개인정보 원문(전화/주민번호/계좌/상세주소) 제외. URL 존재 여부 위주. */
export interface OutputSettlementRecordEvidence {
  id: string;
  fiscalYear?: number;
  localGovName?: string;
  projectName?: string;
  projectNameCompactKey?: string;
  normalizedRecipientName?: string;
  documentType?: string;
  subsidyAmount?: number;
  executionAmount?: number;
  settlementAmount?: number;
  returnAmount?: number;
  hasSourceUrl: boolean;
  hasEvidenceUrl: boolean;
  hasPerformanceReport: boolean;
  hasSettlementDocument: boolean;
  hasResultReport: boolean;
  hasResultUrl: boolean;
  hasAttachment: boolean;
  attachmentCount: number;
}

export interface OutputSettlementRiskCandidate {
  candidateId: string;
  recordId: string;
  groupKey: string; // 개인정보 원문 미포함
  riskScore: number; // 0~100
  riskLevel: OutputSettlementRiskLevel;
  missingSignals: MissingSignal[];
  evidence: OutputSettlementRecordEvidence;
  reason: string; // 중립 표현만
  reviewRequired: boolean; // 항상 true
  createdAt: string;
}

export interface OutputSettlementRiskReport {
  runId: string;
  generatedAt: string;
  isRealData: boolean;
  sourceNote: string;
  totalRecords: number;
  totalCandidates: number;
  topCandidates: OutputSettlementRiskCandidate[];
  signalSummary: Record<string, number>;
  notes: string[];
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface OutputSettlementRiskOptions {
  limit?: number; // TOP N (기본 50)
  minScore?: number; // 후보 보존 최소 riskScore (기본 40)
  /** projectEndedLongAgo 기준일(연도). 기본은 현재 연도. */
  currentYear?: number;
  isRealData?: boolean;
  sourceNote?: string;
  runId?: string;
  outputDir?: string;
}

// ---------- 안내문 ----------

export const OUTPUT_SETTLEMENT_NOTICE =
  "본 모듈은 보조사업 데이터에서 성과보고서·정산서·결과보고서·결과물 URL·증빙 URL·첨부파일 등 공개 근거가 부족한 " +
  "'결과물 누락 후보 / 정산 확인 필요 후보 / 증빙 보완 필요 후보'를 찾는 보조 도구입니다. " +
  "위법 여부를 판단하지 않으며, 공개자료에 없다는 것은 '확인 필요'일 뿐 실제 미제출 확정이 아닙니다. " +
  "일부 지자체는 결과보고서·정산서를 별도 공개하지 않을 수 있고, 정산 정보는 내부 시스템에만 존재할 수 있습니다. " +
  "로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않으며, 개인정보 원문은 저장·노출하지 않습니다. " +
  "모든 후보는 사람 검토 대상(reviewRequired=true)입니다.";
