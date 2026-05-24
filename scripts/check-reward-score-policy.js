#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const findings = [];
const fail = (msg) => findings.push(msg);

const GUIDE = "docs/REWARD_POSSIBILITY_SCORE_MODEL.md";
const REQUIRED_FILES = [
  GUIDE,
  "src/scoring/rewardPossibilityScore.ts",
  "src/types/rewardPossibilityScore.ts",
  "tests/rewardPossibilityScore.test.ts",
  "scripts/run-reward-possibility-score.ts"
];
const REQUIRED_SECTIONS = [
  "문서 목적",
  "평가 대상",
  "점수 구성",
  "환수 가능성 신호",
  "공공기관 손실방지 가능성 신호",
  "증거 명확성 신호",
  "High/Medium/Low 표시 기준",
  "출력 데이터 구조",
  "금지 표현",
  "개인정보 제한",
  "검증 기준",
  "후속 작업"
];
const REQUIRED_KEYWORDS = [
  "보상가능성",
  "보상/포상 가능성 검토",
  "환수 가능성",
  "공공기관 손실방지 가능성",
  "증거 명확성",
  "High",
  "Medium",
  "Low",
  "rewardPossibilityScore",
  "rewardPossibilityLevel",
  "scoreBreakdown",
  "evidence",
  "reason",
  "reviewRequired",
  "clean.go.kr",
  "공식 기준",
  "기관 심사",
  "개인정보"
];
const FORBIDDEN = [
  ["보상금", "지급", "확정"],
  ["포상금", "지급", "확정"],
  ["보상금", "받을", "수", "있음"],
  ["포상금", "받을", "수", "있음"],
  ["수령", "보장"],
  ["지급", "보장"],
  ["무조건", "보상"],
  ["신고하면", "보상"],
  ["보상", "확정"],
  ["포상", "확정"],
  ["자동", "신고"],
  ["개인정보", "수집", "허용"],
  ["계좌번호", "저장"],
  ["주민번호", "저장"]
].map((parts) => parts.join(" "));
const NEGATION = ["금지", "않", "아님", "아니다", "보장하지", "확정하지", "가능성 검토", "후보", "기관 기준", "공식 기준", "수행하지"];

function isNegatedNearby(text, idx, len) {
  const before = text.slice(Math.max(0, idx - 120), idx);
  const after = text.slice(idx + len, idx + len + 50);
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
    console.log("CHECK_REWARD_SCORE_POLICY_OK");
    process.exit(0);
  }
  console.error("CHECK_REWARD_SCORE_POLICY_FAIL");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-reward-score-policy.js failed:", e);
  process.exit(2);
});
