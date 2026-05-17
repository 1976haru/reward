// Human Review Queue 공통 타입.
// SUBMITTED 상태는 시스템이 외부 신고기관에 자동 제출했다는 뜻이 아니라,
// "사용자가 외부 공식 창구에 직접 제출한 사실을 내부 기록으로 표시"하는 상태다.

import type { CaseStatus } from "./core.js";

export type ReviewQueueStatus = CaseStatus;

export const REVIEW_QUEUE_STATUS_LABELS: Record<ReviewQueueStatus, string> = {
  DRAFT:         "신규",
  REVIEW:        "검토중",
  HOLD:          "보류",
  APPROVED:      "승인",
  REPORT_DRAFT:  "신고초안",
  SUBMITTED:     "제출(내부 기록)",
  OUTCOME_CHECK: "결과확인",
  REJECTED:      "폐기"
};

export interface ReviewQueueItem {
  id: string;
  moduleId: string;
  title: string;
  url?: string;
  status: ReviewQueueStatus;
  priorityScore?: number;
  priorityLabel?: string;
  agencyCandidate?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  hasEvidencePackage?: boolean;
  hasReportDraft?: boolean;
  matchCount?: number;
  llmSummary?: string;
}

export type ReviewLogKind = "STATUS_CHANGE" | "NOTE";

export interface ReviewLogEntry {
  id: string;
  caseId: string;
  kind: ReviewLogKind;
  fromStatus?: ReviewQueueStatus;
  toStatus?: ReviewQueueStatus;
  reviewerName?: string;
  note?: string;
  createdAt: string;
}

export interface QueueSummary {
  total: number;
  counts: Partial<Record<ReviewQueueStatus, number>>;
}
