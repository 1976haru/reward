#!/usr/bin/env node
/**
 * 공공데이터 API 수집기 정책 정적 검사 (체크리스트 11 — 필수 작업 8).
 *
 * 검증:
 *   1) 수집기 코드/문서/실행스크립트/테스트가 존재한다.
 *   2) src / scripts / docs / README 에 실제 API 키처럼 보이는 긴 토큰 문자열이 하드코딩되어 있지 않다.
 *   3) DATA_GO_KR_SERVICE_KEY / PUBLIC_DATA_SERVICE_KEY 가 값과 함께 하드코딩되어 있지 않다
 *      (.env.example 의 자리표시자/빈 값은 허용).
 *   4) serviceKey 원문 로그 금지 문구가 문서에 있다.
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
function fail(msg) {
  findings.push(msg);
}

// ---------- 1) 필수 파일 존재 ----------

const REQUIRED_FILES = [
  "src/collectors/publicDataApiCollector.ts",
  "scripts/collect-public-data-api.ts",
  "tests/publicDataApiCollector.test.ts",
  "docs/API_COLLECTOR_RUNBOOK.md"
];

async function checkFilesExist() {
  for (const rel of REQUIRED_FILES) {
    try {
      const s = await stat(path.join(ROOT, rel));
      if (!s.isFile()) fail(`필수 파일이 파일이 아님: ${rel}`);
    } catch {
      fail(`필수 파일 누락: ${rel}`);
    }
  }
}

// ---------- 2) API 키 하드코딩 검사 ----------

// data.go.kr serviceKey 는 보통 매우 긴 Base64/URL-encoded 토큰.
// 키 이름(serviceKey/SERVICE_KEY) 에 긴 값이 직접 할당된 패턴을 잡는다.
const HARDCODED_KEY_PATTERNS = [
  // DATA_GO_KR_SERVICE_KEY=<긴 값>  또는  PUBLIC_DATA_SERVICE_KEY=<긴 값>
  // ([ \t]* 만 — 줄바꿈을 건너 다음 줄 값으로 오인하지 않도록)
  {
    re: /(DATA_GO_KR_SERVICE_KEY|PUBLIC_DATA_SERVICE_KEY)[ \t]*[:=][ \t]*["']?([A-Za-z0-9%+/=_\-]{20,})/g,
    desc: "환경변수명에 긴 API 키 값이 직접 할당됨"
  },
  // serviceKey= 뒤에 긴 토큰 (URL 하드코딩)
  {
    re: /serviceKey[ \t]*[:=][ \t]*["']([A-Za-z0-9%+/=_\-]{20,})["']/g,
    desc: "serviceKey 에 긴 토큰이 하드코딩됨"
  }
];

// 자리표시자/예시는 허용 (대문자 키워드 포함 시 placeholder 로 간주)
const PLACEHOLDER_TOKENS = [
  "YOUR_",
  "PLACEHOLDER",
  "EXAMPLE",
  "XXXX",
  "<",
  "발급",
  "여기에"
];

function isPlaceholder(value) {
  const v = String(value);
  if (PLACEHOLDER_TOKENS.some((t) => v.toUpperCase().includes(t.toUpperCase()))) return true;
  return false;
}

const SCAN_DIRS = ["src", "scripts", "docs"];
const SCAN_FILES = ["README.md", ".env.example"];
const SCAN_EXTS = new Set([".ts", ".js", ".mjs", ".cjs", ".md", ".json"]);

// 검사기/테스트 자신은 의도적으로 패턴/모의 키 문자열을 포함 → 제외
const FILE_WHITELIST = new Set([
  "scripts/check-collector-policy.js",
  "tests/publicDataApiCollector.test.ts"
]);

async function walk(dir, onFile) {
  let entries;
  try {
    const { readdir } = await import("node:fs/promises");
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      await walk(full, onFile);
    } else if (SCAN_EXTS.has(path.extname(e.name))) {
      await onFile(full);
    }
  }
}

async function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (FILE_WHITELIST.has(rel)) return;
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return;
  }
  for (const { re, desc } of HARDCODED_KEY_PATTERNS) {
    const fresh = new RegExp(re.source, re.flags);
    let m;
    while ((m = fresh.exec(content)) !== null) {
      const value = m[2] ?? m[1] ?? "";
      if (isPlaceholder(value) || isPlaceholder(m[0])) continue;
      const lineNo = content.slice(0, m.index).split(/\r?\n/).length;
      fail(`${rel}:${lineNo}  하드코딩 의심 (${desc}) → ${m[0].slice(0, 40)}...`);
    }
  }
}

async function checkHardcodedKeys() {
  for (const f of SCAN_FILES) {
    const abs = path.join(ROOT, f);
    try {
      const s = await stat(abs);
      if (s.isFile()) await scanFile(abs);
    } catch {
      /* missing OK */
    }
  }
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    try {
      const s = await stat(abs);
      if (s.isDirectory()) await walk(abs, scanFile);
    } catch {
      /* missing OK */
    }
  }
}

// ---------- 3) .env.example 자리표시자 / 빈 값만 ----------

async function checkEnvExample() {
  const abs = path.join(ROOT, ".env.example");
  let content;
  try {
    content = await readFile(abs, "utf8");
  } catch {
    fail(".env.example 가 없습니다.");
    return;
  }
  for (const name of ["DATA_GO_KR_SERVICE_KEY", "PUBLIC_DATA_SERVICE_KEY"]) {
    if (!content.includes(name)) {
      fail(`.env.example 에 ${name} 항목이 없습니다.`);
      continue;
    }
    const re = new RegExp(`^${name}[ \\t]*=[ \\t]*(.*)$`, "m");
    const m = content.match(re);
    if (m) {
      const val = (m[1] ?? "").trim();
      if (val.length > 0 && !isPlaceholder(val)) {
        fail(`.env.example 의 ${name} 에 실제 값처럼 보이는 문자열이 있습니다 (자리표시자/빈 값만 허용).`);
      }
    }
  }
}

// ---------- 4) serviceKey 원문 로그 금지 문구 ----------

async function checkLogMaskingDoc() {
  const runbook = path.join(ROOT, "docs", "API_COLLECTOR_RUNBOOK.md");
  let content;
  try {
    content = await readFile(runbook, "utf8");
  } catch {
    fail("docs/API_COLLECTOR_RUNBOOK.md 가 없습니다.");
    return;
  }
  const hasMaskNotice =
    (content.includes("serviceKey") || content.includes("인증키")) &&
    (content.includes("원문") || content.includes("마스킹")) &&
    (content.includes("로그")) ;
  if (!hasMaskNotice) {
    fail("docs/API_COLLECTOR_RUNBOOK.md 에 'serviceKey/인증키 원문을 로그에 남기지 않는다(마스킹)' 취지의 문구가 없습니다.");
  }
}

// ---------- 실행 ----------

async function main() {
  await checkFilesExist();
  await checkHardcodedKeys();
  await checkEnvExample();
  await checkLogMaskingDoc();

  if (findings.length === 0) {
    console.log("CHECK_COLLECTOR_OK — 수집기 코드/문서 존재, API 키 하드코딩 없음, 로그 마스킹 문구 확인.");
    process.exit(0);
  }
  console.error("CHECK_COLLECTOR_FAIL — 수집기 정책 위반:");
  for (const f of findings) console.error(` - ${f}`);
  process.exit(1);
}

main().catch((e) => {
  console.error("check-collector-policy.js failed:", e);
  process.exit(2);
});
