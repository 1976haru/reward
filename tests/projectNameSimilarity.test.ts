// 사업명 유사도 계산/후보 목록 정확도 테스트 (체크리스트 15 — 필수 작업 5).
//
// 실행: `npm run test:project-similarity` (tsx). node:assert/strict 만 사용.
// 모든 테스트 데이터는 가짜 사업명이며 실제 개인정보를 포함하지 않는다.
// 본 모듈은 "유사 사업명 후보 / 반복 신청 검토 후보"만 만들며 반복 신청/부정수급을 확정하지 않는다.

import assert from "node:assert/strict";
import {
  calculateProjectNameSimilarity,
  classifyProjectSimilarity,
  createProjectSimilarityCandidate,
  findSimilarProjectNameCandidates,
  normalizeProjectName
} from "../src/normalizers/projectNameSimilarity.js";
import { convertRowToStandardRecord } from "../src/parsers/uploadSubsidyParser.js";

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const decisionOf = (a: string, b: string) => createProjectSimilarityCandidate(a, b).decision;
const scoreOf = (a: string, b: string) => createProjectSimilarityCandidate(a, b).similarityScore;

// ---------- 1~9. 정규화/가중치 ----------

test("1. 연도 차이가 큰 감점이 되지 않는다", () => {
  assert.equal(decisionOf("2024년 청년 문화활동 지원사업", "2023년 청년 문화활동 지원사업"), "strong_similar");
});

test("2. 차수/회차 차이가 큰 감점이 되지 않는다", () => {
  assert.equal(decisionOf("청년 문화활동 지원사업 1차", "청년 문화활동 지원사업 2차"), "strong_similar");
});

test("3. 괄호 메모가 제거된다", () => {
  const n = normalizeProjectName("청년 문화활동 지원사업(수원시)");
  assert.ok(n.removedTokens.includes("수원시"));
  assert.equal(decisionOf("청년 문화활동 지원사업(수원시)", "청년 문화활동 지원사업"), "strong_similar");
});

test("4. 띄어쓰기 차이가 보정된다", () => {
  assert.equal(
    normalizeProjectName("청년문화활동지원사업").compactName,
    normalizeProjectName("청년 문화 활동 지원 사업").compactName
  );
});

test("5. 특수문자 차이가 보정된다", () => {
  assert.equal(decisionOf("청년-문화_활동 지원사업", "청년 문화 활동 지원사업"), "strong_similar");
});

test("6. 영문 대소문자 차이가 정규화된다", () => {
  assert.equal(normalizeProjectName("Youth Care").compactName, normalizeProjectName("youth-care").compactName);
});

test("7. '청년문화활동지원사업'과 '청년 문화 활동 지원 사업'이 유사 후보가 된다", () => {
  const d = decisionOf("청년문화활동지원사업", "청년 문화 활동 지원 사업");
  assert.ok(d === "strong_similar" || d === "similar_candidate");
});

test("8. 공모/모집/신청 안내 같은 일반 표현은 낮은 가중치로 처리된다", () => {
  // 일반 표현이 추가돼도 핵심 사업명이 같으면 후보로 유지된다(일반 표현이 매칭을 깨지 않음).
  const d = decisionOf("청년 문화활동 지원사업 공모 모집 안내", "청년 문화활동 지원사업");
  assert.ok(["strong_similar", "similar_candidate", "possible_candidate"].includes(d), `decision=${d}`);
});

test("9. 일반 토큰만 남은 사업명은 ambiguous 처리된다", () => {
  assert.equal(decisionOf("지원 사업 공모 안내", "보조 사업 신청 안내"), "ambiguous");
});

// ---------- 10~11. 임계값 ----------

test("10. 유사도 0.85 이상이면 similar_candidate 이상으로 분류된다", () => {
  const r = createProjectSimilarityCandidate("청년 문화활동 지원사업 2024", "청년 문화활동 지원사업 2025");
  assert.ok(r.similarityScore >= 0.85);
  assert.ok(r.decision === "strong_similar" || r.decision === "similar_candidate");
});

