#!/usr/bin/env node
/**
 * Reset mock/test demo data — clears mojibake-ridden JSON artifacts that
 * accumulated from earlier sessions, while preserving evidence/report binaries.
 *
 * Default: dry-run only (prints targets, makes no changes).
 *   node scripts/reset-demo-data.js
 *
 * Apply (destructive):
 *   node scripts/reset-demo-data.js --apply
 *
 * Targets (cleared / re-initialized):
 *   data/cases/*.json           → removed
 *   data/candidates/candidates.json → {candidates:[]}
 *   data/feedback/feedback.json → {schemaVersion:"1.0.0",updatedAt,feedback:[]}
 *   data/outcomes/outcomes.json → {schemaVersion:"1.0.0",updatedAt,outcomes:[]}
 *   data/scheduler/runs.json    → {runs:[]}
 *   data/dedupe/latest-report.json → removed
 *   data/traces/*.jsonl         → removed
 *
 * Preserved by default:
 *   data/evidence/**, data/reports/**, data/raw/**, data/eval/**
 *   .env, src/**, public/**, docs/**
 */

import { readdir, stat, unlink, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const APPLY = process.argv.includes("--apply");

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function listFiles(dir, predicate) {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (!predicate || predicate(e.name)))
    .map((e) => path.join(dir, e.name));
}

async function removeFile(p, plan) {
  if (!(await exists(p))) return;
  plan.removes.push(rel(p));
  if (APPLY) await unlink(p);
}

async function resetJson(p, value, plan) {
  plan.resets.push({ file: rel(p), value });
  if (APPLY) {
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(value, null, 2), "utf8");
  }
}

async function main() {
  console.log(`[reset-demo-data] mode=${APPLY ? "APPLY (destructive)" : "DRY-RUN"}`);
  console.log(`[reset-demo-data] root=${ROOT}`);
  console.log("[reset-demo-data] preserved: data/evidence/**, data/reports/**, data/raw/**, data/eval/**, .env, src/, public/, docs/");

  const plan = { removes: [], resets: [] };

  const caseFiles = await listFiles(path.join(ROOT, "data/cases"), (n) => n.endsWith(".json"));
  for (const f of caseFiles) await removeFile(f, plan);

  await resetJson(path.join(ROOT, "data/candidates/candidates.json"), { candidates: [] }, plan);

  const now = new Date().toISOString();
  await resetJson(path.join(ROOT, "data/feedback/feedback.json"), {
    schemaVersion: "1.0.0",
    updatedAt: now,
    feedback: []
  }, plan);
  await resetJson(path.join(ROOT, "data/outcomes/outcomes.json"), {
    schemaVersion: "1.0.0",
    updatedAt: now,
    outcomes: []
  }, plan);
  await resetJson(path.join(ROOT, "data/scheduler/runs.json"), { runs: [] }, plan);

  await removeFile(path.join(ROOT, "data/dedupe/latest-report.json"), plan);

  const traceFiles = await listFiles(path.join(ROOT, "data/traces"), (n) => n.endsWith(".jsonl"));
  for (const f of traceFiles) await removeFile(f, plan);

  console.log(`\n[reset-demo-data] plan: ${plan.removes.length} files to remove, ${plan.resets.length} files to re-init`);
  if (plan.removes.length > 0) {
    console.log("  Remove:");
    for (const r of plan.removes) console.log(`    - ${r}`);
  }
  if (plan.resets.length > 0) {
    console.log("  Re-init to empty:");
    for (const r of plan.resets) console.log(`    - ${r.file}`);
  }

  console.log("\n[reset-demo-data] evidence / reports / raw / eval are NOT touched.");
  if (!APPLY) {
    console.log("[reset-demo-data] dry-run only. Run with --apply to actually delete/overwrite.");
  } else {
    console.log("[reset-demo-data] APPLY complete.");
  }
}

main().catch((err) => {
  console.error("[reset-demo-data] ERROR", err);
  process.exit(1);
});
