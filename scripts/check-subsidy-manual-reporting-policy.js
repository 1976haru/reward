#!/usr/bin/env node
/**
 * 보조금 수동 실제 신고 연결 + 결과·보상 기록 정책 정적 검사 (체크리스트 67~68).
 *
 * 검증:
 *   1) 필수 파일 존재 (가이드 2종 / 서비스 / 타입 / 테스트)
 *   2) 가이드 필수 섹션·키워드 존재
 *   3) 단정적 금지 표현이 부정/후보 문맥 없이 쓰이지 않음
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

const MANUAL_GUIDE = "docs/SUBSIDY_MANUAL_REPORTING_GUIDE.md";
const OUTCOME_GUIDE = "docs/SUBSIDY_OUTCOME_TRACKING_GUIDE.md";

const REQUIRED_FILES = [
  MANUAL_GUIDE,
  OUTCOME_GUIDE,
  "src/services/subsidyReportingLinks.ts",
  "src/services/subsidyOutcomeTracker.ts",
  "src/types/subsidyOutcome.ts",
  "tests/subsidyOutcomeTracker.test.ts"
];

const MANUAL_SECTIONS = [
  "수동 신고 절차",
  "공식 신고처 링크 사용 방법",
  "신고서 초안 복사/다운로드 방법",
  "자동신고를 하지 않는 이유",
  "개인정보 마스킹 원칙"
];
const OUTCOME_SECTIONS = [
  "결과 기록 항목",
  "상태 흐름",
  "접수번호 기록 방법",
  "처리상태 기록 방법",
  "포상금 기록 시 주의사항",
  "개인정보 마스킹 원칙",
  "GitHub에 결과 산출물을 올리면 안 되는 이유"
];

const MANUAL_KEYWORDS = [
  "manualSubmissionOnly",
  "autoSubmitAvailable",
  "reporting-links",
  "공식 창구",
  "자동 제출",
  "query parameter",
  "candidateId"
];
const OUTCOME_KEYWORDS = [
  "confirmManualSubmission",
  "submittedManually",
  "externalReceiptNo",
  "submitted_manually",
  "rewardAmount",
  "rewardConfirmedAt",
  "rewardGuaranteed",
  "autoSubmitted",
  "notLegalConclusion",
  "data/outcomes",
  "마스킹"
];

const FORBIDDEN_PHRASES = [
  "부정수급 확정",
  "위법 확정",
  "포상금 보장",
  "신고 성공 보장",
  "수령 확정"
];
const NEGATION_MARKERS = ["않", "없", "금지", "아니", "아닌", "아님", "불가", "후보", "제외", "사용하지", "하지", "직접", "보장되지", "마스킹"];

async function fileExists(rel) {
  try {
    const s = await stat(path.join(ROOT, rel));
    return s.isFile();
  } catch {
    return false;
  }
}

async function checkGuide(rel, sections, keywords) {
  let content;
  try {
    content = await readFile(path.join(ROOT, rel), "utf8");
  } catch {
    fail(`${rel} 를 읽을 수 없습니다.`);
    return;
  }
  if (content.length < 1200) fail(`${rel} 가 너무 짧습니다.`);
  for (const s of sections) if (!content.includes(s)) fail(`${rel} 섹션 누락: "${s}"`);
  for (const k of keywords) if (!content.includes(k)) fail(`${rel} 키워드 누락: "${k}"`);
  content.split(/\r?\n/).forEach((line, i) => {
    for (const phrase of FORBIDDEN_PHRASES) {
      if (!line.includes(phrase)) continue;
      if (!NEGATION_MARKERS.some((m) => line.includes(m))) fail(`${rel}:${i + 1} 단정적 금지 표현: "${phrase}"`);
    }
  });
}

async function main() {
  for (const rel of REQUIRED_FILES) if (!(await fileExists(rel))) fail(`필수 파일 누락: ${rel}`);
  await checkGuide(MANUAL_GUIDE, MANUAL_SECTIONS, MANUAL_KEYWORDS);
  await checkGuide(OUTCOME_GUIDE, OUTCOME_SECTIONS, OUTCOME_KEYWORDS);

  if (findings.length === 0) {
    console.log("CHECK_SUBSIDY_MANUAL_REPORTING_OK — 수동 신고 연결/결과·보상 기록 모듈·가이드 존재, 필수 섹션·키워드 확인, 단정적 금지 표현 없음.");
    process.exit(0);
  }
  console.error("CHECK_SUBSIDY_MANUAL_REPORTING_FAIL — 수동 신고/결과 기록 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-subsidy-manual-reporting-policy.js failed:", e);
  process.exit(2);
});
