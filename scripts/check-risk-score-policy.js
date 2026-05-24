#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const findings = [];
const fail = (msg) => findings.push(msg);

const GUIDE = "docs/RISK_SCORE_MODEL.md";
const REQUIRED_FILES = [
  GUIDE,
  "src/scoring/riskScoreModel.ts",
  "src/types/riskScoreModel.ts",
  "tests/riskScoreModel.test.ts",
  "scripts/run-risk-score-model.ts"
];
const REQUIRED_SECTIONS = [
  "문서 목적",
  "통합 대상 룰",
  "100점 점수 구성",
  "등급 기준",
  "점수 산출 원칙",
  "입력 데이터 구조",
  "출력 데이터 구조",
  "개인정보 제한",
  "검증 기준",
  "후속 작업"
];
const REQUIRED_KEYWORDS = [
  "100점",
  "위험점수",
  "A/B/C",
  "반복성",
  "금액",
  "증가감",
  "결과물 부족",
  "주소 유사성",
  "정산 이상",
  "계약업체",
  "riskScore",
  "riskGrade",
  "scoreBreakdown",
  "evidence",
  "reason",
  "reviewRequired",
  "개인정보",
  "우선 검토 후보",
  "추가 확인 필요"
];
const FORBIDDEN = [
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"],
  ["환수", "대상", "확정"],
  ["신고", "확정"],
  ["자동", "신고"],
  ["A등급", "확정"],
  ["개인정보", "수집", "허용"],
  ["계좌번호", "저장"],
  ["주민번호", "저장"],
  ["보상금", "지급", "확정"]
].map((parts) => parts.join(" "));
const NEGATION = ["금지", "않", "아님", "아니", "후보", "검토", "제한", "저장하지", "사용하지", "단정", "보조"];

function isNegatedNearby(text, idx, len) {
  const before = text.slice(Math.max(0, idx - 25), idx);
  const after = text.slice(idx + len, idx + len + 35);
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
    console.log("CHECK_RISK_SCORE_MODEL_OK");
    process.exit(0);
  }
  console.error("CHECK_RISK_SCORE_MODEL_FAIL");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-risk-score-policy.js failed:", e);
  process.exit(2);
});
