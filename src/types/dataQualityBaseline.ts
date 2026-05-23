// 실데이터 1차 기준선 / 데이터 품질검증 표준 타입 (체크리스트 16).
//
// 본 모듈은 최근 2~3년 보조사업 데이터를 표준 저장소(경량 JSONL)에 적재하고,
// 수집건수·중복률·결측률 등 품질 지표를 계산하기 위한 타입/상수를 정의한다.
//
// 중요:
//   - fixture 데이터는 테스트용이며 실데이터 기준선으로 간주하지 않는다.
//   - 실제 기준선 완료는 sourceType 이 api/upload/manual 이고 1,000건 이상일 때만 인정한다.
//   - 중복률·결측률은 품질 지표이며 부정수급 판단 근거가 아니다.
//   - 개인정보 원문은 저장하지 않는다(저장 전 sanitizeForStorage 통과).
//
// 운영 기준: docs/DATA_BASELINE_QUALITY_RUNBOOK.md
// 본 모듈은 법률 자문을 대체하지 않으며, 기준선은 분석 입력이지 신고 근거 확정 자료가 아니다.

// ---------- enum ----------

export const BASELINE_SOURCE_TYPES = ["api", "upload", "manual", "fixture"] as const;
export type BaselineSourceType = (typeof BASELINE_SOURCE_TYPES)[number];

/** 기준선 적재 결과 상태. */
export const BASELINE_STATUSES = [
  "real_baseline_ok", // 실데이터(api/upload/manual) 1,000건 이상
  "fixture_pending", // fixture 1,000건 — 경로 검증만, 실데이터 기준선 보류
  "incomplete" // 1,000건 미만
] as const;
export type BaselineStatus = (typeof BASELINE_STATUSES)[number];

/** 1차 기준선 목표 적재 건수. */
export const BASELINE_TARGET_RECORDS = 1000;

// ---------- 표준 기준선 레코드 ----------

/**
 * 표준화된 기준선 레코드. 원본 파일은 저장하지 않고 본 표준 레코드만 저장한다.
 * 모든 문자열 필드는 저장 전 sanitizeForStorage 를 통과한다.
 */
export interface BaselineRecord {
  id: string; // 필수
  sourceType: BaselineSourceType; // 필수
  sourceName: string; // 필수
  sourceFileName?: string; // 선택
  sourceUrl?: string; // 권장
  collectedAt: string; // 필수 (ISO 8601)
  fiscalYear?: number; // 권장
  localGovName?: string; // 권장
  ministryName?: string; // 선택
  agencyName?: string; // 선택
  projectName: string; // 필수
  projectNameCompactKey?: string; // 권장 — 사업명 정규화 키 (체크리스트 15)
  recipientName?: string; // 권장
  normalizedRecipientName?: string; // 권장 — 기관명 정규화 키 (체크리스트 13)
  normalizedAddressKey?: string; // 선택 — 주소 정규화 키 (체크리스트 14)
  addressRegionKey?: string; // 선택 — 지역 주소 키
  subsidyAmount?: number; // 권장
  executionAmount?: number; // 선택
  settlementAmount?: number; // 선택
  returnAmount?: number; // 선택
  documentType: string; // 필수
  evidenceUrl?: string; // 권장
  privacyDetectedTypes: string[]; // 필수 — 탐지된 개인정보 유형
  qualityWarnings?: string[]; // 선택

  // --- 결과물/정산/첨부 메타 (체크리스트 19 연계, 모두 선택) ---
  // 공개자료 기준 URL/존재 플래그만 저장한다(개인정보 원문 저장 금지).
  resultUrl?: string; // 결과물 URL
  resultReportUrl?: string; // 결과보고서 URL
  performanceReportUrl?: string; // 성과보고서 URL
  settlementDocumentUrl?: string; // 정산서/정산결과 자료 URL
  attachmentUrls?: string[]; // 첨부파일 URL 목록
  attachmentCount?: number; // 첨부파일 수
  hasPerformanceReport?: boolean;
  hasSettlementDocument?: boolean;
  hasResultReport?: boolean;
  hasResultUrl?: boolean;
  hasAttachment?: boolean;
}

/** 결측률 계산 대상 필드 (Runbook §4 의 '결측률 계산 대상=예'). */
export const BASELINE_MISSING_RATE_FIELDS: readonly (keyof BaselineRecord)[] = [
  "id",
  "sourceType",
  "sourceName",
  "sourceUrl",
  "collectedAt",
  "fiscalYear",
  "localGovName",
  "projectName",
  "projectNameCompactKey",
  "recipientName",
  "normalizedRecipientName",
  "subsidyAmount",
  "documentType",
  "evidenceUrl",
  "privacyDetectedTypes"
];

/** 필수 필드 — 비어 있으면 qualityWarnings 에 기록한다. */
export const BASELINE_REQUIRED_FIELDS: readonly (keyof BaselineRecord)[] = [
  "id",
  "sourceType",
  "sourceName",
  "collectedAt",
  "projectName",
  "documentType"
];

// ---------- 품질 지표 ----------

export interface BaselineQualityReport {
  runId: string;
  generatedAt: string;
  status: BaselineStatus;
  /** 실데이터 여부(api/upload/manual 만 true). fixture 는 false. */
  isRealData: boolean;
  /** 적재된 sourceType 분포 키. */
  sourceTypesPresent: BaselineSourceType[];

  totalRecords: number;
  uniqueRecords: number;
  duplicateCount: number;
  duplicateRate: number; // 0~1
  missingRate: number; // 0~1 (대상 필드 전체 평균)
  fieldMissingRates: Record<string, number>;
  privacyDetectedCount: number;
  parseWarningCount: number;
  sourceCoverage: Record<string, number>;
  yearCoverage: Record<string, number>;

  /** 중복 후보(삭제하지 않고 표시만). */
  duplicateCandidates: Array<{ dedupeKey: string; ids: string[]; count: number }>;

  /** 계산 근거/주의 메모 (중립 표현). */
  notes: string[];

  recordsFile: string;
  qualityReportJsonFile: string;
  qualityReportMdFile: string;
  errorLogFile: string;
}

export interface BaselineErrorEntry {
  at: string;
  phase: "normalize" | "dedupe" | "write" | "input";
  /** 개인정보 원문이 남지 않도록 일반화된 사유. */
  reason: string;
  recordId?: string;
}

export interface BaselineErrorLog {
  runId: string;
  errorsCount: number;
  errors: BaselineErrorEntry[];
}

// ---------- 안내문 ----------

export const DATA_BASELINE_NOTICE =
  "본 모듈은 최근 2~3년 보조사업 데이터를 표준 저장소에 적재하고 수집건수·중복률·결측률 등 품질 지표를 계산합니다. " +
  "fixture 데이터는 테스트용이며 실데이터 기준선으로 간주하지 않습니다 — 실제 기준선 완료는 sourceType 이 api/upload/manual 이고 1,000건 이상일 때만 인정합니다. " +
  "중복률·결측률은 데이터 품질 지표이며 부정수급 판단 근거가 아닙니다. 개인정보 원문은 저장하지 않으며 저장 전 마스킹합니다. " +
  "기준선은 분석 입력이며 신고 근거 확정 자료가 아닙니다.";
