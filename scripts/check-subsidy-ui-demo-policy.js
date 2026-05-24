#!/usr/bin/env node
// 보조금 엔진 UI 연결 데모 정책 검사.
// - 필수 파일/엔드포인트/버튼/함수 존재 확인
// - 화면 표시 문구에 단정 표현(근거가 있어도 쓰지 않는 확정 표현)이 없는지 확인
// - 개인정보 원문 패턴이 데모 소스에 직접 들어가지 않는지 확인
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const findings = [];
const fail = (msg) => findings.push(msg);

const REQUIRED_FILES = [
  "src/services/subsidyEngineDemo.ts",
  "src/routes/subsidy.ts",
  "public/index.html",
  "public/app.js",
  "tests/subsidyUiDemo.test.ts"
];

// 파일별 필수 토큰(엔드포인트/버튼/함수/안내문 연결 확인)
const REQUIRED_TOKENS = {
  "src/routes/subsidy.ts": ["/demo-status", "/run-demo", "buildSubsidyEngineDemo"],
  "src/services/subsidyEngineDemo.ts": [
    "buildSubsidyEngineDemo",
    "getSubsidyEngineStatus",
    "citationValidation",
    "rewardScore",
    "riskScore",
    "llmExplanation",
    "fixture 기반 검증"
  ],
  "public/index.html": ["subsidyEngineDemoBtn", "보조금 엔진 샘플 실행", "fixture 기반 검증 결과"],
  "public/app.js": ["runSubsidyEngineDemo", "renderSubsidyEngineDemo", "/api/subsidy/run-demo"]
};

// 단정 표현 — 근거가 있어도 화면에 쓰지 않는다.
const FORBIDDEN = [
  "부정수급 확정",
  "보상금 지급 확정",
  "포상금 지급 확정",
  "신고 가능 확정",
  "불법 확정",
  "사기 확정",
  "위법 확정"
];
// 데모 소스에 직접 박힌 개인정보 원문 패턴(주민번호/휴대폰).
const PII_RES = [/01[016789]-\d{3,4}-\d{4}/, /\d{6}-\d{7}/];

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

async function checkTokens() {
  for (const [rel, tokens] of Object.entries(REQUIRED_TOKENS)) {
    let content = "";
    try {
      content = await readFile(path.join(ROOT, rel), "utf8");
    } catch {
      fail(`cannot read ${rel}`);
      continue;
    }
    for (const token of tokens) if (!content.includes(token)) fail(`missing token in ${rel}: ${token}`);
  }
}

async function checkSafety() {
  const targets = ["src/services/subsidyEngineDemo.ts", "public/index.html"];
  for (const rel of targets) {
    let content = "";
    try {
      content = await readFile(path.join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    for (const phrase of FORBIDDEN) if (content.includes(phrase)) fail(`forbidden assertive phrase in ${rel}: ${phrase}`);
    for (const re of PII_RES) if (re.test(content)) fail(`personal-info pattern in ${rel}: ${re}`);
  }
}

async function main() {
  await checkFiles();
  await checkTokens();
  await checkSafety();
  if (findings.length === 0) {
    console.log("CHECK_SUBSIDY_UI_DEMO_POLICY_OK");
    process.exit(0);
  }
  console.error("CHECK_SUBSIDY_UI_DEMO_POLICY_FAIL");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-subsidy-ui-demo-policy.js failed:", e);
  process.exit(2);
});
