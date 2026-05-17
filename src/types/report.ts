// 신고서 초안 (Report Draft) 공통 타입.
// 본 초안은 자동 신고서가 아니며 사람이 검토·수정·복사해서 직접 제출하는 보조 자료다.

export const REPORT_FORMATS = ["markdown", "text", "docx"] as const;
export type ReportFormat = typeof REPORT_FORMATS[number];

export const REPORT_FILES = {
  markdown: "report.md",
  text: "report.txt",
  docx: "report.docx",
  metadata: "report_metadata.json"
} as const;

export const ALLOWED_REPORT_FILENAMES: ReadonlySet<string> = new Set(Object.values(REPORT_FILES));

export interface ReportDraftFiles {
  markdownPath: string;
  textPath: string;
  docxPath?: string;
  metadataPath: string;
}

export interface ReportDraftMetadata {
  schemaVersion: "1.0.0";
  caseId: string;
  moduleId: string;
  title: string;
  url?: string;
  productName?: string;
  generatedAt: string;
  generatedBy: string;
  formats: ReportFormat[];
  files: { name: string; size: number; sha256: string; mimeType: string }[];
  safetyNotice: string;
  notSubmittedAutomatically: true;
  humanReviewRequired: true;
  warnings: string[];
}

export interface ReportDraftResult {
  caseId: string;
  title: string;
  markdown: string;
  text: string;
  files: ReportDraftFiles;
  generatedAt: string;
  warnings: string[];
  safetyNotice: string;
  notSubmittedAutomatically: true;
  humanReviewRequired: true;
}

export interface ReportSummary {
  caseId: string;
  exists: boolean;
  hasMarkdown: boolean;
  hasText: boolean;
  hasDocx: boolean;
  hasMetadata: boolean;
  generatedAt: string | null;
  files: { name: string; size: number; sha256: string; mimeType: string }[];
  safetyNotice: string;
  autoReport: false;
  humanReviewRequired: true;
}
