#!/usr/bin/env node
/**
 * API 키 안전검사 (체크리스트 25).
 *
 * 목적: API 키 / 토큰 / Authorization / Cookie / Secret 이 git 에 추적되는 파일이나
 *       사용자 노출 위치(코드/문서/응답/로그 샘플)에 원문으로 남지 않게 한다.
 *
 * 검사 항목:
 *   1) .env 가 git 추적 대상이 아님 (gitignore 됨)
 *   2) git 으로 추적되는 파일에 실제 API 키 패턴(sk-, AIza, ghp_, xox-, JWT 등)이 없음
 *   3) Authorization: Bearer <실제 토큰> / Set-Cookie 원문이 추적 파일에 없음
 *   4) SettingsService 가 키 원문을 응답에 직접 넣지 않음 (maskSecretStatusOnly/present 사용 확인)
 *
 * 통과 시 "CHECK_API_KEY_SAFETY_OK", 위반 시 비-0 종료.
 *
 * 주의: 본 스크립트에는 실제 키나 실제처럼 보이는 fake key 를 넣지 않는다.
 *       패턴 정의는 문자 클래스 조합으로만 표현한다.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const failures = [];
function fail(msg) { failures.push(msg); }

// 패턴 정의 파일·테스트·문서(패턴을 설명하는 곳)는 스캔에서 제외한다.
// 이 파일들은 "탐지 규칙/더미 예시"를 담고 있어 실제 유출이 아니다.
const WHITELIST_SUFFIXES = [
  "scripts/check-api-key-safety.js",
  "scripts/check-privacy-policy.js",
  "src/services/privacy/SensitiveDataDetector.ts",
  "src/services/trace/maskSensitive.ts",
  "src/services/privacy/MaskingService.ts",
  "tests/privacyGuard.test.ts",
  "src/scripts/smoke-test.ts",
  "docs/API_SETUP.md",
  "docs/privacy_policy.md",
  "docs/trace_log.md"
];

function isWhitelisted(rel) {
  const norm = rel.replace(/\\/g, "/");
  return WHITELIST_SUFFIXES.some((w) => norm.endsWith(w));
}

// 실제 키처럼 보이는 값만 잡는다 (식별자/플레이스홀더 제외).
const SECRET_VALUE_PATTERNS = [
  { name: "openai_key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "openai_scoped_key", re: /\bsk-(?:live|test|proj|svcacct)[_-][A-Za-z0-9]{16,}\b/g },
  { name: "google_key", re: /\bAIza[0-9A-Za-z_\-]{30,}\b/g },
  { name: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: "slack_token", re: /\bxox[apbsr]-[A-Za-z0-9-]{12,}\b/g },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "bearer_token", re: /\bBearer\s+[A-Za-z0-9._\-]{24,}\b/g }
];

// 플레이스홀더/마스킹 토큰은 위반이 아니다.
const PLACEHOLDER_RE = /(masked|example|dummy|placeholder|your[_-]?key|xxxx|<.*>|여기에|본인_?키|REDACTED|test_abcdef)/i;

function listTrackedFiles() {
  const out = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function gitCheckIgnored(file) {
  try {
    execSync(`git check-ignore ${file}`, { cwd: ROOT, stdio: "pipe" });
    return true; // exit 0 → ignored
  } catch {
    return false;
  }
}

// 1) .env 가 추적되지 않고 ignore 되는지
const tracked = listTrackedFiles();
if (tracked.includes(".env")) {
  fail(".env 가 git 추적 대상입니다. 즉시 추적 해제하고 .gitignore 에 등록하세요.");
}
if (!gitCheckIgnored(".env")) {
  fail(".env 가 .gitignore 로 무시되지 않습니다. .gitignore 에 .env 를 추가하세요.");
}

// 2~3) 추적 파일 본문 스캔
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".css", ".md", ".json", ".jsonl", ".env"]);
let scanned = 0;
for (const rel of tracked) {
  const ext = path.extname(rel).toLowerCase();
  if (rel !== ".env.example" && !SCAN_EXTS.has(ext)) continue;
  if (isWhitelisted(rel)) continue;
  let text;
  try { text = readFileSync(path.join(ROOT, rel), "utf8"); }
  catch { continue; }
  scanned++;
  for (const { name, re } of SECRET_VALUE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const matched = m[0];
      if (PLACEHOLDER_RE.test(matched)) continue;
      const line = text.slice(0, m.index).split(/\r?\n/).length;
      fail(`${rel}:${line} 에 ${name} 형태의 실제 키/토큰 패턴이 있습니다. 원문을 제거하고 .env 환경변수로 옮기세요.`);
    }
  }
}

// 4) SettingsService 가 키 원문을 노출하지 않는지 (정적 휴리스틱)
try {
  const settingsSrc = readFileSync(path.join(ROOT, "src/services/settings/SettingsService.ts"), "utf8");
  if (!/maskSecretStatusOnly/.test(settingsSrc)) {
    fail("SettingsService 가 maskSecretStatusOnly 를 사용하지 않습니다. 키 상태(present)만 노출해야 합니다.");
  }
  // 응답 빌더가 openaiApiKey / naverClientSecret 원문을 직접 반환하지 않는지
  if (/configured\s*:\s*config\.(openaiApiKey|scout\.naverClientSecret|scout\.naverClientId)\b/.test(settingsSrc)) {
    fail("SettingsService 응답에 키 원문이 직접 들어갈 수 있습니다. present(boolean) 만 노출하세요.");
  }
} catch {
  fail("SettingsService.ts 를 읽지 못했습니다. 키 비노출 검사를 수행할 수 없습니다.");
}

if (failures.length > 0) {
  console.error("CHECK_API_KEY_SAFETY_FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`CHECK_API_KEY_SAFETY_OK — 추적 파일 ${scanned}개 스캔, .env 무시 확인, settings 키 비노출 확인. 실제 API 키/토큰 패턴 없음.`);
