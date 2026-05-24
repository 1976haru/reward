#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const findings = [];
const fail = (msg) => findings.push(msg);

const GUIDE = "docs/LLM_EXPLANATION_ANALYSIS_GUIDE.md";
const REQUIRED_FILES = [
  GUIDE,
  "src/analysis/llmExplanationAnalysis.ts",
  "src/types/llmExplanationAnalysis.ts",
  "tests/llmExplanationAnalysis.test.ts",
  "scripts/run-llm-explanation-analysis.ts"
];
const REQUIRED_SECTIONS = [
  "문서 목적",
  "입력 대상",
  "출력 구성",
  "설명 원칙",
  "금지 표현",
  "권장 표현",
  "프롬프트 안전 기준",
  "fallback 분석기 기준",
  "리포트 생성 기준",
  "검증 기준",
  "후속 작업"
];
const REQUIRED_KEYWORDS = [
  "LLM 설명형 분석",
  "왜 검토 후보",
  "어떤 근거",
  "추가 확인사항",
  "공개자료 기준",
  "단정 표현",
  "개인정보",
  "프롬프트",
  "fallback",
  "deterministic",
  "summary",
  "whyFlagged",
  "keyEvidence",
  "additionalChecks",
  "safetyDisclaimers",
  "reviewRequired"
];
const FORBIDDEN = [
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"],
  ["횡령", "확정"],
  ["담합", "확정"],
  ["유착", "확정"],
  ["환수", "대상", "확정"],
  ["신고", "확정"],
  ["보상금", "지급", "확정"],
  ["포상금", "지급", "확정"],
  ["보상금", "받을", "수", "있음"],
  ["무조건", "신고"],
  ["반드시", "신고"],
  ["개인정보", "수집", "허용"],
  ["계좌번호", "저장"],
  ["주민번호", "저장"]
].map((parts) => parts.join(" "));
const NEGATION = ["금지", "않", "아님", "아니다", "보장하지", "확정하지", "가능성 검토", "후보", "검토", "필요", "대체"];

function isNegatedNearby(text, idx, len) {
  const before = text.slice(Math.max(0, idx - 120), idx);
  const after = text.slice(idx + len, idx + len + 60);
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
      if (!isNegatedNearby(content, idx, phrase.length)) fail(`forbidden assertive phrase: ${phrase}`);
      idx = content.indexOf(phrase, idx + phrase.length);
    }
  }
}

async function main() {
  await checkFiles();
  await checkGuide();
  if (findings.length === 0) {
    console.log("CHECK_LLM_EXPLANATION_POLICY_OK");
    process.exit(0);
  }
  console.error("CHECK_LLM_EXPLANATION_POLICY_FAIL");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-llm-explanation-policy.js failed:", e);
  process.exit(2);
});
