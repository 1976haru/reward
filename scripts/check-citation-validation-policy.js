#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const findings = [];
const fail = (msg) => findings.push(msg);

const GUIDE = "docs/CITATION_VALIDATION_GUIDE.md";
const REQUIRED_FILES = [
  GUIDE,
  "src/analysis/citationValidator.ts",
  "src/types/citationValidation.ts",
  "tests/citationValidator.test.ts",
  "scripts/validate-report-citations.ts"
];
const REQUIRED_SECTIONS = [
  "문서 목적",
  "검증 대상",
  "근거로 인정되는 항목",
  "핵심 주장 정의",
  "Citation 요구 기준",
  "개인정보·비공개자료 제한",
  "검증 결과 등급",
  "근거 없는 문장 처리",
  "리포트 생성 기준",
  "검증 기준",
  "후속 작업"
];
const REQUIRED_KEYWORDS = [
  "citation",
  "근거 검증",
  "원문 URL",
  "파일명",
  "행번호",
  "recordId",
  "evidenceId",
  "sourceUrl",
  "evidenceUrl",
  "근거 없는 문장",
  "자동 경고",
  "개인정보",
  "비공개",
  "로그인 필요",
  "pass",
  "warning",
  "fail"
];
const FORBIDDEN = [
  ["근거", "없이", "통과"],
  ["비공개자료", "근거", "허용"],
  ["로그인", "자료", "근거", "허용"],
  ["개인정보", "근거", "허용"],
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"],
  ["자동", "신고"],
  ["보상금", "지급", "확정"],
  ["개인정보", "수집", "허용"],
  ["계좌번호", "저장"],
  ["주민번호", "저장"]
].map((parts) => parts.join(" "));
const NEGATION = ["금지", "않", "아님", "아니다", "없이 통과시키지", "허용하지", "저장하지", "수집하지", "확정하지", "수행하지", "대체", "후보", "검토", "필요"];

function isNegatedNearby(text, idx, len) {
  const before = text.slice(Math.max(0, idx - 140), idx);
  const after = text.slice(idx + len, idx + len + 80);
  return NEGATION.some((m) => before.includes(m) || after.includes(m));
}

async function checkFiles() {
  for (const rel of REQUIRED_FILES) {
    try {
      const s = await stat(path.join(ROOT, rel));
      if (!s.isFile()) fail(`required file is not a file: ${rel}`);
    } catch {
      fail(`missing required file: ${rel}`);
    }
  }
}

async function checkGuide() {
  let content = "";
  try {
    content = await readFile(path.join(ROOT, GUIDE), "utf8");
  } catch {
    fail(`cannot read ${GUIDE}`);
    return;
  }
  for (const section of REQUIRED_SECTIONS) if (!content.includes(section)) fail(`missing section: ${section}`);
  for (const keyword of REQUIRED_KEYWORDS) if (!content.includes(keyword)) fail(`missing keyword: ${keyword}`);
  for (const phrase of FORBIDDEN) {
    let idx = content.indexOf(phrase);
    while (idx !== -1) {
      if (!isNegatedNearby(content, idx, phrase.length)) fail(`forbidden phrase without negation: ${phrase}`);
      idx = content.indexOf(phrase, idx + phrase.length);
    }
  }
}

async function main() {
  await checkFiles();
  await checkGuide();
  if (findings.length === 0) {
    console.log("CHECK_CITATION_VALIDATION_POLICY_OK");
    process.exit(0);
  }
  console.error("CHECK_CITATION_VALIDATION_POLICY_FAIL");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-citation-validation-policy.js failed:", e);
  process.exit(2);
});
