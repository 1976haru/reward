// Data Source Map 정적 검증 (체크리스트 7).
//
// 실행: `npm run test:datasource-map` (tsx 로 실행).
// node:assert/strict 만 사용.
//
// 본 테스트는 다음을 검증한다:
//   1. docs/DATA_SOURCE_MAP_GOSIMS.md 가 존재한다
//   2. 문서에 필수 섹션 (1~9) 이 모두 있다
//   3. 문서가 공개 통계센터의 1차 조사 URL 4개를 모두 언급한다
//   4. 문서가 핵심 키워드 (공개자료 / 비공개 / 개인정보 / 자동 신고 금지 등) 를 포함한다
//   5. src/types/gosimsDataSource.ts 가 필수 타입과 상수를 export 한다
//   6. GOSIMS_SOURCE_ENTRIES 의 URL 이 문서의 URL 과 동기화되어 있다

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GOSIMS_DOWNLOAD_FORMATS,
  GOSIMS_RECIPIENT_TYPES,
  GOSIMS_RECORD_CATEGORIES,
  GOSIMS_SCOPE_CLASSIFICATION,
  GOSIMS_SOURCE_ENTRIES,
  GOSIMS_DATA_SOURCE_MAP_NOTICE,
  type GosimsDataRecord,
  type GosimsSourceEntry
} from "../src/types/gosimsDataSource.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

type TestFn = () => void | Promise<void>;
const tests: Array<{ name: string; fn: TestFn }> = [];
function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

let docContent = "";

// ---------- 문서 로드 ----------

async function loadDoc(): Promise<void> {
  const docPath = path.join(ROOT, "docs", "DATA_SOURCE_MAP_GOSIMS.md");
  docContent = await readFile(docPath, "utf8");
}

// ---------- 1. 필수 섹션 ----------

test("docs/DATA_SOURCE_MAP_GOSIMS.md 가 존재하고 비어있지 않다", () => {
  assert.ok(docContent.length > 1000, "문서가 너무 짧다 — 필수 섹션이 누락된 것으로 의심됨");
});

const REQUIRED_SECTIONS = [
  "## 1. 문서 목적",
  "## 2. 데이터소스 개요",
  "## 3. 1차 조사 대상 URL",
  "## 4. 공개 범위 분류",
  "## 5. 수집 가능 필드 후보",
  "## 6. 접근 방법",
  "## 7. 비공개·제한 데이터",
  "## 8. 수집기 스키마 초안",
  "## 9. 검증 / 운영 원칙"
];

for (const heading of REQUIRED_SECTIONS) {
  test(`문서에 "${heading}" 섹션이 존재한다`, () => {
    assert.ok(
      docContent.includes(heading),
      `섹션 누락: "${heading}" — DATA_SOURCE_MAP_GOSIMS.md 에 추가하세요`
    );
  });
}

// ---------- 2. 1차 조사 URL ----------

const REQUIRED_URLS = [
  "https://www.gosims.go.kr",
  "https://eduopn.gosims.go.kr",
  "https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001001QView.do",
  "https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001002QView.do",
  "https://eduopn.gosims.go.kr/opn/ih/ih002/getIH002002QView.do",
  "https://eduopn.gosims.go.kr/opn/ih/ih002/getIH002001QView.do",
  "https://www.losims.go.kr"
];

for (const url of REQUIRED_URLS) {
  test(`문서가 URL "${url}" 을 포함한다`, () => {
    assert.ok(docContent.includes(url), `URL 누락: ${url}`);
  });
}

// ---------- 3. 핵심 정책 키워드 ----------

const REQUIRED_KEYWORDS = [
  "공개자료",
  "비공개",
  "개인정보",
  "수집 제외",
  "로그인",
  "약관",
  "사실관계 점검",
  "검토 후보"
];

for (const kw of REQUIRED_KEYWORDS) {
  test(`문서가 정책 키워드 "${kw}" 를 포함한다`, () => {
    assert.ok(docContent.includes(kw), `키워드 누락: ${kw}`);
  });
}

// ---------- 4. 다운로드 포맷 / 카테고리 / 수급자 타입 언급 ----------

test("문서가 CSV / 엑셀 / TXT 다운로드 포맷을 언급한다", () => {
  assert.ok(/CSV/.test(docContent));
  assert.ok(/엑셀/.test(docContent));
  assert.ok(/TXT/.test(docContent));
});

