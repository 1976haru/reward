// 경기도 지자체 수집대상 정적 검증 (체크리스트 9).
//
// 실행: `npm run test:local-gov-targets` (tsx 로 실행).
// node:assert/strict 만 사용.
//
// 검증 항목:
//   1. docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md 가 존재하고 §1~§9 필수 섹션을 모두 포함한다
//   2. 문서가 32개 지자체 (광역 1 + 기초 31) 를 모두 언급한다
//   3. 문서가 정책 키워드 (재확인 필요 / 개인정보 / 로그인 / 비공개 / 자동 신고 등) 를 포함한다
//   4. src/types/localGovCollectionTarget.ts 가 32개 수집 대상을 export 한다
//   5. 각 수집 대상이 필수 필드를 가진다
//   6. 우선순위 분포: 경기도 광역 1건 P0 / 기초 P0 16건 / 기초 P1 15건
//   7. 자료 유형 / 키워드 세트 / 안내문 노출

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  countTargets,
  getTargetById,
  listTargetsByLevel,
  listTargetsByPriority,
  LOCAL_GOV_COLLECTION_NOTICE,
  LOCAL_GOV_DOCUMENT_TYPES,
  LOCAL_GOV_KEYWORD_SETS,
  LOCAL_GOV_PRIORITIES,
  LOCAL_GOV_PRIVACY_RISKS,
  LOCAL_GOV_REGION_LEVELS,
  LOCAL_GOV_STATUSES,
  LOCAL_GOV_TARGETS_GYEONGGI,
  type LocalGovCollectionTarget
} from "../src/types/localGovCollectionTarget.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

let docContent = "";

async function loadDoc(): Promise<void> {
  const docPath = path.join(ROOT, "docs", "LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md");
  docContent = await readFile(docPath, "utf8");
}

// ---------- 1. 필수 섹션 ----------

test("docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md 가 존재하고 비어있지 않다", () => {
  assert.ok(docContent.length > 3000, "문서가 너무 짧다 — 필수 섹션 누락 의심");
});

const REQUIRED_SECTIONS = [
  "## 1. 문서 목적",
  "## 2. 파일럿 선정 기준",
  "## 3. 수집 대상 지자체 목록",
  "## 4. 수집 대상 자료 유형",
  "## 5. 지자체별 접근 경로 후보",
  "## 6. 최근 2~3년 수집 범위",
  "## 7. 검색 키워드 세트",
  "## 8. 수집 제외 기준",
  "## 9. 지자체 수집 스키마 초안"
];

for (const heading of REQUIRED_SECTIONS) {
  test(`문서에 "${heading}" 섹션이 존재한다`, () => {
    assert.ok(docContent.includes(heading), `섹션 누락: "${heading}"`);
  });
}

// ---------- 2. 32개 지자체 이름이 모두 문서에 등장 ----------

const ALL_LOCAL_GOV_NAMES = [
  "경기도",
  "수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시",
  "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시",
  "광명시", "광주시", "군포시", "하남시", "오산시", "이천시", "안성시",
  "의왕시", "양주시", "구리시", "포천시", "여주시", "동두천시", "과천시",
  "양평군", "가평군", "연천군"
];

for (const name of ALL_LOCAL_GOV_NAMES) {
  test(`문서가 지자체명 "${name}" 을 포함한다`, () => {
    assert.ok(docContent.includes(name), `지자체명 누락: ${name}`);
  });
}

test("문서가 32개 지자체를 모두 언급한다 (광역 1 + 기초 31)", () => {
  assert.equal(ALL_LOCAL_GOV_NAMES.length, 32, `리스트 자체 길이가 32 가 아님: ${ALL_LOCAL_GOV_NAMES.length}`);
});

// ---------- 3. 경기도 공식 홈페이지 URL ----------

test("문서가 경기도 공식 홈페이지 URL https://www.gg.go.kr 을 포함한다", () => {
  assert.ok(docContent.includes("https://www.gg.go.kr"), "경기도 공식 홈페이지 URL 누락");
});

// ---------- 4. 정책 키워드 ----------

const REQUIRED_KEYWORDS = [
  "재확인 필요",
  "개인정보",
  "로그인",
  "비공개",
  "수집 제외",
  "공개자료",
  "자동",
  "사실관계 점검",
  "최근 2~3년"
];

