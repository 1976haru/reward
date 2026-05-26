// 보조금 룰 5종 통합 실행 CLI (체크리스트 60).
//
// 실행:
//   npm run risk:rules -- --fixture 12
//   npm run risk:rules -- --input data/upload-parser/runs/xxx/records.jsonl
//   npm run risk:rules                      (인자 없으면 fixture 폴백)
//
// - 출력 폴더: RISK_RULES_OUTPUT_DIR 또는 data/risk (runs/{runId} 하위에 4개 파일).
// - 개인정보 원문은 콘솔/파일에 저장하지 않으며 정규화 키만 사용한다.
//
// 결과는 "검토 후보 TOP N"이며 부정수급/위법 확정이 아니다.
// 100점 위험점수/보상가능성 점수/LLM 설명형 분석/신고서 초안은 다음 단계에서 진행한다.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  runSubsidyRiskRules,
  writeSubsidyRiskRun,
  SUBSIDY_RISK_RULES_NOTICE
} from "../src/rules/subsidyRiskRules.js";
import type { SubsidyRiskInputRecord } from "../src/types/subsidyRisk.js";
import { createSubsidyRiskFixtures } from "../tests/fixtures/createSubsidyRiskFixtures.js";

function getArg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

/** 업로드 파서/수집기 산출물을 룰 입력 레코드로 안전 매핑(필요 필드만, 개인정보 제외). */
function toRiskInputRecord(raw: Record<string, unknown>, idx: number): SubsidyRiskInputRecord {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  return {
    recordId: str(raw.recordId) ?? str(raw.id) ?? `input-${String(idx + 1).padStart(4, "0")}`,
    fiscalYear: num(raw.fiscalYear),
    projectName: str(raw.projectName) ?? str(raw.projectTitle),
    projectNameCompactKey: str(raw.projectNameCompactKey),
    recipientName: str(raw.recipientName),
    normalizedRecipientName: str(raw.normalizedRecipientName),
    addressRegionKey: str(raw.addressRegionKey),
    normalizedAddressKey: str(raw.normalizedAddressKey),
    subsidyAmount: num(raw.subsidyAmount) ?? num(raw.grantAmount),
    executionAmount: num(raw.executionAmount),
    settlementAmount: num(raw.settlementAmount),
    hasResultReport:
      typeof raw.hasResultReport === "boolean"
        ? raw.hasResultReport
        : Array.isArray(raw.resultEvidenceUrls)
          ? raw.resultEvidenceUrls.length > 0
          : undefined,
    resultEvidenceUrl:
      str(raw.resultEvidenceUrl) ??
      (Array.isArray(raw.resultEvidenceUrls) ? str(raw.resultEvidenceUrls[0]) : undefined),
    publicListingUrl: str(raw.publicListingUrl),
    sourceFileName: str(raw.sourceFileName),
    localGovName: str(raw.localGovName) ?? str(raw.managingAgency)
  };
}

async function readJsonl(filePath: string): Promise<SubsidyRiskInputRecord[]> {
  const raw = await readFile(filePath, "utf8");
  const out: SubsidyRiskInputRecord[] = [];
  let idx = 0;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(toRiskInputRecord(JSON.parse(t) as Record<string, unknown>, idx++));
    } catch {
      // 손상된 라인 건너뜀
    }
  }
  return out;
}

async function main(): Promise<void> {
  console.log("[risk:rules] 보조금 룰 5종 통합 실행");
  console.log(SUBSIDY_RISK_RULES_NOTICE);
  console.log("");

  const fixtureArg = getArg("fixture");
  const inputArg = getArg("input");
  const outputDir = process.env.RISK_RULES_OUTPUT_DIR ?? "data/risk";

  let records: SubsidyRiskInputRecord[] = [];
  let inputMode = "fixture-synthetic";
  let isRealData = false;

  if (inputArg) {
    try {
      records = await readJsonl(path.resolve(inputArg));
    } catch (e) {
      console.error(
        `  입력 파일을 읽지 못했습니다: ${inputArg} (${e instanceof Error ? e.message : e})`
      );
      console.error("  사용법: --input <records.jsonl>  또는  --fixture <count>");
      process.exit(2);
      return;
    }
    if (records.length === 0) {
      console.error(`  입력 파일에 유효한 레코드가 없습니다: ${inputArg}`);
      process.exit(2);
      return;
    }
    inputMode = `input:${path.basename(inputArg)}`;
    isRealData = records.length >= 1000;
    console.log(`  입력 ${records.length}건 로드 (실데이터 추정: ${isRealData ? "예" : "아니오"}).`);
  } else {
    const n = Math.max(1, Number(fixtureArg) || 12);
    records = createSubsidyRiskFixtures(n).records;
    inputMode = "fixture-synthetic";
    isRealData = false;
    console.log(`  fixture ${records.length}건 생성 (합성 데이터 — 실제 탐지 완료 아님).`);
  }

  const result = runSubsidyRiskRules(records, { inputMode, isRealData });
  const written = await writeSubsidyRiskRun(outputDir, result);

  console.log("");
  console.log("SUBSIDY_RISK_RULES_RUN_OK");
  console.log(`  runId: ${result.runId}`);
  console.log(`  totalRecords: ${result.totalRecords}`);
  console.log(`  totalRuleResults: ${result.totalRuleResults}`);
  for (const c of result.ruleCounts) {
    console.log(`    - ${c.ruleId}: ${c.candidateCount} (high ${c.highSeverityCount})`);
  }
  console.log(`  topCandidates: ${result.topCandidates.length} (TOP ${result.topN})`);
  console.log(`  outputDir: ${written.runDir}`);
  console.log(`  rule-results.json: ${written.ruleResultsFile}`);
  console.log(`  top50-candidates.json: ${written.top50File}`);
  console.log(`  rule-summary.md: ${written.summaryMdFile}`);
  console.log(`  metadata.json: ${written.metadataFile}`);
  if (!isRealData) {
    console.log("");
    console.log("  ⚠ fixture/소규모 입력 기반입니다 — 실제 부정수급 탐지 완료가 아닙니다. 사람 검토 필요.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[risk:rules] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
