#!/usr/bin/env node
/**
 * CSV/PDF/엑셀 업로드 수집기 정책 정적 검사 (체크리스트 12 — 필수 작업 7).
 *
 * 검증:
 *   1) 필수 파일 존재 (Runbook / parser / 타입 / 테스트)
 *   2) Runbook 필수 섹션 존재
 *   3) Runbook 필수 키워드 존재
 *   4) 금지(위험) 표현이 문서에 없음 (개인정보 수집 허용 / 주민번호 저장 / 계좌번호 저장 /
 *      OCR 자동 처리 완료 / 부정수급 확정 / 보상금 지급 확정)
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

const RUNBOOK = "docs/UPLOAD_PARSER_RUNBOOK.md";

const REQUIRED_FILES = [
  RUNBOOK,
  "src/parsers/uploadSubsidyParser.ts",
  "src/types/uploadParser.ts",
  "tests/uploadSubsidyParser.test.ts"
];

const REQUIRED_SECTIONS = [
  "문서 목적",
  "지원 파일 형식",
  "표준 보조금 레코드 스키마",
  "필드 매핑 규칙",
  "개인정보 처리",
  "변환 결과 저장",
  "오류 처리",
  "테스트 기준",
  "주의사항"
];

const REQUIRED_KEYWORDS = [
  "CSV",
  "XLSX",
  "PDF",
  "수동 업로드",
  "표준 보조금 레코드",
  "개인정보",
  "마스킹",
  "오류 로그",
  "records.jsonl",
  "parse-log.json",
  "error-log.json",
  "OCR 제외"
];

// 문서에 있으면 안 되는 위험/금지 표현 (정책 위반을 시사)
const FORBIDDEN_PHRASES = [
  "개인정보 수집 허용",
  "주민번호 저장",
  "계좌번호 저장",
  "OCR 자동 처리 완료",
  "부정수급 확정",
  "보상금 지급 확정"
];

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
  if (content.length < 1500) fail(`${RUNBOOK} 가 너무 짧습니다 — 필수 섹션 누락 의심.`);

  for (const sec of REQUIRED_SECTIONS) {
    if (!content.includes(sec)) fail(`Runbook 섹션 누락: "${sec}"`);
  }
  for (const kw of REQUIRED_KEYWORDS) {
    if (!content.includes(kw)) fail(`Runbook 키워드 누락: "${kw}"`);
  }
  for (const bad of FORBIDDEN_PHRASES) {
    if (content.includes(bad)) fail(`Runbook 에 금지 표현 발견: "${bad}"`);
  }
}

async function main() {
  await checkFiles();
  await checkRunbook();

  if (findings.length === 0) {
    console.log("CHECK_UPLOAD_PARSER_OK — 업로드 파서 코드/문서 존재, 필수 섹션·키워드 확인, 금지 표현 없음.");
    process.exit(0);
  }
  console.error("CHECK_UPLOAD_PARSER_FAIL — 업로드 파서 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-upload-parser-policy.js failed:", e);
  process.exit(2);
});