test("11. 유사도 0.70 미만이면 no_match 가 된다", () => {
  const r = createProjectSimilarityCandidate("청년 문화활동 지원사업", "노인 돌봄 지원사업");
  assert.ok(r.similarityScore < 0.7, `score=${r.similarityScore}`);
  assert.equal(r.decision, "no_match");
});

// ---------- 12. 후보 목록 ----------

test("12. findSimilarProjectNameCandidates 가 0.85 이상 후보 목록을 생성한다", () => {
  const names = [
    "2024년 청년 문화활동 지원사업",
    "청년 문화활동 지원사업 2차",
    "청년문화활동지원사업(수원시)",
    "노인 돌봄 지원사업",
    "농업 기술 교육사업"
  ];
  const cands = findSimilarProjectNameCandidates(names);
  assert.ok(cands.length >= 1, "유사 후보가 없음");
  assert.ok(cands.every((c) => c.similarityScore >= 0.85));
  assert.ok(cands.every((c) => c.reviewRequired === true));
  // 무관한 사업명(노인/농업)은 청년 후보와 묶이지 않는다
  assert.ok(
    !cands.some((c) => (c.leftName + c.rightName).includes("노인 돌봄") && (c.leftName + c.rightName).includes("청년"))
  );
});

// ---------- 13. 업로드 parser 연결 ----------

test("13. 업로드 parser 에서 projectName 이 있으면 projectNameCompactKey 가 생성된다", () => {
  const rec = convertRowToStandardRecord(
    { 사업명: "2024년 청년 문화활동 지원사업", 보조사업자: "행복나눔" },
    { sourceFileName: "x.csv", sourceFileType: "csv" }
  );
  assert.equal(rec.projectNameCompactKey, "청년문화활동지원사업");
});

// ---------- 14~15. 정확도 ----------

const SIMILAR_PAIRS: Array<[string, string]> = [
  ["2024년 청년 문화활동 지원사업", "2023년 청년 문화활동 지원사업"],
  ["청년 문화활동 지원사업 1차", "청년 문화활동 지원사업 2차"],
  ["청년 문화활동 지원사업(수원시)", "청년 문화활동 지원사업"],
  ["청년문화활동지원사업", "청년 문화 활동 지원 사업"],
  ["청년-문화_활동 지원사업", "청년 문화 활동 지원사업"],
  ["Youth Care 지원사업", "youth-care 지원사업"],
  ["경기도 청년 문화활동 지원사업", "청년 문화활동 지원사업"],
  ["청년 문화활동 지원사업 공모 안내", "청년 문화활동 지원사업"],
  ["아동 돌봄 지원사업", "아동돌봄지원사업"],
  ["노인 일자리 지원사업 2024", "노인 일자리 지원사업 2025"],
  ["장애인 활동지원 사업", "장애인활동지원사업"],
  ["스마트팜 보급사업 제1차", "스마트팜 보급사업 제2차"],
  ["창업 지원 프로그램", "창업지원프로그램"],
  ["마을 공동체 활성화 지원사업", "마을공동체 활성화 지원사업"],
  ["농업 기술 교육사업(2024)", "농업 기술 교육사업"],
  ["주거 환경 개선 지원사업", "주거환경개선 지원사업"],
  ["예술인 창작 지원사업 상반기", "예술인 창작 지원사업 하반기"],
  ["청년 주거 지원사업", "청년주거지원 사업"],
  ["환경 정화 활동 지원사업", "환경정화활동 지원사업"],
  ["다문화 가정 교육지원사업", "다문화가정 교육 지원사업"],
  ["청년 문화활동 지원 사업 공모", "청년 문화활동 지원사업"],
  ["스마트팜 청년 창업 지원사업", "스마트팜 청년창업 지원사업"]
];

