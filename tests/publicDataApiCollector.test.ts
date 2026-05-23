// 공공데이터 API 수집기 스모크 테스트 (체크리스트 11 — 필수 작업 5).
//
// 실행: `npm run test:collector` (tsx). node:assert/strict 만 사용.
// 실제 API 키 없이도 mock fetch 로 수집기 핵심 기능을 결정적으로 검증한다.
//
// 검증:
//   1. serviceKey 마스킹
//   2. buildPublicDataUrl 이 serviceKey 포함 + 로그용 URL 마스킹
//   3. extractRecordsFromPublicDataResponse 가 JSON items.item 배열 추출
//   4. item 단일 객체도 배열로 변환
//   5. sanitizeRecordForStorage 가 개인정보 패턴 마스킹
//   6. fetchWithRetry 가 500 응답 후 재시도하여 성공
//   7. collectPublicDataApi 가 mock endpoint 에서 1,000건 수집 + records.jsonl 생성
//   8. collection-log.json 에 totalRecords/requestCount/startedAt/finishedAt 기록
//   9. error-log.json 생성
//  10. API 키 원문이 로그/파일에 남지 않음
//  11. maxRecords 초과 수집하지 않음
//  12. rate limit 설정 수용 (테스트는 0ms)

import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  buildPublicDataUrl,
  collectPublicDataApi,
  createCollectorRunId,
  extractRecordsFromPublicDataResponse,
  fetchWithRetry,
  getPublicDataServiceKey,
  loadCollectorConfigFromEnv,
  maskServiceKey,
  maskUrlServiceKey,
  MissingServiceKeyError,
  normalizePublicDataResponse,
  sanitizeRecordForStorage,
  type FetchLike,
  type FetchLikeResponse
} from "../src/collectors/publicDataApiCollector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const SECRET_KEY = "ABCD1234SECRETKEYVALUE5678WXYZ";

function jsonResponse(body: unknown, status = 200): FetchLikeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  };
}

// ---------- 1. serviceKey 마스킹 ----------

test("maskServiceKey 는 앞 4 / 뒤 4 만 남기고 마스킹한다", () => {
  const masked = maskServiceKey(SECRET_KEY);
  assert.equal(masked, "ABCD...WXYZ");
  assert.ok(!masked.includes("SECRETKEYVALUE"), "원문 키 일부가 노출됨");
});

test("maskServiceKey 는 8자 이하 짧은 키를 전체 마스킹한다", () => {
  assert.equal(maskServiceKey("short"), "*****");
  assert.equal(maskServiceKey(""), "");
});

// ---------- 2. buildPublicDataUrl ----------

test("buildPublicDataUrl 은 호출 URL 에 serviceKey 원문을 포함한다", () => {
  const { url } = buildPublicDataUrl("https://api.example.test/svc", { pageNo: 1 }, SECRET_KEY);
  assert.ok(url.includes(SECRET_KEY), "호출 URL 에 serviceKey 가 없음");
  assert.ok(url.includes("pageNo=1"));
});

test("buildPublicDataUrl 의 로그용(maskedUrl)은 serviceKey 가 마스킹된다", () => {
  const { maskedUrl } = buildPublicDataUrl("https://api.example.test/svc", { pageNo: 1 }, SECRET_KEY);
  assert.ok(!maskedUrl.includes(SECRET_KEY), "로그용 URL 에 원문 키가 노출됨");
  assert.ok(maskedUrl.includes("ABCD...WXYZ"));
});

test("maskUrlServiceKey 는 임의 URL 의 serviceKey 값을 마스킹한다", () => {
  const masked = maskUrlServiceKey(`https://api.example.test/svc?serviceKey=${SECRET_KEY}&pageNo=2`);
  assert.ok(!masked.includes(SECRET_KEY));
  assert.ok(masked.includes("pageNo=2"));
});

// ---------- 3 & 4. extract / normalize ----------

test("extractRecordsFromPublicDataResponse 가 response.body.items.item 배열을 추출한다", () => {
  const payload = {
    response: { body: { items: { item: [{ a: 1 }, { a: 2 }, { a: 3 }] }, totalCount: 3 } }
  };
  const records = extractRecordsFromPublicDataResponse(payload);
  assert.equal(records.length, 3);
  assert.deepEqual(records[0], { a: 1 });
});

test("extractRecordsFromPublicDataResponse 가 단일 item 객체를 배열로 변환한다", () => {
  const payload = { response: { body: { items: { item: { a: 99 } } } } };
  const records = extractRecordsFromPublicDataResponse(payload);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { a: 99 });
});

test("extractRecordsFromPublicDataResponse 가 최상위 배열도 처리한다", () => {
  assert.equal(extractRecordsFromPublicDataResponse([{ x: 1 }, { x: 2 }]).length, 2);
  assert.equal(extractRecordsFromPublicDataResponse(null).length, 0);
});

