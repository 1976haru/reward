import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  Document,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  Packer
} from "docx";
import type { RewardCase, CaseRuleMatch, CaseLlmAnalysis } from "../types/core.js";
import type { ScoringResult } from "../types/scoring.js";
import { config } from "../utils/config.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import {
  ALLOWED_REPORT_FILENAMES,
  REPORT_FILES,
  type ReportDraftMetadata,
  type ReportDraftResult,
  type ReportSummary
} from "../types/report.js";

// 신고서 초안 — 사람이 검토·수정·복사해서 직접 제출하는 보조 자료.
// 자동 신고는 수행하지 않는다. 금지 표현 sanitize.

const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function isSafeCaseId(caseId: string): boolean {
  return typeof caseId === "string" && CASE_ID_PATTERN.test(caseId);
}

export function isAllowedReportFileName(name: string): boolean {
  return typeof name === "string" && ALLOWED_REPORT_FILENAMES.has(name);
}

// 결과 본문에 들어가서는 안 되는 표현 — 발견 시 중립 표현으로 치환 + warnings에 기록
const BANNED_PHRASES: Array<{ re: RegExp; replace: string }> = [
  { re: /불법\s*확정/g, replace: "위반 의심 (검토 필요)" },
  { re: /위반\s*확정/g, replace: "위반 의심 (검토 필요)" },
  { re: /포상금\s*지급\s*확정/g, replace: "포상금 지급 여부 확인 필요" },
  { re: /포상금\s*보장/g, replace: "포상금 지급 여부 확인 필요" },
  { re: /무조건\s*처벌/g, replace: "관계 기관 검토 요청" },
  { re: /무조건\s*지급/g, replace: "지급 여부 확인 필요" },
  { re: /범죄자/g, replace: "관련 사업자(검토 필요)" },
  { re: /사기꾼/g, replace: "관련 사업자(검토 필요)" },
  { re: /\b사기\b/g, replace: "검토 필요 표현" },
  { re: /고의로\s*속였습니다/g, replace: "검토가 필요한 표현입니다" },
  { re: /허위\s*사실\s*단정/g, replace: "허위 의심 표현(검토 필요)" }
];

export function sanitizeReportText(input: string, warnings: string[]): string {
  let out = String(input ?? "");
  for (const rule of BANNED_PHRASES) {
    if (rule.re.test(out)) {
      warnings.push(`금지 표현(${rule.re.source})을 중립 표현으로 치환했습니다.`);
      out = out.replace(rule.re, rule.replace);
    }
  }
  return out;
}

export interface ReportDraftInput {
  caseId: string;
  moduleId: string;
  title?: string;
  url?: string;
  productName?: string;
  status?: string;
  agencyCandidate?: string;
  priorityScore?: number;
  priorityLabel?: string;
  capturedAt?: string;
  memo?: string;

  // 분석 산출물
  ruleMatches?: CaseRuleMatch[];
  ruleSafetyNotice?: string;
  llmAnalysis?: CaseLlmAnalysis | null;
  scoringResult?: ScoringResult | null;

  // 증거 패키지 (요약)
  evidence?: {
    hasHtml?: boolean; hasText?: boolean; hasScreenshot?: boolean; hasPdf?: boolean;
    hasMetadata?: boolean; hasManifest?: boolean;
    capturedAt?: string | null;
    files?: { name: string; size: number; sha256: string; mimeType: string }[];
  };

  // 사업자 표시 (사람이 직접 채울 자리)
  sellerCandidates?: string[];

  // 검출된 가격/추출 정보
  extractionWarnings?: string[];
}

export class ReportService {
  // ---------- 경로 헬퍼 ----------

  getReportDir(caseId: string): string {
    if (!isSafeCaseId(caseId)) {
      throw new Error(`Invalid caseId: ${caseId}`);
    }
    return path.join(config.reportsDir, caseId);
  }

  getReportFilePath(caseId: string, fileName: string): string {
    if (!isAllowedReportFileName(fileName)) {
      throw new Error(`Invalid report file name: ${fileName}`);
    }
    return path.join(this.getReportDir(caseId), fileName);
  }

  async listReports(caseId: string): Promise<string[]> {
    const dir = this.getReportDir(caseId);
    try {
      const files = await readdir(dir);
      return files.filter((n) => isAllowedReportFileName(n));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw error;
    }
  }

  async readReport(caseId: string, fileName: string): Promise<Buffer> {
    return readFile(this.getReportFilePath(caseId, fileName));
  }

  // ---------- 신고서 본문 생성 ----------

