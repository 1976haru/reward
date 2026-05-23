#!/usr/bin/env node
/**
 * 실데이터 기준선 / 품질검증 정책 정적 검사 (체크리스트 16 — 필수 작업 7).
 *
 * 검증:
 *   1) 필수 파일 존재 (Runbook / 모듈 / 타입 / 테스트 / CLI)
 *   2) Runbook 필수 섹션 존재
 *   3) Runbook 필수 키워드 존재
 *   4) 금지(위험) 표현이 단정적으로 쓰이지 않음
 *      - "금지 / 단정하지 않는다 / 확정하지 않는다 / 보류 / 간주하지 않는다" 부정·보류 문맥에서는 허용한다.
 *      - 사용자 노출 문구에 금지어가 단정적으로 쓰이면 실패 처리한다.
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

const RUNBOOK = "docs/DATA_BASELINE_QUALITY_RUNBOOK.md";

const REQUIRED_FILES = [
  RUNBOOK,
  "src/quality/dataBaselineQuality.ts",
  "src/types/dataQualityBaseline.ts",
  "tests/dataBaselineQuality.test.ts",
  "scripts/build-data-baseline.ts"
];

const REQUIRED_SECTIONS = [
  "문서 목적",
  "기준선 데이터 범위",
  "표준 저장소 원칙",
  "표준 기준선 레코드 필드",
  "품질 지표",
  "중복 판정 기준",
  "결측률 기준",
  "실데이터와 fixture 구분",
  "실행 방법",
  "주의사항",
  "후속 작업"
];

const REQUIRED_KEYWORDS = [
  "실데이터",
  "fixture",
  "1,000건",
  "수집건수",
  "중복률",
  "결측률",
  "품질 리포트",
  "records.jsonl",
  "quality-report.json",
  "quality-report.md",
  "error-log.json",
  "개인정보",
  "마스킹",
  "기준선 구축 보류"
];

// 단정적으로 쓰이면 안 되는 표현 (부정·보류 문맥에서는 허용)
const FORBIDDEN_PHRASES = [
  "fixture를 실데이터로 간주",
  "중복률로 부정수급 확정",
  "결측률로 부정수급 확정",
  "개인정보 수집 허용",
  "주민번호 저장",
  "계좌번호 저장",
  "보상금 지급 확정"
];

const NEGATION_MARKERS = ["않", "없", "금지", "아니", "말아", "마라", "불가", "보류", "제외", "하지 않"];

function isNegatedNearby(text, phraseStart, phraseLen) {
  const after = text.slice(phraseStart + phraseLen, phraseStart + phraseLen + 25);
  const before = text.slice(Math.max(0, phraseStart - 14), phraseStart);
  return NEGATION_MARKERS.some((m) => after.includes(m) || before.includes(m));
}

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

async function checkRunbook() {
  let content;
  try {
    content = await readFile(path.join(ROOT, RUNBOOK), "utf8");
  } catch {
    fail(`${RUNBOOK} 를 읽을 수 없습니다.`);
    return;
  }
  if (content.length < 1800) fail(`${RUNBOOK} 가 너무 짧습니다 — 필수 섹션 누락 의심.`);

  for (const sec of REQUIRED_SECTIONS) {
    if (!content.includes(sec)) fail(`Runbook 섹션 누락: "${sec}"`);
  }
  for (const kw of REQUIRED_KEYWORDS) {
    if (!content.includes(kw)) fail(`Runbook 키워드 누락: "${kw}"`);
  }
  for (const phrase of FORBIDDEN_PHRASES) {
    let idx = content.indexOf(phrase);
    while (idx !== -1) {
      if (!isNegatedNearby(content, idx, phrase.length)) {
        const lineNo = content.slice(0, idx).split(/\r?\n/).length;
        fail(`Runbook ${RUNBOOK}:${lineNo} 에 단정적 금지 표현 발견: "${phrase}" (부정/보류 문맥 아님)`);
      }
      idx = content.indexOf(phrase, idx + phrase.length);
    }
  }
}

async function main() {
  await checkFiles();
  await checkRunbook();

  if (findings.length === 0) {
    console.log(
      "CHECK_DATA_BASELINE_OK — 기준선/품질검증 모듈·문서 존재, 필수 섹션·키워드 확인, 단정적 금지 표현 없음."
    );
    process.exit(0);
  }
  console.error("CHECK_DATA_BASELINE_FAIL — 데이터 기준선 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-data-baseline-policy.js failed:", e);
  process.exit(2);
});
