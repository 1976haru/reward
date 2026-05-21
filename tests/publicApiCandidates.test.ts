// Public Data Portal API Candidate Map 정적 검증 (체크리스트 8).
//
// 실행: `npm run test:public-api-candidates` (tsx 로 실행).
// node:assert/strict 만 사용.
//
// 검증 항목:
//   1. docs/DATA_SOURCE_MAP_PUBLIC_API.md 가 존재하고 §1~§9 필수 섹션을 모두 포함한다
//   2. 문서가 우선 확인 후보 4개의 URL 을 모두 포함한다
//   3. 문서가 정책 키워드 (재확인 필요 / 활용신청 / 인증키 / 트래픽 / 개인정보 / 비공개 / 마스킹 / 공개자료 / 자동 신고 등) 를 포함한다
//   4. src/types/publicApiCandidate.ts 가 5개 이상의 후보를 export 한다
//   5. 각 후보가 필수 필드를 가진다
//   6. 후보 URL 이 문서에 등장한다 (역방향 동기화)
//   7. 관련성 / API 유형 / 인증 / 접근 상태 / 우선순위 enum 값이 노출된다

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCandidateById,
  listCandidatesByPriority,
  listCandidatesByRelevance,
  PUBLIC_API_ACCESS_STATUS,
  PUBLIC_API_AUTH_REQUIRED,
  PUBLIC_API_CANDIDATES,
  PUBLIC_API_CANDIDATES_NOTICE,
  PUBLIC_API_DATA_FORMATS,
  PUBLIC_API_PRIORITIES,
  PUBLIC_API_PRIVACY_RISK,
  PUBLIC_API_RELEVANCE_TAGS,
  PUBLIC_API_TYPES,
  type PublicApiCandidate
} from "../src/types/publicApiCandidate.js";

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
  const docPath = path.join(ROOT, "docs", "DATA_SOURCE_MAP_PUBLIC_API.md");
  docContent = await readFile(docPath, "utf8");
}

// ---------- 1. 필수 섹션 ----------

test("docs/DATA_SOURCE_MAP_PUBLIC_API.md 가 존재하고 비어있지 않다", () => {
  assert.ok(docContent.length > 2000, "문서가 너무 짧다 — 필수 섹션 누락 의심");
});

const REQUIRED_SECTIONS = [
  "## 1. 문서 목적",
  "## 2. 조사 기준",
  "## 3. API 후보 요약표",
  "## 4. API별 상세 조사표",
  "## 5. 관련성 분류 기준",
  "## 6. 주요 필드 후보",
  "## 7. 접근 방법",
  "## 8. 비공개·제한 데이터 및 개인정보 제한",
  "## 9. 수집기 스키마 초안 / 검증·운영 원칙"
];

for (const heading of REQUIRED_SECTIONS) {
  test(`문서에 "${heading}" 섹션이 존재한다`, () => {
    assert.ok(docContent.includes(heading), `섹션 누락: "${heading}"`);
  });
}

// ---------- 2. 우선 확인 후보 URL ----------

const REQUIRED_URLS = [
  "https://www.data.go.kr/data/15097584/openapi.do",
  "https://www.data.go.kr/data/15126793/openapi.do",
  "https://www.data.go.kr/data/15138713/openapi.do",
  "https://www.data.go.kr/data/15058377/openapi.do"
];

for (const url of REQUIRED_URLS) {
  test(`문서가 우선 확인 후보 URL "${url}" 을 포함한다`, () => {
    assert.ok(docContent.includes(url), `URL 누락: ${url}`);
  });
}

// ---------- 3. 정책 키워드 ----------

const REQUIRED_KEYWORDS = [
  "재확인 필요",
  "활용신청",
  "인증키",
  "트래픽",
  "개인정보",
  "비공개",
  "마스킹",
  "공개자료",
  "자동 신고"
];