  private buildMarkdown(input: ReportDraftInput, warnings: string[]): string {
    // 위조상품 모듈은 별도 템플릿 사용 (false_ad 의 보건/광고 문구와 섞이지 않게 분리)
    if (input.moduleId === "counterfeit_goods") {
      return this.buildCounterfeitMarkdown(input, warnings);
    }
    // 일반식품 허위·과대광고 (2차 확장) — 건강기능식품과 분리된 전용 템플릿
    if (input.moduleId === "general_food_false_ad") {
      return this.buildGeneralFoodMarkdown(input, warnings);
    }
    // 화장품 허위·과대광고 (3차 확장) — 의약품 오인·기능성 범위 초과 관점의 전용 템플릿
    if (input.moduleId === "cosmetic_false_ad") {
      return this.buildCosmeticMarkdown(input, warnings);
    }
    const title = sanitizeReportText(input.title ?? input.productName ?? input.caseId, warnings);
    const url = sanitizeReportText(input.url ?? "", warnings);
    const productName = sanitizeReportText(input.productName ?? "", warnings) || "(미식별)";
    const agency = sanitizeReportText(input.agencyCandidate ?? "식품의약품안전처 (후보)", warnings);
    const priorityScore = typeof input.priorityScore === "number" ? input.priorityScore : null;
    const priorityLabel = sanitizeReportText(input.priorityLabel ?? "", warnings) || "(미계산)";
    const captured = sanitizeReportText(input.capturedAt ?? input.evidence?.capturedAt ?? "", warnings) || "(미기록)";

    const matches = (input.ruleMatches ?? []).slice(0, 30);
    const matchRows = matches.length
      ? matches.map((m, i) =>
          `| ${i + 1} | ${escapeMd(sanitizeReportText(m.sentence ?? m.keyword, warnings))} | ${escapeMd(m.riskLevel)} | ${escapeMd(m.sourceSection ?? "main")} | ${escapeMd(sanitizeReportText(m.reason, warnings))} |`
        ).join("\n")
      : "| - | - | - | - | 매치된 룰이 없습니다. |";

    const evidenceFiles = input.evidence?.files ?? [];
    const evidenceRows = evidenceFiles.length
      ? evidenceFiles.map((f, i) => `| ${i + 1} | ${escapeMd(f.name)} | ${escapeMd(f.name)} | ${escapeMd(f.mimeType)} (${f.size}B) | \`${escapeMd((f.sha256 ?? "").slice(0, 16))}…\` |`).join("\n")
      : "| - | - | - | 증거 패키지가 아직 생성되지 않았습니다. 신고 전 캡처/PDF 저장을 권장합니다. | - |";

    const llm = input.llmAnalysis ?? null;
    const aiSummary = sanitizeReportText(llm?.summary ?? "(AI 분석 요약이 제공되지 않았습니다)", warnings);
    const aiLikelihood = llm ? `${llm.violationLikelihood} / ${llm.overallRisk}` : "(미수행)";
    const aiMissing = (llm?.missingEvidence ?? []).map((e) => `- ${sanitizeReportText(e, warnings)}`).join("\n") || "- (없음)";
    const aiCautions = (llm?.safetyWarnings ?? []).map((e) => `- ${sanitizeReportText(e, warnings)}`).join("\n") || "- (없음)";

    const scoring = input.scoringResult ?? null;
    const scoringComps = scoring
      ? scoring.components.map((c) => `- ${c.label}: ${c.score}/${c.maxPoints}`).join("\n")
      : "- (점수 미계산)";
    const recActions = scoring?.recommendedNextActions ?? [];
    const recHtml = recActions.length ? recActions.map((a) => `- ${sanitizeReportText(a, warnings)}`).join("\n") : "- (없음)";

    const lines: string[] = [];
    lines.push(`# 건강기능식품 온라인 허위·과대광고 신고 후보 검토 요청서 초안`);
    lines.push("");
    lines.push(`> 본 문서는 **자동 신고서가 아닙니다.** 사람이 검토·수정 후 공식 신고 창구에 직접 제출하는 보조 자료입니다.`);
    lines.push(`> AI 분석 결과는 법률 자문이나 행정기관 판단을 대체하지 않습니다. 포상금 지급을 보장하지 않습니다.`);
    lines.push("");
    lines.push(`## 1. 제목`);
    lines.push("");
    lines.push(`건강기능식품 온라인 광고 표현 관련 검토 요청 — ${title}`);
    lines.push("");
    lines.push(`## 2. 신고 후보 요약`);
    lines.push("");
    lines.push(`- 신고 후보 유형: 건강기능식품 온라인 허위·과대광고 의심`);
    lines.push(`- 신고처 후보: ${agency}`);
    lines.push(`- 원본 URL: ${url || "(미기록)"}`);
    lines.push(`- 수집일시: ${captured}`);
    lines.push(`- 상품명 또는 광고 제목: ${productName}`);
    lines.push(`- 판매자 표시 정보: ${(input.sellerCandidates ?? []).map((s) => sanitizeReportText(s, warnings)).join(" / ") || "(공개 표시 정보 확인 필요)"}`);
    lines.push(`- 신고 후보 우선순위 점수: ${priorityScore != null ? `${priorityScore}/100 (${priorityLabel})` : "(미계산)"}`);
    lines.push(`- 상태: ${sanitizeReportText(input.status ?? "DRAFT", warnings)}`);
    lines.push(`- 주의: 본 문서는 자동 신고서가 아니라 사람이 검토·수정 후 제출할 수 있는 초안입니다.`);
    lines.push("");
    lines.push(`## 3. 육하원칙 정리`);
    lines.push("");
    lines.push(`- 누가: (광고 게시자 — 페이지 공개 표시 정보 확인 필요)`);
    lines.push(`- 언제: ${captured}`);
    lines.push(`- 어디서: ${url || "(원본 URL 미기록)"}`);
    lines.push(`- 무엇을: ${productName} 관련 광고 표현`);
    lines.push(`- 어떻게: 질병 치료·예방·완치 표현, 의약품 오인 표현, 과장 효능 표현 등 의심`);
    lines.push(`- 왜 검토가 필요한지: 건강기능식품 광고 기준에 부합하는지 검토 필요`);
    lines.push("");
    lines.push(`## 4. 위반 의심 문구`);
    lines.push("");
    lines.push(`아래 문구는 RuleAgent와 AI 분석을 통해 검토 후보로 분류된 표현입니다.`);
    lines.push(`법 위반 확정이 아니라 행정기관 검토 요청 대상입니다.`);
    lines.push("");
    lines.push(`| No | 문구 | 위험도 | 위치/섹션 | 검토 필요 사유 |`);
    lines.push(`|----|------|--------|-----------|----------------|`);
    lines.push(matchRows);
    lines.push("");
    lines.push(`## 5. AI 문맥 검토 요약`);
    lines.push("");
    lines.push(`- AI 분석 요약: ${aiSummary}`);
    lines.push(`- 위반 가능성 검토 의견: ${aiLikelihood}`);
    lines.push(`- 보완 증거:`);
    lines.push(aiMissing);
    lines.push(`- 주의사항:`);
    lines.push(aiCautions);
    lines.push("");
    lines.push(`AI 분석은 법률 자문이나 행정기관 판단을 대체하지 않습니다.`);
    lines.push("");
    lines.push(`## 6. 증거 자료 목록`);
    lines.push("");
    lines.push(`| No | 자료명 | 파일명 | 설명 | 해시(앞 16자) |`);
    lines.push(`|----|--------|--------|------|----------------|`);
    lines.push(evidenceRows);
    lines.push("");
    lines.push(`## 7. 첨부 가능 자료`);
    lines.push("");
    lines.push(`- 화면 캡처 (screenshot.png)`);
    lines.push(`- PDF 저장본 (page.pdf)`);
    lines.push(`- HTML 원본 (page.html)`);
    lines.push(`- 텍스트 추출본 (page.txt)`);
    lines.push(`- manifest.json`);
    lines.push(`- metadata.json`);
    lines.push("");
    lines.push(`## 8. 신고처 후보`);
    lines.push("");
    lines.push(`- 식품의약품안전처`);
    lines.push(`- 국민신문고 / 국민권익위원회`);
    lines.push(`- 관할 지자체`);
    lines.push("");
    lines.push(`구체적 신고처와 포상금 지급 여부는 공식 기준과 조사 결과에 따라 달라질 수 있습니다.`);
    lines.push("");
    lines.push(`## 9. 신고 전 사람 검토 체크리스트`);
    lines.push("");
    lines.push(`- [ ] 원본 URL이 공개 페이지인지 확인`);
    lines.push(`- [ ] 캡처와 PDF가 정상 열리는지 확인`);
    lines.push(`- [ ] 위반 의심 문구가 실제 광고 페이지에 표시되는지 확인`);
    lines.push(`- [ ] 상품명과 판매자 표시 정보가 정확한지 확인`);
    lines.push(`- [ ] 개인정보가 불필요하게 포함되지 않았는지 확인`);
    lines.push(`- [ ] 신고처 공식 안내를 확인`);
    lines.push(`- [ ] 포상금 지급을 단정·약속하는 표현이 없는지 확인`);
    lines.push(`- [ ] 최종 제출 문구를 사람이 직접 검토`);
    lines.push("");
    lines.push(`## 10. 신고 후보 우선순위 점수 (참고)`);
    lines.push("");
    lines.push(scoringComps);
    lines.push("");
    lines.push(`### 다음 행동 추천`);
    lines.push("");
    lines.push(recHtml);
    lines.push("");
    lines.push(`> 본 점수는 사람이 먼저 검토할 후보의 우선순위를 위한 참고 점수이며, 법 위반 확정이나 포상금 지급 가능성을 의미하지 않습니다.`);
    lines.push("");
    lines.push(`## 11. 중립 신고 문구 예시`);
    lines.push("");
    lines.push(`다음 온라인 광고에서 건강기능식품과 관련하여 질병 치료·예방 또는 의약품 오인 가능성이 있는 표현이 포함된 것으로 보여 검토를 요청드립니다.`);
    lines.push("");
    lines.push(`첨부자료에는 원본 URL, 수집일시, 화면 캡처, PDF 저장본 및 위반 의심 문구 정리표가 포함되어 있습니다.`);
    lines.push("");
    lines.push(`본 신고는 법 위반을 단정하는 것이 아니라 관계 기관의 확인을 요청하는 취지입니다.`);
    lines.push("");
    lines.push(`## 12. 피해야 할 표현`);
    lines.push("");
    lines.push(`다음 유형의 표현은 신고서에 사용하지 않습니다 (중립 표현으로 대체):`);
    lines.push("");
    lines.push(`- 위반·불법 단정 표현`);
    lines.push(`- 범죄·사기 단정 표현`);
    lines.push(`- 무조건 처벌 요구`);
    lines.push(`- 포상금 지급 요구·지급 단정`);
    lines.push(`- 허위 사실 단정 표현`);
    lines.push(`- 고의성 단정 표현`);
    lines.push("");
    lines.push(`---`);
    lines.push(`자동 신고는 수행하지 않습니다. 본 초안은 사람 검토·수정 후 사용자가 직접 외부 신고기관에 제출하는 자료입니다.`);

    return lines.join("\n");
  }

