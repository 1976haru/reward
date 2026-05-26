import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CITATION_VALIDATION_NOTICE,
  extractClaimsFromReportJson,
  validateReportCitations,
  writeCitationValidationReport
} from "../src/analysis/citationValidator.js";
import { createCitationValidationFixtures } from "../tests/fixtures/createCitationValidationFixtures.js";
import { CitationValidationMode } from "../src/types/citationValidation.js";

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

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main(): Promise<void> {
  console.log("[validate:citations] AI 리포트 근거 검증 (deterministic)");
  console.log(CITATION_VALIDATION_NOTICE);
  console.log("");

  const fixtureFlag = hasFlag("fixture");
  const inputArgs = getArgs("input");
  const strict = hasFlag("strict") || getArg("mode") === "strict";
  const mode: CitationValidationMode = strict ? "strict" : "warning";
  const outputDir = process.env.CITATION_OUTPUT_DIR ?? "data/analysis/citation-validation";

  let claims = [] as ReturnType<typeof extractClaimsFromReportJson>["claims"];
  let isFixtureBased = false;
  const detectedKinds: string[] = [];

  if (fixtureFlag) {
    claims = createCitationValidationFixtures().claims;
    isFixtureBased = true;
    detectedKinds.push("fixture-claims");
    console.log(`fixture ${claims.length} claims generated. This is fixture-based verification.`);
  } else if (inputArgs.length > 0) {
    for (const input of inputArgs) {
      const raw = await readFile(path.resolve(input), "utf8");
      const { claims: extracted, kind } = extractClaimsFromReportJson(JSON.parse(raw));
      claims.push(...extracted);
      detectedKinds.push(kind);
    }
    console.log(`loaded ${claims.length} claims from ${inputArgs.length} report file(s) [${detectedKinds.join(", ")}].`);
  } else {
    console.error("Usage: --input <report.json> [--input <report2.json>] [--strict] or --fixture [--strict]");
    process.exit(2);
    return;
  }

  const report = validateReportCitations(claims, { mode, isFixtureBased });
  const { reportJsonFile, reportMdFile } = await writeCitationValidationReport(outputDir, report);

  console.log("");
  console.log("CITATION_VALIDATION_RUN_OK");
  console.log(`mode: ${report.mode}`);
  console.log(`status: ${report.status}`);
  console.log(`totalClaims: ${report.totalClaims}`);
  console.log(`coreClaims: ${report.coreClaims}`);
  console.log(`supportedClaims: ${report.supportedClaims}`);
  console.log(`unsupportedClaims: ${report.unsupportedClaims}`);
  console.log(`warningClaims: ${report.warningClaims}`);
  console.log(`failedClaims: ${report.failedClaims}`);
  console.log(`strictPassed: ${report.strictPassed}`);
  console.log(`privacyBlockedCitations: ${report.privacyBlockedCitations}`);
  console.log(`blockedPersonalInfoCount: ${report.blockedPersonalInfoCount}`);
  console.log(`blockedPrivateUrlCount: ${report.blockedPrivateUrlCount}`);
  console.log(`suggestedFixes: ${report.suggestedFixes.length}`);
  console.log(`report.json: ${reportJsonFile}`);
  console.log(`report.md: ${reportMdFile}`);
  console.log("근거 검증은 법 위반 확정이 아니라 환각·오류 방지 장치입니다. 근거 없는 주장은 근거 보강 필요로 표시됩니다.");
  if (report.isFixtureBased) console.log("fixture 기반 검증입니다. 실데이터 근거처럼 표현하지 않습니다.");

  // strict 모드에서 근거 없는 핵심 주장이 있으면 실패 종료한다.
  if (mode === "strict" && report.status === "fail") {
    console.error("CITATION_VALIDATION_STRICT_FAIL: 근거 없는 핵심 주장이 있습니다 (근거 보강 필요).");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[validate:citations] unexpected error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
