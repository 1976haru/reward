// AutoPipeline MOCK 모드 end-to-end 실행 (키 없이: mock 발굴 → 분석 → 검수 대기열 적재).
//
// 실행: `npm run pipeline:mock`
//
// 외부 신고 자동 제출은 수행하지 않는다. 끝점은 사람 검수 대기(human_review_required).
// 실제 data/ 를 오염시키지 않도록 DATA_DIR 을 임시 디렉터리로 격리한 뒤 모듈을 동적 import 한다.
// (config 는 import 시점에 DATA_DIR 을 읽으므로, 반드시 import 전에 env 를 설정한다.)
// mock 후보는 RFC 6761 예약 도메인(.test/.example)을 써서 실 네트워크 호출이 일어나지 않는다.

import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

// ---- 1) 모든 import 전에 DATA_DIR 격리 + mock 강제 ----
const ISOLATED_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "pipe-e2e-"));
process.env.DATA_DIR = ISOLATED_DATA_DIR;
process.env.MOCK_AI = "true";       // 외부 LLM 미호출 (비용 0)
process.env.MOCK_SCOUT = "true";    // mock 발굴 어댑터

// ---- 2) 격리 이후 동적 import (config 가 위 env 를 읽는다) ----
const { AutoPipeline } = await import("../src/services/pipeline/AutoPipeline.js");
const { createCaseRepository } = await import("../src/repositories/CaseRepository.js");
const { config } = await import("../src/utils/config.js");

const caseRepo = createCaseRepository();

// 데모 임계값: mock 후보 본문(.example → 수집 fallback, 빈 본문)은 점수가 낮으므로,
// "검수 대기열 적재까지" 전체 사슬을 시연하기 위해 임계값을 낮춘다. 운영 기본값은 config(.env) 참조.
// 임계값은 외부화되어 있으므로 이 데모 오버라이드는 안전 정책을 우회하지 않는다 (제출은 여전히 자동화 없음).
const demoConfig = { minScore: 10, minConfidence: 0.05, triageMinScore: 5 };
const pipeline = new AutoPipeline({ config: demoConfig });

console.log("=".repeat(70));
console.log("AutoPipeline MOCK e2e — mock 발굴 → 분석 → 검수 대기열 적재");
console.log(`MOCK_AI=${config.mockAi}  MOCK_SCOUT=${config.scout.mock}  (외부 LLM/네트워크 미호출, 비용 0)`);
console.log(`격리 DATA_DIR: ${ISOLATED_DATA_DIR}`);
console.log(`운영 기본 임계값(config): minScore=${config.pipeline.minScore} minConfidence=${config.pipeline.minConfidence} triageMinScore=${config.pipeline.triageMinScore} maxAnalyses=${config.pipeline.maxAnalyses}`);
console.log(`데모 오버라이드 임계값: minScore=${demoConfig.minScore} minConfidence=${demoConfig.minConfidence} triageMinScore=${demoConfig.triageMinScore} (mock 빈 본문에서도 적재 사슬 시연용)`);
console.log("=".repeat(70));

// 진짜 end-to-end: scout.discover(mock) → dedupe → analyze → 신뢰도 라우팅 → 적재.
// sourceTypes=["mock"] 로 고정 — 키 없이 완전 오프라인. (naver 등 외부 어댑터/네트워크 미사용)
const result = await pipeline.run({ moduleId: "false_ad", topics: ["blood-sugar"], mode: "quick", sourceTypes: ["mock"], reason: "mock-e2e" });
const summary = result.pipeline;

console.log("\n--- 발굴(discover) ---");
console.log(`  totalFound=${result.discovery.totalFound} totalAdded=${result.discovery.totalAdded} usedSources=${result.discovery.usedSources.join(",") || "(mock)"}`);

console.log("\n--- 후보별 결과 ---");
for (const r of summary.results) {
  console.log(
    `  ${r.outcome.padEnd(18)} ${r.url}` +
    (r.caseId ? `  → case=${r.caseId} status=${r.caseStatus ?? "-"}` : "") +
    (r.reviewRequestStatus ? `  review=${r.reviewRequestStatus}` : "") +
    (typeof r.score === "number" ? `  score=${r.score} conf=${r.confidence}` : "") +
    (r.reason ? `  (${r.reason})` : "")
  );
}

console.log("\n--- 요약 ---");
console.log(`  runId=${summary.runId}`);
console.log(`  totalCandidates=${summary.totalCandidates} analyzed=${summary.analyzed}`);
console.log(`  autoReviewQueued=${summary.autoReviewQueued} needsTriageQueued=${summary.needsTriageQueued} noiseDropped=${summary.noiseDropped}`);
console.log(`  duplicatesSkipped=${summary.duplicatesSkipped} failed=${summary.failed} limitReached=${summary.limitReached}`);
console.log(`  autoSubmitted=${summary.autoSubmitted}  humanReviewRequired=${summary.humanReviewRequired}  terminalState=${summary.terminalState}`);

const cases = await caseRepo.list({ limit: 500 });
console.log(`\n--- 적재된 케이스 (${cases.total}건) — 모두 검수 대기 흐름(REVIEW/DRAFT) ---`);
for (const c of cases.cases) {
  console.log(`  ${c.id}  status=${c.status}  score=${c.score}  "${c.title}"`);
}

console.log("\n[안전 확인] 자동 제출 없음. 끝점은 human_review_required. 실제 신고는 사람이 공식 창구에서 직접 수행.");
console.log("PIPELINE_MOCK_E2E_OK");