for (const kw of REQUIRED_KEYWORDS) {
  test(`문서가 정책 키워드 "${kw}" 를 포함한다`, () => {
    assert.ok(docContent.includes(kw), `키워드 누락: ${kw}`);
  });
}

// ---------- 5. 자료 유형 / 키워드 그룹 등 분류 등장 ----------

test("문서가 자료 유형 8개를 모두 다룬다 (보조금 공고 / 선정 결과 / 정산 자료 / 검사·점검 자료 / 감사결과 / 환수·반환 자료 / 예산·결산 자료 / 입법예고·조례)", () => {
  for (const t of [
    "보조금 공고",
    "선정 결과",
    "정산 자료",
    "검사·점검 자료",
    "감사결과",
    "환수·반환 자료",
    "예산·결산 자료",
    "입법예고·조례"
  ]) {
    assert.ok(docContent.includes(t), `자료 유형 누락: ${t}`);
  }
});

test("문서가 키워드 그룹 7개를 다룬다 (보조금 기본 / 공모·선정 / 교부·집행 / 정산·반납 / 점검·검사 / 감사·환수 / 제도·기준)", () => {
  for (const g of [
    "보조금 기본",
    "공모·선정",
    "교부·집행",
    "정산·반납",
    "점검·검사",
    "감사·환수",
    "제도·기준"
  ]) {
    assert.ok(docContent.includes(g), `키워드 그룹 누락: ${g}`);
  }
});

// ---------- 6. 스키마: 32개 수집 대상 + 필수 필드 ----------

test("LOCAL_GOV_TARGETS_GYEONGGI 가 정확히 32개 (광역 1 + 기초 31) 이다", () => {
  const c = countTargets();
  assert.equal(c.total, 32, `총합 32가 아님: ${c.total}`);
  assert.equal(c.province, 1, `광역 1 아님: ${c.province}`);
  assert.equal(c.city + c.county, 31, `기초 31 아님: ${c.city + c.county}`);
});

test("32개 수집 대상 모두 필수 필드를 가진다 (id / regionLevel / provinceName / localGovName / priority / status / searchKeywords / targetDocumentTypes / collectionYearRange / privacyRisk)", () => {
  for (const t of LOCAL_GOV_TARGETS_GYEONGGI) {
    assert.ok(t.id && t.id.length > 0, `id 누락: ${JSON.stringify(t)}`);
    assert.ok((LOCAL_GOV_REGION_LEVELS as readonly string[]).includes(t.regionLevel), `regionLevel 잘못됨: ${t.id}`);
    assert.equal(t.provinceName, "경기도", `provinceName 잘못됨: ${t.id}`);
    assert.ok(t.localGovName && t.localGovName.length > 0, `localGovName 누락: ${t.id}`);
    assert.ok((LOCAL_GOV_PRIORITIES as readonly string[]).includes(t.priority), `priority 잘못됨: ${t.id}`);
    assert.ok((LOCAL_GOV_STATUSES as readonly string[]).includes(t.status), `status 잘못됨: ${t.id}`);
    assert.ok(t.searchKeywords.length > 0, `searchKeywords 빈 배열: ${t.id}`);
    assert.ok(t.targetDocumentTypes.length > 0, `targetDocumentTypes 빈 배열: ${t.id}`);
    for (const d of t.targetDocumentTypes) {
      assert.ok((LOCAL_GOV_DOCUMENT_TYPES as readonly string[]).includes(d), `documentType 잘못됨: ${t.id}/${d}`);
    }
    assert.equal(t.collectionYearRange.mode, "recent_2_to_3_years", `year range mode 잘못됨: ${t.id}`);
    assert.ok((LOCAL_GOV_PRIVACY_RISKS as readonly string[]).includes(t.privacyRisk), `privacyRisk 잘못됨: ${t.id}`);
  }
});

test("경기도 광역 항목이 정확히 1건이고 officialSiteUrl 이 https://www.gg.go.kr 이다", () => {
  const provs = listTargetsByLevel("province");
  assert.equal(provs.length, 1, `광역 항목 수: ${provs.length}`);
  assert.equal(provs[0].localGovName, "경기도");
  assert.equal(provs[0].officialSiteUrl, "https://www.gg.go.kr");
  assert.equal(provs[0].priority, "P0");
});

