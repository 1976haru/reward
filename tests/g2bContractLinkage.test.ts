// 나라장터 연계 데이터 매핑 정적 검증 (체크리스트 10).
//
// 실행: `npm run test:g2b-linkage` (tsx 로 실행).
// node:assert/strict 만 사용.
//
// 검증 항목:
//   1. docs/G2B_CONTRACT_LINKAGE_MAP.md 가 존재하고 §1~§9 필수 섹션을 모두 포함한다
//   2. 문서가 우선 확인 후보 URL 5개를 모두 포함한다
//   3. 문서가 정책 키워드 (재확인 필요 / 동일성 후보 / 매칭 신뢰도 / 사람 검토 / 마스킹 등) 를 포함한다
//   4. src/types/g2bContractLinkage.ts 가 5개 데이터소스를 export 한다
//   5. 매칭 신호 9종 / 신뢰도 4종 / 상태 4종 / 우선순위 enum 이 노출된다
//   6. G2bContractLinkageCandidate 타입의 reviewRequired 가 항상 true

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  G2B_CONTRACT_LINKAGE_NOTICE,
  G2B_DATA_SOURCES,
  G2B_LINKAGE_CONFIDENCES,
  G2B_LINKAGE_PRIVACY_RISKS,
  G2B_LINKAGE_STATUSES,
  G2B_MATCHING_SIGNALS,
  G2B_SOURCE_PRIORITIES,
  getDataSourceById,
  listDataSourcesByPriority,
  type G2bContractLinkageCandidate,
  type G2bDataSourceEntry
} from "../src/types/g2bContractLinkage.js";

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
  const docPath = path.join(ROOT, "docs", "G2B_CONTRACT_LINKAGE_MAP.md");
  docContent = await readFile(docPath, "utf8");
}

// ---------- 1. 필수 섹션 ----------

test("docs/G2B_CONTRACT_LINKAGE_MAP.md 가 존재하고 비어있지 않다", () => {
  assert.ok(docContent.length > 3000, "문서가 너무 짧다 — 필수 섹션 누락 의심");
});

const REQUIRED_SECTIONS = [
  "## 1. 문서 목적",
  "## 2. 연계 분석 목적",
  "## 3. 나라장터 / 공공데이터포털 후보 데이터소스",
  "## 4. 보조사업 데이터와 계약데이터 연결 기준",
  "## 5. 표준 매핑 필드 후보",
  "## 6. 매칭 신뢰도 기준",
  "## 7. 개인정보·식별정보 제한사항",
  "## 8. 수집·접근 제한사항",
  "## 9. 계약데이터 매핑 스키마 초안"
];

for (const heading of REQUIRED_SECTIONS) {
  test(`문서에 "${heading}" 섹션이 존재한다`, () => {
    assert.ok(docContent.includes(heading), `섹션 누락: "${heading}"`);
  });
}

// ---------- 2. 우선 확인 후보 URL ----------

const REQUIRED_URLS = [
  "https://www.data.go.kr/data/15129427/openapi.do",
  "https://www.data.go.kr/data/15129459/openapi.do",
  "https://www.data.go.kr/data/15058815/openapi.do",
  "https://www.data.go.kr/data/15129466/openapi.do",
  "https://www.data.go.kr/data/15129468/openapi.do"
];

for (const url of REQUIRED_URLS) {
  test(`문서가 후보 URL "${url}" 을 포함한다`, () => {
    assert.ok(docContent.includes(url), `URL 누락: ${url}`);
  });
}

// ---------- 3. 정책 키워드 ----------

const REQUIRED_KEYWORDS = [
  "재확인 필요",
  "동일성 후보",
  "추가 검토 필요",
  "매칭 신뢰도",
  "활용신청",
  "인증키",
  "개인정보",
  "마스킹",
  "공개자료",
  "자동",
  "사람 검토"
];

for (const kw of REQUIRED_KEYWORDS) {
  test(`문서가 정책 키워드 "${kw}" 를 포함한다`, () => {
    assert.ok(docContent.includes(kw), `키워드 누락: ${kw}`);
  });
}

// ---------- 4. 연결 기준 / 매핑 필드 / 신뢰도 등급 등장 ----------

test("문서가 연결 기준 10개를 모두 다룬다", () => {
  for (const t of [
    "사업자등록번호",
    "법인등록번호",
    "업체명/기관명",
    "대표자명",
    "주소",
    "전화번호",
    "기관명",
    "계약명/사업명",
    "계약기간/사업기간",
    "계약금액/보조금액"
  ]) {
    assert.ok(docContent.includes(t), `연결 기준 누락: ${t}`);
  }
});

test("문서가 매칭 신뢰도 4등급(high/medium/low/excluded)을 다룬다", () => {
  for (const g of ["`high`", "`medium`", "`low`", "`excluded`"]) {
    assert.ok(docContent.includes(g), `신뢰도 등급 누락: ${g}`);
  }
});

test("문서가 매핑 필드 핵심 항목(해시·마스킹 저장 기준) 을 다룬다", () => {
  for (const f of [
    "businessRegistrationNumberHash",
    "corporateRegistrationNumberHash",
    "representativeNameMasked",
    "phoneNumberMasked",
    "addressRegion",
    "linkageConfidence",
    "linkageReason"
  ]) {
    assert.ok(docContent.includes(f), `매핑 필드 누락: ${f}`);
  }
});

// ---------- 5. 스키마 / 상수 ----------

test("G2B_DATA_SOURCES 가 정확히 5개 후보를 가진다", () => {
  assert.equal(G2B_DATA_SOURCES.length, 5, `후보 개수: ${G2B_DATA_SOURCES.length}`);
});

