// CSV/PDF/엑셀 업로드 수집기 표준 타입 (체크리스트 12).
//
// 본 모듈은 지자체가 공개한 보조금 관련 CSV/XLSX/PDF 파일을 "사람이 수동 업로드" 했다고
// 가정하고, 표준 보조금 레코드로 변환하기 위한 타입/상수를 정의한다.
// 본 모듈은 웹 크롤러가 아니라 수동 업로드 파일 변환기이며, 공개자료 중심 분석 원칙과
// 개인정보 최소수집 원칙을 따른다.
//
// 실제 파서는 src/parsers/uploadSubsidyParser.ts 에 구현된다.
// 운영 기준: docs/UPLOAD_PARSER_RUNBOOK.md
//
// 본 모듈은 법률 자문이나 운영기관 공식 안내를 대체하지 않으며, 변환 결과만으로
// 부정수급/위법 여부를 확정하지 않는다.

// ---------- enum / 분류 ----------

export const UPLOAD_SOURCE_FILE_TYPES = ["csv", "xlsx", "pdf", "unsupported"] as const;
export type UploadSourceFileType = (typeof UPLOAD_SOURCE_FILE_TYPES)[number];

export const UPLOAD_DOCUMENT_TYPES = [
  "subsidy_notice", // 공고
  "selection_result", // 선정
  "settlement", // 정산
  "inspection", // 점검/검사
  "audit_result", // 감사
  "recovery_return", // 환수/반납
  "budget_settlement", // 결산
  "unknown"
] as const;
export type UploadDocumentType = (typeof UPLOAD_DOCUMENT_TYPES)[number];

export const UPLOAD_PARSE_STATUSES = ["parsed", "partial", "failed"] as const;
export type UploadParseStatus = (typeof UPLOAD_PARSE_STATUSES)[number];

/** 지원하는 확장자 (소문자, 점 포함). 그 외는 unsupported 로 처리. */
export const UPLOAD_SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".pdf"] as const;

// ---------- 표준 보조금 레코드 ----------

/**
 * 업로드 파일에서 변환된 표준 보조금 레코드.
 *
 * - 모든 문자열 필드는 저장 전 sanitizeForStorage(privacyGuard) 를 통과해야 한다.
 * - sourceText 는 반드시 마스킹 후 저장한다.
 * - 금액 필드는 원화(원) 기준 숫자. 원본 단위(원/천원/백만원)가 다르면 환산 후 저장하고,
 *   불명확하면 parseWarnings 에 기록한다.
 */
export interface StandardSubsidyRecordFromUpload {
  // --- 출처 (필수/권장) ---
  sourceFileName: string; // 필수
  sourceFileType: UploadSourceFileType; // 필수
  sourceRowNumber?: number; // 권장 — CSV/XLSX 행 번호 또는 PDF 페이지/줄 번호
  sourceText?: string; // 선택 — 마스킹 후 원문 일부

  // --- 사업/기관 ---
  localGovName?: string; // 권장
  fiscalYear?: number; // 권장
  projectName: string; // 필수
  recipientName?: string; // 권장
  /** 기관명·단체명 정규화 결과(compactName 기반 동일 기관 후보 키). 확정 병합이 아니다 — 사람 검토 대상. */
  normalizedRecipientName?: string; // 선택 (체크리스트 13 연계)
  departmentName?: string; // 권장

  // --- 금액 (원화 숫자) ---
  subsidyAmount?: number; // 권장
  executionAmount?: number; // 선택
  settlementAmount?: number; // 선택
  returnAmount?: number; // 선택

  // --- 기간/일자 ---
  projectPeriodStart?: string; // 선택 (YYYY-MM-DD)
  projectPeriodEnd?: string; // 선택
  noticeDate?: string; // 선택

  // --- 분류/메모 ---
  documentType: UploadDocumentType; // 필수
  evidenceNote?: string; // 선택

  // --- 처리 메타 (필수) ---
  privacyDetectedTypes: string[]; // 필수 — 탐지된 개인정보 유형
  parseStatus: UploadParseStatus; // 필수
  parseWarnings?: string[]; // 선택
}

