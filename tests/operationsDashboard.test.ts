// 운영 대시보드 + 일일 운영 루틴 테스트 (체크리스트 69~70).
//
// 실행: `npm run test:operations` (tsx). node:assert/strict 만 사용.

import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildOperationsSummary } from "../src/services/operationsSummary.js";
import {
  getDailyRoutineDefinition,
  getDailyRoutineState,
  setDailyRoutineStep,
  DAILY_ROUTINE_STEPS
} from "../src/services/dailyOperationsRoutine.js";

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}
const cleanupDirs: string[] = [];

// ---------- 69. 운영 대시보드 ----------

test("[CL69] operations summary 가 필수 필드를 갖고 안전하게 동작한다", async () => {
  const s = await buildOperationsSummary();
  for (const k of ["collected", "analyzed", "reviewed", "reportDrafts", "manualSubmissions", "outcomes"]) {
    assert.equal(typeof (s.todayCounts as Record<string, number>)[k], "number", `todayCounts.${k}`);
  }
  assert.ok(Array.isArray(s.modules) && s.modules.length >= 1);
  assert.ok(Array.isArray(s.lockedModules));
  assert.ok("privacyScanWarnings" in s.warnings && "citationFailures" in s.warnings && "humanReviewPending" in s.warnings);
  assert.ok(Array.isArray(s.recentActivity));
  assert.equal(s.autoReport, false);
  assert.equal(s.rewardGuaranteed, false);
});

test("[CL69] 빈 상태에서도 안내 문구가 있다", async () => {
  const s = await buildOperationsSummary({ outcomesDir: path.join(os.tmpdir(), `empty-${Date.now()}`) });
  assert.ok(s.notices.join(" ").includes("운영 현황판은 진행상황 확인용입니다"));
  assert.ok(s.notices.join(" ").includes("법 위반 확정이 아닙니다"));
});

test("[CL69] 모듈별 현황에 active/ready 가 아닌 모듈은 locked 로 표시", async () => {
  const s = await buildOperationsSummary();
  const subsidy = s.modules.find((m) => m.id === "subsidy_fraud");
  if (subsidy) assert.equal(subsidy.locked, true, "보조금 모듈은 prototype → locked");
});

// ---------- 70. 일일 운영 루틴 ----------

test("[CL70] 일일 루틴 정의는 10단계 + 안내 문구를 갖는다", () => {
  const def = getDailyRoutineDefinition();
  assert.equal(def.steps.length, 10);
  assert.ok(def.notes.join(" ").includes("하루 1건만 완주"));
  assert.ok(def.notes.join(" ").includes("자동신고는 하지 않습니다"));
});

test("[CL70] 기본 상태는 모든 단계 미완료", async () => {
  const dir = path.join(os.tmpdir(), `ops-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  cleanupDirs.push(dir);
  const state = await getDailyRoutineState("2026-05-27", dir);
  assert.equal(state.steps.length, 10);
  assert.ok(state.steps.every((s) => s.done === false));
});

test("[CL70] 단계 체크가 저장되고 다시 읽힌다", async () => {
  const dir = path.join(os.tmpdir(), `ops-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  cleanupDirs.push(dir);
  await setDailyRoutineStep(1, true, { date: "2026-05-27", baseDir: dir, note: "수집 완료" });
  const state = await getDailyRoutineState("2026-05-27", dir);
  const step1 = state.steps.find((s) => s.stepId === 1)!;
  assert.equal(step1.done, true);
  assert.equal(step1.note, "수집 완료");
});

test("[CL70] 유효하지 않은 stepId 는 거부된다", async () => {
  const dir = path.join(os.tmpdir(), `ops-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  cleanupDirs.push(dir);
  await assert.rejects(() => setDailyRoutineStep(99, true, { baseDir: dir }));
});

test("[CL70] 10단계 stepId가 1..10 연속이다", () => {
  assert.deepEqual(
    DAILY_ROUTINE_STEPS.map((s) => s.stepId),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
});

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  OK   ${t.name}`);
    } catch (error) {
      failed++;
      failures.push({ name: t.name, error });
      console.error(`  FAIL ${t.name}`);
      console.error(error);
    }
  }
  for (const d of cleanupDirs) await rm(d, { recursive: true, force: true }).catch(() => {});
  console.log(`\nOperationsDashboard tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