test("문서가 보조사업·내역사업·보조사업자·집행·정산 카테고리를 모두 다룬다", () => {
  for (const cat of ["보조사업", "내역사업", "보조사업자", "집행", "정산"]) {
    assert.ok(docContent.includes(cat), `카테고리 누락: ${cat}`);
  }
});

test("문서가 안보 / 통일 등 공개 제한 사업을 명시한다", () => {
  assert.ok(/안보|통일/.test(docContent), "공개 제한 사업 언급이 없음");
  assert.ok(docContent.includes("수집 제외") || docContent.includes("제외"), "수집 제외 명시가 없음");
});

// ---------- 5. 스키마 타입 / 상수 export ----------

test("GosimsDataRecord 타입이 컴파일 시점에 존재한다 (타입 가드)", () => {
  // 컴파일 통과만으로 검증 — 런타임 검사는 import 자체로 충족
  const _rec: GosimsDataRecord = {
    sourceName: "e나라도움 공개 통계센터",
    sourceUrl: "https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001001QView.do",
    collectedAt: new Date().toISOString(),
    category: "subsidy_project",
    projectName: "예시 보조사업"
  };
  assert.equal(_rec.sourceName, "e나라도움 공개 통계센터");
});

test("GOSIMS_RECIPIENT_TYPES 가 필수 5개 값을 포함한다", () => {
  for (const t of ["institution", "organization", "corporation", "individual", "unknown"]) {
    assert.ok((GOSIMS_RECIPIENT_TYPES as readonly string[]).includes(t), `recipient type 누락: ${t}`);
  }
});

test("GOSIMS_DOWNLOAD_FORMATS 가 csv/excel/txt/html/api/unknown 을 포함한다", () => {
  for (const f of ["csv", "excel", "txt", "html", "api", "unknown"]) {
    assert.ok((GOSIMS_DOWNLOAD_FORMATS as readonly string[]).includes(f), `download format 누락: ${f}`);
  }
});

test("GOSIMS_RECORD_CATEGORIES 가 6+1 카테고리를 포함한다", () => {
  for (const c of [
    "subsidy_project",
    "sub_project",
    "subsidy_recipient",
    "project_recipient_link",
    "execution_status",
    "settlement",
    "unknown"
  ]) {
    assert.ok((GOSIMS_RECORD_CATEGORIES as readonly string[]).includes(c), `category 누락: ${c}`);
  }
});

test("GOSIMS_SCOPE_CLASSIFICATION 이 비공개(excluded) 항목을 1건 이상 포함한다", () => {
  const excluded = GOSIMS_SCOPE_CLASSIFICATION.filter((e) => e.collectability === "excluded");
  assert.ok(excluded.length >= 1, "공개 제한(excluded) 분류 항목이 없음");
});

test("GOSIMS_DATA_SOURCE_MAP_NOTICE 가 '공개자료 중심' / '로그인' / '약관' 또는 '대량' 표현을 포함한다", () => {
  assert.ok(GOSIMS_DATA_SOURCE_MAP_NOTICE.includes("공개자료"));
  assert.ok(/로그인|약관|대량|우회/.test(GOSIMS_DATA_SOURCE_MAP_NOTICE));
});

// ---------- 6. 문서와 스키마 동기화 ----------

test("GOSIMS_SOURCE_ENTRIES 의 모든 URL 이 문서에 등장한다 (역방향 동기화)", () => {
  for (const entry of GOSIMS_SOURCE_ENTRIES as readonly GosimsSourceEntry[]) {
    assert.ok(
      docContent.includes(entry.url),
      `스키마의 URL 이 문서에 없음 — 동기화 필요: ${entry.id} (${entry.url})`
    );
  }
});

test("GOSIMS_SOURCE_ENTRIES 에 P0 항목이 최소 4개 있다 (1차 수집 핵심)", () => {
  const p0 = GOSIMS_SOURCE_ENTRIES.filter((e) => e.priority === "P0");
  assert.ok(p0.length >= 4, `P0 항목이 너무 적음: ${p0.length}`);
});

test("GOSIMS_SOURCE_ENTRIES 에 보탬e (지방보조금) P1 참고 항목이 있다", () => {
  const losims = GOSIMS_SOURCE_ENTRIES.find((e) => e.url.includes("losims.go.kr"));
  assert.ok(losims, "보탬e (losims) 참조 항목이 없음");
  assert.equal(losims?.priority, "P1");
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

  console.log(`\nDataSourceMap tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) {
      console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    }
    process.exit(1);
  }
}

await main();
