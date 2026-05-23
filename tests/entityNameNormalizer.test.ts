// 기관명·단체명 정규화/병합 후보 정확도 테스트 (체크리스트 13 — 필수 작업 5).
//
// 실행: `npm run test:entity-normalizer` (tsx). node:assert/strict 만 사용.
// 모든 테스트 데이터는 가짜 기관명/단체명이며 실제 개인정보를 포함하지 않는다.
// 본 모듈은 "동일 기관 후보"를 만들 뿐 동일 기관을 확정하지 않는다.

import assert from "node:assert/strict";
import {
  calculateEntityNameSimilarity,
  classifyEntityMatch,
  compactEntityName,
  createEntityMatchCandidate,
  groupEntityCandidates,
  normalizeEntityName
} from "../src/normalizers/entityNameNormalizer.js";
import { convertRowToStandardRecord } from "../src/parsers/uploadSubsidyParser.js";

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const compactOf = (s: string) => normalizeEntityName(s).compactName;

// ---------- 1~8. 정규화 ----------

test("1. 주식회사/(주)/㈜ 표기가 같은 compactName 이 된다", () => {
  const a = compactOf("주식회사 행복나눔");
  const b = compactOf("(주)행복나눔");
  const c = compactOf("㈜ 행복나눔");
  assert.equal(a, "행복나눔");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("2. 사단법인 / (사) 표기가 같은 후보가 된다", () => {
  const cand = createEntityMatchCandidate("사단법인 함께하는마을", "(사)함께하는마을");
  assert.equal(cand.decision, "strong_match");
});

test("3. 재단법인 / (재) 표기가 같은 후보가 된다", () => {
  const cand = createEntityMatchCandidate("재단법인 미래복지재단", "(재)미래복지재단");
  assert.equal(cand.decision, "strong_match");
});

test("4. 사회복지법인 사랑복지회 / 사랑복지회 가 같은 후보가 된다", () => {
  const cand = createEntityMatchCandidate("사회복지법인 사랑복지회", "사랑복지회");
  assert.equal(cand.decision, "strong_match");
});

test("5. 행복 협동 조합 / 행복협동조합 이 같은 후보가 된다", () => {
  const cand = createEntityMatchCandidate("행복 협동 조합", "행복협동조합");
  assert.equal(cand.decision, "strong_match");
  assert.equal(compactOf("행복협동조합"), "행복");
});

test("6. 괄호 지부 표현은 기본 제거된다", () => {
  assert.equal(compactOf("행복나눔(수원지부)"), "행복나눔");
  const cand = createEntityMatchCandidate("행복나눔(수원지부)", "행복나눔(성남지부)");
  assert.equal(cand.decision, "strong_match");
});

test("7. 띄어쓰기와 특수문자 차이가 제거된다", () => {
  assert.equal(compactOf("행복-나눔"), "행복나눔");
  assert.equal(compactOf("행복_나눔"), "행복나눔");
  assert.equal(compactOf("행복 나눔"), "행복나눔");
});

test("8. 영문 대소문자 차이가 정규화된다", () => {
  assert.equal(compactOf("HappyCare"), "happycare");
  assert.equal(createEntityMatchCandidate("HappyCare", "happy care").decision, "strong_match");
});

// ---------- 9~11. 구분/제한 ----------

test("9. 서로 다른 기관은 no_match 또는 possible_match 이하로 분류된다", () => {
  const cand = createEntityMatchCandidate("행복나눔복지회", "미래도약장학재단");
  assert.ok(["no_match", "possible_match", "ambiguous"].includes(cand.decision));
  assert.notEqual(cand.decision, "strong_match");
  assert.notEqual(cand.decision, "likely_match");
});

test("10. 너무 짧은 이름은 ambiguous 처리된다", () => {
  const cand = createEntityMatchCandidate("가", "나");
  assert.equal(cand.decision, "ambiguous");
});

test("11. 대표자명·전화번호는 단독 매칭 기준으로 사용되지 않는다", () => {
  // 본 모듈은 이름만 입력으로 받는다. 같은 대표자/전화번호를 가정하더라도
  // 기관명이 다르면 동일 기관 후보가 되지 않는다.
  const cand = createEntityMatchCandidate("행복나눔복지회", "푸른솔영농조합법인");
  assert.notEqual(cand.decision, "strong_match");
  assert.notEqual(cand.decision, "likely_match");
});

// ---------- 12. 그룹화 ----------

test("12. groupEntityCandidates 가 동일 후보 그룹을 만든다", () => {
  const names = [
    "주식회사 행복나눔",
    "(주)행복나눔",
    "행복나눔(수원지부)",
    "미래도약장학재단",
    "재단법인 미래도약장학재단"
  ];
  const groups = groupEntityCandidates(names);
  const happy = groups.find((g) => g.representative.compactName === "행복나눔");
  assert.ok(happy, "행복나눔 그룹 없음");
  assert.ok(happy!.members.length >= 3, `행복나눔 그룹 멤버 부족: ${happy!.members.length}`);
  const future = groups.find((g) => g.representative.compactName === "미래도약장학재단");
  assert.ok(future && future.members.length >= 2, "미래도약장학재단 그룹 부족");
  // 모든 그룹은 사람 검토 대상
  assert.ok(groups.every((g) => g.reviewRequired === true));
});

// ---------- 13. 업로드 parser 연결 ----------

test("13. 업로드 parser 에서 recipientName 이 있으면 normalizedRecipientName 이 생성된다", () => {
  const rec = convertRowToStandardRecord(
    { 사업명: "마을 환경정비", 보조사업자: "주식회사 행복나눔", 보조금액: "1,000,000원" },
    { sourceFileName: "x.csv", sourceFileType: "csv" }
  );
  assert.equal(rec.recipientName, "주식회사 행복나눔");
  assert.equal(rec.normalizedRecipientName, "행복나눔");
});

// ---------- 14~15. 정확도 (20쌍 / 10쌍) ----------

const SAME_ENTITY_PAIRS: Array<[string, string]> = [
  ["주식회사 행복나눔", "(주)행복나눔"],
  ["㈜행복나눔", "행복나눔 주식회사"],
  ["사단법인 함께하는마을", "(사)함께하는마을"],
  ["재단법인 미래복지재단", "(재)미래복지재단"],
  ["사회복지법인 사랑복지회", "사랑복지회"],
  ["행복 협동 조합", "행복협동조합"],
  ["햇살영농조합법인", "햇살 영농조합법인"],
  ["농업회사법인 들꽃", "들꽃농업회사법인"],
  ["행복나눔(수원지부)", "행복나눔"],
  ["행복-나눔", "행복_나눔"],
  ["행복 나눔", "행복나눔"],
  ["HappyCare", "happy care"],
  ["미래교육센터", "미래 교육 센터"],
  ["새빛지역아동센터", "새빛 지역아동센터"],
  ["(주)green환경", "green환경 주식회사"],
  ["한울타리복지관", "한울타리 복지관"],
  ["늘봄돌봄협동조합", "늘봄돌봄 협동조합"],
  ["청춘나래사회적협동조합", "청춘나래 사회적 협동조합"],
  ["두드림장학재단", "두드림 장학재단"],
  ["우리마을방범대", "우리마을 방범대"],
  ["빛고을문화나눔", "빛고을 문화나눔"],
  ["참좋은의료복지사회적협동조합", "참좋은 의료복지 사회적협동조합"]
];

const DIFFERENT_ENTITY_PAIRS: Array<[string, string]> = [
  ["행복나눔복지회", "미래도약장학재단"],
  ["푸른솔영농조합법인", "한빛교육문화원"],
  ["동산지역아동센터", "서산노인복지관"],
  ["늘봄돌봄협동조합", "바다누리수산물직판장"],
  ["green환경연구소", "blue바다보존회"],
  ["참좋은의료재단", "든든한건설산업"],
  ["새싹어린이집", "한울타리경로당"],
  ["우리밀제과점", "코스모스화훼농원"],
  ["빛고을문화협회", "가온누리체육진흥회"],
  ["별빛마을도서관", "햇살가득나눔터"],
  ["강물스포츠클럽", "산들바람합창단"],
  ["미래도약장학재단", "행복나눔복지회"]
];

test("14. 동일 기관 표기 변형 22쌍 중 80% 이상이 strong/likely 다", () => {
  let good = 0;
  const misses: string[] = [];
  for (const [a, b] of SAME_ENTITY_PAIRS) {
    const d = createEntityMatchCandidate(a, b).decision;
    if (d === "strong_match" || d === "likely_match") good++;
    else misses.push(`[${a}|${b}]=${d}`);
  }
  const ratio = good / SAME_ENTITY_PAIRS.length;
  assert.ok(ratio >= 0.8, `동일 기관 후보화 비율 ${(ratio * 100).toFixed(0)}% (<80%). 미스: ${misses.join(", ")}`);
});

test("15. 다른 기관 쌍 12쌍 중 80% 이상이 no_match 또는 ambiguous 다", () => {
  let good = 0;
  const misses: string[] = [];
  for (const [a, b] of DIFFERENT_ENTITY_PAIRS) {
    const d = createEntityMatchCandidate(a, b).decision;
    if (d === "no_match" || d === "ambiguous") good++;
    else misses.push(`[${a}|${b}]=${d}`);
  }
  const ratio = good / DIFFERENT_ENTITY_PAIRS.length;
  assert.ok(ratio >= 0.8, `오병합 방지 비율 ${(ratio * 100).toFixed(0)}% (<80%). 미스: ${misses.join(", ")}`);
});

// ---------- 16~17. 안전 원칙 ----------

test("16. reviewRequired 는 항상 true 다 (strong_match 포함)", () => {
  for (const [a, b] of [...SAME_ENTITY_PAIRS, ...DIFFERENT_ENTITY_PAIRS]) {
    assert.equal(createEntityMatchCandidate(a, b).reviewRequired, true);
  }
});

test("17. 결과 사유에 '동일 기관 확정' 같은 단정 표현이 없다", () => {
  for (const [a, b] of SAME_ENTITY_PAIRS) {
    const cand = createEntityMatchCandidate(a, b);
    const joined = cand.reasons.join(" ");
    assert.ok(!joined.includes("동일 기관 확정"), `단정 표현 발견: ${joined}`);
    assert.ok(!joined.includes("자동 확정"), `단정 표현 발견: ${joined}`);
  }
});

// ---------- 보조: 유사도 함수 직접 검증 ----------

test("calculateEntityNameSimilarity: 동일 compact 는 1, 무관 이름은 낮다", () => {
  const eq = calculateEntityNameSimilarity(normalizeEntityName("행복나눔"), normalizeEntityName("(주)행복나눔"));
  assert.equal(eq, 1);
  const diff = calculateEntityNameSimilarity(
    normalizeEntityName("행복나눔복지회"),
    normalizeEntityName("미래도약장학재단")
  );
  assert.ok(diff < 0.72, `무관 이름 유사도 과대: ${diff}`);
});

test("classifyEntityMatch: compactName 완전 일치는 strong_match", () => {
  const r = classifyEntityMatch(normalizeEntityName("늘봄돌봄협동조합"), normalizeEntityName("늘봄돌봄 협동조합"));
  assert.equal(r.decision, "strong_match");
});

test("compactEntityName: 특수문자/공백 제거", () => {
  assert.equal(compactEntityName("행복 나눔-센터"), "행복나눔센터");
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
  console.log(`\nEntityNameNormalizer tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
