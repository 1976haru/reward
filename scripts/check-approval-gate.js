#!/usr/bin/env node
/**
 * Approval Gate static safety check.
 *
 * src/와 public/ 에서 위험한 식별자/함수명/UI 버튼 문구를 검사한다.
 * 허용된 부정 컨텍스트("자동 신고가 아닙니다" 등)는 예외 처리한다.
 *
 * 위반 발견 시 exit code 1.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SCAN_DIRS = ["src", "public"];
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".html", ".css"]);

// 정적으로 정의하지 않을 식별자/함수명 (definition만 검사. references는 제거 어려움)
const DANGEROUS_IDENTIFIERS = [
  /\bautoSubmit\s*\(/,
  /\bsendToAgency\s*\(/,
  /\bagencyLogin\s*\(/,
  /\bautoLogin\s*\(/,
  /\bsubmitReport\s*\(/,
  /\bclaimReward\s*\(/,
  /\bautoSubmit\s*[:=]/,
  /\bsendToAgency\s*[:=]/,
  /\bagencyLogin\s*[:=]/,
  /\bautoLogin\s*[:=]/
];

// UI 버튼/링크에서 금지 문구. 주변 ±80자에 부정 마커가 있으면 안전 문맥으로 간주.
const DANGEROUS_UI_TEXTS = [
  { needle: "자동 신고" },
  { needle: "바로 제출" },
  { needle: "포상금 신청" }
];

// 위 needle이 등장해도 같은 문맥에 부정 표현이 함께 있으면 통과 (정책 안내 문구로 간주)
const NEGATIVE_MARKERS = /(금지|아닙니다|아니다|아니라|아니며|않습니다|않으며|않는다|않음|없습니다|없으며|없음|미수행|제외|불가|제거|차단|수행하지|진행하지|기능\s*없)/;

// 검사 제외 파일 (정책/문서 본문 — 의도적으로 금지 표현을 나열)
const EXCLUDED_FILES = new Set([
  "src/policy/approvalGate.ts",
  "src/utils/validation.ts",
  "src/agents/AnalyzerAgent.ts",
  "src/services/ReportService.ts",
  "src/services/TextExtractor.ts",
  "src/modules/false-ad/agency_config.json",
  "src/modules/false-ad/keywords.json",
  "src/modules/false-ad/analysis_prompt.md",
  "src/modules/false-ad/analysis_schema.json",
  "src/modules/false-ad/report-template.md",
  "src/agents/scoring_rules.ts",
  "src/scripts/smoke-test.ts",
  "scripts/check-approval-gate.js"
]);

const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      await walk(full);
    } else if (SCAN_EXTS.has(path.extname(e.name))) {
      await scanFile(full);
    }
  }
}

async function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (EXCLUDED_FILES.has(rel)) return;
  let content;
  try { content = await readFile(filePath, "utf8"); }
  catch { return; }

  for (const re of DANGEROUS_IDENTIFIERS) {
    if (re.test(content)) {
      const idx = content.search(re);
      const lineNo = content.slice(0, idx).split(/\r?\n/).length;
      const lineText = content.split(/\r?\n/)[lineNo - 1]?.trim() ?? "";
      findings.push({
        file: rel,
        line: lineNo,
        kind: "dangerous_identifier",
        pattern: re.source,
        snippet: lineText.slice(0, 200)
      });
    }
  }

  for (const { needle } of DANGEROUS_UI_TEXTS) {
    let idx = 0;
    while ((idx = content.indexOf(needle, idx)) >= 0) {
      const before = content.slice(Math.max(0, idx - 80), idx);
      const after = content.slice(idx, Math.min(content.length, idx + needle.length + 80));
      const window = before + after;
      // 부정 마커가 같은 문맥에 있으면 정책 안내로 간주 → 통과
      if (!NEGATIVE_MARKERS.test(window)) {
        const lineNo = content.slice(0, idx).split(/\r?\n/).length;
        findings.push({
          file: rel,
          line: lineNo,
          kind: "dangerous_ui_text",
          pattern: needle,
          snippet: window.replace(/\s+/g, " ").trim().slice(0, 200)
        });
      }
      idx += needle.length;
    }
  }
}

async function main() {
  for (const d of SCAN_DIRS) {
    const abs = path.join(ROOT, d);
    try {
      const s = await stat(abs);
      if (s.isDirectory()) await walk(abs);
    } catch { /* missing dir is OK */ }
  }
  if (findings.length === 0) {
    console.log("CHECK_POLICY_OK — no dangerous identifiers or UI texts detected.");
    process.exit(0);
  }
  console.error("CHECK_POLICY_FAIL — found dangerous patterns:");
  for (const f of findings) {
    console.error(` - [${f.kind}] ${f.file}:${f.line}  /${f.pattern}/  → ${f.snippet}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("check-approval-gate.js failed:", e);
  process.exit(2);
});
