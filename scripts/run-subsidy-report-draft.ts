// 보조금 신고서 초안 생성 CLI (체크리스트 66).
//
// 실행:
//   npm run subsidy:report-draft -- --fixture
//   npm run subsidy:report-draft -- --input data/cases/xxx/draft-input.json
//
// - 사실점검 11항목을 통과(canGenerateReportDraft=true)한 후보만 초안 생성.
// - 차단 후보는 서버/프로세스를 죽이지 않고 draftCreated=false + 한국어 사유로 안내.
// - 출력 폴더: REPORTS_OUTPUT_DIR 또는 data/reports (subsidy/{candidateId} 하위).
//
// 본 초안은 실제 신고 제출이 아니며 사람 검토·수정용이다.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  generateSubsidyReportDraft,
  writeSubsidyReportDraft,
  SUBSIDY_REPORT_DRAFT_NOTICE
} from "../src/reports/subsidyReportDraft.js";
import type { SubsidyReportDraftInput } from "../src/types/subsidyReportDraft.js";
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

function casesFromJson(value: unknown): SubsidyReportDraftInput[] {
  if (Array.isArray(value)) return value as SubsidyReportDraftInput[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.cases)) return obj.cases as SubsidyReportDraftInput[];
    return [value as SubsidyReportDraftInput];
  }
  return [];
}

async function main(): Promise<void> {
  console.log("[subsidy:report-draft] 보조금 신고서 초안 생성 (사실점검 게이트)");
  console.log(SUBSIDY_REPORT_DRAFT_NOTICE);
  console.log("");

  const fixture = hasFlag("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.REPORTS_OUTPUT_DIR ?? "data/reports";

  let cases: SubsidyReportDraftInput[] = [];
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
  } else if (fixture) {
    cases = createSubsidyFactCheckFixtures().cases as SubsidyReportDraftInput[];
  } else {
    console.error("사용법: --fixture  또는  --input <draft-input.json>");
    process.exit(2);
    return;
  }

  let created = 0;
  let blocked = 0;
  for (const input of cases) {
    const result = generateSubsidyReportDraft(input);
    if (result.draftCreated) {
      const { outDir, written } = await writeSubsidyReportDraft(outputDir, result);
      created++;
      console.log(`  [생성] ${result.candidateId} → ${outDir} (${written.length} files)`);
    } else {
      blocked++;
      console.log(`  [차단] ${result.candidateId} (${result.factCheckOverallStatus}) — ${result.blockedReason}`);
    }
  }

  console.log("");
  console.log("SUBSIDY_REPORT_DRAFT_RUN_OK");
  console.log(`totalCases: ${cases.length}`);
  console.log(`draftCreated(true): ${created}`);
  console.log(`blocked: ${blocked}`);
  console.log("autoSubmitted: false / rewardGuaranteed: false / notLegalConclusion: true / humanReviewRequired: true");
  if (fixture) console.log("fixture 기반 검증입니다. 실제 신고 제출이 아닙니다. 사람 검토 필요.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[subsidy:report-draft] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