test("normalizePublicDataResponse 가 XML <item> 블록을 방어적으로 파싱한다", () => {
  const xml =
    "<response><body><items><item><name>가</name><amount>100</amount></item>" +
    "<item><name>나</name><amount>200</amount></item></items></body></response>";
  const normalized = normalizePublicDataResponse(xml);
  assert.equal(normalized.format, "xml");
  const records = extractRecordsFromPublicDataResponse(normalized.payload);
  assert.equal(records.length, 2);
  assert.deepEqual(records[0], { name: "가", amount: "100" });
});

// ---------- 5. sanitizeRecordForStorage ----------

test("sanitizeRecordForStorage 가 개인정보 패턴을 마스킹한다", () => {
  const record = {
    projectName: "샘플 보조사업",
    contact: "문의: 010-1234-5678 / user@private-domain.kr",
    nested: { memo: "주민번호 900101-1234567 포함" }
  };
  const { record: out, changed, detectedTypes } = sanitizeRecordForStorage(record);
  const serialized = JSON.stringify(out);
  assert.ok(changed, "변경 플래그가 false");
  assert.ok(!serialized.includes("900101-1234567"), "주민번호 원문이 남음");
  assert.ok(!serialized.includes("010-1234-5678"), "휴대폰 원문이 남음");
  assert.ok(detectedTypes.length > 0, "탐지 타입이 비어있음");
});

// ---------- 6. fetchWithRetry ----------

test("fetchWithRetry 가 500 응답 후 재시도하여 성공한다", async () => {
  let calls = 0;
  const errors: unknown[] = [];
  const mockFetch: FetchLike = async () => {
    calls++;
    if (calls < 2) return jsonResponse({}, 500);
    return jsonResponse({ ok: true }, 200);
  };
  const res = await fetchWithRetry("https://api.example.test/svc?serviceKey=" + SECRET_KEY, {
    maxRetries: 3,
    timeoutMs: 1000,
    retryDelayMs: 0,
    fetchImpl: mockFetch,
    onError: (e) => errors.push(e)
  });
  assert.equal(res.status, 200);
  assert.equal(calls, 2, "재시도가 일어나지 않음");
  assert.ok(errors.length >= 1, "재시도 에러가 기록되지 않음");
});

test("fetchWithRetry 는 최대 재시도 초과 시 에러를 던지고 메시지에 키를 노출하지 않는다", async () => {
  const mockFetch: FetchLike = async () => jsonResponse({}, 503);
  await assert.rejects(
    () =>
      fetchWithRetry("https://api.example.test/svc?serviceKey=" + SECRET_KEY, {
        maxRetries: 2,
        timeoutMs: 1000,
        retryDelayMs: 0,
        fetchImpl: mockFetch
      }),
    (err: Error) => {
      assert.ok(!err.message.includes(SECRET_KEY), "에러 메시지에 키 노출");
      return true;
    }
  );
});

// ---------- 7~12. collectPublicDataApi (mock 1,000건) ----------

const TARGET = 1000;
const PAGE_SIZE = 100;

function makeMockApi(): { fetchImpl: FetchLike; getCalls: () => number } {
  let calls = 0;
  const fetchImpl: FetchLike = async (input) => {
    calls++;
    // pageNo / numOfRows 파싱
    const u = new URL(input);
    const pageNo = Number(u.searchParams.get("pageNo") ?? "1");
    const rows = Number(u.searchParams.get("numOfRows") ?? String(PAGE_SIZE));
    const item = Array.from({ length: rows }, (_v, i) => ({
      id: (pageNo - 1) * rows + i + 1,
      projectName: `샘플 보조사업 ${pageNo}-${i}`,
      amount: 1000 + i,
      note: "공개자료 합성 레코드"
    }));
    return jsonResponse({ response: { body: { items: { item }, totalCount: 100000 } } });
  };
  return { fetchImpl, getCalls: () => calls };
}

let runResultRecordsFile = "";
let runOutputDir = "";

test("collectPublicDataApi 가 mock endpoint 에서 1,000건을 수집하고 records.jsonl 을 만든다", async () => {
  runOutputDir = path.join(os.tmpdir(), `collector-test-${Date.now()}`);
  const { fetchImpl } = makeMockApi();
  const result = await collectPublicDataApi(
    {
      baseUrl: "https://api.example.test/svc",
      apiName: "테스트_보조금_API",
      serviceKey: SECRET_KEY,
      fetchImpl,
      outputDir: runOutputDir,
      pageSize: PAGE_SIZE,
      maxRecords: TARGET,
      rateLimitMs: 0,
      timeoutMs: 1000,
      maxRetries: 2
    },
    {} // env 비움 — serviceKey 는 옵션으로 주입
  );
  runResultRecordsFile = result.recordsFile;
  assert.equal(result.totalRecords, TARGET, `수집 건수 불일치: ${result.totalRecords}`);
  assert.ok(result.reachedTarget, "목표 미달");

  const jsonl = await readFile(result.recordsFile, "utf8");
  const lines = jsonl.trim().split("\n");
  assert.equal(lines.length, TARGET, `JSONL 줄 수 불일치: ${lines.length}`);
  const first = JSON.parse(lines[0]);
  assert.ok(first.id === 1, "첫 레코드 id 불일치");
});

