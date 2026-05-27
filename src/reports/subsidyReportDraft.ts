// 보조금 신고서 초안 생성 (체크리스트 66).
//
// 신고 전 사실점검 11항목(체크리스트 65)을 통과한 후보(canGenerateReportDraft=true)에 한해
// 사람이 검토·수정할 수 있는 신고서 초안(report.md/txt/docx/report_metadata.json)을 생성한다.
// 차단 시 서버를 죽이지 않고 draftCreated=false + 한국어 blockedReason 으로 안전 반환한다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { runSubsidyPreReportFactCheck } from "../policy/subsidyPreReportChecklist.js";
import {
  REPORT_DRAFT_BLOCKED_CODE,
  SUBSIDY_REPORT_DRAFT_NOTICE,
  type SubsidyReportDraftInput,
  type SubsidyReportDraftMetadata,
  type SubsidyReportDraftResult,
  type SubsidyReportFile
} from "../types/subsidyReportDraft.js";
import type { SubsidyFactCheckResult } from "../types/subsidyFactCheck.js";

// ---------- 안전 문구 ----------

// 신고서 초안에 들어가면 안 되는 단정 표현(없을 때만 통과). 발견 시 중립 표현으로 치환.
const FORBIDDEN_DRAFT_PHRASES = [
  "부정수급 확정",
  "위법 확정",
  "신고 성공 보장",
  "포상금 수령 확정",
  "포상금 보장",
  "수령 확정"
];

export function scrubDraftText(text: string): string {
  let next = String(text ?? "");
  for (const p of FORBIDDEN_DRAFT_PHRASES) next = next.split(p).join("검토 후보(확정 아님)");
  return next;
}

function val(v: unknown, fallback = "(미확인 — 보강 필요)"): string {
  if (v === undefined || v === null || (typeof v === "string" && v.trim().length === 0)) return fallback;
  return String(v);
}

function moneyKRW(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "(미확인 — 보강 필요)";
  return `${v.toLocaleString()}원`;
}

// ---------- 본문 ----------

