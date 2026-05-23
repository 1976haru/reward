#!/usr/bin/env node
/**
 * 사업명 유사도 정책 정적 검사 (체크리스트 15 — 필수 작업 6).
 *
 * 검증:
 *   1) 필수 파일 존재 (가이드 / 모듈 / 타입 / 테스트)
 *   2) 가이드 필수 섹션 존재
 *   3) 가이드 필수 키워드 존재
 *   4) 금지(위험) 표현이 단정적으로 쓰이지 않음
 *      - "금지 / 단정하지 않는다 / 확정하지 않는다 / 후보" 부정·후보 문맥에서는 허용한다.
 *      - 사용자 노출 문구에 단정적으로 쓰이면 실패 처리한다.
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

const GUIDE = "docs/PROJECT_NAME_SIMILARITY_GUIDE.md";

const REQUIRED_FILES = [
  GUIDE,
  "src/normalizers/projectNameSimilarity.ts",
  "src/types/projectNameSimilarity.ts",
  "tests/projectNameSimilarity.test.ts"
];

const REQUIRED_SECTIONS = [
  "문서 목적",
  "정규화 대상",
  "사업명 정규화 규칙",
  "일반 토큰과 중요 토큰",
  "유사도 기준",
  "유사도 계산 기준",
  "반복 신청 탐지 활용 기준",
  "정확도 검증 기준",
  "후속 작업"
];

const REQUIRED_KEYWORDS = [
  "사업명",
  "유사도",
  "형태소",
  "문자열",
  "일반 토큰",
  "중요 토큰",
  "유사 사업명 후보",
  "반복 신청 검토 후보",
  "추가 확인 필요",
  "0.85",
  "공모",
  "지원",
  "사업",
  "연도",
  "차수"
];

// 단정적으로 쓰이면 안 되는 표현 (부정·후보 문맥에서는 허용)
const FORBIDDEN_PHRASES = [
  "반복 신청 확정",
  "부정수급 확정",
  "자동 확정 병합",
  "보상금 지급 확정",
  "무조건 신고",
  "반드시 신고"
];

const NEGATION_MARKERS = ["않", "없", "금지", "아니", "말아", "마라", "불가", "후보", "하지 않"];

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

async function checkGuide() {
  let content;
  try {
    content = await readFile(path.join(ROOT, GUIDE), "utf8");
  } catch {
    fail(`${GUIDE} 를 읽을 수 없습니다.`);
    return;
  }
  if (content.length < 1500) fail(`${GUIDE} 가 너무 짧습니다 — 필수 섹션 누락 의심.`);

  for (const sec of REQUIRED_SECTIONS) {
    if (!content.includes(sec)) fail(`가이드 섹션 누락: "${sec}"`);
  }
  for (const kw of REQUIRED_KEYWORDS) {
    if (!content.includes(kw)) fail(`가이드 키워드 누락: "${kw}"`);
  }
  for (const phrase of FORBIDDEN_PHRASES) {
    let idx = content.indexOf(phrase);
    while (idx !== -1) {
      if (!isNegatedNearby(content, idx, phrase.length)) {
        const lineNo = content.slice(0, idx).split(/\r?\n/).length;
        fail(`가이드 ${GUIDE}:${lineNo} 에 단정적 금지 표현 발견: "${phrase}" (부정/후보 문맥 아님)`);
      }
      idx = content.indexOf(phrase, idx + phrase.length);
    }
  }
}

async function main() {
  await checkFiles();
  await checkGuide();

  if (findings.length === 0) {
    console.log(
      "CHECK_PROJECT_SIMILARITY_OK — 사업명 유사도 모듈/가이드 존재, 필수 섹션·키워드 확인, 단정적 금지 표현 없음."
    );
    process.exit(0);
  }
  console.error("CHECK_PROJECT_SIMILARITY_FAIL — 사업명 유사도 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-project-similarity-policy.js failed:", e);
  process.exit(2);
});
