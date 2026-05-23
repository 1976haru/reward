// 동일 주소 다수 단체 탐지 룰 표준 타입 (체크리스트 18).
//
// 본 모듈은 보조사업 기준선 데이터에서 같은 주소(normalizedAddressKey) 또는 같은 지역 주소 키
// (addressRegionKey)에 여러 단체(normalizedRecipientName)가 반복 등장하는
// "동일 주소 다수 단체 후보 / 추가 확인 필요 후보"를 찾기 위한 타입/상수를 정의한다.
//
// 중요:
//   - 위법 여부를 판단하지 않는다. "동일 주소 확정/위장 단체 확정/허위 단체 확정/부정수급 확정/불법/사기" 같은 단정 표현을 쓰지 않는다.
//   - 같은 주소에 여러 단체가 있어도 공유오피스·복지관·회관·공공시설·행정복지센터·공동체 공간일 수 있다(cautionNotes 로 반영).
//   - 대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않는다.
//   - 상세주소 원문은 groupKey/evidence/reason/report 에 넣지 않는다(정규화 키만 사용).
//
// 운영 기준: docs/ADDRESS_CLUSTER_RISK_RULE.md
// 본 모듈은 법률 자문을 대체하지 않으며, 결과는 사실관계 점검과 사람 검토가 필요하다.

// ---------- enum ----------

export const ADDRESS_CLUSTER_RISK_LEVELS = ["high", "medium", "low", "minimal"] as const;
export type AddressClusterRiskLevel = (typeof ADDRESS_CLUSTER_RISK_LEVELS)[number];

export const ADDRESS_KEY_TYPES = ["normalizedAddressKey", "addressRegionKey"] as const;
export type AddressKeyType = (typeof ADDRESS_KEY_TYPES)[number];

/** 신호 코드와 기본/최대 점수(Runbook §3). */
export const ADDRESS_CLUSTER_SIGNALS = {
  ADDRESS_KEY_GROUP: { label: "동일 normalizedAddressKey 그룹", score: 30 },
  REGION_KEY_GROUP: { label: "동일 addressRegionKey 그룹", score: 15 },
  DISTINCT_RECIPIENTS: { label: "같은 주소 후보 내 서로 다른 단체 수", score: 25 },
  REPEATED_YEARS: { label: "여러 회계연도 반복 등장", score: 10 },
  SIMILAR_PROJECTS: { label: "유사 사업명 후보 다수 존재", score: 15 },
  TOTAL_AMOUNT: { label: "같은 주소 후보 총 보조금액", score: 15 },
  EVIDENCE_COVERAGE: { label: "원문 URL/evidenceUrl 존재 비율", score: 5 },
  PUBLIC_FACILITY_HINT: { label: "복지관·회관·센터·공공시설 등 합리적 사유 가능성(주의·감점)", score: -15 }
} as const;
export type AddressClusterSignalCode = keyof typeof ADDRESS_CLUSTER_SIGNALS;

/** 공유오피스·복지관·공공시설 등 합리적 사유 가능성 힌트 키워드. */
export const PUBLIC_FACILITY_KEYWORDS: readonly string[] = [
  "복지관",
  "회관",
  "주민센터",
  "행정복지센터",
  "공공시설",
  "창업센터",
  "문화센터",
  "체육센터",
  "도서관",
  "경로당",
  "공유오피스",
  "공유 오피스",
  "공동체공간",
  "마을회관",
  "센터"
];

// ---------- 인터페이스 ----------

export interface MatchedSignal {
  code: AddressClusterSignalCode;
  label: string;
  score: number;
}

/** 증거용 레코드 요약 — 상세주소·개인정보 원문 제외(정규화 키·요약만). */
export interface AddressClusterRecordEvidence {
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

export interface AddressClusterRiskCandidate {
  candidateId: string;
  addressGroupKey: string; // 개인정보·상세주소 원문 미포함
  addressKeyType: AddressKeyType;
  involvedRecordIds: string[];
  distinctRecipientCount: number;
  fiscalYears: number[];
  totalSubsidyAmount: number;
  riskScore: number; // 0~100
  riskLevel: AddressClusterRiskLevel;
  matchedSignals: MatchedSignal[];
  evidence: AddressClusterRecordEvidence[];
  reason: string; // 중립 표현만
  cautionNotes: string[]; // 합리적 사유 가능성
  reviewRequired: boolean; // 항상 true
  createdAt: string;
}

export interface AddressClusterRiskReport {
  runId: string;
  generatedAt: string;
  isRealData: boolean;
  sourceNote: string;
  totalRecords: number;
  totalAddressGroups: number;
  totalCandidates: number;
  topCandidates: AddressClusterRiskCandidate[];
  signalSummary: Record<string, number>;
  notes: string[];
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface AddressClusterRiskOptions {
  limit?: number; // TOP N (기본 50)
  minScore?: number; // 후보 보존 최소 riskScore (기본 40)
  minDistinctRecipients?: number; // 후보 최소 서로 다른 단체 수 (기본 2)
  isRealData?: boolean;
  sourceNote?: string;
  runId?: string;
  outputDir?: string;
}

// ---------- 안내문 ----------

export const ADDRESS_CLUSTER_NOTICE =
  "본 모듈은 보조사업 데이터에서 같은 주소/지역 주소 키에 여러 단체가 반복 등장하는 '동일 주소 다수 단체 후보 / 추가 확인 필요 후보'를 찾는 보조 도구입니다. " +
  "위법 여부를 판단하지 않으며, 동일 주소/위장 단체/부정수급을 확정하지 않습니다. 모든 후보는 사람 검토 대상(reviewRequired=true)입니다. " +
  "같은 주소에 여러 단체가 있어도 공유오피스·복지관·회관·주민센터·행정복지센터·공공시설·공동체 공간일 수 있으므로 합리적 사유 가능성을 함께 검토해야 합니다. " +
  "대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않으며, 상세주소·개인정보 원문은 저장·노출하지 않습니다.";
