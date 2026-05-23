// 동일 주소 다수 단체 탐지 룰 실행 CLI (체크리스트 18 — 필수 작업 4).
//
// 실행:
//   npm run risk:address-cluster -- --input data/baseline/runs/xxx/records.jsonl
//   npm run risk:address-cluster -- --fixture 1000
//
// - 출력 폴더는 RISK_OUTPUT_DIR 또는 data/risk/address-cluster 기본값.
// - 개인정보·상세주소 원문은 콘솔에 출력하지 않는다(요약 지표만).
//
// 결과는 "동일 주소 다수 단체 후보표"이며 위법 여부 판단이 아니다.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  generateAddressClusterRiskReport,
  writeAddressClusterRiskReport,
  ADDRESS_CLUSTER_NOTICE
} from "../src/rules/addressClusterRiskRule.js";
import { BaselineRecord } from "../src/types/dataQualityBaseline.js";
import { createAddressClusterRiskFixtures } from "../tests/fixtures/createAddressClusterRiskFixtures.js";

function getArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

async function readJsonl(filePath: string): Promise<BaselineRecord[]> {
  const raw = await readFile(filePath, "utf8");
  const out: BaselineRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as BaselineRecord);
    } catch {
      /* 손상된 라인 건너뜀 */
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("[risk:address-cluster] 동일 주소 다수 단체 탐지 룰");
  console.log(ADDRESS_CLUSTER_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.RISK_OUTPUT_DIR ?? "data/risk/address-cluster";

  let records: BaselineRecord[] = [];
  let isRealData = false;
  let sourceNote = "fixture-synthetic";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 1000);
    records = createAddressClusterRiskFixtures(n).records;
    isRealData = false;
    console.log(`  fixture ${records.length}건 생성 (합성 데이터 — 실제 탐지 완료 아님).`);
  } else if (inputArg) {
    records = await readJsonl(path.resolve(inputArg));
    const realCount = records.filter(
      (r) => r.sourceType === "api" || r.sourceType === "upload" || r.sourceType === "manual"
    ).length;
    isRealData = realCount >= 1000;
    sourceNote = isRealData ? "real-data" : "input(non-real-or-small)";
    console.log(`  입력 ${records.length}건 로드 (실데이터 추정: ${isRealData ? "예" : "아니오"}).`);
  } else {
    console.error("사용법: --input <records.jsonl>  또는  --fixture <count>");
    process.exit(2);
    return;
  }

  const report = generateAddressClusterRiskReport(records, { isRealData, sourceNote });
  const { reportJsonFile, reportMdFile } = await writeAddressClusterRiskReport(outputDir, report);

  console.log("");
  console.log("ADDRESS_CLUSTER_RISK_RUN_OK");
  console.log(`  runId: ${report.runId}`);
  console.log(`  totalRecords: ${report.totalRecords}`);
  console.log(`  totalAddressGroups: ${report.totalAddressGroups}`);
  console.log(`  totalCandidates: ${report.totalCandidates}`);
  console.log(`  topCandidates: ${report.topCandidates.length}`);
  console.log(`  outputDir: ${path.join(outputDir, "runs", report.runId)}`);
  console.log(`  report.json: ${reportJsonFile}`);
  console.log(`  report.md: ${reportMdFile}`);
  if (!isRealData) {
    console.log("");
    console.log("  ⚠ fixture 기반 검증입니다 — 실제 동일 주소 다수 단체 탐지 완료가 아닙니다.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[risk:address-cluster] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
