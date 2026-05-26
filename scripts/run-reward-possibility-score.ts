import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  REWARD_POSSIBILITY_SCORE_NOTICE,
  generateRewardPossibilityScoreReport,
  writeRewardPossibilityScoreReport
} from "../src/scoring/rewardPossibilityScore.js";
import { createRewardPossibilityScoreFixtures } from "../tests/fixtures/createRewardPossibilityScoreFixtures.js";

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
  if (Array.isArray(obj.ruleResults)) return obj.ruleResults; // 체크리스트 60 rule-results.json
  if (Array.isArray(obj.topScores)) return obj.topScores;
  if (Array.isArray(obj.topCandidates)) return obj.topCandidates;
  if (Array.isArray(obj.candidates)) return obj.candidates;
  return [value];
}

async function readRewardInput(filePath: string): Promise<unknown[]> {
  const raw = await readFile(filePath, "utf8");
  return candidatesFromReportJson(JSON.parse(raw));
}

async function main(): Promise<void> {
  console.log("[reward:score] reward possibility score model");
  console.log(REWARD_POSSIBILITY_SCORE_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArgs = getArgs("input");
  const outputDir = process.env.REWARD_OUTPUT_DIR ?? "data/reward/score";
  let inputs: unknown[] = [];
  let isFixtureBased = false;
  let sourceNote = "input-risk-or-rule-reports";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 1000);
    inputs = createRewardPossibilityScoreFixtures(n).candidates;
    isFixtureBased = true;
    sourceNote = "fixture-synthetic";
    console.log(`fixture ${inputs.length} input candidates generated. This is fixture-based verification.`);
  } else if (inputArgs.length > 0) {
    for (const input of inputArgs) inputs.push(...(await readRewardInput(path.resolve(input))));
    console.log(`loaded ${inputs.length} input candidates from ${inputArgs.length} report file(s).`);
  } else {
    console.error("Usage: --input <risk-score-report.json> [--input <rule-report.json>] or --fixture <count>");
    process.exit(2);
    return;
  }

  const report = generateRewardPossibilityScoreReport(inputs, { isFixtureBased, sourceNote });
  const { reportJsonFile, reportMdFile, summaryMdFile, metadataFile } =
    await writeRewardPossibilityScoreReport(outputDir, report);

  console.log("");
  console.log("REWARD_SCORE_RUN_OK");
  console.log(`totalInputCandidates: ${report.totalInputCandidates}`);
  console.log(`totalScoredSubjects: ${report.totalScoredSubjects}`);
  console.log(
    `levelSummary: High=${report.levelSummary.High}, Medium=${report.levelSummary.Medium}, Low=${report.levelSummary.Low}`
  );
  console.log("rewardGuaranteed: false");
  console.log(`outputDir: ${path.join(outputDir, "runs", report.runId)}`);
  console.log(`reward-possibility-score-report.json: ${reportJsonFile}`);
  console.log(`reward-possibility-score-report.md: ${reportMdFile}`);
  console.log(`reward-score-summary.md: ${summaryMdFile}`);
  console.log(`metadata.json: ${metadataFile}`);
  if (report.isFixtureBased) {
    console.log("fixture 기반 검증입니다. 실제 보상/포상 가능성 검토 완료로 표현하지 않습니다.");
  }
}

main().catch((e) => {
  console.error("[reward:score] unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
