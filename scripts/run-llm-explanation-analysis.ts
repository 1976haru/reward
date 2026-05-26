import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  LLM_EXPLANATION_NOTICE,
  generateLlmExplanationReport,
  writeLlmExplanationReport
} from "../src/analysis/llmExplanationAnalysis.js";
import { createLlmExplanationFixtures } from "../tests/fixtures/createLlmExplanationFixtures.js";

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
  if (Array.isArray(obj.explanations)) return obj.explanations;
  if (Array.isArray(obj.ruleResults)) return obj.ruleResults; // 체크리스트 60 rule-results.json
  if (Array.isArray(obj.topScores)) return obj.topScores;
  if (Array.isArray(obj.topCandidates)) return obj.topCandidates;
  if (Array.isArray(obj.candidates)) return obj.candidates;
  return [value];
}

async function readInput(filePath: string): Promise<unknown[]> {
  const raw = await readFile(filePath, "utf8");
  return candidatesFromReportJson(JSON.parse(raw));
}

async function main(): Promise<void> {
  console.log("[analysis:llm-explain] deterministic fallback explanation analysis");
  console.log(LLM_EXPLANATION_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArgs = getArgs("input");
  const outputDir = process.env.ANALYSIS_OUTPUT_DIR ?? "data/analysis/llm-explanation";
  let inputs: unknown[] = [];
  let isFixtureBased = false;
  let sourceNote = "input-risk-or-reward-reports";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 100);
    inputs = createLlmExplanationFixtures(n).candidates;
    isFixtureBased = true;
    sourceNote = "fixture-synthetic";
    console.log(`fixture ${inputs.length} input candidates generated. This is fixture-based verification.`);
  } else if (inputArgs.length > 0) {
    for (const input of inputArgs) inputs.push(...(await readInput(path.resolve(input))));
    console.log(`loaded ${inputs.length} input candidates from ${inputArgs.length} report file(s).`);
  } else {
    console.error("Usage: --input <risk-or-reward-report.json> [--input <rule-report.json>] or --fixture <count>");
    process.exit(2);
    return;
  }

  const report = generateLlmExplanationReport(inputs, { isFixtureBased, sourceNote });
  const { reportJsonFile, reportMdFile, summaryMdFile, metadataFile } =
    await writeLlmExplanationReport(outputDir, report);

  console.log("");
  console.log("LLM_EXPLANATION_ANALYSIS_RUN_OK");
  console.log(`totalInputCandidates: ${report.totalInputCandidates}`);
  console.log(`totalExplanations: ${report.totalExplanations}`);
  console.log("deterministicFallbackOnly: true (실제 LLM API 미호출)");
  console.log(`outputDir: ${path.join(outputDir, "runs", report.runId)}`);
  console.log(`llm-explanation-report.json: ${reportJsonFile}`);
  console.log(`llm-explanation-report.md: ${reportMdFile}`);
  console.log(`llm-explanation-summary.md: ${summaryMdFile}`);
  console.log(`metadata.json: ${metadataFile}`);
  if (report.isFixtureBased) console.log("fixture 기반 검증입니다. 실제 LLM API 호출은 수행하지 않았습니다.");
}

main().catch((e) => {
  console.error("[analysis:llm-explain] unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
