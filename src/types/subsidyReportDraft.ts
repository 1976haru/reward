// 보조금 신고서 초안 생성 타입 (체크리스트 66).
//
// 신고 전 사실점검 11항목(체크리스트 65)을 통과한 후보(canGenerateReportDraft=true)에 한해
// 사람이 검토·수정할 수 있는 "신고서 초안"을 생성한다. 실제 제출 문서가 아니다.
//
// 안전 원칙:
// - draft 는 실제 신고 제출이 아니며 isDraft=true / autoSubmitted=false / rewardGuaranteed=false / notLegalConclusion=true 고정.
// - 대표자명·전화번호·주민번호·계좌번호·상세주소 원문은 초안/metadata 에 넣지 않는다.

import type { SubsidyFactCheckInput, SubsidyFactCheckResult } from "./subsidyFactCheck.js";

/**
 * 신고서 초안 입력. 사실점검 입력(SubsidyFactCheckInput)에 초안 표시용 보조 필드를 더한 형태.
 * 점수/룰/설명/출처/검토 정보는 사실점검 입력과 공유한다.
 */
export interface SubsidyReportDraftInput extends SubsidyFactCheckInput {
  /** 지역 정보(시군구 등, 개인 상세주소 아님). */
  region?: string;
  /** 룰 결과 요약 라벨(예: "반복수급 검토 후보"). */
  ruleSummaries?: string[];
}

export const SUBSIDY_REPORT_FILE_FORMATS = ["markdown", "text", "docx", "metadata"] as const;
export type SubsidyReportFileFormat = (typeof SUBSIDY_REPORT_FILE_FORMATS)[number];

export interface SubsidyReportFile {
  name: string;
  format: SubsidyReportFileFormat;
  path?: string;
  mime?: string;
}

export interface SubsidyReportDraftMetadata {
  candidateId: string;
  caseId?: string;
  moduleId: "subsidy_fraud";
  generatedAt: string;
  isDraft: true;
  factCheckOverallStatus: string;
  canGenerateReportDraft: boolean;
  finalRiskScore?: number;
  rewardPossibilityScore?: number;
  citationStrictPassed?: boolean;
  privacyScanPassed?: boolean;
  reviewer?: string;
  files: SubsidyReportFile[];
  autoSubmitted: false;
  rewardGuaranteed: false;
  notLegalConclusion: true;
  reviewRequired: true;
  safetyNotice: string;
}

export interface SubsidyReportDraftResult {
  candidateId: string;
  caseId?: string;
  moduleId: "subsidy_fraud";
  /** 초안이 실제로 생성됐는지 여부. */
  draftCreated: boolean;
  /** 차단됐을 때 사람이 이해할 수 있는 한국어 사유. 생성 시 null. */
  blockedReason: string | null;
  blockedCode?: string;
  factCheckOverallStatus: string;
  canGenerateReportDraft: boolean;
  /** 생성된 파일 목록(차단 시 빈 배열). */
  reportFiles: SubsidyReportFile[];
  metadata?: SubsidyReportDraftMetadata;
  /** 차단 사유/보강 필요 항목 등 사람 안내(중립). */
  warnings: string[];
  /** 초안 본문(생성 시). */
  markdown?: string;
  factCheck: SubsidyFactCheckResult;
  isDraft: true;
  humanReviewRequired: true;
  autoSubmitted: false;
  rewardGuaranteed: false;
  notLegalConclusion: true;
  safetyNotice: string;
}

/** 차단 안전 오류 코드. */
export const REPORT_DRAFT_BLOCKED_CODE = "REPORT_DRAFT_BLOCKED_BY_FACT_CHECK";

export const SUBSIDY_REPORT_DRAFT_NOTICE =
  "본 문서는 신고서 초안이며 실제 신고 제출이 아닙니다. 부정수급으로 단정하는 판단이 아닙니다. " +
  "사람이 근거와 개인정보를 다시 확인해야 하며, 실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다. " +
  "자동 신고/자동 제출 기능은 없고 포상금 지급을 보장하지 않습니다.";
