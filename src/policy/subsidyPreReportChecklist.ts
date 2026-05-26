// 보조금 신고 전 사실점검 11항목 게이트 (체크리스트 65).
//
// 보조금 후보 Case를 신고서 초안 생성 단계로 넘기기 전에 11항목을 점검한다.
// FAIL 항목이 하나라도 있으면 canGenerateReportDraft=false 다.
// strict citation fail / 개인정보 노출 / 사람 검토 없음은 기본 차단(BLOCKED) 사유다.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SUBSIDY_FACT_CHECK_HARD_BLOCK_ITEMS,
  SUBSIDY_FACT_CHECK_ITEM_NAMES,
  SUBSIDY_FACT_CHECK_NOTICE,
  type SubsidyFactCheckInput,
  type SubsidyFactCheckItemId,
  type SubsidyFactCheckItemResult,
  type SubsidyFactCheckItemStatus,
  type SubsidyFactCheckOverallStatus,
  type SubsidyFactCheckReport,
  type SubsidyFactCheckResult
} from "../types/subsidyFactCheck.js";

// ---------- 유틸 ----------

function has(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function item(
  itemId: SubsidyFactCheckItemId,
  status: SubsidyFactCheckItemStatus,
  reason: string,
  requiredAction: string,
  evidenceRefs: string[] = []
): SubsidyFactCheckItemResult {
  return { itemId, itemName: SUBSIDY_FACT_CHECK_ITEM_NAMES[itemId], status, reason, requiredAction, evidenceRefs };
}

// ---------- 11항목 평가 ----------

export function evaluateSubsidyFactCheckItems(input: SubsidyFactCheckInput): SubsidyFactCheckItemResult[] {
  const items: SubsidyFactCheckItemResult[] = [];

  // 1. 공개자료 여부 — 로그인 필요/비공개 자료면 근거로 사용 불가(FAIL, 차단).
  if (input.hasLoginRequiredSource || input.hasPrivateSource) {
    items.push(
      item(
        "public_data",
        "FAIL",
        "로그인 필요/비공개/내부자료가 근거에 포함되어 있습니다. 공개자료가 아닙니다.",
        "비공개·로그인 필요 자료를 제거하고 공개자료 근거로 교체하세요."
      )
    );
  } else if (input.evidenceIsPublic === true) {
    items.push(item("public_data", "PASS", "근거 자료가 로그인 없이 접근 가능한 공개자료로 표시되었습니다.", "추가 조치 불필요."));
  } else {
    items.push(
      item(
        "public_data",
        "WARNING",
        "공개자료 여부가 명시되지 않았습니다.",
        "근거 자료가 공개자료인지 사람이 확인해 표시하세요(보강 필요)."
      )
    );
  }

  // 2. 원본 URL/파일 출처.
  const sourceRefs: string[] = [];
  if (has(input.sourceUrl)) sourceRefs.push(`sourceUrl:${input.sourceUrl}`);
  if (has(input.sourceFileName))
    sourceRefs.push(`sourceFile:${input.sourceFileName}${has(input.sourceRowNumber) ? `#${input.sourceRowNumber}` : ""}`);
  if (has(input.pageNumber)) sourceRefs.push(`page:${input.pageNumber}`);
  if (sourceRefs.length > 0) {
    items.push(item("source_origin", "PASS", "원본 URL 또는 파일 출처가 확인되었습니다.", "추가 조치 불필요.", sourceRefs));
  } else {
    items.push(
      item(
        "source_origin",
        "FAIL",
        "sourceUrl / sourceFileName+sourceRowNumber / pageNumber 중 어느 것도 없습니다.",
        "원본 출처(공개 URL 또는 파일명+행번호)를 보강하세요."
      )
    );
  }

  // 3. 수집일시.
  const timeRefs: string[] = [];
  for (const [k, v] of [
    ["collectedAt", input.collectedAt],
    ["parsedAt", input.parsedAt],
    ["capturedAt", input.capturedAt]
  ] as const) {
    if (has(v)) timeRefs.push(`${k}:${v}`);
  }
  if (timeRefs.length > 0) {
    items.push(item("collected_at", "PASS", "수집/변환/캡처 일시가 확인되었습니다.", "추가 조치 불필요.", timeRefs));
  } else {
    items.push(
      item("collected_at", "WARNING", "수집일시(collectedAt/parsedAt/capturedAt)가 없습니다.", "수집일시를 보강하세요(보강 필요).")
    );
  }

  // 4. 수급기관/사업명 식별 가능 여부 — 원문은 echo하지 않고 가능 여부만 본다.
  const hasRecipient = has(input.normalizedRecipientName) || has(input.recipientName);
  const hasProject = has(input.normalizedProjectName) || has(input.projectName);
  if (hasRecipient && hasProject) {
    items.push(
      item("identification", "PASS", "수급기관과 사업명을 식별할 수 있습니다(원문 미표시, 식별 가능 여부만 확인).", "추가 조치 불필요.")
    );
  } else if (hasRecipient || hasProject) {
    items.push(
      item("identification", "WARNING", "수급기관 또는 사업명 중 하나만 식별 가능합니다.", "나머지 식별 정보를 보강하세요(개인정보 원문 제외).")
    );
  } else {
    items.push(
      item("identification", "FAIL", "수급기관/사업명을 식별할 수 없습니다.", "정규화 키 또는 공개 사업명 정보를 보강하세요(개인정보 원문 제외).")
    );
  }

  // 5. 금액/연도/기관.
  const coreFields: string[] = [];
  if (has(input.amount) || has(input.subsidyAmount)) coreFields.push("amount");
  if (has(input.fiscalYear) || has(input.year)) coreFields.push("fiscalYear");
  if (has(input.agencyName) || has(input.localGovName)) coreFields.push("agency");
  if (coreFields.length >= 2) {
    items.push(item("amount_year_agency", "PASS", `핵심 필드 확인: ${coreFields.join(", ")}.`, "추가 조치 불필요."));
  } else if (coreFields.length === 1) {
    items.push(item("amount_year_agency", "WARNING", `핵심 필드가 일부만 있습니다: ${coreFields.join(", ")}.`, "금액/연도/기관 정보를 보강하세요(보강 필요)."));
  } else {
    items.push(item("amount_year_agency", "WARNING", "금액/연도/기관 핵심 필드가 확인되지 않았습니다.", "공개자료에서 금액/연도/기관을 보강하세요(보강 필요)."));
  }

  // 6. 위험룰 근거 — hit 없어도 오류가 아니라 보강 필요.
  if (has(input.ruleHits)) {
    items.push(item("risk_rule_hits", "PASS", `위험룰 hit: ${(input.ruleHits ?? []).join(", ")}.`, "추가 조치 불필요."));
  } else {
    items.push(
      item("risk_rule_hits", "WARNING", "반복수급/동일주소/결과물·정산/예산집행/사업명 유사 룰 hit가 없습니다.", "신고 전 룰 근거 보강이 필요합니다(보강 필요).")
    );
  }

  // 7. 위험점수·보상가능성 점수 — 확정 판단이 아니라 우선 검토 참고 점수.
  const hasRisk = has(input.finalRiskScore);
  const hasReward = has(input.rewardPossibilityScore);
  if (hasRisk && hasReward) {
    items.push(
      item(
        "risk_reward_scores",
        "PASS",
        `위험점수 ${input.finalRiskScore}, 보상가능성 점수 ${input.rewardPossibilityScore} (우선 검토 참고 점수이며 확정 판단 아님).`,
        "추가 조치 불필요."
      )
    );
  } else if (hasRisk || hasReward) {
    items.push(item("risk_reward_scores", "WARNING", "위험점수 또는 보상가능성 점수 중 하나만 있습니다(참고 점수).", "누락 점수를 보강하세요(보강 필요)."));
  } else {
    items.push(item("risk_reward_scores", "WARNING", "위험점수/보상가능성 점수가 없습니다(참고 점수).", "점수 산출 후 보강하세요(보강 필요)."));
  }

  // 8. LLM 설명형 분석.
  const ex = input.explanation;
  const exOk = ex && has(ex.summary) && has(ex.whyFlagged) && has(ex.keyEvidence) && has(ex.additionalChecks);
  if (exOk) {
    items.push(item("llm_explanation", "PASS", "설명형 분석(summary/whyFlagged/keyEvidence/additionalChecks)이 있습니다(LLM 미호출 fallback 포함).", "추가 조치 불필요."));
  } else if (ex && (has(ex.summary) || has(ex.whyFlagged) || has(ex.keyEvidence))) {
    items.push(item("llm_explanation", "WARNING", "설명형 분석 일부 항목이 누락되었습니다.", "누락된 설명 항목을 보강하세요(보강 필요)."));
  } else {
    items.push(item("llm_explanation", "WARNING", "설명형 분석 결과가 없습니다.", "설명형 분석을 생성해 보강하세요(보강 필요)."));
  }

  // 9. 근거검증 strict 통과 — false면 차단.
  if (input.citationStrictPassed === true) {
    items.push(item("citation_strict", "PASS", "근거검증 strict를 통과했습니다(모든 핵심 주장에 공개자료 근거 연결).", "추가 조치 불필요."));
  } else {
    items.push(
      item(
        "citation_strict",
        "FAIL",
        "근거검증 strict를 통과하지 못했습니다(근거 없는 핵심 주장 존재 가능).",
        "근거 보강 후 strict 재검증을 통과해야 신고서 초안 생성이 가능합니다."
      )
    );
  }

  // 10. 개인정보/API 키 스캔 — fail이면 차단.
  if (input.privacyScanPassed === true) {
    items.push(item("privacy_api_scan", "PASS", "개인정보/API 키/토큰/상세주소 원문 스캔을 통과했습니다.", "추가 조치 불필요."));
  } else {
    const n = (input.privacyScanFindings ?? []).length;
    items.push(
      item(
        "privacy_api_scan",
        "FAIL",
        `개인정보/API 키 스캔이 통과되지 않았습니다${n ? ` (탐지 ${n}건)` : ""}.`,
        "개인정보·키·상세주소 원문을 마스킹/제거한 뒤 다시 점검하세요."
      )
    );
  }

  // 11. 사람 검토 승인 — 자동 승인/검토 없음 금지.
  const reviewApproved =
    has(input.reviewerName) && has(input.reviewStatus) && String(input.reviewStatus).toLowerCase() === "approved";
  const reviewRecorded = has(input.reviewerName) || has(input.reviewStatus) || has(input.reviewMemo);
  if (reviewApproved) {
    items.push(item("human_review", "PASS", "사람 검토 승인 기록이 있습니다(reviewer/status=approved).", "추가 조치 불필요."));
  } else if (reviewRecorded) {
    items.push(
      item("human_review", "FAIL", "사람 검토 기록은 있으나 승인(approved) 상태가 아닙니다.", "사람 검토자가 승인해야 신고서 초안 생성이 가능합니다.")
    );
  } else {
    items.push(
      item("human_review", "FAIL", "사람 검토 기록(reviewerName/reviewStatus/reviewMemo)이 없습니다. 자동 승인은 금지됩니다.", "사람이 검토하고 승인 기록을 남겨야 합니다.")
    );
  }

  return items;
}

// ---------- 종합 판정 ----------

export function runSubsidyPreReportFactCheck(input: SubsidyFactCheckInput): SubsidyFactCheckResult {
  const checklistItems = evaluateSubsidyFactCheckItems(input);
  const fails = checklistItems.filter((i) => i.status === "FAIL");
  const warnings = checklistItems.filter((i) => i.status === "WARNING");
  const hardBlocks = fails.filter((i) => SUBSIDY_FACT_CHECK_HARD_BLOCK_ITEMS.includes(i.itemId));

  let overallStatus: SubsidyFactCheckOverallStatus;
  if (hardBlocks.length > 0) overallStatus = "BLOCKED";
  else if (fails.length > 0) overallStatus = "NEEDS_FIX";
  else if (warnings.length > 0) overallStatus = "PASS_WITH_WARNINGS";
  else overallStatus = "PASS";

  // FAIL이 하나도 없을 때만 초안 생성 가능.
  const canGenerateReportDraft = fails.length === 0;
  const blockingReasons = fails.map((i) => `${i.itemName}: ${i.requiredAction}`);

  return {
    caseId: input.caseId,
    candidateId: input.candidateId,
    checkedAt: new Date().toISOString(),
    checklistItems,
    overallStatus,
    canGenerateReportDraft,
    reviewRequired: true,
    notLegalConclusion: true,
    autoSubmitAvailable: false,
    rewardGuaranteed: false,
    blockingReasons,
    isFixtureBased: Boolean(input.isFixtureBased),
    safetyNotice: SUBSIDY_FACT_CHECK_NOTICE
  };
}

// ---------- 리포트(여러 Case) ----------

function makeRunId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `fact_check_${stamp}_${createHash("sha1").update(String(d.getTime() + Math.random())).digest("hex").slice(0, 6)}`;
}

export function generateSubsidyFactCheckReport(
  inputs: SubsidyFactCheckInput[],
  options: { runId?: string; isFixtureBased?: boolean; sourceNote?: string } = {}
): SubsidyFactCheckReport {
  const results = inputs.map(runSubsidyPreReportFactCheck);
  const overallSummary: Record<SubsidyFactCheckOverallStatus, number> = {
    PASS: 0,
    PASS_WITH_WARNINGS: 0,
    NEEDS_FIX: 0,
    BLOCKED: 0
  };
  for (const r of results) overallSummary[r.overallStatus] += 1;
  return {
    runId: options.runId ?? makeRunId(),
    createdAt: new Date().toISOString(),
    totalCases: results.length,
    results,
    overallSummary,
    canGenerateCount: results.filter((r) => r.canGenerateReportDraft).length,
    isFixtureBased: Boolean(options.isFixtureBased || inputs.some((i) => i.isFixtureBased)),
    sourceNote: options.sourceNote
  };
}

export function renderSubsidyFactCheckSummaryMarkdown(report: SubsidyFactCheckReport): string {
  const lines: string[] = [];
  lines.push(`# 보조금 신고 전 사실점검 11항목 요약 - ${report.runId}`);
  lines.push("");
  lines.push(`- 생성일시: ${report.createdAt}`);
  lines.push(`- 점검 Case: ${report.totalCases}`);
  lines.push(`- 초안 생성 가능(canGenerateReportDraft=true): ${report.canGenerateCount}`);
  lines.push(
    `- 종합: PASS ${report.overallSummary.PASS}, PASS_WITH_WARNINGS ${report.overallSummary.PASS_WITH_WARNINGS}, NEEDS_FIX ${report.overallSummary.NEEDS_FIX}, BLOCKED ${report.overallSummary.BLOCKED}`
  );
  lines.push("");
  lines.push("> " + SUBSIDY_FACT_CHECK_NOTICE);
  lines.push("");
  for (const r of report.results) {
    lines.push(`## ${r.candidateId ?? r.caseId ?? "case"} — ${r.overallStatus} (초안 생성 ${r.canGenerateReportDraft ? "가능" : "불가"})`);
    lines.push("");
    lines.push("| 항목 | 상태 | 사유 | 필요 조치 |");
    lines.push("| --- | --- | --- | --- |");
    for (const i of r.checklistItems) {
      lines.push(`| ${i.itemName} | ${i.status} | ${i.reason} | ${i.requiredAction} |`);
    }
    if (r.blockingReasons.length > 0) {
      lines.push("");
      lines.push("초안 생성 차단 사유:");
      for (const b of r.blockingReasons) lines.push(`- ${b}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export interface SubsidyFactCheckWriteResult {
  runDir: string;
  reportJsonFile: string;
  summaryMdFile: string;
  metadataFile: string;
}

export async function writeSubsidyFactCheckReport(
  baseDir: string,
  report: SubsidyFactCheckReport
): Promise<SubsidyFactCheckWriteResult> {
  const runDir = path.join(baseDir, "runs", report.runId);
  await mkdir(runDir, { recursive: true });
  const reportJsonFile = path.join(runDir, "fact-check-report.json");
  const summaryMdFile = path.join(runDir, "fact-check-summary.md");
  const metadataFile = path.join(runDir, "metadata.json");
  report.reportJsonFile = reportJsonFile;
  report.reportMdFile = summaryMdFile;
  await writeFile(reportJsonFile, JSON.stringify(report, null, 2), "utf8");
  await writeFile(summaryMdFile, renderSubsidyFactCheckSummaryMarkdown(report), "utf8");
  await writeFile(
    metadataFile,
    JSON.stringify(
      {
        runId: report.runId,
        createdAt: report.createdAt,
        totalCases: report.totalCases,
        canGenerateCount: report.canGenerateCount,
        overallSummary: report.overallSummary,
        isFixtureBased: report.isFixtureBased,
        sourceNote: report.sourceNote,
        autoSubmitAvailable: false,
        rewardGuaranteed: false,
        reviewRequired: true,
        notLegalConclusion: true,
        notice: SUBSIDY_FACT_CHECK_NOTICE
      },
      null,
      2
    ),
    "utf8"
  );
  return { runDir, reportJsonFile, summaryMdFile, metadataFile };
}

export { SUBSIDY_FACT_CHECK_NOTICE };
