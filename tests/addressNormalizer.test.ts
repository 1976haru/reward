// 주소 정규화/동일 주소 후보 매칭 정확도 테스트 (체크리스트 14 — 필수 작업 5).
//
// 실행: `npm run test:address-normalizer` (tsx). node:assert/strict 만 사용.
// 모든 테스트 데이터는 가짜 주소이며 실제 개인 주거지/개인정보를 포함하지 않는다.
// 본 모듈은 "동일 주소 후보"를 만들 뿐 동일 주소를 확정하지 않는다.

import assert from "node:assert/strict";
import {
  classifyAddressMatch,
  createAddressMatchCandidate,
  groupAddressCandidates,
  normalizeAddress
} from "../src/normalizers/addressNormalizer.js";

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

const keyOf = (s: string) => normalizeAddress(s).normalizedAddressKey;

// ---------- 1~10. 정규화 ----------

test("1. 경기/경기도 약칭이 통합된다", () => {
  assert.equal(keyOf("경기 수원시 팔달구 효원로 1"), keyOf("경기도 수원시 팔달구 효원로 1"));
  assert.equal(normalizeAddress("경기 수원시 팔달구 효원로 1").sido, "경기도");
});

test("2. 도로명 주소 띄어쓰기 차이가 통합된다", () => {
  assert.equal(keyOf("경기도 수원시 팔달구 효원 로 1"), keyOf("경기도 수원시 팔달구 효원로 1"));
});

test("3. 지번 주소 띄어쓰기 차이가 통합된다", () => {
  assert.equal(keyOf("경기도 성남시 분당구 정자동 178-1"), keyOf("경기도 성남시 분당구 정자동 178 - 1"));
});

test("4. 괄호 메모가 제거된다", () => {
  assert.equal(
    keyOf("경기도 수원시 팔달구 효원로 1 (인계동)"),
    keyOf("경기도 수원시 팔달구 효원로 1")
  );
});

test("5. 우편번호가 제거된다", () => {
  const n = normalizeAddress("16444 경기도 수원시 팔달구 효원로 1");
  assert.equal(n.zipCode, "16444");
  assert.equal(n.normalizedAddressKey, keyOf("경기도 수원시 팔달구 효원로 1"));
});

test("6. 층·호수·동호수 상세주소가 removedDetailTokens 로 분리되고 key 에 남지 않는다", () => {
  const n = normalizeAddress("경기도 수원시 인계동 1115-1 101동 202호");
  assert.ok(n.removedDetailTokens.length >= 1, "상세주소 토큰 미분리");
  assert.ok(!n.normalizedAddressKey.includes("202"), "key 에 호수가 남음");
  assert.ok(!n.normalizedAddressKey.includes("101동"), "key 에 동이 남음");
  // 3층/201호도 분리
  const n2 = normalizeAddress("서울 강남구 테헤란로 123 4층 501호");
  assert.ok(n2.removedDetailTokens.some((t) => t.includes("층")));
  assert.ok(!n2.normalizedAddressKey.includes("501"));
});

test("7. 특수문자 차이가 정규화된다", () => {
  assert.equal(keyOf("경기도 수원시 팔달구 효원로-1"), keyOf("경기도 수원시 팔달구 효원로 1"));
});

test("8. 전각 숫자가 반각 숫자로 정규화된다", () => {
  assert.equal(keyOf("경기도 수원시 팔달구 효원로 １"), keyOf("경기도 수원시 팔달구 효원로 1"));
});

test("9. normalizedAddressKey 가 생성된다", () => {
  const n = normalizeAddress("경기도 수원시 팔달구 효원로 1");
  assert.ok(n.normalizedAddressKey.length > 0);
  assert.equal(n.normalizedAddressKey, "경기도수원시팔달구효원로1");
});

test("10. addressRegionKey 가 생성된다 (기본번지 미포함)", () => {
  const n = normalizeAddress("경기도 수원시 팔달구 효원로 1");
  assert.equal(n.addressRegionKey, "경기도수원시팔달구효원로");
  assert.ok(!n.addressRegionKey.includes("1"));
});

// ---------- 11~13. 매칭 ----------

test("11. 동일 주소 변형은 strong_match 또는 likely_match 가 된다", () => {
  for (const [a, b] of [
    ["경기 수원시 팔달구 효원로 1", "경기도 수원시 팔달구 효원로 1 (인계동)"],
    ["경기도 수원시 팔달구 효원로 1 3층", "경기도 수원시 팔달구 효원로-1"]
  ] as Array<[string, string]>) {
    const d = createAddressMatchCandidate(a, b).decision;
    assert.ok(d === "strong_match" || d === "likely_match", `${a} vs ${b} = ${d}`);
  }
});

