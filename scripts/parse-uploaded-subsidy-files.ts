// CSV/PDF/엑셀 업로드 파일 변환 CLI (체크리스트 12 — 필수 작업 4).
//
// 실행: `npm run parse:uploads -- <파일 또는 폴더 경로> [추가 경로...]`
//
// - 폴더면 .csv/.xlsx/.pdf 파일만 처리한다.
// - 출력 폴더는 UPLOAD_PARSER_OUTPUT_DIR 또는 data/upload-parser 기본값.
// - 오류가 있어도 가능한 파일은 계속 처리한다.
// - 개인정보 원문은 콘솔에 출력하지 않는다 (요약 카운트만 출력).
//
// 본 모듈은 웹 크롤러가 아니라 수동 업로드 파일 변환기다.

import "dotenv/config";
import path from "node:path";
import {
  collectUploadFilePaths,
  parseUploadedSubsidyFiles
} from "../src/parsers/uploadSubsidyParser.js";
import { UPLOAD_PARSER_NOTICE } from "../src/types/uploadParser.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  console.log("[parse:uploads] 업로드 파일 변환기");
  console.log(UPLOAD_PARSER_NOTICE);
  console.log("");

  if (args.length === 0) {
    console.error("사용법: npm run parse:uploads -- <파일 또는 폴더 경로> [추가 경로...]");
    console.error("  지원 확장자: .csv / .xlsx / .pdf");
    process.exit(2);
    return;
  }

  // 입력 경로들에서 처리 대상 파일 수집
  const filePaths: string[] = [];
  for (const input of args) {
    try {
      const collected = await collectUploadFilePaths(path.resolve(input));
      if (collected.length === 0) {
        console.warn(`  경고: 처리 대상 파일이 없습니다 (지원 확장자 아님?): ${input}`);
      }
      filePaths.push(...collected);
    } catch (e) {
      console.error(`  경고: 경로를 읽을 수 없습니다: ${input} (${e instanceof Error ? e.message : e})`);
    }
  }

  if (filePaths.length === 0) {
    console.error("처리할 파일이 없습니다.");
    process.exit(2);
    return;
  }

  const outputDir = process.env.UPLOAD_PARSER_OUTPUT_DIR ?? "data/upload-parser";
  const result = await parseUploadedSubsidyFiles(filePaths, { outputDir });
  const log = result.runLog;

  console.log("UPLOAD_PARSER_RUN_OK");
  console.log(`  runId: ${log.runId}`);
  console.log(`  totalFiles: ${log.totalFiles}`);
  console.log(`  totalRecords: ${log.totalRecords}`);
  console.log(`  parsedCount: ${log.parsedCount}`);
  console.log(`  partialCount: ${log.partialCount}`);
  console.log(`  failedCount: ${log.failedCount}`);
  console.log(`  errorsCount: ${result.errorLog.errorsCount}`);
  console.log(`  outputDir: ${path.join(outputDir, "runs", log.runId)}`);
  console.log(`  records: ${result.recordsFile}`);
  console.log(`  parse-log: ${result.parseLogFile}`);
  console.log(`  error-log: ${result.errorLogFile}`);

  if (result.errorLog.errorsCount > 0) {
    console.log("");
    console.log(`  ⚠ ${result.errorLog.errorsCount}건의 변환 오류가 error-log.json 에 기록되었습니다.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[parse:uploads] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
