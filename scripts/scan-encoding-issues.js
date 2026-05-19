#!/usr/bin/env node
/**
 * Mojibake (U+FFFD) scanner.
 *
 * - Scans src/, public/, docs/, README.md for U+FFFD ('�' aka REPLACEMENT CHARACTER).
 *   Any match exits with code 1 — these are source assets that must not contain mojibake.
 * - Also scans data/ (mock/test artifacts). By default these only print a warning.
 *   With `--strict-data` (or `--strict`), data/ matches also exit 1.
 * - Excludes node_modules/, dist/, .git/, evidence/, reports/ binary files automatically.
 *
 * Usage:
 *   node scripts/scan-encoding-issues.js
 *   node scripts/scan-encoding-issues.js --strict-data
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["src", "public", "docs"];
const SOURCE_FILES = ["README.md"];
const DATA_DIR = "data";

const STRICT_DATA = process.argv.includes("--strict-data") || process.argv.includes("--strict");

const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".git"]);
// 이진/대용량 산출물은 텍스트 스캔에서 제외 (evidence/report 보존).
const EXCLUDE_DATA_SUBDIRS = new Set(["evidence", "reports", "raw"]);
const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".docx", ".xlsx",
  ".zip", ".gz", ".tar", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mov"
]);

const REPLACEMENT_CHAR = "�";

async function walk(dir, results) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      if (rel.startsWith("data/")) {
        const second = rel.split("/")[1];
        if (EXCLUDE_DATA_SUBDIRS.has(second)) continue;
      }
      await walk(abs, results);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (BINARY_EXTS.has(ext)) continue;
      results.push(abs);
    }
  }
}

async function scanFile(abs) {
  try {
    const text = await readFile(abs, "utf8");
    if (!text.includes(REPLACEMENT_CHAR)) return null;
    const lines = text.split(/\r?\n/);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(REPLACEMENT_CHAR)) {
        hits.push({ line: i + 1, preview: lines[i].slice(0, 120) });
      }
      if (hits.length >= 3) break;
    }
    return hits;
  } catch (err) {
    if (err.code === "EISDIR" || err.code === "ENOENT") return null;
    return [{ line: 0, preview: `read error: ${err.message}` }];
  }
}

async function collectTargets(roots) {
  const files = [];
  for (const r of roots) {
    const abs = path.join(ROOT, r);
    let s;
    try { s = await stat(abs); } catch { continue; }
    if (s.isFile()) files.push(abs);
    else if (s.isDirectory()) await walk(abs, files);
  }
  return files;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

async function scanSet(files, label) {
  const offenders = [];
  for (const f of files) {
    const hits = await scanFile(f);
    if (hits && hits.length > 0) {
      offenders.push({ file: rel(f), hits });
    }
  }
  if (offenders.length > 0) {
    console.log(`[scan-encoding] ${label}: ${offenders.length} file(s) contain U+FFFD`);
    for (const o of offenders) {
      console.log(`  - ${o.file}`);
      for (const h of o.hits) {
        console.log(`      line ${h.line}: ${h.preview}`);
      }
    }
  } else {
    console.log(`[scan-encoding] ${label}: clean (no U+FFFD)`);
  }
  return offenders;
}

async function main() {
  console.log(`[scan-encoding] root=${ROOT}`);
  console.log(`[scan-encoding] mode=${STRICT_DATA ? "strict (data also fails)" : "lenient (data warns only)"}`);

  const sourceFiles = await collectTargets([...SOURCE_DIRS, ...SOURCE_FILES]);
  const dataFiles = await collectTargets([DATA_DIR]);

  const sourceOffenders = await scanSet(sourceFiles, "source (src/public/docs/README)");
  const dataOffenders = await scanSet(dataFiles, "data (mock/test artifacts)");

  let exitCode = 0;
  if (sourceOffenders.length > 0) {
    console.error("[scan-encoding] FAIL — source files contain U+FFFD.");
    exitCode = 1;
  }
  if (dataOffenders.length > 0) {
    if (STRICT_DATA) {
      console.error("[scan-encoding] FAIL — data files contain U+FFFD (strict mode).");
      console.error("  Run `npm run data:reset-demo:apply` to clear mock/test artifacts (evidence/reports/raw are preserved).");
      exitCode = 1;
    } else {
      console.warn("[scan-encoding] WARN — data files contain U+FFFD. Run `npm run data:reset-demo` (dry-run) and then `:apply` to fix.");
    }
  }
  if (exitCode === 0) {
    console.log("[scan-encoding] OK");
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[scan-encoding] ERROR", err);
  process.exit(2);
});
