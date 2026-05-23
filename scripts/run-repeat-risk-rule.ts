// 반복 수급 탐지 룰 실행 CLI (체크리스트 17 — 필수 작업 4).
//
// 실행:
//   npm run risk:repeat -- --input data/baseline/runs/xxx/records.jsonl
//   npm run risk:repeat -- --fixture 1000
//
// - 출력 폴더는 RISK_OUTPUT_DIR 또는 data/risk/repeat 기본값.
// - 개인정보 원문은 콘솔에 출력하지 않는다(요약 지표만).
//
// 결과는 "반복 수급 후보 TOP 50"이며 부정수급 판단이 아니다.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  generateRepeatRiskReport,
  writeRepeatRiskReport,
  REPEAT_RISK_NOTICE
} from "../src/rules/repeatSubsidyRiskRule.js";
import { BaselineRecord } from "../src/types/dataQualityBaseline.js";
import { createRepeatRiskFixtures } from "../tests/fixtures/createRepeatRiskFixtures.js";

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
      // 손상된 라인 건너뜀
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("[risk:repeat] 반복 수급 탐지 룰");
  console.log(REPEAT_RISK_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.RISK_OUTPUT_DIR ?? "data/risk/repeat";

  let records: BaselineRecord[] = [];
  let isRealData = false;
  let sourceNote = "fixture-synthetic";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 1000);
    records = createRepeatRiskFixtures(n).records;
    isRealData = false;
    sourceNote = "fixture-synthetic";
    console.log(`  fixture ${records.length}건 생성 (합성 데이터 — 실제 탐지 완료 아님).`);
  } else if (inputArg) {
    records = await readJsonl(path.resolve(inputArg));
    // 입력이 실데이터인지(api/upload/manual)만으로 판단
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

  const report = generateRepeatRiskReport(records, { isRealData, sourceNote });
  const { reportJsonFile, reportMdFile } = await writeRepeatRiskReport(outputDir, report);

  console.log("");
  console.log("REPEAT_RISK_RUN_OK");
  console.log(`  runId: ${report.runId}`);
  console.log(`  totalRecords: ${report.totalRecords}`);
  console.log(`  totalPairsEvaluated: ${report.totalPairsEvaluated}`);
  console.log(`  totalCandidates: ${report.totalCandidates}`);
  console.log(`  topCandidates: ${report.topCandidates.length}`);
  console.log(`  outputDir: ${path.join(outputDir, "runs", report.runId)}`);
  console.log(`  report.json: ${reportJsonFile}`);
  console.log(`  report.md: ${reportMdFile}`);
  if (!isRealData) {
    console.log("");
    console.log("  ⚠ fixture 기반 검증입니다 — 실제 반복 수급 탐지 완료가 아닙니다.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[risk:repeat] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