  // ---------- 위조상품 신고서 초안 (체크리스트 24) ----------
  private buildCounterfeitMarkdown(input: ReportDraftInput, warnings: string[]): string {
    const title = sanitizeReportText(input.title ?? input.productName ?? input.caseId, warnings);
    const url = sanitizeReportText(input.url ?? "", warnings) || "(미기록)";
    const productName = sanitizeReportText(input.productName ?? "", warnings) || "(미식별)";
    const captured = sanitizeReportText(input.capturedAt ?? input.evidence?.capturedAt ?? "", warnings) || "(미기록)";
    const agency = sanitizeReportText(
      input.agencyCandidate ?? "특허청 / 지식재산침해 원스톱 신고상담센터",
      warnings
    );
    const sellerInfo =
      (input.sellerCandidates ?? []).map((s) => sanitizeReportText(s, warnings)).join(" / ")
      || "(공개 표시 정보 확인 필요 — 판매자 개인정보는 저장하지 않습니다)";

    const priorityScore = typeof input.priorityScore === "number" ? input.priorityScore : null;
    const priorityLabel = sanitizeReportText(input.priorityLabel ?? "", warnings) || "(미계산)";

    const matches = (input.ruleMatches ?? []).slice(0, 30);
    const counterfeitPhrases = matches
      .map((m) => escapeMd(sanitizeReportText(m.sentence ?? m.keyword, warnings)))
      .slice(0, 10).join(" / ") || "(매치된 룰 없음)";
    const matchRows = matches.length
      ? matches.map((m, i) =>
          `| ${i + 1} | ${escapeMd(sanitizeReportText(m.sentence ?? m.keyword, warnings))} | ${escapeMd(m.riskLevel)} | ${escapeMd(m.category ?? "")} | ${escapeMd(sanitizeReportText(m.reason, warnings))} |`
        ).join("\n")
      : "| - | - | - | - | 매치된 룰이 없습니다. |";

    const evidenceFiles = input.evidence?.files ?? [];
    const evidenceRows = evidenceFiles.length
      ? evidenceFiles.map((f, i) => `| ${i + 1} | ${escapeMd(f.name)} | ${escapeMd(f.mimeType)} (${f.size}B) | \`${escapeMd((f.sha256 ?? "").slice(0, 16))}…\` |`).join("\n")
      : "| - | - | 증거 패키지가 아직 생성되지 않았습니다. 신고 전 캡처/PDF 저장을 권장합니다. | - |";

    const scoring = input.scoringResult ?? null;
    const scoringComps = scoring
      ? scoring.components.map((c) => `- ${c.label}: ${c.score}/${c.maxPoints}`).join("\n")
      : "- (점수 미계산)";
    const recActions = scoring?.recommendedNextActions ?? [];
    const recList = recActions.length
      ? recActions.map((a) => `- ${sanitizeReportText(a, warnings)}`).join("\n")
      : "- (없음)";

    const lines: string[] = [];
    lines.push(`# 위조상품 온라인 판매 의심 신고 후보 검토 요청서 초안`);
    lines.push("");
    lines.push(`> 본 문서는 **자동 신고서가 아닙니다.** 사람이 검토·수정 후 공식 신고 창구에 직접 제출하는 보조 자료입니다.`);
    lines.push(`> 본 문서는 **위조 여부를 확정하지 않습니다.** 권리자 감정과 관계기관 판단이 별도로 필요합니다. 포상금 지급을 보장하지 않습니다.`);
    lines.push("");
    lines.push(`## 1. 제목`);
    lines.push("");
    lines.push(`위조상품 온라인 판매 의심 검토 요청 — ${title}`);
    lines.push("");
    lines.push(`## 2. 신고 후보 요약`);
    lines.push("");
    lines.push(`- 신고 후보 유형: 위조상품 온라인 판매 의심`);
    lines.push(`- 원본 URL: ${url}`);
    lines.push(`- 수집일시: ${captured}`);
    lines.push(`- 상품명/모델명: ${productName}`);
    lines.push(`- 판매자 표시 정보 (공개 영역만): ${sellerInfo}`);
    lines.push(`- 신고처 후보: ${agency}`);
    lines.push(`- 신고 후보 우선순위 점수: ${priorityScore != null ? `${priorityScore}/100 (${priorityLabel})` : "(미계산)"}`);
    lines.push(`- 상태: ${sanitizeReportText(input.status ?? "DRAFT", warnings)}`);
    lines.push(`- 주의: 본 문서는 자동 신고서가 아니라 사람이 검토·수정 후 제출할 수 있는 초안입니다.`);
    lines.push("");
    lines.push(`## 3. 위조상품 의심 정황`);
    lines.push("");
    lines.push(`- 위조 의심 문구 (상위): ${counterfeitPhrases}`);
    lines.push(`- 정품 아님을 암시하는 표현, 정품 구성품 모방 표현, 비공개 채널 유도 신호 등에 해당하는 표현이 게시글 내에서 관찰되었습니다.`);
    lines.push(`- 다음 표는 RuleAgent가 검토 후보로 분류한 표현입니다. 위조 확정이 아니라 관계기관 검토 요청 대상입니다.`);
    lines.push("");
    lines.push(`| No | 문구 | 위험도 | 카테고리 | 검토 필요 사유 |`);
    lines.push(`|----|------|--------|----------|----------------|`);
    lines.push(matchRows);
    lines.push("");
    lines.push(`## 4. 증거 자료 목록`);
    lines.push("");
    lines.push(`| No | 파일명 | 유형 | 해시(앞 16자) |`);
    lines.push(`|----|--------|------|----------------|`);
    lines.push(evidenceRows);
    lines.push("");
    lines.push(`첨부 가능 자료: 화면 캡처 (screenshot.png), PDF 저장본 (page.pdf), HTML 원본 (page.html), 텍스트 추출본 (page.txt), manifest.json, metadata.json`);
    lines.push("");
    lines.push(`## 5. 신고처 후보`);
    lines.push("");
    lines.push(`- 특허청 (위조상품 신고포상금 안내)`);
    lines.push(`  https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346`);
    lines.push(`- 지식재산침해 원스톱 신고상담센터`);
    lines.push(`  https://koipa.re.kr/ippolice/`);
    lines.push(`- 사안에 따라 관할 지자체 / 수사기관`);
    lines.push("");
    lines.push(`구체적 신고 채널·포상금 지급 여부·한도·신청 절차는 공식 기준과 처리 결과에 따라 달라질 수 있으므로 각 기관 공식 페이지를 직접 확인하세요.`);
    lines.push("");
    lines.push(`## 6. 신고 전 사람 검토 체크리스트`);
    lines.push("");
    lines.push(`- [ ] 원본 URL이 공개 페이지인지 확인`);
    lines.push(`- [ ] 권리자/상표 표시가 명확한지 확인`);
    lines.push(`- [ ] 판매게시글 URL 저장 여부`);
    lines.push(`- [ ] 동일 판매자 추정 증거 확인`);
    lines.push(`- [ ] 위조상품 의심 증거 화면 확보`);
    lines.push(`- [ ] 가격/구성품 캡처 확보`);
    lines.push(`- [ ] 비공개 채팅방/판매자 개인정보가 포함되지 않았는지 확인`);
    lines.push(`- [ ] 공식 기준 안내 확인`);
    lines.push(`- [ ] 포상금 지급을 단정·약속하는 표현이 없는지 확인`);
    lines.push(`- [ ] 최종 제출 문구를 사람이 직접 검토`);
    lines.push("");
    lines.push(`## 7. 신고 후보 우선순위 점수 (참고)`);
    lines.push("");
    lines.push(scoringComps);
    lines.push("");
    lines.push(`### 다음 행동 추천`);
    lines.push("");
    lines.push(recList);
    lines.push("");
    lines.push(`> 본 점수는 사람이 먼저 검토할 후보의 우선순위를 위한 참고 점수이며, 위조 확정·법 위반 확정·포상금 지급 가능성을 의미하지 않습니다.`);
    lines.push("");
    lines.push(`## 8. 중립 신고 문구 예시`);
    lines.push("");
    lines.push(`다음 온라인 판매게시글에서 위조상품 또는 상표권 침해가 의심되는 표현과 상품 표시가 확인되어 관계기관의 검토를 요청드립니다.`);
    lines.push("");
    lines.push(`본 신고는 위조 여부를 단정하는 것이 아니라 판매게시글과 증거자료를 근거로 확인을 요청하는 취지입니다.`);
    lines.push("");
    lines.push(`## 9. 피해야 할 표현`);
    lines.push("");
    lines.push(`- 위조 확정 / 침해 확정 단정 표현`);
    lines.push(`- 범죄자 / 사기꾼 단정 표현`);
    lines.push(`- 무조건 처벌 요구`);
    lines.push(`- 포상금 지급 요구·지급 단정`);
    lines.push(`- 판매자 개인 식별 정보 (휴대전화/이메일/주소 등)`);
    lines.push("");
    lines.push(`---`);
    lines.push(`자동 신고는 수행하지 않습니다. 본 초안은 사람 검토·수정 후 사용자가 직접 공식 신고 창구에 제출하는 자료입니다.`);
    return lines.join("\n");
  }

