// 실데이터 1차 기준선 적재 + 품질 리포트 생성 CLI (체크리스트 16 — 필수 작업 4).
//
// 실행:
//   npm run build:baseline -- --input data/upload-parser/runs/xxx/records.jsonl --sourceType upload --sourceName local-upload
//   npm run build:baseline -- --fixture 1000
//
// - 출력 폴더는 DATA_BASELINE_OUTPUT_DIR 또는 data/baseline 기본값.
// - 개인정보 원문은 콘솔에 출력하지 않는다(요약 지표만).
//
// fixture 는 적재 경로/품질 리포트 검증용이며 실데이터 기준선으로 간주하지 않는다.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDataBaseline,
  DATA_BASELINE_NOTICE
} from "../src/quality/dataBaselineQuality.js";
import { BASELINE_SOURCE_TYPES, BaselineSourceType } from "../src/types/dataQualityBaseline.js";
import { createBaselineFixtures } from "../tests/fixtures/createBaselineFixtures.js";

function getArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

async function readJsonlRecords(filePath: string): Promise<Record<string, unknown>[]> {
  const raw = await readFile(filePath, "utf8");
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // 손상된 라인은 건너뛴다(사유는 일반화).
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("[build:baseline] 데이터 기준선 적재 + 품질검증");
  console.log(DATA_BASELINE_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.DATA_BASELINE_OUTPUT_DIR ?? "data/baseline";

  let rawRecords: Record<string, unknown>[] = [];
  let sourceType: BaselineSourceType = "fixture";
  let sourceName = "fixture-synthetic";

  if (fixtureArg) {
    const n = Math.max(1, Number(fixtureArg) || 1000);
    rawRecords = createBaselineFixtures(n) as unknown as Record<string, unknown>[];
    sourceType = "fixture";
    sourceName = "fixture-synthetic";
    console.log(`  fixture ${n}건 생성 (합성 데이터 — 실데이터 아님).`);
  } else if (inputArg) {
    const st = (getArg("sourceType") ?? "upload").trim();
    if (!(BASELINE_SOURCE_TYPES as readonly string[]).includes(st)) {
      console.error(`  지원하지 않는 sourceType: ${st} (api/upload/manual/fixture 중 하나)`);
      process.exit(2);
      return;
    }
    sourceType = st as BaselineSourceType;
    sourceName = (getArg("sourceName") ?? path.basename(path.dirname(inputArg))).trim();
    rawRecords = await readJsonlRecords(path.resolve(inputArg));
    console.log(`  입력 ${rawRecords.length}건 로드 (sourceType=${sourceType}, sourceName=${sourceName}).`);
  } else {
    console.error("사용법: --input <records.jsonl> --sourceType <api|upload|manual> --sourceName <name>  또는  --fixture <count>");
    process.exit(2);
    return;
  }

  const result = await buildDataBaseline(rawRecords, { sourceType, sourceName, outputDir });
  const r = result.report;

  console.log("");
  console.log("DATA_BASELINE_RUN_OK");
  console.log(`  runId: ${r.runId}`);
  console.log(`  totalRecords: ${r.totalRecords}`);
  console.log(`  duplicateRate: ${(r.duplicateRate * 100).toFixed(2)}%`);
  console.log(`  missingRate: ${(r.missingRate * 100).toFixed(2)}%`);
  console.log(`  status: ${r.status}`);
  console.log(`  outputDir: ${path.join(outputDir, "runs", r.runId)}`);
  console.log(`  records: ${result.recordsFile}`);
  console.log(`  quality-report.json: ${result.qualityReportJsonFile}`);
  console.log(`  quality-report.md: ${result.qualityReportMdFile}`);
  console.log(`  error-log.json: ${result.errorLogFile} (errors=${result.errorLog.errorsCount})`);
  console.log("");

  if (r.status === "real_baseline_ok") {
    console.log("DATA_BASELINE_REAL_1000_OK");
    console.log("  → 실데이터(api/upload/manual) 1,000건 이상 적재. 실데이터 기준선 구축 가능.");
    process.exit(0);
    return;
  }
  if (r.status === "fixture_pending") {
    console.log("DATA_BASELINE_FIXTURE_1000_OK_BUT_REAL_BASELINE_PENDING");
    console.log("  → fixture 1,000건 적재 경로/품질 리포트 검증 완료. 실데이터 기준선 구축은 보류.");
    process.exit(0);
    return;
  }
  console.log("DATA_BASELINE_INCOMPLETE");
  console.log("  → 적재 건수가 1,000건 미만입니다. 기준선 구축 미완료.");
  process.exit(1);
}

main().catch((e) => {
  console.error("[build:baseline] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