for (const kw of REQUIRED_KEYWORDS) {
  test(`문서가 정책 키워드 "${kw}" 를 포함한다`, () => {
    assert.ok(docContent.includes(kw), `키워드 누락: ${kw}`);
  });
}

// ---------- 4. 5개 이상 후보 + 필수 필드 ----------

test("PUBLIC_API_CANDIDATES 가 최소 5개 이상이다", () => {
  assert.ok(
    PUBLIC_API_CANDIDATES.length >= 5,
    `후보 부족: ${PUBLIC_API_CANDIDATES.length}건 (최소 5건 필요)`
  );
});

test("각 후보가 필수 필드를 가진다 (apiId / apiName / providerName / dataGoKrUrl / apiType / dataFormat / authRequired / relevance / keyFields / purpose / privacyRisk / accessStatus / priority)", () => {
  for (const c of PUBLIC_API_CANDIDATES) {
    assert.ok(c.apiId && c.apiId.length > 0, `apiId 누락: ${JSON.stringify(c)}`);
    assert.ok(c.apiName && c.apiName.length > 0, `apiName 누락: ${c.apiId}`);
    assert.ok(c.providerName && c.providerName.length > 0, `providerName 누락: ${c.apiId}`);
    assert.ok(c.dataGoKrUrl.startsWith("https://www.data.go.kr"), `dataGoKrUrl 형식 오류: ${c.apiId}`);
    assert.ok((PUBLIC_API_TYPES as readonly string[]).includes(c.apiType), `apiType 잘못됨: ${c.apiId}`);
    assert.ok(c.dataFormat.length > 0, `dataFormat 빈 배열: ${c.apiId}`);
    for (const f of c.dataFormat) {
      assert.ok((PUBLIC_API_DATA_FORMATS as readonly string[]).includes(f), `dataFormat 값 잘못됨: ${c.apiId}/${f}`);
    }
    assert.ok((PUBLIC_API_AUTH_REQUIRED as readonly string[]).includes(c.authRequired), `authRequired 잘못됨: ${c.apiId}`);
    assert.ok(c.relevance.length > 0, `relevance 빈 배열: ${c.apiId}`);
    for (const r of c.relevance) {
      assert.ok((PUBLIC_API_RELEVANCE_TAGS as readonly string[]).includes(r), `relevance 값 잘못됨: ${c.apiId}/${r}`);
    }
    assert.ok(c.keyFields.length > 0, `keyFields 빈 배열: ${c.apiId}`);
    assert.ok(c.purpose.length > 0, `purpose 빈 배열: ${c.apiId}`);
    assert.ok((PUBLIC_API_PRIVACY_RISK as readonly string[]).includes(c.privacyRisk), `privacyRisk 잘못됨: ${c.apiId}`);
    assert.ok((PUBLIC_API_ACCESS_STATUS as readonly string[]).includes(c.accessStatus), `accessStatus 잘못됨: ${c.apiId}`);
    assert.ok((PUBLIC_API_PRIORITIES as readonly string[]).includes(c.priority), `priority 잘못됨: ${c.apiId}`);
  }
});

test("국고보조금 / 지방보조금 / 환수 / 감사·점검 관련성 후보가 각각 1건 이상 있다", () => {
  assert.ok(listCandidatesByRelevance("국고보조금").length >= 1, "국고보조금 후보 부족");
  assert.ok(listCandidatesByRelevance("지방보조금").length >= 1, "지방보조금 후보 부족");
  assert.ok(listCandidatesByRelevance("환수").length >= 1, "환수 후보 부족");
  assert.ok(listCandidatesByRelevance("감사·점검").length >= 1, "감사·점검 후보 부족");
});

test("P0 우선순위 후보가 최소 2건 이상이다", () => {
  const p0 = listCandidatesByPriority("P0");
  assert.ok(p0.length >= 2, `P0 부족: ${p0.length}`);
});

// ---------- 5. 문서 ↔ 스키마 동기화 ----------

