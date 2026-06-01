// AutoPipeline 테스트 — 자율 발굴→분석→검수 대기열 적재 파이프라인.
//
// 실행: `npm run test:auto-pipeline` (tsx).
// node:assert/strict 만 사용. 외부 네트워크/LLM 없이 가짜 Orchestrator + 임시 저장소로 결정적 검증.
//
// 검증 포인트:
//   - mock 후보 N건 → 중복 1건 제거, 高위험은 검수 대기열(REVIEW + human_review_required) 적재,
//     低위험은 케이스 미생성, 분석 실패 1건이 전체를 죽이지 않음(부분 성공).
//   - 멱등성: 같은 후보 2회 실행 시 케이스 1건만 생성.
//   - 비용 가드: MAX_ANALYSES 초과 시 중단·로그.
//   - "제출은 여전히 수동": 출력에 auto-submit/제출 상태가 없고 human_review_required 에서 멈춘다.

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { nanoid } from "nanoid";
import {
  AutoPipeline,
  assertNoSubmissionAutomation,
  PIPELINE_SAFETY,
  type PipelineOrchestrator
} from "../src/services/pipeline/AutoPipeline.js";
import { CandidateRepository } from "../src/repositories/CandidateRepository.js";
import { JsonCaseRepository } from "../src/repositories/CaseRepository.js";
import { canAutoSubmit } from "../src/policy/approvalGate.js";
import type { RewardCase } from "../src/types/core.js";
import type { DiscoveryCandidate } from "../src/types/candidate.js";

// ---------- 미니 러너 ----------

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];
function test(name: string, fn: () => Promise<void>): void { tests.push({ name, fn }); }

// ---------- 헬퍼 ----------

function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "autopipe-"));
}

function makeCandidate(over: Partial<DiscoveryCandidate> & { url: string; title: string }): DiscoveryCandidate {
  return {
    id: over.id ?? `cand-${nanoid(8)}`,
    moduleId: over.moduleId ?? "false_ad",
    topic: over.topic ?? "blood-sugar",
    keyword: over.keyword ?? "혈당",
    title: over.title,
    url: over.url,
    snippet: over.snippet ?? "mock snippet",
    source: over.source ?? "scout-mock",
    discoveryMethod: over.discoveryMethod ?? "seed",
    firstScore: over.firstScore ?? 50,
    reasons: over.reasons ?? ["mock"],
    foundAt: over.foundAt ?? new Date().toISOString(),
    status: "NEW"
  };
}

function makeDraft(url: string, moduleId: string, score: number, confidence: number): RewardCase {
  const now = new Date().toISOString();
  return {
    id: nanoid(12),
    moduleId,
    status: "DRAFT",
    url,
    title: url,
    createdAt: now,
    updatedAt: now,
    score,
    riskScore: score,
    riskLevel: "검토 필요",
    summary: "fake draft",
    rewardCaution: "포상금 수령을 보장하지 않습니다.",
    ruleHits: [],
    aiFinding: {
      suspicious: score >= 60,
      confidence: Math.round(confidence * 100),
      violationType: "테스트",
      summary: "fake",
      reasons: [],
      requiredHumanChecks: [],
      recommendedAgency: "식품의약품안전처 (후보)",
      safeWording: "검토 필요"
    },
    evidence: { htmlPath: "", textPath: "", capturedAt: now },
    reportPath: "",
    statusHistory: [{ at: now, from: null, to: "DRAFT", note: "fake" }],
    reviews: [],
    llmAnalysis: {
      schemaVersion: "1.0.0",
      moduleId,
      notLegalConclusion: true,
      rewardGuaranteed: false,
      overallRisk: "MEDIUM",
      violationLikelihood: "MEDIUM",
      confidence,
      summary: "fake",
      findings: [],
      missingEvidence: [],
      recommendedAgency: "식품의약품안전처 (후보)",
      agencyCandidates: [],
      reportDraftSummary: "fake",
      prohibitedPhrases: [],
      humanReviewChecklist: [],
      safetyWarnings: []
    }
  };
}