export function buildSubsidyReportDraftMarkdown(
  input: SubsidyReportDraftInput,
  factCheck: SubsidyFactCheckResult
): string {
  const candidateId = input.candidateId ?? input.caseId ?? "subsidy-candidate";
  const recipient = input.normalizedRecipientName ?? input.recipientName;
  const project = input.normalizedProjectName ?? input.projectName;
  const agency = input.agencyName ?? input.localGovName;
  const ex = input.explanation ?? {};
  const lines: string[] = [];

  lines.push(`# [검토용 초안] 보조금 의심 후보 신고서 초안 — ${candidateId}`);
  lines.push("");
  lines.push("> 본 문서는 **신고서 초안**이며 실제 신고 제출 문서가 아닙니다. 사람이 검토·수정한 뒤 공식 창구에 직접 제출해야 합니다.");
  lines.push("");

  lines.push("## 1. 신고 후보 요약");
  lines.push(`- 후보 ID: ${candidateId}`);
  lines.push(`- 모듈: 보조금 부정수급 의심(subsidy_fraud) — 공개자료 기준 검토 후보`);
  lines.push(`- 종합 사실점검 상태: ${factCheck.overallStatus} (초안 생성 ${factCheck.canGenerateReportDraft ? "가능" : "불가"})`);
  lines.push("");

  lines.push("## 2. 원본 공개자료 출처 / 수집일시");
  lines.push(`- 원본 URL: ${val(input.sourceUrl)}`);
  lines.push(`- 출처 파일: ${val(input.sourceFileName)}${input.sourceRowNumber ? ` (행 ${input.sourceRowNumber})` : ""}`);
  lines.push(`- 수집/변환 일시: ${val(input.collectedAt ?? input.parsedAt ?? input.capturedAt)}`);
  lines.push("");

  lines.push("## 3. 사업/기관 정보");
  lines.push(`- 수급기관(정규화): ${val(recipient)}`);
  lines.push(`- 사업명(정규화): ${val(project)}`);
  lines.push(`- 보조금 금액: ${moneyKRW(input.amount ?? input.subsidyAmount)}`);
  lines.push(`- 사업연도: ${val(input.fiscalYear ?? input.year)}`);
  lines.push(`- 담당/지원 기관: ${val(agency)}`);
  lines.push(`- 지역 정보: ${val(input.region ?? input.localGovName)}`);
  lines.push("");

  lines.push("## 4. 위험룰 5종 탐지 결과");
  const hits = input.ruleHits ?? [];
  if (hits.length > 0) {
    for (const h of hits) lines.push(`- ${h} (검토 후보 신호)`);
  } else {
    lines.push("- 룰 hit 없음 — 신고 전 룰 근거 보강 필요");
  }
  lines.push("");

  lines.push("## 5. 점수(우선 검토 참고 점수 — 확정 판단 아님)");
  lines.push(`- 위험점수(0~100): ${val(input.finalRiskScore)}`);
  lines.push(`- 보상가능성 점수: ${val(input.rewardPossibilityScore)} (포상금 지급을 보장하지 않음)`);
  lines.push("");

  lines.push("## 6. LLM 설명형 분석 요약 (검토 보조 의견)");
  lines.push(`- 요약: ${scrubDraftText(val(ex.summary))}`);
  if (Array.isArray(ex.whyFlagged) && ex.whyFlagged.length)
    lines.push(`- 왜 검토 후보인지: ${scrubDraftText(ex.whyFlagged.map(String).join(" / "))}`);
  if (Array.isArray(ex.additionalChecks) && ex.additionalChecks.length)
    lines.push(`- 추가 확인 필요: ${scrubDraftText(ex.additionalChecks.map(String).join(" / "))}`);
  lines.push("");

  lines.push("## 7. 핵심 근거 목록");
  const evid = Array.isArray(ex.keyEvidence) ? ex.keyEvidence.map(String) : [];
  if (evid.length > 0) for (const e of evid) lines.push(`- ${scrubDraftText(e)}`);
  else lines.push("- 공개자료 근거 보강 필요(원문 URL/파일+행번호).");
  lines.push("");

  lines.push("## 8. 근거검증 / 개인정보 스캔 결과");
  lines.push(`- 근거검증 strict: ${input.citationStrictPassed === true ? "통과" : "미통과(보강 필요)"}`);
  lines.push(`- 개인정보/API 키 스캔: ${input.privacyScanPassed === true ? "통과" : "미통과(보강 필요)"}`);
  lines.push("");

  lines.push("## 9. 신고 전 사실점검 11항목 결과");
  lines.push("| 항목 | 상태 | 사유 |");
  lines.push("| --- | --- | --- |");
  for (const i of factCheck.checklistItems) lines.push(`| ${i.itemName} | ${i.status} | ${i.reason} |`);
  lines.push("");

  lines.push("## 10. 사람이 직접 확인해야 할 항목 / 추가 확인 필요");
  lines.push("- 동일 기관·동일 주소·유사 사업명이 실제로 중복되는지 공개자료로 재확인");
  lines.push("- 정산·결과물 증빙의 공시 시점과 누락 여부 확인");
  lines.push("- 개인정보(대표자명·연락처·계좌·상세주소)가 초안에 포함되지 않았는지 재확인");
  lines.push("- 공식 신고 기준(환수·처분·신고자 요건)을 관할 기관에 확인");
  lines.push("");

  lines.push("## 11. 중립 신고 문구 예시");
  lines.push("> \"공개자료를 검토한 결과 반복수급/동일주소/정산 증빙 등에서 추가 확인이 필요한 의심 신호가 있어 검토를 요청합니다. 부정수급 여부 판단은 기관의 공식 확인이 필요합니다.\"");
  lines.push("");

  lines.push("## 12. 피해야 할 표현");
  lines.push("- 부정수급·위법을 '확정'하는 단정 표현, 신고 성공·포상금 수령을 '보장'하는 표현은 사용하지 않습니다.");
  lines.push("- 특정 단체·개인을 부정수급자로 단정하지 않습니다.");
  lines.push("");

  lines.push("## 13. 안내");
  lines.push("- **부정수급으로 단정하지 않음** — 공개자료 기준 검토 후보입니다.");
  lines.push("- **포상금 지급을 보장하지 않음** — 환수·처분·기관 심사에 따라 달라집니다.");
  lines.push("- **실제 신고는 사용자가 공식 창구에서 직접 제출**해야 합니다(자동 신고 없음).");
  lines.push("- 본 초안은 사람 검토·수정용이며 그대로 제출용이 아닙니다.");
  lines.push("");
  lines.push(`> ${SUBSIDY_REPORT_DRAFT_NOTICE}`);

  // 전체 문서는 손글씨 템플릿으로 안전하며, 동적 입력 필드만 위에서 scrub 했다.
  return lines.join("\n");
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\>\s?/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\|/g, " ")
    .trim();
}

export async function buildDraftDocxBuffer(title: string, markdown: string): Promise<Buffer | null> {
  try {
    const children: Paragraph[] = [];
    for (const raw of markdown.split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (line.startsWith("# ")) children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(line.slice(2))] }));
      else if (line.startsWith("## ")) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.slice(3))] }));
      else if (line.startsWith("### ")) children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(line.slice(4))] }));
      else if (line.startsWith("> ")) children.push(new Paragraph({ children: [new TextRun({ text: line.slice(2), italics: true })] }));
      else children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
    const doc = new Document({ sections: [{ children }] });
    const buf = await Packer.toBuffer(doc);
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

// ---------- 게이트 + 생성 ----------