test("PUBLIC_API_CANDIDATES 의 모든 URL 이 문서에 등장한다", () => {
  for (const c of PUBLIC_API_CANDIDATES) {
    assert.ok(docContent.includes(c.dataGoKrUrl), `스키마 URL 이 문서에 없음: ${c.apiId} (${c.dataGoKrUrl})`);
  }
});

test("PUBLIC_API_CANDIDATES 의 모든 apiName 이 문서에 등장한다", () => {
  for (const c of PUBLIC_API_CANDIDATES) {
    // apiName 의 앞부분(예: "재정경제부_국고보조금 정보") 이 문서에 있는지 확인
    const namePart = c.apiName.split("(")[0].trim();
    assert.ok(docContent.includes(namePart), `apiName 이 문서에 없음: ${c.apiId} (${namePart})`);
  }
});

// ---------- 6. 안내문 및 헬퍼 ----------

test("PUBLIC_API_CANDIDATES_NOTICE 가 '활용 가능성 검토 대상' / '재확인' / '로그인' / '마스킹' 표현을 포함한다", () => {
  assert.ok(PUBLIC_API_CANDIDATES_NOTICE.includes("활용 가능성 검토 대상"));
  assert.ok(PUBLIC_API_CANDIDATES_NOTICE.includes("재확인"));
  assert.ok(PUBLIC_API_CANDIDATES_NOTICE.includes("로그인"));
  assert.ok(PUBLIC_API_CANDIDATES_NOTICE.includes("마스킹"));
});

test("getCandidateById 가 정확한 후보를 반환한다", () => {
  const c = getCandidateById("moef_subsidy_info");
  assert.ok(c, "moef_subsidy_info 후보를 찾을 수 없음");
  assert.equal(c?.apiName, "재정경제부_국고보조금 정보");
});

test("getCandidateById 는 없는 ID 에 undefined 를 반환한다", () => {
  assert.equal(getCandidateById("nonexistent_api"), undefined);
});

// ---------- 7. 카테고리 / enum 노출 ----------

test("PUBLIC_API_RELEVANCE_TAGS 가 8개 관련성 분류를 포함한다", () => {
  for (const tag of [
    "국고보조금",
    "지방보조금",
    "기관별 보조사업",
    "집행",
    "정산",
    "환수",
    "감사·점검",
    "공공재정 일반"
  ]) {
    assert.ok((PUBLIC_API_RELEVANCE_TAGS as readonly string[]).includes(tag), `relevance 누락: ${tag}`);
  }
});

test("PUBLIC_API_TYPES / DATA_FORMATS / AUTH_REQUIRED / PRIVACY_RISK / ACCESS_STATUS / PRIORITIES 가 모두 노출된다", () => {
  assert.ok(PUBLIC_API_TYPES.length >= 4);
  assert.ok(PUBLIC_API_DATA_FORMATS.length >= 4);
  assert.ok(PUBLIC_API_AUTH_REQUIRED.length === 3);
  assert.ok(PUBLIC_API_PRIVACY_RISK.length === 4);
  assert.ok(PUBLIC_API_ACCESS_STATUS.length === 4);
  assert.ok(PUBLIC_API_PRIORITIES.length === 3);
});

test("PublicApiCandidate 타입이 컴파일 시점에 존재한다 (타입 가드)", () => {
  const _sample: PublicApiCandidate = {
    apiId: "test_api",
    apiName: "테스트",
    providerName: "테스트 기관",
    dataGoKrUrl: "https://www.data.go.kr/data/0/openapi.do",
    apiType: "unknown",
    dataFormat: ["unknown"],
    authRequired: "unknown",
    relevance: ["공공재정 일반"],
    keyFields: ["sourceUrl"],
    purpose: ["테스트"],
    privacyRisk: "unknown",
    accessStatus: "candidate",
    priority: "P2"
  };
  assert.equal(_sample.apiId, "test_api");
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

  console.log(`\nPublicApiCandidates tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) {
      console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    }
    process.exit(1);
  }
}

await main();