/** 결정적 가짜 Orchestrator — URL별로 score/confidence/실패를 제어하고 commitCase 는 주입된 caseRepo 에 저장. */
class FakeOrchestrator implements PipelineOrchestrator {
  public analyzeCalls = 0;
  constructor(
    private caseRepo: JsonCaseRepository,
    private outcomes: Map<string, { score: number; confidence: number; fail?: boolean }>
  ) {}

  async analyze(request: { url: string; moduleId: string; memo?: string }): Promise<RewardCase> {
    this.analyzeCalls++;
    const o = this.outcomes.get(request.url) ?? { score: 0, confidence: 0 };
    if (o.fail) throw new Error("synthetic analysis failure");
    return makeDraft(request.url, request.moduleId, o.score, o.confidence);
  }

  async commitCase(draft: RewardCase, options?: { statusOverride?: RewardCase["status"]; statusNote?: string }): Promise<RewardCase> {
    const status = options?.statusOverride ?? draft.status;
    const committed: RewardCase = { ...draft, status, reportPath: `report/${draft.id}.md` };
    return this.caseRepo.save(committed);
  }
}

const silentTrace = { async log() { return null; } };

function buildPipeline(outcomes: Map<string, { score: number; confidence: number; fail?: boolean }>, cfg?: Record<string, number>) {
  const candFile = path.join(tmpDir(), "candidates.json");
  const caseDir = tmpDir();
  const candidateRepo = new CandidateRepository(candFile);
  const caseRepo = new JsonCaseRepository(caseDir);
  const orchestrator = new FakeOrchestrator(caseRepo, outcomes);
  const pipeline = new AutoPipeline({
    orchestrator,
    candidateRepo,
    caseRepo,
    trace: silentTrace as any,
    config: cfg
  });
  return { pipeline, candidateRepo, caseRepo, orchestrator };
}

// ====================================================================

test("N건 처리: 중복 1건 제거 · 高위험 검수 적재 · 低위험 미생성 · 실패 격리", async () => {
  const outcomes = new Map<string, { score: number; confidence: number; fail?: boolean }>([
    ["https://high.example/p1", { score: 80, confidence: 0.8 }],
    ["https://mid.example/p2", { score: 40, confidence: 0.5 }],
    ["https://low.example/p3", { score: 10, confidence: 0.3 }],
    ["https://fail.example/p5", { score: 0, confidence: 0, fail: true }]
  ]);
  const { pipeline, candidateRepo, caseRepo, orchestrator } = buildPipeline(outcomes);

  const cands = [
    makeCandidate({ url: "https://high.example/p1", title: "고위험 광고 A" }),
    makeCandidate({ url: "https://mid.example/p2", title: "중간 광고 B" }),
    makeCandidate({ url: "https://low.example/p3", title: "노이즈 광고 C" }),
    makeCandidate({ url: "https://dup.example/p4", title: "고위험 광고 A" }), // #1 과 동일 제목 → 중복
    makeCandidate({ url: "https://fail.example/p5", title: "실패 광고 E" })
  ];
  await candidateRepo.createMany(cands);

  const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad" });

  assert.equal(summary.autoReviewQueued, 1, "高위험·高신뢰도 1건 검수 적재");
  assert.equal(summary.needsTriageQueued, 1, "中간 1건 triage");
  assert.equal(summary.noiseDropped, 1, "低위험 1건 케이스 미생성");
  assert.equal(summary.duplicatesSkipped, 1, "중복 1건 제거");
  assert.equal(summary.failed, 1, "실패 1건 격리");
  assert.equal(orchestrator.analyzeCalls, 4, "중복은 분석 전 제거 → analyze 4회");

  // 저장된 케이스는 정확히 2건 (REVIEW + DRAFT). 노이즈/중복/실패는 케이스를 만들지 않는다.
  const all = await caseRepo.list({ limit: 500 });
  assert.equal(all.total, 2, "케이스 2건만 생성");
  const statuses = all.cases.map((c) => c.status).sort();
  assert.deepEqual(statuses, ["DRAFT", "REVIEW"]);

  // 高위험 결과는 human_review_required 검수 요청 + REVIEW 상태.
  const high = summary.results.find((r) => r.url === "https://high.example/p1")!;
  assert.equal(high.outcome, "auto_review");
  assert.equal(high.caseStatus, "REVIEW");
  assert.equal(high.reviewRequestStatus, "human_review_required");

  // 低위험 후보는 REJECTED 로 마감되고 caseId 없음.
  const low = summary.results.find((r) => r.url === "https://low.example/p3")!;
  assert.equal(low.outcome, "noise");
  assert.equal(low.caseId, undefined);
});

