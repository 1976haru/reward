// 예산 집행 이상 패턴 탐지 룰 표준 타입 (체크리스트 20).
//
// 본 모듈은 보조사업 데이터에서 인건비/홍보비/용역비/장비구입비 등 특정 집행 항목의 과다 비중·
// 반복 지출 "예산 집행 이상 패턴 후보 / 정산 확인 필요 후보 / 추가 확인 필요 후보"를
// 찾기 위한 타입/상수를 정의한다.
//
// 중요:
//   - 위법 여부를 판단하지 않는다. "부정집행 확정/횡령 확정/부정수급 확정/불법/사기" 같은 단정 표현을 쓰지 않는다.
//   - 특정 항목 비중이 높거나 반복된다는 사실만으로 문제라고 단정하지 않는다(사업 유형상 정상일 수 있음).
//   - 지급처명은 vendorNameMasked 처럼 마스킹 값만 사용한다(개인정보 원문 미저장).
//   - 로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않는다.
//
// 운영 기준: docs/SPENDING_ANOMALY_RISK_RULE.md
// 본 모듈은 법률 자문을 대체하지 않으며, 결과는 정산 자료 확인과 사람 검토가 필요하다.

// ---------- enum ----------

export const SPENDING_ANOMALY_RISK_LEVELS = ["high", "medium", "low", "minimal"] as const;
export type SpendingAnomalyRiskLevel = (typeof SPENDING_ANOMALY_RISK_LEVELS)[number];

export const SPENDING_CATEGORIES = [
  "labor", // 인건비
  "promotion", // 홍보비
  "service", // 용역비
  "equipment", // 장비구입비
  "travel", // 여비
  "material", // 재료비
  "rent", // 임차료
  "other"
] as const;
export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

/** 신호 코드와 점수(Runbook §4). 음수는 근거 신뢰도 보조(감점). */
export const SPENDING_ANOMALY_SIGNAL_WEIGHTS = {
  highLaborCostRatio: { label: "인건비 비중이 기준 이상", score: 20 },
  highPromotionCostRatio: { label: "홍보비 비중이 기준 이상", score: 15 },
  highServiceCostRatio: { label: "용역비 비중이 기준 이상", score: 20 },
  highEquipmentCostRatio: { label: "장비구입비 비중이 기준 이상", score: 20 },
  repeatedSameCategory: { label: "같은 항목 반복 지출", score: 15 },
  repeatedSimilarAmount: { label: "같은 항목 유사 금액 반복", score: 15 },
  repeatedVendor: { label: "같은 지급처 반복", score: 15 },
  missingBreakdown: { label: "세부 지출내역 부족", score: 10 },
  missingReceiptEvidence: { label: "영수증·증빙 URL 부족", score: 10 },
  largeSingleSpending: { label: "단일 지출이 총액 대비 큼", score: 15 },
  publicSourceConfirmed: { label: "공개자료 원문 확인(근거 신뢰도 보조)", score: -5 }
} as const;
export type SpendingAnomalySignalCode = keyof typeof SPENDING_ANOMALY_SIGNAL_WEIGHTS;

/** 항목별 비중 이상치 기준(총 집행액 대비 비율). */
export const SPENDING_CATEGORY_THRESHOLDS: Record<string, number> = {
  labor: 0.5,
  promotion: 0.3,
  service: 0.5,
  equipment: 0.4
};

/** 반복 판정 기준(같은 항목/유사 금액/같은 지급처 N회 이상). */
export const SPENDING_REPEAT_THRESHOLD = 3;
/** 단일 지출 과다 기준(총액 대비 비율). */
export const SPENDING_LARGE_SINGLE_RATIO = 0.6;
/** 유사 금액 판정 허용 오차(비율). */
export const SPENDING_SIMILAR_AMOUNT_TOLERANCE = 0.1;

/** riskScore 등급 임계값. */
export const SPENDING_ANOMALY_RISK_THRESHOLDS = { high: 80, medium: 60, low: 40 } as const;

// ---------- 지출 라인아이템 / 요약 ----------