const DIFFERENT_PAIRS: Array<[string, string]> = [
  ["청년 문화활동 지원사업", "노인 돌봄 지원사업"],
  ["아동 교육 지원사업", "농업 기술 보급사업"],
  ["장애인 활동 지원사업", "환경 정화 사업"],
  ["창업 지원 프로그램", "주거 안정 지원사업"],
  ["스마트팜 보급사업", "예술인 창작 지원사업"],
  ["마을 공동체 활성화", "다문화 가정 지원"],
  ["청년 일자리 사업", "노인 건강 증진 사업"],
  ["문화 예술 교육", "농어촌 도로 정비"],
  ["돌봄 서비스 지원", "체육 시설 운영"],
  ["환경 보전 활동", "관광 자원 개발"],
  ["청년 창업 지원", "도서관 운영 사업"],
  ["주거 복지 지원", "상수도 정비 공사"]
];

test("14. 유사 사업명 변형 22쌍 중 80% 이상이 0.85↑ 또는 similar_candidate↑ 다", () => {
  let good = 0;
  const misses: string[] = [];
  for (const [a, b] of SIMILAR_PAIRS) {
    const d = decisionOf(a, b);
    if (d === "strong_similar" || d === "similar_candidate") good++;
    else misses.push(`[${a}|${b}]=${d}(${scoreOf(a, b).toFixed(2)})`);
  }
  const ratio = good / SIMILAR_PAIRS.length;
  assert.ok(ratio >= 0.8, `유사 후보화 비율 ${(ratio * 100).toFixed(0)}% (<80%). 미스: ${misses.join(", ")}`);
});

test("15. 다른 사업명 쌍 12쌍 중 80% 이상이 no_match 또는 possible_candidate 이하다", () => {
  let good = 0;
  const misses: string[] = [];
  for (const [a, b] of DIFFERENT_PAIRS) {
    const d = decisionOf(a, b);
    if (d === "no_match" || d === "possible_candidate" || d === "ambiguous") good++;
    else misses.push(`[${a}|${b}]=${d}(${scoreOf(a, b).toFixed(2)})`);
  }
  const ratio = good / DIFFERENT_PAIRS.length;
  assert.ok(ratio >= 0.8, `오매칭 방지 비율 ${(ratio * 100).toFixed(0)}% (<80%). 미스: ${misses.join(", ")}`);
});

// ---------- 16~17. 안전 원칙 ----------

test("16. reviewRequired 는 항상 true 다", () => {
  for (const [a, b] of [...SIMILAR_PAIRS, ...DIFFERENT_PAIRS]) {
    assert.equal(createProjectSimilarityCandidate(a, b).reviewRequired, true);
  }
});

test("17. 결과 사유에 '반복 신청 확정'/'부정수급 확정' 단정 표현이 없다", () => {
  for (const [a, b] of SIMILAR_PAIRS) {
    const joined = createProjectSimilarityCandidate(a, b).reasons.join(" ");
    assert.ok(!joined.includes("반복 신청 확정"), `단정 표현: ${joined}`);
    assert.ok(!joined.includes("부정수급 확정"), `단정 표현: ${joined}`);
    assert.ok(!joined.includes("자동 확정"), `단정 표현: ${joined}`);
  }
});

// ---------- 보조 ----------

test("calculateProjectNameSimilarity: 동일 compactName 은 1, 무관 사업명은 낮다", () => {
  assert.equal(
    calculateProjectNameSimilarity(
      normalizeProjectName("청년문화활동지원사업"),
      normalizeProjectName("청년 문화 활동 지원 사업")
    ),
    1
  );
  assert.ok(
    calculateProjectNameSimilarity(
      normalizeProjectName("청년 문화활동 지원사업"),
      normalizeProjectName("노인 돌봄 지원사업")
    ) < 0.7
  );
});

test("classifyProjectSimilarity: 핵심 동일 시 strong_similar", () => {
  const r = classifyProjectSimilarity(
    normalizeProjectName("경기도 청년 문화활동 지원사업"),
    normalizeProjectName("청년 문화활동 지원사업")
  );
  assert.equal(r.decision, "strong_similar");
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
  console.log(`\nProjectNameSimilarity tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