test("멱등성: 같은 후보 2회 실행 → 케이스 1건만 생성", async () => {
  const outcomes = new Map([["https://idem.example/p1", { score: 80, confidence: 0.8 }]]);
  const { pipeline, candidateRepo, caseRepo } = buildPipeline(outcomes);
  const cands = [makeCandidate({ url: "https://idem.example/p1", title: "멱등 광고" })];
  await candidateRepo.createMany(cands);

  const s1 = await pipeline.processCandidates(cands, { moduleId: "false_ad" });
  const s2 = await pipeline.processCandidates(cands, { moduleId: "false_ad" });

  assert.equal(s1.autoReviewQueued, 1, "1회차 적재");
  assert.equal(s2.autoReviewQueued, 0, "2회차 신규 적재 없음");
  assert.equal(s2.skippedNotNew + s2.duplicatesSkipped, 1, "2회차는 멱등 스킵");

  const all = await caseRepo.list({ limit: 500 });
  assert.equal(all.total, 1, "케이스는 1건만");
});

test("비용 가드: MAX_ANALYSES 초과 시 중단 + 미처리 후보는 NEW 유지", async () => {
  const outcomes = new Map<string, { score: number; confidence: number }>();
  for (let i = 1; i <= 4; i++) outcomes.set(`https://cost.example/p${i}`, { score: 80, confidence: 0.8 });
  const { pipeline, candidateRepo, caseRepo } = buildPipeline(outcomes, { maxAnalyses: 2 });

  const cands = [1, 2, 3, 4].map((i) => makeCandidate({ url: `https://cost.example/p${i}`, title: `비용가드 광고 ${i}` }));
  await candidateRepo.createMany(cands);

  const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad" });

  assert.equal(summary.analyzed, 2, "분석은 상한 2회까지만");
  assert.equal(summary.limitReached, true, "상한 도달 플래그");
  const skipped = summary.results.filter((r) => r.outcome === "limit_skipped");
  assert.equal(skipped.length, 2, "초과 후보 2건은 limit_skipped");

  // 케이스는 2건만, 초과 후보는 NEW 로 남아 다음 run 재시도 가능.
  const all = await caseRepo.list({ limit: 500 });
  assert.equal(all.total, 2);
  let stillNew = 0;
  for (const r of skipped) {
    const c = await candidateRepo.getById(r.candidateId);
    if (c.status === "NEW") stillNew++;
  }
  assert.equal(stillNew, 2, "초과 후보는 NEW 유지(이월)");
});

test("제출은 여전히 수동: 출력에 자동 제출/제출 상태 없음 · human_review_required 에서 멈춤", async () => {
  const outcomes = new Map([
    ["https://sub.example/p1", { score: 90, confidence: 0.9 }],
    ["https://sub.example/p2", { score: 45, confidence: 0.5 }]
  ]);
  const { pipeline, candidateRepo, caseRepo } = buildPipeline(outcomes);
  const cands = [
    makeCandidate({ url: "https://sub.example/p1", title: "제출검증 광고 1" }),
    makeCandidate({ url: "https://sub.example/p2", title: "제출검증 광고 2" })
  ];
  await candidateRepo.createMany(cands);

  const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad" });

  // 안전 불변식 단언.
  assert.equal(summary.autoSubmitted, false);
  assert.equal(summary.humanReviewRequired, true);
  assert.equal(summary.terminalState, "human_review_required");
  assert.equal(assertNoSubmissionAutomation(summary), true, "어떤 자동 제출/제출 상태도 없음");
  assert.equal(canAutoSubmit(), false);

  // 적재된 케이스 중 SUBMITTED/승인 단계로 넘어간 것이 없어야 한다 (검수 흐름 시작점만).
  const all = await caseRepo.list({ limit: 500 });
  for (const c of all.cases) {
    assert.ok(["REVIEW", "DRAFT"].includes(c.status), `케이스 상태는 검수 흐름 시작점만: ${c.status}`);
    assert.notEqual(c.status, "SUBMITTED");
  }

  // 파이프라인이 부여 가능한 상태에 SUBMITTED/제출 게이트 상태가 없음.
  assert.equal(PIPELINE_SAFETY.assignableCaseStatuses.includes("SUBMITTED" as any), false);
  assert.equal(PIPELINE_SAFETY.terminalReviewStatus, "human_review_required");
});