/** 단일 지출 항목. 지급처는 마스킹 값만 보관한다(개인정보 원문 미저장). */
export interface SpendingLineItem {
  category: SpendingCategory | string; // 정규화 전 라벨이 올 수 있음
  label?: string; // 항목 라벨(마스킹 후)
  amount: number;
  vendorNameMasked?: string; // 지급처 마스킹 값만 허용
  spendingDate?: string; // YYYY-MM-DD (선택)
  subItems?: SpendingLineItem[];
}

export interface SpendingBreakdownSummary {
  totalSpending: number;
  byCategory: Record<string, number>;
  categoryRatios: Record<string, number>;
  lineItemCount: number;
  /** 항목별 라인아이템 수. */
  categoryCounts: Record<string, number>;
  /** 유사 금액 반복이 감지된 카테고리. */
  similarAmountCategories: string[];
  /** 지급처(마스킹)별 지급 횟수·합계 상위. */
  topVendors: Array<{ vendorNameMasked: string; count: number; total: number }>;
  /** 단일 지출 최대 비중. */
  largestSingleRatio: number;
}

// ---------- 신호 / 후보 / 리포트 ----------

export interface SpendingAnomalySignal {
  code: SpendingAnomalySignalCode;
  label: string;
  score: number;
}

/** 증거용 요약 — 개인정보 원문(계좌/연락처/상세주소) 제외. */
export interface SpendingAnomalyRiskEvidence {
  id: string;
  fiscalYear?: number;
  localGovName?: string;
  projectName?: string;
  projectNameCompactKey?: string;
  normalizedRecipientName?: string;
  documentType?: string;
  subsidyAmount?: number;
  executionAmount?: number;
  totalSpending: number;
  categoryRatios: Record<string, number>;
  hasSpendingBreakdown: boolean;
  spendingEvidenceCount: number;
  topVendorsMasked: string[];
}

export interface SpendingAnomalyRiskCandidate {
  candidateId: string;
  recordId: string;
  groupKey: string;
  riskScore: number; // 0~100
  riskLevel: SpendingAnomalyRiskLevel;
  spendingSignals: SpendingAnomalySignal[];
  spendingBreakdownSummary: SpendingBreakdownSummary;
  evidence: SpendingAnomalyRiskEvidence;
  reason: string;
  cautionNotes: string[];
  reviewRequired: boolean; // 항상 true
  createdAt: string;
}

export interface SpendingAnomalyRiskReport {
  runId: string;
  generatedAt: string;
  isRealData: boolean;
  sourceNote: string;
  totalRecords: number;
  totalCandidates: number;
  topCandidates: SpendingAnomalyRiskCandidate[];
  signalSummary: Record<string, number>;
  notes: string[];
  reportJsonFile?: string;
  reportMdFile?: string;
}

export interface SpendingAnomalyRiskOptions {
  limit?: number; // TOP N (기본 50)
  minScore?: number; // 후보 보존 최소 riskScore (기본 40)
  isRealData?: boolean;
  sourceNote?: string;
  runId?: string;
  outputDir?: string;
}

// ---------- 안내문 ----------

export const SPENDING_ANOMALY_RISK_NOTICE =
  "본 모듈은 보조사업 데이터에서 인건비·홍보비·용역비·장비구입비 등 특정 집행 항목의 과다 비중·반복 지출 " +
  "'예산 집행 이상 패턴 후보 / 정산 확인 필요 후보 / 추가 확인 필요 후보'를 찾는 보조 도구입니다. " +
  "위법 여부를 판단하지 않으며, 특정 항목 비중이 높거나 반복된다는 사실만으로 문제라고 단정하지 않습니다. " +
  "인건비 중심 사업·홍보 캠페인·전문 용역·장비 지원 사업은 해당 항목 비중이 높을 수 있습니다. " +
  "지급처명은 마스킹 값만 사용하고, 계좌번호·개인 연락처·상세주소 등 개인정보 원문은 저장·노출하지 않으며, " +
  "로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않습니다. 모든 후보는 사람 검토 대상(reviewRequired=true)입니다.";