test("기초 지자체 P0 16건 / P1 15건 우선순위 분포", () => {
  const p0Cities = LOCAL_GOV_TARGETS_GYEONGGI.filter((t) => t.regionLevel !== "province" && t.priority === "P0");
  const p1Cities = LOCAL_GOV_TARGETS_GYEONGGI.filter((t) => t.regionLevel !== "province" && t.priority === "P1");
  assert.equal(p0Cities.length, 16, `기초 P0 16 아님: ${p0Cities.length}`);
  assert.equal(p1Cities.length, 15, `기초 P1 15 아님: ${p1Cities.length}`);
});

test("군(郡) 항목이 정확히 3건 (양평군 / 가평군 / 연천군)", () => {
  const counties = listTargetsByLevel("county");
  assert.equal(counties.length, 3, `군 항목 수: ${counties.length}`);
  const names = counties.map((c) => c.localGovName).sort();
  assert.deepEqual(names, ["가평군", "양평군", "연천군"]);
});

// ---------- 7. 헬퍼 ----------

test("getTargetById 가 정확한 항목을 반환한다", () => {
  const t = getTargetById("gg_province");
  assert.ok(t, "gg_province 항목 누락");
  assert.equal(t?.localGovName, "경기도");
  assert.equal(t?.officialSiteUrl, "https://www.gg.go.kr");
});

test("getTargetById 는 없는 ID 에 undefined 를 반환한다", () => {
  assert.equal(getTargetById("nonexistent_target"), undefined);
});

test("listTargetsByPriority(P0) 가 광역 1 + 기초 16 = 17건 반환", () => {
  const p0 = listTargetsByPriority("P0");
  assert.equal(p0.length, 17, `P0 합계 17 아님: ${p0.length}`);
});

// ---------- 8. 키워드 / 자료 유형 enum 노출 ----------

test("LOCAL_GOV_DOCUMENT_TYPES 가 8개 자료 유형을 포함한다", () => {
  for (const d of [
    "subsidy_notice",
    "selection_result",
    "settlement",
    "inspection",
    "audit_result",
    "recovery_return",
    "budget_settlement",
    "ordinance"
  ]) {
    assert.ok((LOCAL_GOV_DOCUMENT_TYPES as readonly string[]).includes(d), `documentType 누락: ${d}`);
  }
});

test("LOCAL_GOV_KEYWORD_SETS 가 7개 그룹을 가진다", () => {
  const keys = Object.keys(LOCAL_GOV_KEYWORD_SETS);
  assert.equal(keys.length, 7, `키워드 그룹 수: ${keys.length}`);
  for (const grp of ["보조금_기본", "공모_선정", "교부_집행", "정산_반납", "점검_검사", "감사_환수", "제도_기준"]) {
    assert.ok(keys.includes(grp), `키워드 그룹 누락: ${grp}`);
  }
});

test("LOCAL_GOV_COLLECTION_NOTICE 가 '수집 대상 선정' / '재확인' / '로그인' / '제외' / '자동' 표현을 포함한다", () => {
  assert.ok(LOCAL_GOV_COLLECTION_NOTICE.includes("수집 대상 선정"));
  assert.ok(LOCAL_GOV_COLLECTION_NOTICE.includes("재확인"));
  assert.ok(LOCAL_GOV_COLLECTION_NOTICE.includes("로그인"));
  assert.ok(LOCAL_GOV_COLLECTION_NOTICE.includes("제외"));
  assert.ok(LOCAL_GOV_COLLECTION_NOTICE.includes("자동"));
});

test("LocalGovCollectionTarget 타입이 컴파일 시점에 존재한다 (타입 가드)", () => {
  const _sample: LocalGovCollectionTarget = {
    id: "test_sample",
    regionLevel: "city",
    provinceName: "경기도",
    localGovName: "테스트시",
    priority: "P2",
    status: "candidate",
    searchKeywords: ["보조금"],
    targetDocumentTypes: ["subsidy_notice"],
    collectionYearRange: { mode: "recent_2_to_3_years", note: "테스트" },
    privacyRisk: "low"
  };
  assert.equal(_sample.id, "test_sample");
});

// ---------- 러너 ----------

async function main() {
  await loadDoc();
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

  console.log(`\nLocalGovTargets tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) {
      console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    }
    process.exit(1);
  }
}

await main();