  // ---------- 일반식품 허위·과대광고 신고서 초안 (체크리스트 34) ----------
  // 건강기능식품 템플릿을 복사하지 않고, 일반식품(기능성 표시 불가) 맥락에 맞게 문구를 조정한다.
  private buildGeneralFoodMarkdown(input: ReportDraftInput, warnings: string[]): string {
    const title = sanitizeReportText(input.title ?? input.productName ?? input.caseId, warnings);
    const url = sanitizeReportText(input.url ?? "", warnings) || "(미기록)";
    const productName = sanitizeReportText(input.productName ?? "", warnings) || "(미식별)";
    const agency = sanitizeReportText(input.agencyCandidate ?? "식품의약품안전처 (후보)", warnings);
    const priorityScore = typeof input.priorityScore === "number" ? input.priorityScore : null;
    const priorityLabel = sanitizeReportText(input.priorityLabel ?? "", warnings) || "(미계산)";
    const captured = sanitizeReportText(input.capturedAt ?? input.evidence?.capturedAt ?? "", warnings) || "(미기록)";

    const matches = (input.ruleMatches ?? []).slice(0, 30);
    const matchRows = matches.length
      ? matches.map((m, i) =>
          `| ${i + 1} | ${escapeMd(sanitizeReportText(m.sentence ?? m.keyword, warnings))} | ${escapeMd(m.riskLevel)} | ${escapeMd(m.sourceSection ?? m.category ?? "main")} | ${escapeMd(sanitizeReportText(m.reason, warnings))} |`
        ).join("\n")
      : "| - | - | - | - | 매치된 룰이 없습니다. |";

    const evidenceFiles = input.evidence?.files ?? [];
    const evidenceRows = evidenceFiles.length
      ? evidenceFiles.map((f, i) => `| ${i + 1} | ${escapeMd(f.name)} | ${escapeMd(f.mimeType)} (${f.size}B) | \`${escapeMd((f.sha256 ?? "").slice(0, 16))}…\` |`).join("\n")
      : "| - | - | 증거 패키지가 아직 생성되지 않았습니다. 신고 전 캡처/PDF 저장을 권장합니다. | - |";

    const llm = input.llmAnalysis ?? null;
    const aiSummary = sanitizeReportText(llm?.summary ?? "(AI 분석 요약이 제공되지 않았습니다)", warnings);
    const aiLikelihood = llm ? `${llm.violationLikelihood} / ${llm.overallRisk}` : "(미수행)";
    const scoring = input.scoringResult ?? null;
    const scoringComps = scoring
      ? scoring.components.map((c) => `- ${c.label}: ${c.score}/${c.maxPoints}`).join("\n")
      : "- (점수 미계산)";

    const lines: string[] = [];
    lines.push(`# 일반식품 온라인 허위·과대광고 신고 후보 검토 요청서 초안`);
    lines.push("");
    lines.push(`> 본 문서는 **자동 신고서가 아닙니다.** 사람이 검토·수정 후 공식 신고 창구에 직접 제출하는 보조 자료입니다.`);
    lines.push(`> 본 결과는 **법 위반 확정이 아닙니다.** 일반식품 광고가 의약품·건강기능식품처럼 보이는지 검토를 요청하는 취지이며, 포상금 지급을 보장하지 않습니다.`);
    lines.push("");
    lines.push(`## 1. 제목`);
    lines.push("");
    lines.push(`일반식품 온라인 광고 표현 관련 검토 요청 — ${title}`);
    lines.push("");
    lines.push(`## 2. 신고 후보 요약`);
    lines.push("");
    lines.push(`- 신고 후보 유형: 일반식품 온라인 허위·과대광고 의심`);
    lines.push(`- 일반식품 광고 유형: 질병 치료·예방 표현 / 의약품 대체 / 다이어트·면역·해독 과장 / 혈당·혈압·콜레스테롤 오인 / 항암·염증 오인 / 즉시효과·100% 보장 (해당 항목 사람 확인 필요)`);
    lines.push(`- 신고처 후보: ${agency}`);
    lines.push(`- 원본 URL: ${url}`);
    lines.push(`- 수집일시: ${captured}`);
    lines.push(`- 상품명 또는 광고 제목: ${productName}`);
    lines.push(`- 판매자 표시 정보: ${(input.sellerCandidates ?? []).map((s) => sanitizeReportText(s, warnings)).join(" / ") || "(공개 표시 정보 확인 필요)"}`);
    lines.push(`- 신고 후보 우선순위 점수: ${priorityScore != null ? `${priorityScore}/100 (${priorityLabel})` : "(미계산)"}`);
    lines.push(`- 상태: ${sanitizeReportText(input.status ?? "DRAFT", warnings)}`);
    lines.push(`- 주의: 본 문서는 자동 신고서가 아니라 사람이 검토·수정 후 제출할 수 있는 초안입니다.`);
    lines.push("");
    lines.push(`## 3. 의심 문구 (검토 후보)`);
    lines.push("");
    lines.push(`아래 문구는 일반식품 키워드 룰과 AI 문맥 검토로 분류된 검토 후보 표현입니다. 법 위반 확정이 아니라 관계 기관 검토 요청 대상입니다.`);
    lines.push(`일반식품은 인정된 기능성 표시가 허용되지 않으므로, 질병·의약품·기능성 효능 표현은 더 분명한 검토 후보가 됩니다.`);
    lines.push("");
    lines.push(`| No | 문구 | 위험도 | 위치/분류 | 검토 필요 사유 |`);
    lines.push(`|----|------|--------|-----------|----------------|`);
    lines.push(matchRows);
    lines.push("");
    lines.push(`## 4. AI 문맥 검토 요약`);
    lines.push("");
    lines.push(`- AI 분석 요약: ${aiSummary}`);
    lines.push(`- 위반 가능성 검토 의견(후보): ${aiLikelihood}`);
    lines.push(`AI 분석은 법률 자문이나 행정기관 판단을 대체하지 않습니다.`);
    lines.push("");
    lines.push(`## 5. 룰 탐지 결과 / 위험점수 (참고)`);
    lines.push("");
    lines.push(scoringComps);
    lines.push("");
    lines.push(`> 본 점수는 사람이 먼저 검토할 후보의 우선순위 참고용이며, 법 위반 확정이나 포상금 지급 가능성을 의미하지 않습니다.`);
    lines.push("");
    lines.push(`## 6. 증거 자료 목록`);
    lines.push("");
    lines.push(`| No | 파일명 | 유형 | 해시(앞 16자) |`);
    lines.push(`|----|--------|------|----------------|`);
    lines.push(evidenceRows);
    lines.push("");
    lines.push(`## 7. 신고 전 사람 검토 체크리스트`);
    lines.push("");
    lines.push(`- [ ] 원본 URL이 공개 페이지인지 확인`);
    lines.push(`- [ ] 캡처와 PDF가 정상 열리는지 확인`);
    lines.push(`- [ ] 의심 문구가 실제 광고 페이지에 표시되는지 확인`);
    lines.push(`- [ ] 대상이 건강기능식품이 아니라 일반식품인지 확인`);
    lines.push(`- [ ] 개인정보가 불필요하게 포함되지 않았는지 확인`);
    lines.push(`- [ ] 신고처 공식 안내를 확인`);
    lines.push(`- [ ] 포상금 지급을 단정·약속하는 표현이 없는지 확인`);
    lines.push(`- [ ] 최종 제출 문구를 사람이 직접 검토`);
    lines.push("");
    lines.push(`## 8. 공식 신고처 후보`);
    lines.push("");
    lines.push(`- 식품의약품안전처 (식품 허위·과대광고 신고)`);
    lines.push(`- 국민신문고`);
    lines.push(`- 관할 지자체 · 보건소 · 식품안전관리과`);
    lines.push("");
    lines.push(`구체적 신고처와 포상금 지급 여부는 공식 기준과 조사 결과에 따라 달라질 수 있습니다. 공식 URL은 변경될 수 있으니 신고 전 공식 사이트에서 확인하세요.`);
    lines.push("");
    lines.push(`## 9. 중립 신고 문구 예시`);
    lines.push("");
    lines.push(`다음 온라인 광고에서 일반식품이 질병 치료·예방 또는 의약품·건강기능식품처럼 오인될 수 있는 표현이 포함된 것으로 보여 검토를 요청드립니다.`);
    lines.push("");
    lines.push(`첨부자료에는 원본 URL, 수집일시, 화면 캡처, PDF 저장본 및 의심 문구 정리표가 포함되어 있습니다. 본 신고는 법 위반을 단정하는 것이 아니라 관계 기관의 확인을 요청하는 취지입니다.`);
    lines.push("");
    lines.push(`## 10. 피해야 할 표현`);
    lines.push("");
    lines.push(`- 위반·불법 단정 표현 / 범죄·사기 단정 표현 / 무조건 처벌 요구`);
    lines.push(`- 포상금 지급 요구·지급 단정 / 허위 사실 단정 / 고의성 단정`);
    lines.push("");
    lines.push(`## 11. 안내`);
    lines.push("");
    lines.push(`- 법 위반 확정 아님`);
    lines.push(`- 포상금 지급 보장 아님`);
    lines.push(`- 실제 신고는 사용자가 공식 창구에서 직접 제출`);
    lines.push("");
    lines.push(`---`);
    lines.push(`자동 신고는 수행하지 않습니다. 본 초안은 사람 검토·수정 후 사용자가 직접 공식 신고 창구에 제출하는 자료입니다.`);
    return lines.join("\n");
  }