// ====================================================================
// 단계 범위(stopAfter) — 하이브리드 자동 실행
// ====================================================================

test('stopAfter="collect": 후보만 수집 · 케이스 0 · 큐 0 · LLM 분석 0회', async () => {
  const outcomes = new Map([
    ["https://c.example/p1", { score: 80, confidence: 0.8 }],
    ["https://c.example/p2", { score: 40, confidence: 0.5 }]
  ]);
  const { pipeline, candidateRepo, caseRepo, orchestrator } = buildPipeline(outcomes);
  const cands = [
    makeCandidate({ url: "https://c.example/p1", title: "수집 광고 1" }),
    makeCandidate({ url: "https://c.example/p2", title: "수집 광고 2" })
  ];
  await candidateRepo.createMany(cands);

  const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad", stopAfter: "collect" });

  assert.equal(summary.stopAfter, "collect");
  assert.equal(orchestrator.analyzeCalls, 0, "LLM 분석 0회 (비용 0)");
  assert.equal(summary.analyzed, 0);
  assert.equal(summary.autoReviewQueued + summary.needsTriageQueued, 0, "큐 적재 0");
  assert.equal(summary.collected, 2, "수집 후보 2건");
  assert.ok(summary.results.every((r) => r.persisted === false), "어떤 결과도 저장되지 않음");

  const all = await caseRepo.list({ limit: 500 });
  assert.equal(all.total, 0, "케이스 0건");

  // 후보 상태는 NEW 로 보존 — 이어서 analyze/queue 가능.
  for (const c of cands) {
    const cur = await candidateRepo.getById(c.id);
    assert.equal(cur.status, "NEW", "collect 모드는 후보 상태를 바꾸지 않음");
  }

  assert.equal(assertNoSubmissionAutomation(summary), true);
});

test('stopAfter="analyze": 분석/점수 수행 · 케이스 0 · 큐 0(persisted:false) · preview>0', async () => {
  const outcomes = new Map([
    ["https://a.example/p1", { score: 80, confidence: 0.8 }],
    ["https://a.example/p2", { score: 40, confidence: 0.5 }],
    ["https://a.example/p3", { score: 10, confidence: 0.2 }]
  ]);
  const { pipeline, candidateRepo, caseRepo, orchestrator } = buildPipeline(outcomes);
  const cands = [
    makeCandidate({ url: "https://a.example/p1", title: "분석 광고 1" }),
    makeCandidate({ url: "https://a.example/p2", title: "분석 광고 2" }),
    makeCandidate({ url: "https://a.example/p3", title: "분석 광고 3" })
  ];
  await candidateRepo.createMany(cands);

  const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad", stopAfter: "analyze" });

  assert.equal(summary.stopAfter, "analyze");
  assert.equal(orchestrator.analyzeCalls, 3, "3건 모두 분석/점수 산출");
  assert.equal(summary.analyzed, 3);
  assert.equal(summary.previewed, 3, "preview 3건");
  assert.ok(summary.previewed > 0, "preview 개수 > 0");
  assert.equal(summary.autoReviewQueued + summary.needsTriageQueued, 0, "큐 적재 0");
  assert.equal(summary.noiseDropped, 0, "analyze 모드는 노이즈도 마감하지 않음(미리보기만)");

  // 모든 preview 는 persisted:false 이고 점수/근거를 담는다.
  const previews = summary.results.filter((r) => r.outcome === "preview");
  assert.equal(previews.length, 3);
  assert.ok(previews.every((r) => r.persisted === false), "preview 는 저장 안 됨");
  assert.ok(previews.every((r) => typeof r.score === "number" && typeof r.route === "string"), "점수·라우팅 근거 표시");

  const all = await caseRepo.list({ limit: 500 });
  assert.equal(all.total, 0, "케이스 0건 — 저장 안 됨");

  // 후보 상태는 NEW 로 보존.
  for (const c of cands) {
    const cur = await candidateRepo.getById(c.id);
    assert.equal(cur.status, "NEW", "analyze 모드는 후보 상태를 바꾸지 않음");
  }

  assert.equal(assertNoSubmissionAutomation(summary), true);
});