export function generateSubsidyReportDraft(input: SubsidyReportDraftInput): SubsidyReportDraftResult {
  const factCheck = runSubsidyPreReportFactCheck(input);
  const candidateId = input.candidateId ?? input.caseId ?? "subsidy-candidate";
  const base = {
    candidateId,
    caseId: input.caseId,
    moduleId: "subsidy_fraud" as const,
    factCheckOverallStatus: factCheck.overallStatus,
    canGenerateReportDraft: factCheck.canGenerateReportDraft,
    factCheck,
    isDraft: true as const,
    humanReviewRequired: true as const,
    autoSubmitted: false as const,
    rewardGuaranteed: false as const,
    notLegalConclusion: true as const,
    safetyNotice: SUBSIDY_REPORT_DRAFT_NOTICE
  };

  // 게이트: canGenerateReportDraft=false 이면 차단(서버는 죽지 않음).
  if (!factCheck.canGenerateReportDraft) {
    const reasons = factCheck.blockingReasons.length
      ? factCheck.blockingReasons.join(" / ")
      : "신고 전 사실점검에서 보강이 필요한 항목이 있습니다.";
    return {
      ...base,
      draftCreated: false,
      blockedReason: `신고 전 사실점검 미통과로 신고서 초안을 생성하지 않았습니다: ${reasons}`,
      blockedCode: REPORT_DRAFT_BLOCKED_CODE,
      reportFiles: [],
      warnings: factCheck.blockingReasons
    };
  }

  const markdown = buildSubsidyReportDraftMarkdown(input, factCheck);
  const warnings = factCheck.checklistItems.filter((i) => i.status === "WARNING").map((i) => `${i.itemName}: ${i.requiredAction}`);
  const files: SubsidyReportFile[] = [
    { name: "report.md", format: "markdown", mime: "text/markdown" },
    { name: "report.txt", format: "text", mime: "text/plain" },
    { name: "report.docx", format: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { name: "report_metadata.json", format: "metadata", mime: "application/json" }
  ];
  const metadata: SubsidyReportDraftMetadata = {
    candidateId,
    caseId: input.caseId,
    moduleId: "subsidy_fraud",
    generatedAt: new Date().toISOString(),
    isDraft: true,
    factCheckOverallStatus: factCheck.overallStatus,
    canGenerateReportDraft: factCheck.canGenerateReportDraft,
    finalRiskScore: input.finalRiskScore,
    rewardPossibilityScore: input.rewardPossibilityScore,
    citationStrictPassed: input.citationStrictPassed,
    privacyScanPassed: input.privacyScanPassed,
    reviewer: input.reviewerName,
    files,
    autoSubmitted: false,
    rewardGuaranteed: false,
    notLegalConclusion: true,
    reviewRequired: true,
    safetyNotice: SUBSIDY_REPORT_DRAFT_NOTICE
  };

  return {
    ...base,
    draftCreated: true,
    blockedReason: null,
    reportFiles: files,
    metadata,
    warnings,
    markdown
  };
}

// ---------- 저장 ----------

function safeCandidateDir(candidateId: string): string {
  return candidateId.replace(/[^A-Za-z0-9_\-:.]+/g, "_").slice(0, 80) || "candidate";
}

export async function writeSubsidyReportDraft(
  baseDir: string,
  result: SubsidyReportDraftResult
): Promise<{ outDir?: string; written: string[] }> {
  if (!result.draftCreated || !result.markdown || !result.metadata) {
    return { written: [] };
  }
  const outDir = path.join(baseDir, "subsidy", safeCandidateDir(result.candidateId));
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];

  const mdPath = path.join(outDir, "report.md");
  await writeFile(mdPath, result.markdown, "utf8");
  written.push(mdPath);

  const txtPath = path.join(outDir, "report.txt");
  await writeFile(txtPath, markdownToPlainText(result.markdown), "utf8");
  written.push(txtPath);

  const docx = await buildDraftDocxBuffer(`보조금 신고서 초안 ${result.candidateId}`, result.markdown);
  if (docx) {
    const docxPath = path.join(outDir, "report.docx");
    await writeFile(docxPath, docx);
    written.push(docxPath);
  } else {
    // docx 생성 실패는 치명적이지 않다 — md/txt 로 진행.
    result.warnings.push("docx 생성에 실패해 markdown/text 만 저장했습니다.");
    result.reportFiles = result.reportFiles.filter((f) => f.format !== "docx");
    result.metadata.files = result.metadata.files.filter((f) => f.format !== "docx");
  }

  const metaPath = path.join(outDir, "report_metadata.json");
  // path 정보를 metadata.files 에 채운다.
  for (const f of result.metadata.files) f.path = path.join(outDir, f.name);
  await writeFile(metaPath, JSON.stringify(result.metadata, null, 2), "utf8");
  written.push(metaPath);

  for (const f of result.reportFiles) f.path = path.join(outDir, f.name);
  return { outDir, written };
}

export { SUBSIDY_REPORT_DRAFT_NOTICE };
