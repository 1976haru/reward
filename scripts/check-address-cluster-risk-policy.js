#!/usr/bin/env node
/**
 * 동일 주소 다수 단체 탐지 룰 정책 정적 검사 (체크리스트 18 — 필수 작업 7).
 *
 * 검증:
 *   1) 필수 파일 존재 (가이드 / 룰 / 타입 / 테스트 / CLI)
 *   2) 가이드 필수 섹션 존재
 *   3) 가이드 필수 키워드 존재
 *   4) 금지(위험) 표현이 단정적으로 쓰이지 않음
 *      - "금지 / 단정하지 않는다 / 확정하지 않는다 / 후보 / 저장하지 않는다" 부정·후보 문맥에서는 허용한다.
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

const GUIDE = "docs/ADDRESS_CLUSTER_RISK_RULE.md";

const REQUIRED_FILES = [
  GUIDE,
  "src/rules/addressClusterRiskRule.ts",
  "src/types/addressClusterRisk.ts",
  "tests/addressClusterRiskRule.test.ts",
  "scripts/run-address-cluster-risk-rule.ts"
];

const REQUIRED_SECTIONS = [
  "문서 목적",
  "탐지 대상",
  "사용 신호",
  "점수 기준",
  "후보표 산출 기준",
  "증거와 사유 구성",
  "개인정보 제한",
  "합리적 사유 가능성",
  "검증 기준",
  "후속 작업"
];

const REQUIRED_KEYWORDS = [
  "동일 주소 다수 단체 후보",
  "검토 필요",
  "normalizedAddressKey",
  "addressRegionKey",
  "normalizedRecipientName",
  "TOP 50",
  "riskScore",
  "riskLevel",
  "evidence",
  "reason",
  "reviewRequired",
  "공유오피스",
  "복지관",
  "회관",
  "공공시설",
  "개인정보",
  "대표자명",
  "전화번호",
  "상세주소"
];

const FORBIDDEN_PHRASES = [
  "동일 주소 확정",
  "위장 단체 확정",
  "허위 단체 확정",
  "부정수급 확정",
  "불법 확정",
  "사기 확정",
  "자동 신고",
  "대표자명 단독 기준 허용",
  "전화번호 단독 기준 허용",
  "상세주소 저장 허용",
  "개인정보 수집 허용",
  "보상금 지급 확정"
];

const NEGATION_MARKERS = ["않", "없", "금지", "아니", "말아", "마라", "불가", "후보", "제외", "하지 않"];

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
  if (content.length < 1800) fail(`${GUIDE} 가 너무 짧습니다 — 필수 섹션 누락 의심.`);

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
      "CHECK_ADDRESS_CLUSTER_RISK_OK — 동일 주소 다수 단체 룰 모듈/가이드 존재, 필수 섹션·키워드 확인, 단정적 금지 표현 없음."
    );
    process.exit(0);
  }
  console.error("CHECK_ADDRESS_CLUSTER_RISK_FAIL — 동일 주소 다수 단체 룰 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-address-cluster-risk-policy.js failed:", e);
  process.exit(2);
});
