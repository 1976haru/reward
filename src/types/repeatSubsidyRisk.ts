// 반복 수급 탐지 룰 표준 타입 (체크리스트 17).
//
// 본 모듈은 보조사업 기준선 데이터에서 동일/유사 기관·주소·사업명이 반복 등장하는
// "반복 수급 후보 / 검토 필요 후보"를 찾기 위한 타입/상수를 정의한다.
//
// 중요:
//   - 위법 여부를 판단하지 않는다. "반복 수급 확정/부정수급 확정/불법/사기" 같은 단정 표현을 쓰지 않는다.
//   - 동일 기관/주소/유사 사업명/연도/금액은 의심 신호가 아니라 "검토 신호"로 표현한다.
//   - 대표자명·전화번호·상세주소는 단독 탐지 기준으로 사용하지 않는다(보조 신호만, 원문 미사용).
//   - 개인정보 원문은 groupKey/reason/evidence 에 넣지 않는다.
//
// 운영 기준: docs/REPEAT_SUBSIDY_RISK_RULE.md
// 본 모듈은 법률 자문을 대체하지 않으며, 결과는 사실관계 점검과 사람 검토가 필요하다.

// ---------- enum ----------

export const REPEAT_RISK_LEVELS = ["high", "medium", "low", "minimal"] as const;
export type RepeatRiskLevel = (typeof REPEAT_RISK_LEVELS)[number];

/** 신호 코드와 기본 점수(Runbook §3). */
export const REPEAT_RISK_SIGNALS = {
  RECIPIENT_KEY_MATCH: { label: "기관명 정규화 키 일치", score: 30 },
  RECIPIENT_NAME_SIMILAR: { label: "기관명 유사도 높음(likely 이상)", score: 20 },
  ADDRESS_KEY_MATCH: { label: "주소 정규화 키 일치", score: 25 },
  ADDRESS_REGION_MATCH: { label: "지역 주소 키 일치", score: 10 },
  PROJECT_SIMILAR: { label: "유사 사업명 후보(>=0.85 또는 키 일치)", score: 20 },
  FISCAL_YEAR_SAME: { label: "같은 회계연도", score: 10 },
  FISCAL_YEAR_ADJACENT: { label: "인접 회계연도(±1년)", score: 5 },
  AMOUNT_SIMILAR: { label: "보조금액 유사(차이 10% 이내)", score: 10 },
  EVIDENCE_PRESENT: { label: "원문 근거(evidenceUrl/sourceUrl) 존재", score: 5 },
  AUX_REP_PHONE: { label: "대표자명/전화번호 보조 신호(마스킹·해시)", score: 5 }
} as const;
export type RepeatRiskSignalCode = keyof typeof REPEAT_RISK_SIGNALS;

/** 대표자명/전화번호 보조 신호의 최대 가중치(단독 기준 금지). */
export const REPEAT_RISK_AUX_MAX_SCORE = 5;

// ---------- 인터페이스 ----------

export interface MatchedSignal {
  code: RepeatRiskSignalCode;
  label: string;
  score: number;
}

/** 증거용 레코드 요약 — 개인정보 원문(전화/주민번호/계좌/상세주소)은 포함하지 않는다. */
export interface RepeatRiskRecordEvidence {
  id: string;
  fiscalYear?: number;
  localGovName?: string;
  projectName?: string;
  projectNameCompactKey?: string;
  normalizedRecipientName?: string;
  normalizedAddressKey?: string;
  addressRegionKey?: string;
  subsidyAmount?: number;
  documentType?: string;
  sourceUrl?: string;
  evidenceUrl?: string;
}

export interface RepeatRiskCandidate {
  candidateId: string;
  involvedRecordIds: string[];
  riskScore: number; // 0~100
  riskLevel: RepeatRiskLevel;
  groupKey: string; // 개인정보 원문 미포함
  matchedSignals: MatchedSignal[];
  evidence: { left: RepeatRiskRecordEvidence; right: RepeatRiskRecordEvidence };
  reason: string; // 중립 표현만
  reviewRequired: boolean; // 항상 true
  createdAt: string;
}

export interface RepeatRiskReport {
  runId: string;
  generatedAt: string;
  /** fixture 기반 검증인지 표시(실데이터 탐지 완료 아님). */
  isRealData: boolean;
  sourceNote: string;
  totalRecords: number;
  totalPairsEvaluated: number;
  totalCandidates: number;
  topCandidates: RepeatRiskCandidate[];
  /** 신호별 등장 횟수 집계. */
  signalSummary: Record<string, number>;
  notes: string[];
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface RepeatRiskOptions {
  /** TOP N (기본 50). */
  limit?: number;
  /** 후보로 보존할 최소 riskScore (기본 40). */
  minScore?: number;
  /** 실데이터 여부(api/upload/manual). 기본 false(fixture). */
  isRealData?: boolean;
  sourceNote?: string;
  runId?: string;
  outputDir?: string;
}

// ---------- 안내문 ----------

export const REPEAT_RISK_NOTICE =
  "본 모듈은 보조사업 데이터에서 동일/유사 기관·주소·사업명이 반복 등장하는 '반복 수급 후보 / 검토 필요 후보'를 찾는 보조 도구입니다. " +
  "위법 여부를 판단하지 않으며, 반복 수급/부정수급을 확정하지 않습니다. 모든 후보는 사람 검토 대상(reviewRequired=true)입니다. " +
  "동일 주소는 공유공간·공공시설·복지관·회관일 수 있고, 같은 기관이 여러 보조사업을 수행하는 것은 정상일 수 있습니다. " +
  "대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않으며, 개인정보 원문은 저장·노출하지 않습니다.";
