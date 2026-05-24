#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const findings = [];
const fail = (msg) => findings.push(msg);

const GUIDE = "docs/CONTRACTOR_NETWORK_RISK_RULE.md";
const REQUIRED_FILES = [
  GUIDE,
  "src/rules/contractorNetworkRiskRule.ts",
  "src/types/contractorNetworkRisk.ts",
  "tests/contractorNetworkRiskRule.test.ts",
  "scripts/run-contractor-network-risk-rule.ts"
];
const REQUIRED_SECTIONS = [
  "문서 목적",
  "탐지 대상",
  "사용 신호",
  "점수 기준",
  "네트워크 후보 산출 기준",
  "증거와 사유 구성",
  "개인정보식별정보 제한",
  "합리적 사유 가능성",
  "검증 기준",
  "후속 작업"
];
const REQUIRED_KEYWORDS = [
  "계약업체 연관성 후보",
  "반복 연결 검토 후보",
  "업체-사업 반복 네트워크",
  "수급단체",
  "계약업체",
  "용역업체",
  "계약명",
  "사업명",
  "계약금액",
  "계약일자",
  "기관명",
  "주소 키",
  "TOP 50",
  "riskScore",
  "riskLevel",
  "networkSignals",
  "evidence",
  "reason",
  "reviewRequired",
  "개인정보",
  "사업자등록번호",
  "법인등록번호",
  "해시",
  "비공개자료",
  "로그인 필요"
];
const FORBIDDEN = [
  ["담합", "확정"],
  ["유착", "확정"],
  ["관계", "확정"],
  ["부정수급", "확정"],
  ["불법", "확정"],
  ["사기", "확정"],
  ["자동", "신고"],
  ["사업자등록번호", "원문", "저장"],
  ["법인등록번호", "원문", "저장"],
  ["대표자명", "단독", "기준", "허용"],
  ["전화번호", "단독", "기준", "허용"],
  ["개인정보", "수집", "허용"],
  ["보상금", "지급", "확정"]
].map((parts) => parts.join(" "));
const NEGATION = ["금지", "않", "아님", "아니", "후보", "검토", "제한", "저장하지", "사용하지", "단정"];

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
    console.log("CHECK_CONTRACTOR_NETWORK_RISK_OK");
    process.exit(0);
  }
  console.error("CHECK_CONTRACTOR_NETWORK_RISK_FAIL");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-contractor-network-risk-policy.js failed:", e);
  process.exit(2);
});