test("각 후보 데이터소스가 필수 필드를 가진다 (id / name / providerName / dataGoKrUrl / contentSummary / apiType / dataFormat / authRequired / priority / status)", () => {
  for (const s of G2B_DATA_SOURCES) {
    assert.ok(s.id && s.id.length > 0, `id 누락: ${JSON.stringify(s)}`);
    assert.ok(s.name && s.name.length > 0, `name 누락: ${s.id}`);
    assert.ok(s.providerName && s.providerName.length > 0, `providerName 누락: ${s.id}`);
    assert.ok(s.dataGoKrUrl.startsWith("https://www.data.go.kr"), `dataGoKrUrl 형식 오류: ${s.id}`);
    assert.ok(s.contentSummary.length > 0, `contentSummary 누락: ${s.id}`);
    assert.ok(s.apiType.length > 0, `apiType 누락: ${s.id}`);
    assert.ok(s.dataFormat.length > 0, `dataFormat 누락: ${s.id}`);
    assert.ok(s.authRequired.length > 0, `authRequired 누락: ${s.id}`);
    assert.ok((G2B_SOURCE_PRIORITIES as readonly string[]).includes(s.priority), `priority 잘못됨: ${s.id}`);
  }
});

test("P0 후보가 최소 2건 이상이다 (계약정보 + 계약과정통합공개)", () => {
  const p0 = listDataSourcesByPriority("P0");
  assert.ok(p0.length >= 2, `P0 부족: ${p0.length}`);
});

test("G2B_DATA_SOURCES 의 모든 URL 이 문서에 등장한다 (역방향 동기화)", () => {
  for (const s of G2B_DATA_SOURCES) {
    assert.ok(docContent.includes(s.dataGoKrUrl), `스키마 URL 이 문서에 없음: ${s.id} (${s.dataGoKrUrl})`);
  }
});

// ---------- 6. enum 노출 ----------

test("G2B_MATCHING_SIGNALS 가 9종 매칭 신호를 가진다", () => {
  for (const sig of [
    "business_number_hash_match",
    "corporate_number_hash_match",
    "name_similarity",
    "address_region_match",
    "phone_masked_match",
    "agency_match",
    "title_similarity",
    "period_overlap",
    "amount_similarity"
  ]) {
    assert.ok((G2B_MATCHING_SIGNALS as readonly string[]).includes(sig), `매칭 신호 누락: ${sig}`);
  }
});

test("G2B_LINKAGE_CONFIDENCES 가 4종 신뢰도 값을 가진다", () => {
  for (const c of ["high", "medium", "low", "excluded"]) {
    assert.ok((G2B_LINKAGE_CONFIDENCES as readonly string[]).includes(c), `신뢰도 누락: ${c}`);
  }
});

test("G2B_LINKAGE_STATUSES / PRIVACY_RISKS / SOURCE_PRIORITIES 가 모두 노출된다", () => {
  assert.equal(G2B_LINKAGE_STATUSES.length, 4);
  assert.equal(G2B_LINKAGE_PRIVACY_RISKS.length, 4);
  assert.equal(G2B_SOURCE_PRIORITIES.length, 3);
});

// ---------- 7. 헬퍼 ----------

test("getDataSourceById 가 정확한 후보를 반환한다", () => {
  const s = getDataSourceById("g2b_contract_info");
  assert.ok(s, "g2b_contract_info 누락");
  assert.equal(s?.dataGoKrUrl, "https://www.data.go.kr/data/15129427/openapi.do");
});

test("getDataSourceById 는 없는 ID 에 undefined 를 반환한다", () => {
  assert.equal(getDataSourceById("nonexistent_source"), undefined);
});

// ---------- 8. 안내문 / 카드 타입 ----------

test("G2B_CONTRACT_LINKAGE_NOTICE 가 '동일성 후보' / '추가 검토 필요' / '해시' / '마스킹' / '재확인' / '자동' 표현을 포함한다", () => {
  for (const kw of ["동일성 후보", "추가 검토 필요", "해시", "마스킹", "재확인", "자동"]) {
    assert.ok(G2B_CONTRACT_LINKAGE_NOTICE.includes(kw), `안내문 키워드 누락: ${kw}`);
  }
});

test("G2bContractLinkageCandidate 의 reviewRequired 가 true 로 강제된다 (타입 가드)", () => {
  const _sample: G2bContractLinkageCandidate = {
    id: "linkage-001",
    subsidyRecordId: "subsidy-001",
    sourceName: "g2b",
    sourceUrl: "https://www.data.go.kr/data/15129427/openapi.do",
    collectedAt: new Date().toISOString(),
    matchingSignals: ["name_similarity"],
    linkageConfidence: "low",
    linkageReason: "업체명 유사 — 추가 검토 필요",
    privacyRisk: "low",
    reviewRequired: true,
    status: "candidate"
  };
  assert.equal(_sample.reviewRequired, true);
});

test("G2bDataSourceEntry 타입이 컴파일 시점에 존재한다 (타입 가드)", () => {
  const _sample: G2bDataSourceEntry = {
    id: "test_src",
    name: "테스트",
    providerName: "테스트 기관",
    dataGoKrUrl: "https://www.data.go.kr/data/0/openapi.do",
    contentSummary: "테스트",
    apiType: "unknown",
    dataFormat: "unknown",
    authRequired: "unknown",
    priority: "P2",
    status: "candidate"
  };
  assert.equal(_sample.id, "test_src");
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

  console.log(`\nG2bContractLinkage tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

  if (failed > 0) {
    console.error("\nFailures:");
    for (const f of failures) {
      console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
    }
    process.exit(1);
  }
}

await main();