test("collection-log.json 에 totalRecords/requestCount/startedAt/finishedAt 이 기록된다", async () => {
  const logPath = path.join(path.dirname(runResultRecordsFile), "collection-log.json");
  const log = JSON.parse(await readFile(logPath, "utf8"));
  assert.equal(log.totalRecords, TARGET);
  assert.ok(log.requestCount >= TARGET / PAGE_SIZE, "requestCount 가 너무 적음");
  assert.ok(typeof log.startedAt === "string" && log.startedAt.length > 0);
  assert.ok(typeof log.finishedAt === "string" && log.finishedAt.length > 0);
  assert.equal(log.status, "ok");
});

test("error-log.json 이 생성된다", async () => {
  const errPath = path.join(path.dirname(runResultRecordsFile), "error-log.json");
  const errLog = JSON.parse(await readFile(errPath, "utf8"));
  assert.ok(typeof errLog.errorsCount === "number");
  assert.ok(Array.isArray(errLog.errors));
});

test("API 키 원문이 로그/결과 파일 어디에도 남지 않는다", async () => {
  const dir = path.dirname(runResultRecordsFile);
  for (const f of ["records.jsonl", "collection-log.json", "error-log.json"]) {
    const content = await readFile(path.join(dir, f), "utf8");
    assert.ok(!content.includes(SECRET_KEY), `${f} 에 serviceKey 원문이 노출됨`);
  }
});

test("collectPublicDataApi 는 maxRecords 를 초과하지 않는다 (250 목표)", async () => {
  const outDir = path.join(os.tmpdir(), `collector-test-cap-${Date.now()}`);
  const { fetchImpl } = makeMockApi();
  const result = await collectPublicDataApi(
    {
      baseUrl: "https://api.example.test/svc",
      apiName: "cap_test",
      serviceKey: SECRET_KEY,
      fetchImpl,
      outputDir: outDir,
      pageSize: PAGE_SIZE,
      maxRecords: 250,
      rateLimitMs: 0
    },
    {}
  );
  assert.equal(result.totalRecords, 250, "maxRecords 를 초과/미달 수집");
  const jsonl = await readFile(result.recordsFile, "utf8");
  assert.equal(jsonl.trim().split("\n").length, 250);
  await rm(outDir, { recursive: true, force: true });
});

test("rate limit 설정(rateLimitMs)을 옵션으로 받을 수 있다", async () => {
  const cfg = loadCollectorConfigFromEnv({ COLLECTOR_RATE_LIMIT_MS: "1500" } as NodeJS.ProcessEnv);
  assert.equal(cfg.rateLimitMs, 1500);
  const cfgDefault = loadCollectorConfigFromEnv({} as NodeJS.ProcessEnv);
  assert.equal(cfgDefault.rateLimitMs, 1000);
  assert.equal(cfgDefault.maxRecords, 1000);
  assert.equal(cfgDefault.pageSize, 100);
});

test("getPublicDataServiceKey 는 키가 없으면 MissingServiceKeyError 를 던진다", () => {
  assert.throws(
    () => getPublicDataServiceKey({} as NodeJS.ProcessEnv),
    (err: Error) => {
      assert.ok(err instanceof MissingServiceKeyError);
      return true;
    }
  );
});

test("getPublicDataServiceKey 는 PUBLIC_DATA_SERVICE_KEY 대체 키도 읽는다", () => {
  const k = getPublicDataServiceKey({ PUBLIC_DATA_SERVICE_KEY: "altkey123456" } as NodeJS.ProcessEnv);
  assert.equal(k, "altkey123456");
});

test("createCollectorRunId 는 prefix 와 안전한 문자만 포함한다", () => {
  const id = createCollectorRunId("테스트 API/이름");
  assert.ok(!id.includes("/"), "경로 구분자 포함");
  assert.ok(!id.includes(" "), "공백 포함");
  assert.ok(id.length > 5);
});

// ---------- 러너 ----------

async function main() {
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  OK   ${t.name}`);
    } catch (err) {
      failed++;
      failures.push({ name: t.name, error: err });
      console.error(`  FAIL ${t.name}`);
      console.error(err);
    }
  }

  // 정리 — 1000건 수집 테스트 산출물 삭제
  if (runOutputDir) {
    await rm(runOutputDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\nPublicDataApiCollector tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) {
      console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    }
    process.exit(1);
  }
}

await main();
