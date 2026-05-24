import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTRACTOR_NETWORK_RISK_NOTICE,
  generateContractorNetworkRiskReport,
  writeContractorNetworkRiskReport
} from "../src/rules/contractorNetworkRiskRule.js";
import { ContractorNetworkEdge } from "../src/types/contractorNetworkRisk.js";
import { createContractorNetworkRiskFixtures } from "../tests/fixtures/createContractorNetworkRiskFixtures.js";

function getArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

async function readJsonl(filePath: string): Promise<ContractorNetworkEdge[]> {
  const raw = await readFile(filePath, "utf8");
  const out: ContractorNetworkEdge[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as ContractorNetworkEdge);
    } catch {
      /* skip malformed fixture/input lines */
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("[risk:contractor-network] contractor network risk rule");
  console.log(CONTRACTOR_NETWORK_RISK_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.RISK_OUTPUT_DIR ?? "data/risk/contractor-network";
  let edges: ContractorNetworkEdge[] = [];
  let isRealData = false;
  let sourceNote = "fixture-synthetic";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 1000);
    edges = createContractorNetworkRiskFixtures(n).edges;
    console.log(`fixture ${edges.length} edges generated. This is fixture-based verification, not actual detection completion.`);
  } else if (inputArg) {
    edges = await readJsonl(path.resolve(inputArg));
    isRealData = edges.length >= 1000;
    sourceNote = isRealData ? "input-data" : "input-small-or-non-real";
    console.log(`input ${edges.length} edges loaded. real-data assumption: ${isRealData ? "yes" : "no"}.`);
  } else {
    console.error("Usage: --input <edges.jsonl> or --fixture <count>");
    process.exit(2);
    return;
  }

  const report = generateContractorNetworkRiskReport(edges, { isRealData, sourceNote });
  const { reportJsonFile, reportMdFile } = await writeContractorNetworkRiskReport(outputDir, report);

  console.log("");
  console.log("CONTRACTOR_NETWORK_RISK_RUN_OK");
  console.log(`totalEdges: ${report.totalEdges}`);
  console.log(`totalCandidates: ${report.totalCandidates}`);
  console.log(`topCandidates: ${report.topCandidates.length}`);
  console.log(`outputDir: ${path.join(outputDir, "runs", report.runId)}`);
  console.log(`report.json: ${reportJsonFile}`);
  console.log(`report.md: ${reportMdFile}`);
  if (!isRealData) console.log("fixture 기반 검증입니다. 실제 탐지 완료로 표현하지 않습니다.");
}

main().catch((e) => {
  console.error("[risk:contractor-network] unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