test("12. 다른 시군구 주소는 no_match 가 된다", () => {
  const cand = createAddressMatchCandidate(
    "경기도 수원시 팔달구 효원로 1",
    "경기도 성남시 분당구 정자로 5"
  );
  assert.equal(cand.decision, "no_match");
});

test("13. 시군구만 있는 주소는 ambiguous 가 된다", () => {
  const cand = createAddressMatchCandidate("경기도 수원시", "경기도 수원시");
  assert.equal(cand.decision, "ambiguous");
});

// ---------- 14. 마스킹 ----------

test("14. 개인정보처럼 보이는 source address 는 sanitizedOriginalAddress 에서 마스킹된다", () => {
  // 합성 PII (전화번호) 포함 — 결과에 원문으로 남으면 안 됨
  const n = normalizeAddress("경기도 수원시 팔달구 효원로 1 (담당 010-1234-5678)");
  assert.ok(!n.sanitizedOriginalAddress.includes("010-1234-5678"), "전화번호 원문이 남음");
  assert.ok(!n.normalizedAddressKey.includes("5678"), "key 에 연락처가 남음");
});

// ---------- 15. 그룹 ----------

test("15. groupAddressCandidates 가 동일 주소 후보 그룹을 만든다", () => {
  const addrs = [
    "경기 수원시 팔달구 효원로 1",
    "경기도 수원시 팔달구 효원로 1 (인계동)",
    "경기도 수원시 팔달구 효원로 1 5층",
    "경기도 성남시 분당구 정자로 5",
    "경기도 성남시 분당구 정자로 5 201호"
  ];
  const groups = groupAddressCandidates(addrs);
  const g1 = groups.find((g) => g.representative.normalizedAddressKey === "경기도수원시팔달구효원로1");
  assert.ok(g1 && g1.members.length >= 3, `효원로 그룹 부족: ${g1?.members.length}`);
  const g2 = groups.find((g) => g.representative.normalizedAddressKey === "경기도성남시분당구정자로5");
  assert.ok(g2 && g2.members.length >= 2, "정자로 그룹 부족");
  assert.ok(groups.every((g) => g.reviewRequired === true));
});

// ---------- 16~17. 정확도 ----------

const SAME_ADDRESS_PAIRS: Array<[string, string]> = [
  ["경기 수원시 팔달구 효원로 1", "경기도 수원시 팔달구 효원로 1"],
  ["경기도 수원시 팔달구 효원 로 1", "경기도 수원시 팔달구 효원로 1"],
  ["경기도 수원시 팔달구 효원로-1", "경기도 수원시 팔달구 효원로 1"],
  ["경기도 수원시 팔달구 효원로 1 (인계동)", "경기도 수원시 팔달구 효원로 1"],
  ["16444 경기도 수원시 팔달구 효원로 1", "경기도 수원시 팔달구 효원로 1"],
  ["경기도 수원시 팔달구 효원로 1 3층", "경기도 수원시 팔달구 효원로 1"],
  ["경기도 수원시 팔달구 효원로 1 201호", "경기도 수원시 팔달구 효원로 1"],
  ["경기도 수원시 팔달구 효원로 １", "경기도 수원시 팔달구 효원로 1"],
  ["서울 강남구 테헤란로 123", "서울특별시 강남구 테헤란로 123"],
  ["서울특별시 강남구 테헤란로 123 4층", "서울특별시 강남구 테헤란로 123"],
  ["부산 해운대구 센텀로 30", "부산광역시 해운대구 센텀로 30"],
  ["인천 연수구 송도과학로 12", "인천광역시 연수구 송도과학로 12"],
  ["경기도 성남시 분당구 정자동 178-1", "경기도 성남시 분당구 정자동 178 - 1"],
  ["경기도 고양시 일산동구 중앙로 100", "경기 고양시 일산동구 중앙로 100"],
  ["대전 유성구 대학로 99", "대전광역시 유성구 대학로 99"],
  ["경기도 용인시 기흥구 동백로 50 2층", "경기도 용인시 기흥구 동백로 50"],
  ["광주 서구 상무대로 700", "광주광역시 서구 상무대로 700"],
  ["경기도 안양시 동안구 시민대로 200 (관양동)", "경기도 안양시 동안구 시민대로 200"],
  ["충남 천안시 서북구 번영로 156", "충청남도 천안시 서북구 번영로 156"],
  ["경기도 수원시 팔달구 매산로1가 1-1", "경기도 수원시 팔달구 매산로1가 1 - 1"],
  ["전북 전주시 완산구 효자로 225", "전북특별자치도 전주시 완산구 효자로 225"],
  ["경기도 부천시 원미구 길주로 210 101동 202호", "경기도 부천시 원미구 길주로 210"]
];

