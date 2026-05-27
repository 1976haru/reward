#!/usr/bin/env node
/**
 * 보조금 신고서 초안 생성 정책 정적 검사 (체크리스트 66).
 *
 * 검증:
 *   1) 필수 파일 존재 (가이드 / 생성기 / 타입 / 테스트 / CLI)
 *   2) 가이드 필수 섹션 존재
 *   3) 가이드 필수 키워드 존재
 *   4) 단정적 금지 표현이 부정/후보 문맥 없이 쓰이지 않음 (같은 줄에 부정어가 있으면 허용)
 *
 * 위반 시 exit code 1.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const findings = [];
const fail = (msg) => findings.push(msg);

const GUIDE = "docs/SUBSIDY_REPORT_DRAFT_GUIDE.md";

const REQUIRED_FILES = [
  GUIDE,
  "src/reports/subsidyReportDraft.ts",
  "src/types/subsidyReportDraft.ts",
  "tests/subsidyReportDraft.test.ts",
  "scripts/run-subsidy-report-draft.ts"
];

const REQUIRED_SECTIONS = [
  "신고서 초안 생성 조건",
  "fact check 11항목과의 관계",
  "초안에 포함되는 항목",
  "초안이 의미하는 것",
  "차단 사유별 해결 방법",
  "생성 파일 위치",
  "GitHub에 올리면 안 되는 파일",
  "사용 방법",
  "다음 단계"
];

const REQUIRED_KEYWORDS = [
  "canGenerateReportDraft",
  "REPORT_DRAFT_BLOCKED_BY_FACT_CHECK",
  "draftCreated",
  "blockedReason",
  "reportFiles",
  "report.md",
  "report.txt",
  "report.docx",
  "report_metadata.json",
  "autoSubmitted",
  "rewardGuaranteed",
  "notLegalConclusion",
  "humanReviewRequired",
  "사람 검토",
  "공식 창구",
  "data/reports",
  "npm run subsidy:report-draft"
];

const FORBIDDEN_PHRASES = [
  "부정수급 확정",
  "위법 확정",
  "포상금 보장",
  "신고 성공 보장",
  "포상금 수령 확정",
  "수령 확정",
  "자동 신고",
  "자동 제출"
];

const NEGATION_MARKERS = ["않", "없", "금지", "아니", "아닌", "아님", "말아", "불가", "후보", "제외", "사용하지", "하지", "직접 제출", "단정"];

async function checkFiles() {
  for (const rel of REQUIRED_FILES) {
    try {
      const s = await stat(path.join(ROOT, rel));
      if (!s.isFile()) fail(`필수 파일이 파일이 아님: ${rel}`);
    } catch {
      fail(`필수 파일 누락: ${rel}`);
    }
  }
}

async function checkGuide() {
  let content;
  try {
    content = await readFile(path.join(ROOT, GUIDE), "utf8");
  } catch {
    fail(`${GUIDE} 를 읽을 수 없습니다.`);
    return;
  }
  if (content.length < 1800) fail(`${GUIDE} 가 너무 짧습니다 — 필수 섹션 누락 의심.`);
  for (const sec of REQUIRED_SECTIONS) if (!content.includes(sec)) fail(`가이드 섹션 누락: "${sec}"`);
  for (const kw of REQUIRED_KEYWORDS) if (!content.includes(kw)) fail(`가이드 키워드 누락: "${kw}"`);

  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const phrase of FORBIDDEN_PHRASES) {
      if (!line.includes(phrase)) continue;
      const negated = NEGATION_MARKERS.some((m) => line.includes(m));
      if (!negated) fail(`가이드 ${GUIDE}:${i + 1} 에 단정적 금지 표현: "${phrase}" (같은 줄에 부정/후보 문맥 없음)`);
    }
  });
}

async function main() {
  await checkFiles();
  await checkGuide();
  if (findings.length === 0) {
    console.log("CHECK_SUBSIDY_REPORT_DRAFT_OK — 신고서 초안 생성 모듈/가이드 존재, 필수 섹션·키워드 확인, 단정적 금지 표현 없음.");
    process.exit(0);
  }
  console.error("CHECK_SUBSIDY_REPORT_DRAFT_FAIL — 신고서 초안 생성 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-subsidy-report-draft-policy.js failed:", e);
  process.exit(2);
});