test('stopAfter="queue"(기본): 고위험은 검수 대기열 적재 — 기존 동작 유지', async () => {
  const outcomes = new Map([
    ["https://q.example/p1", { score: 90, confidence: 0.9 }],
    ["https://q.example/p2", { score: 10, confidence: 0.2 }]
  ]);
  const { pipeline, candidateRepo, caseRepo } = buildPipeline(outcomes);
  const cands = [
    makeCandidate({ url: "https://q.example/p1", title: "적재 광고 1" }),
    makeCandidate({ url: "https://q.example/p2", title: "적재 광고 2" })
  ];
  await candidateRepo.createMany(cands);

  // stopAfter 미지정 → "queue" 기본값으로 동작해야 한다.
  const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad" });

  assert.equal(summary.stopAfter, "queue", "미지정 시 기본 queue");
  assert.equal(summary.autoReviewQueued, 1, "고위험 1건 검수 대기열 적재");
  assert.equal(summary.noiseDropped, 1, "저위험 1건 케이스 미생성");

  const high = summary.results.find((r) => r.url === "https://q.example/p1")!;
  assert.equal(high.outcome, "auto_review");
  assert.equal(high.persisted, true, "적재 건은 persisted:true");
  assert.equal(high.caseStatus, "REVIEW");
  assert.equal(high.reviewRequestStatus, "human_review_required");

  const all = await caseRepo.list({ limit: 500 });
  assert.equal(all.total, 1, "케이스 1건 적재");
  assert.equal(canAutoSubmit(), false, "canAutoSubmit 불변");
  assert.equal(assertNoSubmissionAutomation(summary), true);
});

test("어느 stopAfter 모드에서도 SUBMITTED/auto-submit 상태가 생기지 않음", async () => {
  const outcomes = new Map([["https://s.example/p1", { score: 95, confidence: 0.95 }]]);
  for (const stopAfter of ["collect", "analyze", "queue"] as const) {
    const { pipeline, candidateRepo, caseRepo } = buildPipeline(outcomes);
    const cands = [makeCandidate({ url: "https://s.example/p1", title: "제출불가 광고" })];
    await candidateRepo.createMany(cands);

    const summary = await pipeline.processCandidates(cands, { moduleId: "false_ad", stopAfter });

    assert.equal(summary.autoSubmitted, false, `${stopAfter}: autoSubmitted=false`);
    assert.equal(summary.terminalState, "human_review_required", `${stopAfter}: 끝점 human_review_required`);
    assert.equal(assertNoSubmissionAutomation(summary), true, `${stopAfter}: 제출 자동화 없음`);
    for (const r of summary.results) {
      assert.notEqual(r.caseStatus, "SUBMITTED", `${stopAfter}: SUBMITTED 케이스 없음`);
    }
    const all = await caseRepo.list({ limit: 500 });
    for (const c of all.cases) {
      assert.notEqual(c.status, "SUBMITTED", `${stopAfter}: 저장소에 SUBMITTED 없음`);
    }
    assert.equal(canAutoSubmit(), false, `${stopAfter}: canAutoSubmit()===false 불변`);
  }
});

// ====================================================================

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
  console.log(`\nAutoPipeline tests: PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
  else console.log("AUTO_PIPELINE_TESTS_OK");
})();