  // ---------- 화장품 허위·과대광고 신고서 초안 (체크리스트 38) ----------
  // 건강기능식품/일반식품 템플릿을 복사하지 않고, 화장품(의약품 오인·기능성 범위 초과) 맥락에 맞게 조정한다.
  private buildCosmeticMarkdown(input: ReportDraftInput, warnings: string[]): string {
    const title = sanitizeReportText(input.title ?? input.productName ?? input.caseId, warnings);
    const url = sanitizeReportText(input.url ?? "", warnings) || "(미기록)";
    const productName = sanitizeReportText(input.productName ?? "", warnings) || "(미식별)";
    const agency = sanitizeReportText(input.agencyCandidate ?? "식품의약품안전처 (후보)", warnings);
    const priorityScore = typeof input.priorityScore === "number" ? input.priorityScore : null;
    const priorityLabel = sanitizeReportText(input.priorityLabel ?? "", warnings) || "(미계산)";
    const captured = sanitizeReportText(input.capturedAt ?? input.evidence?.capturedAt ?? "", warnings) || "(미기록)";

    const matches = (input.ruleMatches ?? []).slice(0, 30);
    const matchRows = matches.length
      ? matches.map((m, i) =>
          `| ${i + 1} | ${escapeMd(sanitizeReportText(m.sentence ?? m.keyword, warnings))} | ${escapeMd(m.riskLevel)} | ${escapeMd(m.sourceSection ?? m.category ?? "main")} | ${escapeMd(sanitizeReportText(m.reason, warnings))} |`
        ).join("\n")
      : "| - | - | - | - | 매치된 룰이 없습니다. |";

    const evidenceFiles = input.evidence?.files ?? [];
    const evidenceRows = evidenceFiles.length
      ? evidenceFiles.map((f, i) => `| ${i + 1} | ${escapeMd(f.name)} | ${escapeMd(f.mimeType)} (${f.size}B) | \`${escapeMd((f.sha256 ?? "").slice(0, 16))}…\` |`).join("\n")
      : "| - | - | 증거 패키지가 아직 생성되지 않았습니다. 신고 전 캡처/PDF 저장을 권장합니다. | - |";

    const llm = input.llmAnalysis ?? null;
    const aiSummary = sanitizeReportText(llm?.summary ?? "(AI 분석 요약이 제공되지 않았습니다)", warnings);
    const aiLikelihood = llm ? `${llm.violationLikelihood} / ${llm.overallRisk}` : "(미수행)";
    const scoring = input.scoringResult ?? null;
    const scoringComps = scoring
      ? scoring.components.map((c) => `- ${c.label}: ${c.score}/${c.maxPoints}`).join("\n")
      : "- (점수 미계산)";

    const lines: string[] = [];
    lines.push(`# 화장품 온라인 허위·과대광고 신고 후보 검토 요청서 초안`);
    lines.push("");
    lines.push(`> 본 문서는 **자동 신고서가 아닙니다.** 사람이 검토·수정 후 공식 신고 창구에 직접 제출하는 보조 자료입니다.`);
    lines.push(`> 본 결과는 **법 위반 확정이 아닙니다.** 화장품 광고가 의약품·치료제처럼 보이거나 인정된 기능성 화장품 범위를 넘는지 검토를 요청하는 취지이며, 포상금 지급을 보장하지 않습니다.`);
    lines.push("");
    lines.push(`## 1. 제목`);
    lines.push("");
    lines.push(`화장품 온라인 광고 표현 관련 검토 요청 — ${title}`);
    lines.push("");
    lines.push(`## 2. 신고 후보 요약`);
    lines.push("");
    lines.push(`- 신고 후보 유형: 화장품 온라인 허위·과대광고 의심`);
    lines.push(`- 화장품 광고 유형: 피부질환 치료 / 의약품 대체 / 주름 완전 제거 / 미백·재생·흉터 제거 과장 / 탈모·아토피·여드름·피부염 치료 오인 / 즉시효과·100% 보장 / 기능성 범위 초과 (해당 항목 사람 확인 필요)`);
    lines.push(`- 기능성 화장품 해당 여부: 미백·주름개선·자외선차단 등 인정 기능성 범위 내인지 사람 확인 필요`);
    lines.push(`- 신고처 후보: ${agency}`);
    lines.push(`- 원본 URL: ${url}`);
    lines.push(`- 수집일시: ${captured}`);
    lines.push(`- 상품명 또는 광고 제목: ${productName}`);
    lines.push(`- 판매자 표시 정보: ${(input.sellerCandidates ?? []).map((s) => sanitizeReportText(s, warnings)).join(" / ") || "(공개 표시 정보 확인 필요)"}`);
    lines.push(`- 신고 후보 우선순위 점수: ${priorityScore != null ? `${priorityScore}/100 (${priorityLabel})` : "(미계산)"}`);
    lines.push(`- 상태: ${sanitizeReportText(input.status ?? "DRAFT", warnings)}`);
    lines.push(`- 주의: 본 문서는 자동 신고서가 아니라 사람이 검토·수정 후 제출할 수 있는 초안입니다.`);
    lines.push("");
    lines.push(`## 3. 의심 문구 (검토 후보)`);
    lines.push("");
    lines.push(`아래 문구는 화장품 키워드 룰과 AI 문맥 검토로 분류된 검토 후보 표현입니다. 법 위반 확정이 아니라 관계 기관 검토 요청 대상입니다.`);
    lines.push(`미백·주름개선·자외선차단 등은 인정된 기능성 화장품 범위 내 표현일 수 있으므로, 범위를 넘는 단정·치료·완전 제거 표현인지 사람이 검토해야 합니다.`);
    lines.push("");
    lines.push(`| No | 문구 | 위험도 | 위치/분류 | 검토 필요 사유 |`);
    lines.push(`|----|------|--------|-----------|----------------|`);
    lines.push(matchRows);
    lines.push("");
    lines.push(`## 4. AI 문맥 검토 요약`);
    lines.push("");
    lines.push(`- AI 분석 요약: ${aiSummary}`);
    lines.push(`- 위반 가능성 검토 의견(후보): ${aiLikelihood}`);
    lines.push(`AI 분석은 법률 자문이나 행정기관 판단을 대체하지 않습니다.`);
    lines.push("");
    lines.push(`## 5. 룰 탐지 결과 / 위험점수 (참고)`);
    lines.push("");
    lines.push(scoringComps);
    lines.push("");
    lines.push(`> 본 점수는 사람이 먼저 검토할 후보의 우선순위 참고용이며, 법 위반 확정이나 포상금 지급 가능성을 의미하지 않습니다.`);
    lines.push("");
    lines.push(`## 6. 증거 자료 목록`);
    lines.push("");
    lines.push(`| No | 파일명 | 유형 | 해시(앞 16자) |`);
    lines.push(`|----|--------|------|----------------|`);
    lines.push(evidenceRows);
    lines.push("");
    lines.push(`## 7. 신고 전 사람 검토 체크리스트`);
    lines.push("");
    lines.push(`- [ ] 원본 URL이 공개 페이지인지 확인`);
    lines.push(`- [ ] 캡처와 PDF가 정상 열리는지 확인`);
    lines.push(`- [ ] 의심 문구가 실제 광고 페이지에 표시되는지 확인`);
    lines.push(`- [ ] 인정된 기능성 화장품 범위 내 표현인지 확인`);
    lines.push(`- [ ] 개인정보가 불필요하게 포함되지 않았는지 확인`);
    lines.push(`- [ ] 신고처 공식 안내를 확인`);
    lines.push(`- [ ] 포상금 지급을 단정·약속하는 표현이 없는지 확인`);
    lines.push(`- [ ] 최종 제출 문구를 사람이 직접 검토`);
    lines.push("");
    lines.push(`## 8. 공식 신고처 후보`);
    lines.push("");
    lines.push(`- 식품의약품안전처 (화장품 표시·광고 관련 신고)`);
    lines.push(`- 국민신문고`);
    lines.push(`- 관할 지자체 · 보건소 · 관련 행정기관`);
    lines.push("");
    lines.push(`구체적 신고처와 포상금 지급 여부는 공식 기준과 조사 결과에 따라 달라질 수 있습니다. 공식 URL은 변경될 수 있으니 신고 전 공식 사이트에서 확인하세요.`);
    lines.push("");
    lines.push(`## 9. 중립 신고 문구 예시`);
    lines.push("");
    lines.push(`다음 온라인 광고에서 화장품이 의약품·치료제처럼 오인될 수 있거나 인정된 기능성 화장품 범위를 넘는 표현이 포함된 것으로 보여 검토를 요청드립니다.`);
    lines.push("");
    lines.push(`첨부자료에는 원본 URL, 수집일시, 화면 캡처, PDF 저장본 및 의심 문구 정리표가 포함되어 있습니다. 본 신고는 법 위반을 단정하는 것이 아니라 관계 기관의 확인을 요청하는 취지입니다.`);
    lines.push("");
    lines.push(`## 10. 피해야 할 표현`);
    lines.push("");
    lines.push(`- 위반·불법 단정 표현 / 범죄·사기 단정 표현 / 무조건 처벌 요구`);
    lines.push(`- 포상금 지급 요구·지급 단정 / 허위 사실 단정 / 고의성 단정`);
    lines.push("");
    lines.push(`## 11. 안내`);
    lines.push("");
    lines.push(`- 법 위반 확정 아님`);
    lines.push(`- 포상금 지급 보장 아님`);
    lines.push(`- 실제 신고는 사용자가 공식 창구에서 직접 제출`);
    lines.push("");
    lines.push(`---`);
    lines.push(`자동 신고는 수행하지 않습니다. 본 초안은 사람 검토·수정 후 사용자가 직접 공식 신고 창구에 제출하는 자료입니다.`);
    return lines.join("\n");
  }

