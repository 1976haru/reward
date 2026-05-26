// 보조금 신고 전 사실점검 11항목 실행 CLI (체크리스트 65).
//
// 실행:
//   npm run subsidy:fact-check -- --fixture
//   npm run subsidy:fact-check -- --input data/cases/xxx/fact-check-input.json
//
// - 출력 폴더: FACT_CHECK_OUTPUT_DIR 또는 data/fact-check (runs/{runId} 하위 3개 파일).
// - 개인정보 원문은 결과에 저장하지 않는다.
//
// 결과는 신고서 초안 생성 전 "안전 확인" 단계이며 부정수급 확정 판단이 아니다.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  generateSubsidyFactCheckReport,
  writeSubsidyFactCheckReport,
  SUBSIDY_FACT_CHECK_NOTICE
} from "../src/policy/subsidyPreReportChecklist.js";
import type { SubsidyFactCheckInput } from "../src/types/subsidyFactCheck.js";
import { createSubsidyFactCheckFixtures } from "../tests/fixtures/createSubsidyFactCheckFixtures.js";

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function getArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

function casesFromJson(value: unknown): SubsidyFactCheckInput[] {
  if (Array.isArray(value)) return value as SubsidyFactCheckInput[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.cases)) return obj.cases as SubsidyFactCheckInput[];
    return [value as SubsidyFactCheckInput];
  }
  return [];
}

async function main(): Promise<void> {
  console.log("[subsidy:fact-check] 보조금 신고 전 사실점검 11항목");
  console.log(SUBSIDY_FACT_CHECK_NOTICE);
  console.log("");

  const fixture = hasFlag("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.FACT_CHECK_OUTPUT_DIR ?? "data/fact-check";

  let cases: SubsidyFactCheckInput[] = [];
  let isFixtureBased = false;
  let sourceNote = "input-cases";

  if (inputArg) {
    try {
      cases = casesFromJson(JSON.parse(await readFile(path.resolve(inputArg), "utf8")));
    } catch (e) {
      console.error(`입력 파일을 읽지 못했습니다: ${inputArg} (${e instanceof Error ? e.message : e})`);
      process.exit(2);
      return;
    }
    if (cases.length === 0) {
      console.error(`입력 파일에 유효한 Case가 없습니다: ${inputArg}`);
      process.exit(2);
      return;
    }
    console.log(`입력 ${cases.length} Case 로드.`);
  } else if (fixture) {
    cases = createSubsidyFactCheckFixtures().cases;
    isFixtureBased = true;
    sourceNote = "fixture-synthetic";
    console.log(`fixture ${cases.length} Case 생성 (합성 데이터).`);
  } else {
    console.error("사용법: --fixture  또는  --input <fact-check-input.json>");
    process.exit(2);
    return;
  }

  const report = generateSubsidyFactCheckReport(cases, { isFixtureBased, sourceNote });
  const written = await writeSubsidyFactCheckReport(outputDir, report);

  console.log("");
  console.log("SUBSIDY_FACT_CHECK_RUN_OK");
  console.log(`totalCases: ${report.totalCases}`);
  console.log(`canGenerateReportDraft(true) 건수: ${report.canGenerateCount}`);
  console.log(
    `overall: PASS=${report.overallSummary.PASS}, PASS_WITH_WARNINGS=${report.overallSummary.PASS_WITH_WARNINGS}, NEEDS_FIX=${report.overallSummary.NEEDS_FIX}, BLOCKED=${report.overallSummary.BLOCKED}`
  );
  console.log("autoSubmitAvailable: false / rewardGuaranteed: false / reviewRequired: true");
  console.log(`outputDir: ${written.runDir}`);
  console.log(`fact-check-report.json: ${written.reportJsonFile}`);
  console.log(`fact-check-summary.md: ${written.summaryMdFile}`);
  console.log(`metadata.json: ${written.metadataFile}`);
  if (isFixtureBased) console.log("fixture 기반 검증입니다. 실제 신고 가능 상태가 아닙니다. 사람 검토 필요.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[subsidy:fact-check] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
