// Privacy / Data Minimization (체크리스트 28)
//
// 본 프로젝트는 신고 후보 탐지·증거정리·신고서 초안 생성 도구로, 개인정보를 적극적으로
// 수집하지 않는다. 저장된 개인정보성 문자열은 마스킹 또는 삭제 가능해야 한다.
// 본 타입은 법률 자문이 아니며, 개인정보보호 법령에 대한 검토를 대체하지 않는다.

export const SENSITIVE_DATA_TYPES = [
  "EMAIL",
  "PHONE",
  "KOREAN_RRN",
  "ACCOUNT_NUMBER",
  "API_KEY",
  "TOKEN",
  "COOKIE",
  "AUTH_HEADER",
  "IP_ADDRESS",
  "ADDRESS_LIKE"
] as const;
export type SensitiveDataType = typeof SENSITIVE_DATA_TYPES[number];

export const PRIVACY_CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
export type PrivacyConfidence = typeof PRIVACY_CONFIDENCES[number];

export interface PrivacyFinding {
  type: SensitiveDataType;
  confidence: PrivacyConfidence;
  // 문맥 단서 (원본 그대로 노출하지 않기 위해 매치 발견 위치만 저장)
  startIndex: number;
  endIndex: number;
  // 원문 일부 표본 (안전한 길이만, 매치값은 표시하지 않거나 마스킹된 채로)
  excerpt?: string;
  // 어떤 마스킹 token 으로 대체될지 (이미 마스킹된 경우 노출)
  replacement: string;
  // 권고 액션
  recommendedAction: string;
}

export interface MaskingResult {
  original: string;       // 사이즈 비교용 (실제 원문 저장은 호출자가 결정)
  masked: string;
  changed: boolean;
  findings: PrivacyFinding[];
  byType: Partial<Record<SensitiveDataType, number>>;
  safetyNotice: string;
}

export interface FileScanResult {
  filePath: string;
  fileType: "json" | "jsonl" | "txt" | "md" | "html" | "other";
  scanned: boolean;
  skippedReason?: string;
  byteSize: number;
  findingsCount: number;
  byType: Partial<Record<SensitiveDataType, number>>;
  // 위험 항목 상위 N개 (오탐 가능)
  topFindings: Array<Pick<PrivacyFinding, "type" | "confidence" | "excerpt" | "recommendedAction">>;
}

export interface ScanResult {
  schemaVersion: "1.0.0";
  scannedAt: string;
  rootDirs: string[];
  totalFiles: number;
  scannedFiles: number;
  skippedFiles: number;
  filesWithFindings: number;
  totalFindings: number;
  byType: Partial<Record<SensitiveDataType, number>>;
  riskFiles: FileScanResult[];   // findings > 0
  safetyNotice: string;
}

export type RetentionCategory =
  | "trace" | "evidence" | "report" | "feedback" | "case" | "raw" | "scheduler" | "scout" | "default";

export interface RetentionPolicy {
  category: RetentionCategory;
  days: number;
  dir: string;
  description: string;
}

export interface ExpiredFile {
  filePath: string;
  category: RetentionCategory;
  modifiedAt: string;
  ageDays: number;
  byteSize: number;
}

export interface RetentionReport {
  schemaVersion: "1.0.0";
  dryRun: boolean;
  ranAt: string;
  policies: RetentionPolicy[];
  expired: ExpiredFile[];
  deleted: ExpiredFile[];       // dryRun=false 일 때만 채워짐
  errors: Array<{ filePath: string; message: string }>;
  safetyNotice: string;
}

export interface DeleteRequest {
  filePath: string;
  dryRun?: boolean;
  confirmDelete?: boolean;
  reason?: string;
}

export interface DeleteResult {
  filePath: string;
  dryRun: boolean;
  performed: boolean;
  reason: string;
  safetyNotice: string;
  warning?: string;
}

export const PRIVACY_SAFETY_NOTICE =
  "본 결과는 보수적인 정규식 기반 탐지로 오탐 가능성이 있습니다. 삭제 전 반드시 확인하세요. 증거 원본성 보존이 필요한 파일은 신중히 처리하세요. 본 도구는 개인정보보호 법령에 대한 법률 자문을 대체하지 않습니다.";

// 마스킹 토큰 — 모든 카테고리에 대해 통일된 형식
export const MASK_TOKENS: Record<SensitiveDataType, string> = {
  EMAIL: "[masked-email]",
  PHONE: "[masked-phone]",
  KOREAN_RRN: "[masked-id]",
  ACCOUNT_NUMBER: "[masked-account]",
  API_KEY: "[masked-secret]",
  TOKEN: "[masked-secret]",
  COOKIE: "[masked-cookie]",
  AUTH_HEADER: "[masked-auth]",
  IP_ADDRESS: "[masked-ip]",
  ADDRESS_LIKE: "[masked-address]"
};