  private markdownToText(md: string): string {
    // 안전한 단순 변환 — 외부 의존성 없이.
    let out = md;
    // table separator 라인 제거 (| --- | --- |)
    out = out.replace(/^\|[\s\-:|]+\|\s*$/gm, "");
    // > 인용 → 일반 텍스트
    out = out.replace(/^>\s?/gm, "");
    // 헤딩 # → 그대로 두되 # 기호 제거하고 본문화
    out = out.replace(/^#{1,6}\s+/gm, "");
    // 코드 인라인 백틱 제거
    out = out.replace(/`{1,3}([^`]*)`{1,3}/g, "$1");
    // 강조 *, **, _ 제거
    out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
    out = out.replace(/\*([^*]+)\*/g, "$1");
    out = out.replace(/__([^_]+)__/g, "$1");
    // 리스트 표시 그대로 둠 (- )
    // 연속 빈 줄 정리
    out = out.replace(/\n{3,}/g, "\n\n").trim();
    return out;
  }

  private async buildDocxBuffer(markdownTitle: string, markdown: string): Promise<Buffer | null> {
    try {
      const lines = markdown.split("\n");
      const children: Array<Paragraph | Table> = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (/^#\s+/.test(line)) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(line.replace(/^#\s+/, ""))] }));
          i++; continue;
        }
        if (/^##\s+/.test(line)) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.replace(/^##\s+/, ""))] }));
          i++; continue;
        }
        if (/^###\s+/.test(line)) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(line.replace(/^###\s+/, ""))] }));
          i++; continue;
        }
        if (/^>\s?/.test(line)) {
          children.push(new Paragraph({ children: [new TextRun({ text: line.replace(/^>\s?/, ""), italics: true })] }));
          i++; continue;
        }
        if (line.startsWith("|") && i + 1 < lines.length && /\|[\s\-:|]+\|/.test(lines[i + 1])) {
          // 표 시작
          const tableLines: string[] = [];
          while (i < lines.length && lines[i].startsWith("|")) {
            tableLines.push(lines[i]); i++;
          }
          const rows = tableLines
            .filter((l) => !/\|[\s\-:|]+\|/.test(l))
            .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
          if (rows.length > 0) {
            const table = new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: rows.map((cells) =>
                new TableRow({
                  children: cells.map((c) =>
                    new TableCell({ children: [new Paragraph({ children: [new TextRun(c)] })] })
                  )
                })
              )
            });
            children.push(table);
          }
          continue;
        }
        if (line.trim().length === 0) {
          children.push(new Paragraph({ children: [new TextRun("")] }));
          i++; continue;
        }
        children.push(new Paragraph({ children: [new TextRun(line)] }));
        i++;
      }
      const doc = new Document({
        creator: "RewardAgentMVP",
        title: markdownTitle,
        description: "Report Draft (not auto-submitted)",
        sections: [{ children }]
      });
      return await Packer.toBuffer(doc);
    } catch (error) {
      console.warn("DOCX 생성 실패 — Markdown/Text는 정상 저장됩니다:", (error as Error).message);
      return null;
    }
  }

  // ---------- 외부 진입점 ----------

  async generateDraft(input: ReportDraftInput): Promise<ReportDraftResult> {
    if (!isSafeCaseId(input.caseId)) {
      throw new Error(`Invalid caseId: ${input.caseId}`);
    }
    const warnings: string[] = [];
    const generatedAt = new Date().toISOString();
    const markdown = this.buildMarkdown(input, warnings);
    const text = this.markdownToText(markdown);

    const dir = this.getReportDir(input.caseId);
    await ensureDir(dir);
    const mdPath = this.getReportFilePath(input.caseId, REPORT_FILES.markdown);
    const txtPath = this.getReportFilePath(input.caseId, REPORT_FILES.text);
    const docxPath = this.getReportFilePath(input.caseId, REPORT_FILES.docx);
    const metaPath = this.getReportFilePath(input.caseId, REPORT_FILES.metadata);

    await writeFile(mdPath, markdown, "utf8");
    await writeFile(txtPath, text, "utf8");

    let docxOk = false;
    const docxBuffer = await this.buildDocxBuffer(input.title ?? input.caseId, markdown);
    if (docxBuffer) {
      await writeFile(docxPath, docxBuffer);
      docxOk = true;
    } else {
      warnings.push("DOCX 생성 실패. Markdown/Text는 정상 생성되었습니다.");
    }

    // metadata
    const fileEntries = await Promise.all(
      [
        { name: REPORT_FILES.markdown, mime: "text/markdown; charset=utf-8" },
        { name: REPORT_FILES.text, mime: "text/plain; charset=utf-8" },
        ...(docxOk ? [{ name: REPORT_FILES.docx, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }] : [])
      ].map(async ({ name, mime }) => {
        const abs = this.getReportFilePath(input.caseId, name);
        const s = await stat(abs);
        const buf = await readFile(abs);
        const sha = createHash("sha256").update(buf).digest("hex");
        return { name, size: s.size, sha256: sha, mimeType: mime };
      })
    );

    const meta: ReportDraftMetadata = {
      schemaVersion: "1.0.0",
      caseId: input.caseId,
      moduleId: input.moduleId,
      title: input.title ?? input.caseId,
      url: input.url,
      productName: input.productName,
      generatedAt,
      generatedBy: "RewardAgentMVP/ReportService",
      formats: docxOk ? ["markdown", "text", "docx"] : ["markdown", "text"],
      files: fileEntries,
      safetyNotice: "이 초안은 자동 신고서가 아니며, 사람이 검토·수정 후 직접 제출해야 합니다.",
      notSubmittedAutomatically: true,
      humanReviewRequired: true,
      warnings
    };
    await writeJson(metaPath, meta);

    return {
      caseId: input.caseId,
      title: input.title ?? input.caseId,
      markdown,
      text,
      files: {
        markdownPath: mdPath,
        textPath: txtPath,
        docxPath: docxOk ? docxPath : undefined,
        metadataPath: metaPath
      },
      generatedAt,
      warnings,
      safetyNotice: "이 초안은 자동 신고서가 아니며 사람이 검토·수정 후 직접 제출해야 합니다.",
      notSubmittedAutomatically: true,
      humanReviewRequired: true
    };
  }

  async summarizeReport(caseId: string): Promise<ReportSummary> {
    if (!isSafeCaseId(caseId)) {
      throw new Error(`Invalid caseId: ${caseId}`);
    }
    const files = await this.listReports(caseId);
    const fileMetas: ReportSummary["files"] = [];
    let generatedAt: string | null = null;

    for (const name of files) {
      try {
        const abs = this.getReportFilePath(caseId, name);
        const s = await stat(abs);
        const buf = await readFile(abs);
        const sha = createHash("sha256").update(buf).digest("hex");
        fileMetas.push({
          name,
          size: s.size,
          sha256: sha,
          mimeType: mimeForReport(name)
        });
      } catch { /* ignore */ }
    }

    // generatedAt은 metadata에서 우선 (있으면)
    if (files.includes(REPORT_FILES.metadata)) {
      try {
        const buf = await readFile(this.getReportFilePath(caseId, REPORT_FILES.metadata), "utf8");
        const parsed = JSON.parse(buf);
        if (typeof parsed?.generatedAt === "string") generatedAt = parsed.generatedAt;
      } catch { /* ignore */ }
    }

    return {
      caseId,
      exists: files.length > 0,
      hasMarkdown: files.includes(REPORT_FILES.markdown),
      hasText: files.includes(REPORT_FILES.text),
      hasDocx: files.includes(REPORT_FILES.docx),
      hasMetadata: files.includes(REPORT_FILES.metadata),
      generatedAt,
      files: fileMetas,
      safetyNotice: "신고서 초안은 자동 신고서가 아니며 사람이 검토·수정 후 직접 제출해야 합니다.",
      autoReport: false,
      humanReviewRequired: true
    };
  }

  // ---------- 레거시 호환 (OrchestratorAgent에서 자동 호출) ----------

  async createReport(rewardCase: RewardCase): Promise<string> {
    // RewardCase → ReportDraftInput 적응 → generateDraft 호출
    const input: ReportDraftInput = {
      caseId: rewardCase.id,
      moduleId: rewardCase.moduleId,
      title: rewardCase.title,
      url: rewardCase.url,
      productName: rewardCase.extraction?.productName,
      status: rewardCase.status,
      agencyCandidate: rewardCase.agencyCandidate,
      priorityScore: rewardCase.scoringResult?.priorityScore ?? rewardCase.riskScore,
      priorityLabel: rewardCase.scoringResult?.priorityLabel ?? rewardCase.riskLevel,
      capturedAt: rewardCase.evidence?.capturedAt ?? rewardCase.createdAt,
      memo: rewardCase.memo,
      ruleMatches: rewardCase.ruleDetection?.matches ?? [],
      ruleSafetyNotice: rewardCase.ruleDetection?.safetyNotice,
      llmAnalysis: rewardCase.llmAnalysis,
      scoringResult: rewardCase.scoringResult,
      sellerCandidates: rewardCase.extraction?.sellerCandidates
    };
    const result = await this.generateDraft(input);
    return result.files.markdownPath;
  }
}

function mimeForReport(name: string): string {
  if (name === REPORT_FILES.markdown) return "text/markdown; charset=utf-8";
  if (name === REPORT_FILES.text) return "text/plain; charset=utf-8";
  if (name === REPORT_FILES.docx) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name === REPORT_FILES.metadata) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function escapeMd(s: string): string {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

export const reportService = new ReportService();
