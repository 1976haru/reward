// POST /api/pipeline/run 엔드포인트 테스트 — 단계 범위(stopAfter) · clamp · 모듈 화이트리스트 · 400.
//
// 실행: `npm run test:pipeline-route` (tsx).
// MOCK 모드(외부 LLM/네트워크 미호출). 실제 data/ 오염 방지를 위해 DATA_DIR 을 임시 디렉터리로 격리한 뒤
// 모듈을 동적 import 한다 (config 는 import 시점에 env 를 읽는다).

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

// ---- 1) import 전에 격리 + mock 강제 ----
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "pipe-route-"));
process.env.MOCK_AI = "true";
process.env.MOCK_SCOUT = "true";
// 데모 임계값과 무관 — 본 테스트는 라우트 검증이 목적이라 적재 여부는 단언하지 않는다.

const express = (await import("express")).default;
const { pipelineRouter } = await import("../src/routes/pipeline.js");
const { config } = await import("../src/utils/config.js");

const app = express();
app.use(express.json());
app.use("/api/pipeline", pipelineRouter);

const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

async function run(body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}/api/pipeline/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, json: await res.json() };
}

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];
function test(name: string, fn: () => Promise<void>): void { tests.push({ name, fn }); }

const LIMIT_MAX = config.discovery.maxCandidates;
const ANALYSES_MAX = config.pipeline.maxAnalyses;

test("미등록 moduleId → 400 INVALID_MODULE", async () => {
  const { status, json } = await run({ stopAfter: "collect", moduleId: "__does_not_exist__" });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error, "INVALID_MODULE");
  assert.ok(Array.isArray(json.allowedModuleIds) && json.allowedModuleIds.includes("false_ad"));
});

test("음수 limit → 400 VALIDATION_ERROR", async () => {
  const { status, json } = await run({ stopAfter: "collect", limit: -1 });
  assert.equal(status, 400);
  assert.equal(json.error, "VALIDATION_ERROR");
});

test("문자열 limit → 400 VALIDATION_ERROR", async () => {
  const { status, json } = await run({ stopAfter: "collect", limit: "abc" });
  assert.equal(status, 400);
  assert.equal(json.error, "VALIDATION_ERROR");
});

test("음수 maxAnalyses → 400 VALIDATION_ERROR", async () => {
  const { status, json } = await run({ stopAfter: "analyze", maxAnalyses: -5 });
  assert.equal(status, 400);
  assert.equal(json.error, "VALIDATION_ERROR");
});

test("알 수 없는 stopAfter(submit) → 400 (제출 옵션 자체가 없음)", async () => {
  const { status, json } = await run({ stopAfter: "submit" });
  assert.equal(status, 400);
  assert.equal(json.error, "VALIDATION_ERROR");
});

test("과대 limit → 상한으로 clamp (200, limitClamped=true)", async () => {
  const { status, json } = await run({ stopAfter: "collect", moduleId: "false_ad", limit: 99999 });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.applied.limit, LIMIT_MAX, "limit 이 서버 상한으로 clamp");
  assert.equal(json.applied.limitClamped, true);
});

test("과대 maxAnalyses → 상한으로 clamp (200, maxAnalysesClamped=true)", async () => {
  const { status, json } = await run({ stopAfter: "analyze", moduleId: "false_ad", limit: 3, maxAnalyses: 99999 });
  assert.equal(status, 200);
  assert.equal(json.applied.maxAnalyses, ANALYSES_MAX, "maxAnalyses 가 서버 상한으로 clamp");
  assert.equal(json.applied.maxAnalysesClamped, true);
});

test("stopAfter=collect → 정상 실행 · 큐 적재 0 · 자동 제출 없음", async () => {
  const { status, json } = await run({ stopAfter: "collect", moduleId: "false_ad", sources: ["mock"], limit: 3 });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.stopAfter, "collect");
  assert.ok(json.execSummary, "execSummary 동봉");
  assert.equal(json.execSummary.queued, 0, "collect 는 큐 적재 0");
  assert.equal(json.execSummary.analyzed, 0, "collect 는 LLM 분석 0");
  assert.equal(json.autoReport, false);
  assert.equal(json.humanReviewRequired, true);
  assert.equal(json.autoSubmitted, false);
});

test("기본값: stopAfter 미지정 → queue 로 동작", async () => {
  const { status, json } = await run({ moduleId: "false_ad", sources: ["mock"], limit: 2 });
  assert.equal(status, 200);
  assert.equal(json.stopAfter, "queue");
  assert.equal(json.autoSubmitted, false);
});

(async () => {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      console.log(`  ok  ${t.name}`);
    } catch (e) {
      fail++;
      console.error(`  FAIL  ${t.name}`);
      console.error(`        ${(e as Error).message}`);
    }
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log(`\nPipeline route tests: PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
  else console.log("PIPELINE_ROUTE_TESTS_OK");
})();
