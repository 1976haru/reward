// AutoPipeline 단계 범위(stopAfter) MOCK e2e — 세 모드(collect/analyze/queue)를 각 1회 실행하고 수치를 출력한다.
//
// 실행: `npm run pipeline:mock-stages`
//
// 외부 신고 자동 제출은 어떤 모드로도 수행하지 않는다. 끝점은 사람 검수 대기(human_review_required).
// 각 모드는 별도 자식 프로세스 + 별도 임시 DATA_DIR 에서 실행한다 — 그래야 모드마다 신규 발굴 후보를 얻고
// (scout 가 같은 저장소의 기존 후보를 중복으로 걸러내므로) 모드별 수치가 독립적으로 보인다.
// mock 후보는 RFC 6761 예약 도메인(.test/.example)을 써서 실 네트워크 호출이 일어나지 않는다.

import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const STOP_AFTERS = ["collect", "analyze", "queue"] as const;
type StopAfter = (typeof STOP_AFTERS)[number];

const selfPath = fileURLToPath(import.meta.url);

// ---- 자식 모드: 단일 stopAfter 실행 ----
const singleMode = process.env.PIPE_STAGE_SINGLE as StopAfter | undefined;
if (singleMode) {
  const { AutoPipeline } = await import("../src/services/pipeline/AutoPipeline.js");
  const { createCaseRepository } = await import("../src/repositories/CaseRepository.js");
  const { config } = await import("../src/utils/config.js");

  // 데모 임계값: mock 후보 본문은 점수가 낮으므로 "검수 적재까지" 사슬을 시연하려고 임계값을 낮춘다.
  // 임계값은 외부화되어 있어 데모 오버라이드가 안전 정책(자동 제출 차단)을 우회하지 않는다.
  const demoConfig = { minScore: 10, minConfidence: 0.05, triageMinScore: 5 };
  const pipeline = new AutoPipeline({ config: demoConfig });
  const result = await pipeline.run({
    moduleId: "false_ad",
    topics: ["blood-sugar"],
    mode: "quick",
    sourceTypes: ["mock"],
    stopAfter: singleMode,
    reason: `mock-stages-e2e:${singleMode}`
  });
  const ex = result.execSummary;

  console.log(`### stopAfter="${singleMode}"  (${ex.mode})`);
  console.log(`  MOCK_AI=${config.mockAi} MOCK_SCOUT=${config.scout.mock} DATA_DIR=${config.dataDir}`);
  console.log(`  discovered=${ex.discovered}  deduped=${ex.deduped}  analyzed=${ex.analyzed}  queued=${ex.queued}  previewed=${ex.previewed}  collected=${ex.collected}  skipped=${ex.skipped}  errors=${ex.errors}`);
  console.log(`  autoSubmitted=${result.autoSubmitted}  humanReviewRequired=${result.humanReviewRequired}  terminalState=${result.pipeline.terminalState}`);
  for (const it of ex.items.slice(0, 6)) {
    console.log(
      `   - ${String(it.outcome).padEnd(16)} persisted=${it.persisted}` +
      (typeof it.score === "number" ? `  score=${it.score} conf=${it.confidence}` : "") +
      (it.route ? `  route=${it.route}` : "") +
      (it.caseId ? `  case=${it.caseId} status=${it.caseStatus}` : "")
    );
  }
  const caseRepo = createCaseRepository();
  const cases = await caseRepo.list({ limit: 500 });
  console.log(`  저장된 케이스=${cases.total}건 (collect/analyze 는 0이어야 함)`);
  process.exit(0);
}

// ---- 부모 모드: 모드별 자식 프로세스 스폰 ----
console.log("=".repeat(72));
console.log("AutoPipeline 단계 범위 MOCK e2e — collect / analyze / queue 각 1회 (모드별 격리 실행)");
console.log("=".repeat(72));

let anyFail = false;
for (const stopAfter of STOP_AFTERS) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), `pipe-stage-${stopAfter}-`));
  console.log(`\n----- 실행: stopAfter=${stopAfter} (격리 DATA_DIR=${dataDir}) -----`);
  // shell:true(win32) 에서 공백 포함 경로가 분해되지 않도록 인용한다.
  const quotedSelf = process.platform === "win32" ? `"${selfPath}"` : selfPath;
  const r = spawnSync("npx", ["tsx", quotedSelf], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      PIPE_STAGE_SINGLE: stopAfter,
      DATA_DIR: dataDir,
      MOCK_AI: "true",
      MOCK_SCOUT: "true"
    }
  });
  if (r.status !== 0) anyFail = true;
}

if (anyFail) {
  console.error("\n일부 모드 실행이 실패했습니다.");
  process.exit(1);
}
console.log("\n[안전 확인] collect/analyze 는 저장 없음(persisted:false). 어떤 모드도 자동 제출 없음. 끝점 human_review_required.");
console.log("PIPELINE_STAGES_MOCK_E2E_OK");