const DIFFERENT_ADDRESS_PAIRS: Array<[string, string]> = [
  ["경기도 수원시 팔달구 효원로 1", "경기도 성남시 분당구 정자로 5"],
  ["서울특별시 강남구 테헤란로 123", "서울특별시 종로구 세종대로 100"],
  ["부산광역시 해운대구 센텀로 30", "대구광역시 수성구 동대구로 40"],
  ["경기도 고양시 일산동구 중앙로 100", "경기도 용인시 기흥구 동백로 50"],
  ["인천광역시 연수구 송도과학로 12", "광주광역시 서구 상무대로 700"],
  ["경기도 안양시 동안구 시민대로 200", "경기도 안산시 단원구 광덕대로 30"],
  ["대전광역시 유성구 대학로 99", "울산광역시 남구 삼산로 80"],
  ["충청남도 천안시 서북구 번영로 156", "전라남도 여수시 학동로 22"],
  ["경기도 수원시 팔달구 효원로 1", "경기도 수원시 영통구 광교로 145"],
  ["전북특별자치도 전주시 완산구 효자로 225", "경상북도 포항시 남구 중앙로 9"],
  ["서울특별시 마포구 월드컵로 240", "부산광역시 부산진구 중앙대로 700"],
  ["경기도 의정부시 시민로 1", "강원특별자치도 춘천시 중앙로 1"]
];

test("16. 동일 주소 표기 변형 22쌍 중 80% 이상이 strong/likely 다", () => {
  let good = 0;
  const misses: string[] = [];
  for (const [a, b] of SAME_ADDRESS_PAIRS) {
    const d = createAddressMatchCandidate(a, b).decision;
    if (d === "strong_match" || d === "likely_match") good++;
    else misses.push(`[${a}|${b}]=${d}`);
  }
  const ratio = good / SAME_ADDRESS_PAIRS.length;
  assert.ok(ratio >= 0.8, `동일 주소 후보화 비율 ${(ratio * 100).toFixed(0)}% (<80%). 미스: ${misses.join(", ")}`);
});

test("17. 다른 주소 쌍 12쌍 중 80% 이상이 no_match 또는 ambiguous 다", () => {
  let good = 0;
  const misses: string[] = [];
  for (const [a, b] of DIFFERENT_ADDRESS_PAIRS) {
    const d = createAddressMatchCandidate(a, b).decision;
    if (d === "no_match" || d === "ambiguous") good++;
    else misses.push(`[${a}|${b}]=${d}`);
  }
  const ratio = good / DIFFERENT_ADDRESS_PAIRS.length;
  assert.ok(ratio >= 0.8, `오매칭 방지 비율 ${(ratio * 100).toFixed(0)}% (<80%). 미스: ${misses.join(", ")}`);
});

// ---------- 18~19. 안전 원칙 ----------

test("18. reviewRequired 는 항상 true 다", () => {
  for (const [a, b] of [...SAME_ADDRESS_PAIRS, ...DIFFERENT_ADDRESS_PAIRS]) {
    assert.equal(createAddressMatchCandidate(a, b).reviewRequired, true);
  }
});

test("19. 결과 사유에 '동일 주소 확정' 같은 단정 표현이 없다", () => {
  for (const [a, b] of SAME_ADDRESS_PAIRS) {
    const joined = createAddressMatchCandidate(a, b).reasons.join(" ");
    assert.ok(!joined.includes("동일 주소 확정"), `단정 표현 발견: ${joined}`);
    assert.ok(!joined.includes("자동 확정"), `단정 표현 발견: ${joined}`);
  }
});

// ---------- 보조 ----------

test("classifyAddressMatch: normalizedAddressKey 완전 일치는 strong_match", () => {
  const r = classifyAddressMatch(
    normalizeAddress("경기도 수원시 팔달구 효원로 1 3층"),
    normalizeAddress("경기 수원시 팔달구 효원로 1")
  );
  assert.equal(r.decision, "strong_match");
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
  console.log(`\nAddressNormalizer tests: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    process.exit(1);
  }
}

await main();
