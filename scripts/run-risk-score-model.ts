import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  RISK_SCORE_MODEL_NOTICE,
  generateRiskScoreReport,
  writeRiskScoreReport
} from "../src/scoring/riskScoreModel.js";
import { createRiskScoreFixtures } from "../tests/fixtures/createRiskScoreFixtures.js";

function getArgs(name: string): string[] {
  const argv = process.argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && i + 1 < argv.length) out.push(argv[i + 1]);
  }
  return out;
}

function getArg(name: string): string | undefined {
  return getArgs(name)[0];
}

function candidatesFromReportJson(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  if (Array.isArray(value)) return value;
  if (Array.isArray(obj.topCandidates)) return obj.topCandidates;
  if (Array.isArray(obj.topScores)) return obj.topScores;
  if (Array.isArray(obj.candidates)) return obj.candidates;
  return [value];
}

async function readRiskReport(filePath: string): Promise<unknown[]> {
  const raw = await readFile(filePath, "utf8");
  return candidatesFromReportJson(JSON.parse(raw));
}

async function main(): Promise<void> {
  console.log("[risk:score] 100-point risk score model");
  console.log(RISK_SCORE_MODEL_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArgs = getArgs("input");
  const outputDir = process.env.RISK_OUTPUT_DIR ?? "data/risk/score";
  let inputs: unknown[] = [];
  let isFixtureBased = false;
  let sourceNote = "input-risk-reports";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 1000);
    inputs = createRiskScoreFixtures(n).candidates;
    isFixtureBased = true;
    sourceNote = "fixture-synthetic";
    console.log(`fixture ${inputs.length} input candidates generated. This is fixture-based verification.`);
  } else if (inputArgs.length > 0) {
    for (const input of inputArgs) inputs.push(...(await readRiskReport(path.resolve(input))));
    console.log(`loaded ${inputs.length} input candidates from ${inputArgs.length} report file(s).`);
  } else {
    console.error("Usage: --input <risk-report.json> [--input <risk-report.json>] or --fixture <count>");
    process.exit(2);
    return;
  }

  const report = generateRiskScoreReport(inputs, { isFixtureBased, sourceNote });
  const { reportJsonFile, reportMdFile } = await writeRiskScoreReport(outputDir, report);

  console.log("");
  console.log("RISK_SCORE_RUN_OK");
  console.log(`totalInputCandidates: ${report.totalInputCandidates}`);
  console.log(`totalScoredSubjects: ${report.totalScoredSubjects}`);
  console.log(`gradeSummary: A=${report.gradeSummary.A}, B=${report.gradeSummary.B}, C=${report.gradeSummary.C}`);
  console.log(`outputDir: ${path.join(outputDir, "runs", report.runId)}`);
  console.log(`report.json: ${reportJsonFile}`);
  console.log(`report.md: ${reportMdFile}`);
  if (report.isFixtureBased) console.log("fixture 기반 검증입니다. 실제 탐지 완료로 표현하지 않습니다.");
}

main().catch((e) => {
  console.error("[risk:score] unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