// ---------- 실행 로그 ----------

export interface UploadParserFileSummary {
  sourceFileName: string;
  sourceFileType: UploadSourceFileType;
  recordCount: number;
  parsedCount: number;
  partialCount: number;
  failedCount: number;
  warnings: string[];
}

export interface UploadParserRunLog {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalFiles: number;
  totalRecords: number;
  parsedCount: number;
  partialCount: number;
  failedCount: number;
  sanitizedRecordCount: number;
  recordsFile: string;
  parseLogFile: string;
  errorLogFile: string;
  files: UploadParserFileSummary[];
  notes: string[];
}

export interface UploadParserErrorEntry {
  at: string;
  sourceFileName: string;
  phase: "detect" | "read" | "parse" | "convert" | "write";
  /** 개인정보 원문이 남지 않도록 사유 메시지는 일반화한다. */
  reason: string;
}

export interface UploadParserErrorLog {
  runId: string;
  errorsCount: number;
  errors: UploadParserErrorEntry[];
}

// ---------- 필드 별칭 매핑 ----------

/**
 * 지자체마다 헤더명이 다르므로 표준 필드 → 가능한 원본 헤더 별칭을 매핑한다.
 * 매칭은 공백/괄호 제거 후 부분 포함 비교로 수행한다 (대소문자 무시).
 */
export const UPLOAD_FIELD_ALIASES: Record<string, string[]> = {
  projectName: ["사업명", "보조사업명", "지원사업명", "세부사업명", "사업내용"],
  recipientName: [
    "보조사업자",
    "보조사업자명",
    "단체명",
    "수급기관",
    "수급기관명",
    "수행기관",
    "수급자",
    "사업자명",
    "교부대상"
  ],
  departmentName: ["담당부서", "주관부서", "소관부서", "부서", "담당과"],
  localGovName: ["지자체", "지자체명", "자치단체", "자치단체명", "시군구", "시도", "기관명", "지방자치단체"],
  fiscalYear: ["회계연도", "사업연도", "연도", "년도", "예산연도"],
  subsidyAmount: ["보조금액", "지원금액", "교부액", "교부금액", "보조금", "국비", "지원액", "지급액"],
  executionAmount: ["집행액", "집행금액", "집행"],
  settlementAmount: ["정산액", "정산금액", "정산"],
  returnAmount: ["반납액", "환수액", "반납금", "환수금", "반납", "환수", "회수액"],
  projectPeriodStart: ["사업시작일", "시작일", "사업개시일", "착수일", "시작"],
  projectPeriodEnd: ["사업종료일", "종료일", "완료일", "종료"],
  noticeDate: ["공고일", "공고일자", "게시일", "공시일", "공시일자", "게시일자"]
};

/** documentType 추론용 키워드. */
export const UPLOAD_DOCUMENT_TYPE_KEYWORDS: Array<{ type: UploadDocumentType; keywords: string[] }> = [
  { type: "recovery_return", keywords: ["환수", "반납", "회수"] },
  { type: "settlement", keywords: ["정산"] },
  { type: "selection_result", keywords: ["선정", "선정결과", "교부결정"] },
  { type: "inspection", keywords: ["점검", "검사", "현장점검"] },
  { type: "audit_result", keywords: ["감사", "감사결과"] },
  { type: "budget_settlement", keywords: ["결산"] },
  { type: "subsidy_notice", keywords: ["공고", "공모", "모집"] }
];

// ---------- 안내문 ----------

export const UPLOAD_PARSER_NOTICE =
  "본 모듈은 웹 크롤러가 아니라 사람이 수동 업로드한 CSV/XLSX/PDF 파일을 표준 보조금 레코드로 변환하는 변환기입니다. " +
  "공개자료 중심 분석 원칙과 개인정보 최소수집 원칙을 따르며, 주민번호/계좌번호/휴대폰/이메일/상세주소 등은 저장 전 마스킹합니다. " +
  "스캔 이미지 PDF의 OCR은 범위에서 제외합니다. 변환 결과는 의심 신호 분석의 입력 후보일 뿐, 위법 여부를 확정하지 않습니다.";
