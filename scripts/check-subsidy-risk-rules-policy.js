#!/usr/bin/env node
/**
 * 보조금 룰 5종 통합 실행 정책 정적 검사 (체크리스트 60).
 *
 * 검증:
 *   1) 필수 파일 존재 (가이드 / 엔진 / 타입 / 테스트 / fixture / CLI)
 *   2) 가이드 필수 섹션 존재
 *   3) 가이드 필수 키워드 존재
 *   4) 단정적 금지 표현이 부정/후보 문맥 없이 쓰이지 않음 (같은 줄에 부정어가 있으면 허용)
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

const GUIDE = "docs/SUBSIDY_RISK_RULES_GUIDE.md";

const REQUIRED_FILES = [
  GUIDE,
  "src/rules/subsidyRiskRules.ts",
  "src/types/subsidyRisk.ts",
  "tests/subsidyRiskRules.test.ts",
  "tests/fixtures/createSubsidyRiskFixtures.ts",
  "scripts/run-subsidy-risk-rules.ts"
];

const REQUIRED_SECTIONS = [
  "문서 목적",
  "보조금 룰 5종",
  "왜 부정수급 확정이 아닌가",
  "입력 형식",
  "실행 명령",
  "산출물 위치",
  "룰 결과 구조",
  "TOP 50 해석",
  "개인정보",
  "한계",
  "검증 기준",
  "후속 작업"
];

const REQUIRED_KEYWORDS = [
  "repeat_recipient",
  "same_address",
  "missing_output_settlement",
  "budget_anomaly",
  "similar_project_repeat",
  "반복수급",
  "동일주소",
  "결과물",
  "정산",
  "예산집행 이상치",
  "사업명 유사",
  "0.85",
  "TOP 50",
  "reviewRequired",
  "notLegalConclusion",
  "involvedRecordIds",
  "evidenceRefs",
  "suggestedNextCheck",
  "100점 위험점수",
  "사람 검토",
  "로그인 필요",
  "개인정보",
  "npm run risk:rules"
];

const FORBIDDEN_PHRASES = [
  "부정수급 확정",
  "위법 확정",
  "포상금 보장",
  "신고 성공 보장",
  "범죄 확정",
  "자동 신고",
  "자동 제출",
  "개인정보 수집 허용",
  "계좌번호 저장"
];

const NEGATION_MARKERS = ["않", "없", "금지", "아니", "아닌", "아님", "말아", "마라", "불가", "후보", "제외", "하지 않"];

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
  // 같은 줄에 부정어가 없으면 단정적 금지 표현으로 간주.
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const phrase of FORBIDDEN_PHRASES) {
      if (!line.includes(phrase)) continue;
      const negated = NEGATION_MARKERS.some((m) => line.includes(m));
      if (!negated) {
        fail(`가이드 ${GUIDE}:${i + 1} 에 단정적 금지 표현 발견: "${phrase}" (같은 줄에 부정/후보 문맥 없음)`);
      }
    }
  });
}

async function main() {
  await checkFiles();
  await checkGuide();

  if (findings.length === 0) {
    console.log(
      "CHECK_SUBSIDY_RISK_RULES_OK — 보조금 룰 5종 모듈/가이드 존재, 필수 섹션·키워드 확인, 단정적 금지 표현 없음."
    );
    process.exit(0);
  }
  console.error("CHECK_SUBSIDY_RISK_RULES_FAIL — 보조금 룰 5종 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-subsidy-risk-rules-policy.js failed:", e);
  process.exit(2);
});
