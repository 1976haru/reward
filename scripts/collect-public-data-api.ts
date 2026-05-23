// 실제 공공데이터 API 수집 실행 스크립트 (체크리스트 11 — 필수 작업 4 / 9).
//
// 실행: `npm run collect:public-api`
//
// 동작:
//   - 환경변수에서 API 키(DATA_GO_KR_SERVICE_KEY | PUBLIC_DATA_SERVICE_KEY)와 collector 설정을 읽는다.
//   - COLLECTOR_API_BASE_URL 에 실제 호출 가능한 endpoint 가 있어야 한다 (data.go.kr 상세 페이지 URL 이 아님).
//   - 기본 API 후보는 src/types/publicApiCandidate.ts 의 P0 후보를 표시명으로 사용한다.
//   - COLLECTOR_MAX_RECORDS(기본 1000) 만큼 수집한다.
//   - 성공 시 data/collector/runs/{runId}/ 에 records.jsonl, collection-log.json, error-log.json 생성.
//
// 종료 메시지:
//   - COLLECTOR_API_KEY_REQUIRED  : 인증키 없음 (exit 2)
//   - COLLECTOR_ENDPOINT_REQUIRED : 호출 가능한 endpoint 없음 (exit 2)
//   - COLLECTOR_REAL_RUN_OK       : 1000건 이상 수집 성공 (exit 0)
//   - COLLECTOR_REAL_RUN_INCOMPLETE : 1000건 미만 (exit 1, 이유 출력)
//
// 본 스크립트는 자동 신고/로그인 우회/무제한 호출을 수행하지 않는다.

import "dotenv/config";
import {
  collectPublicDataApi,
  getPublicDataServiceKey,
  loadCollectorConfigFromEnv,
  maskServiceKey,
  MissingServiceKeyError,
  PUBLIC_DATA_COLLECTOR_NOTICE
} from "../src/collectors/publicDataApiCollector.js";
import { listCandidatesByPriority } from "../src/types/publicApiCandidate.js";

function parseExtraParams(raw: string | undefined): Record<string, string> {
  // COLLECTOR_API_PARAMS="type=json&someKey=val" 형태를 파싱
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split("&")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    out[decodeURIComponent(pair.slice(0, idx).trim())] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

async function main(): Promise<void> {
  console.log("[collect:public-api] 공공데이터 API 수집 실행");
  console.log(PUBLIC_DATA_COLLECTOR_NOTICE);
  console.log("");

  const cfg = loadCollectorConfigFromEnv();

  // 1) 인증키 확인
  let serviceKey: string;
  try {
    serviceKey = getPublicDataServiceKey();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) {
      console.error("COLLECTOR_API_KEY_REQUIRED");
      console.error(
        "  → 환경변수 DATA_GO_KR_SERVICE_KEY 또는 PUBLIC_DATA_SERVICE_KEY 를 설정하세요."
      );
      console.error("  → 11번 실제 수집 성공 조건은 미완료입니다 (API 키 필요).");
      process.exit(2);
      return;
    }
    throw e;
  }
  console.log(`  인증키 감지됨 (마스킹): ${maskServiceKey(serviceKey)}`);

  // 2) endpoint 확인
  const baseUrl = (process.env.COLLECTOR_API_BASE_URL ?? "").trim();
  if (!baseUrl) {
    console.error("COLLECTOR_ENDPOINT_REQUIRED");
    console.error(
      "  → COLLECTOR_API_BASE_URL 에 실제 호출 가능한 공공데이터 API endpoint 가 필요합니다."
    );
    console.error("  → data.go.kr 데이터셋 상세 페이지 URL 이 아니라, 활용신청 후 발급된 호출용 endpoint 여야 합니다.");
    console.error("  → 11번 실제 수집 성공 조건은 미완료입니다 (endpoint 필요).");
    process.exit(2);
    return;
  }
  if (baseUrl.includes("/openapi.do") || baseUrl.includes("selectDataSetList.do")) {
    console.warn(
      "  주의: COLLECTOR_API_BASE_URL 이 data.go.kr 상세/검색 페이지 URL 처럼 보입니다. " +
        "실제 호출용 endpoint 인지 확인하세요."
    );
  }

  // 3) 기본 API 표시명 (P0 후보 우선)
  const p0 = listCandidatesByPriority("P0");
  const apiName =
    (process.env.COLLECTOR_API_NAME ?? "").trim() ||
    (p0.length > 0 ? p0[0].apiName : "public-data-api");

  const pageParam = (process.env.COLLECTOR_PAGE_PARAM ?? "pageNo").trim();
  const sizeParam = (process.env.COLLECTOR_SIZE_PARAM ?? "numOfRows").trim();
  const extraParams = parseExtraParams(process.env.COLLECTOR_API_PARAMS);

  console.log(`  대상 API: ${apiName}`);
  console.log(`  endpoint(마스킹): ${baseUrl}`);
  console.log(
    `  설정: maxRecords=${cfg.maxRecords}, pageSize=${cfg.pageSize}, rateLimitMs=${cfg.rateLimitMs}, ` +
      `timeoutMs=${cfg.timeoutMs}, maxRetries=${cfg.maxRetries}`
  );
  if (cfg.rateLimitMs < 500) {
    console.warn("  주의: 실제 수집에서는 COLLECTOR_RATE_LIMIT_MS 를 500 이상(권장 1000)으로 두세요.");
  }
  console.log("");

  // 4) 수집 실행
  const result = await collectPublicDataApi({
    baseUrl,
    params: extraParams,
    pageParam,
    sizeParam,
    serviceKey,
    apiName
  });

  console.log("");
  console.log("[collect:public-api] 수집 완료");
  console.log(`  runId: ${result.runId}`);
  console.log(`  totalRecords: ${result.totalRecords}`);
  console.log(`  requestCount: ${result.requestCount} (success=${result.successCount}, fail=${result.failureCount})`);
  console.log(`  records: ${result.recordsFile}`);
  console.log(`  collection-log: ${result.collectionLogFile}`);
  console.log(`  error-log: ${result.errorLogFile} (errors=${result.errorLog.errorsCount})`);

  if (result.reachedTarget && result.totalRecords >= 1000) {
    console.log("");
    console.log("COLLECTOR_REAL_RUN_OK");
    console.log(`  → ${result.totalRecords}건 수집 성공 (목표 ${cfg.maxRecords}건).`);
    process.exit(0);
    return;
  }

  console.log("");
  console.log("COLLECTOR_REAL_RUN_INCOMPLETE");
  console.log(`  → ${result.totalRecords}건만 수집됨 (목표 1000건 미달).`);
  if (result.errorLog.errorsCount > 0) {
    console.log(`  → 오류 ${result.errorLog.errorsCount}건 발생 — error-log.json 확인.`);
  }
  console.log("  → 응답 구조/파라미터(pageParam, sizeParam, COLLECTOR_API_PARAMS) 또는 데이터 총량을 확인하세요.");
  process.exit(1);
}

main().catch((e) => {
  console.error("[collect:public-api] 예기치 못한 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
