// 표현 통제 정책 테스트 (체크리스트 4).
//
// 실행: `npm run test:language` (tsx 로 실행).
// node:assert/strict 만 사용.
//
// 본 파일은 의도적으로 금지 표현 문자열을 입력으로 사용한다 — 정책 검사기의
// FILE_WHITELIST 에 등록되어 정적 검사에서 제외된다.

import assert from "node:assert/strict";
import {
  checkText,
  FILE_WHITELIST,
  FORBIDDEN_PHRASES,
  NEGATIVE_MARKERS,
  RECOMMENDED_PHRASES
} from "../scripts/check-language-policy.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

// ---------- 1. 금지 표현이 포함된 사용자 노출 문구는 실패해야 한다 ----------

test("금지 표현 '부정수급 확정' 단독 사용은 실패한다", () => {
  const out = checkText("이 사건은 부정수급 확정으로 판단됩니다.");
  assert.equal(out.ok, false);
  assert.ok(out.findings.length >= 1);
  assert.equal(out.findings[0]?.phrase, "부정수급 확정");
});

test("금지 표현 '범죄자' 단독 사용은 실패한다", () => {
  const out = checkText("판매자는 범죄자입니다.");
  assert.equal(out.ok, false);
});

test("금지 표현 '사기꾼' 단독 사용은 실패한다", () => {
  const out = checkText("이 광고주는 사기꾼이라고 결론지을 수 있습니다.");
  assert.equal(out.ok, false);
});

test("금지 표현 '불법 확정' 단독 사용은 실패한다", () => {
  const out = checkText("본 게시물은 불법 확정 사례로 분류됩니다.");
  assert.equal(out.ok, false);
});

test("금지 표현 '유죄' 단독 사용은 실패한다", () => {
  const out = checkText("법원 판단 없이 유죄로 처리됩니다.");
  assert.equal(out.ok, false);
});

test("금지 표현 '고의 범행' 단독 사용은 실패한다", () => {
  const out = checkText("고의 범행으로 보입니다.");
  assert.equal(out.ok, false);
});

// ---------- 2. 권장 표현은 통과해야 한다 ----------

test("권장 표현 '의심 신호' 단독은 통과한다", () => {
  const out = checkText("반복 수급 패턴으로 의심 신호가 확인되어 추가 검토가 필요합니다.");
  assert.equal(out.ok, true);
});

test("권장 표현 '검토 필요' 단독은 통과한다", () => {
  const out = checkText("자료상 불일치가 확인되어 사람 검토 필요.");
  assert.equal(out.ok, true);
});

test("권장 표현 '검토 후보' 단독은 통과한다", () => {
  const out = checkText("본 케이스는 검토 후보로 분류됩니다.");
  assert.equal(out.ok, true);
});

test("권장 표현 '위험 신호' 단독은 통과한다", () => {
  const out = checkText("동일 주소 기반 중복 가능성이 위험 신호로 확인됩니다.");
  assert.equal(out.ok, true);
});

test("권장 표현 '추정' 단독은 통과한다", () => {
  const out = checkText("목적 외 사용 가능성이 있어 추정 단계의 검토가 필요합니다.");
  assert.equal(out.ok, true);
});

// ---------- 3. REPORT_LANGUAGE_GUIDE.md 등 정책 파일은 화이트리스트에 등록 ----------

test("REPORT_LANGUAGE_GUIDE.md 는 FILE_WHITELIST 에 등록되어 있다", () => {
  assert.ok(FILE_WHITELIST.has("docs/REPORT_LANGUAGE_GUIDE.md"));
});

test("OPERATING_POLICY.md / LEGAL_REVIEW.md / approval_gate.md 도 화이트리스트", () => {
  assert.ok(FILE_WHITELIST.has("docs/OPERATING_POLICY.md"));
  assert.ok(FILE_WHITELIST.has("docs/LEGAL_REVIEW.md"));
  assert.ok(FILE_WHITELIST.has("docs/approval_gate.md"));
});

test("sanitize 룰 정의 파일 / 스모크 테스트 / 검사기 자체도 화이트리스트", () => {
  assert.ok(FILE_WHITELIST.has("src/services/ReportService.ts"));
  assert.ok(FILE_WHITELIST.has("src/agents/AnalyzerAgent.ts"));
  assert.ok(FILE_WHITELIST.has("src/agents/scoring_rules.ts"));
  assert.ok(FILE_WHITELIST.has("src/scripts/smoke-test.ts"));
  assert.ok(FILE_WHITELIST.has("scripts/check-language-policy.js"));
});

// ---------- 4. '부정수급 의심 신호' 는 통과해야 한다 ----------

test("'부정수급 의심 신호' 표현은 통과한다", () => {
  const out = checkText(
    "본 모듈은 부정수급 의심 신호를 정리해 사람 검토 후보로 분류합니다."
  );
  assert.equal(out.ok, true);
});

// ---------- 5. '부정수급 확정' 은 실패해야 한다 ----------

test("'부정수급 확정' 단독은 실패한다", () => {
  const out = checkText("이 케이스는 부정수급 확정입니다.");
  assert.equal(out.ok, false);
  assert.equal(out.findings[0]?.phrase, "부정수급 확정");
});

// ---------- 6. '사람 검토 필요' 는 통과해야 한다 ----------

test("'사람 검토 필요' 표현은 통과한다", () => {
  const out = checkText("AI 분석 결과는 보조 자료이며, 사람 검토 필요.");
  assert.equal(out.ok, true);
});

// ---------- 7. '무조건 신고' 는 실패해야 한다 ----------

test("'무조건 신고' 단독은 실패한다", () => {
  const out = checkText("발견되면 무조건 신고하세요.");
  assert.equal(out.ok, false);
});

// ---------- 추가 보강 시나리오 ----------

test("부정 컨텍스트 disclaimer 는 통과한다 — '부정수급 확정이 아닙니다'", () => {
  const out = checkText("본 결과는 부정수급 확정이 아닙니다. 검토 후보일 뿐입니다.");
  assert.equal(out.ok, true);
});

test("부정 컨텍스트 disclaimer 는 통과한다 — '범죄자로 단정하지 않습니다'", () => {
  const out = checkText("특정 단체/개인/사업자를 범죄자로 단정하지 않습니다.");
  assert.equal(out.ok, true);
});

test("부정 컨텍스트 disclaimer 는 통과한다 — '부정수급자로 단정하지 않습니다'", () => {
  const out = checkText("특정 사업자를 부정수급자로 단정하지 않습니다.");
  assert.equal(out.ok, true);
});

test("skipNegativeContext=false 면 disclaimer 도 잡힌다", () => {
  const out = checkText(
    "본 결과는 부정수급 확정이 아닙니다. 검토 후보일 뿐입니다.",
    { skipNegativeContext: false }
  );
  assert.equal(out.ok, false);
});

test("FORBIDDEN_PHRASES 와 RECOMMENDED_PHRASES 가 노출된다", () => {
  assert.ok(Array.isArray(FORBIDDEN_PHRASES) && FORBIDDEN_PHRASES.length > 0);
  assert.ok(Array.isArray(RECOMMENDED_PHRASES) && RECOMMENDED_PHRASES.length > 0);
  assert.ok(FORBIDDEN_PHRASES.includes("부정수급 확정"));
  assert.ok(FORBIDDEN_PHRASES.includes("범죄자"));
  assert.ok(FORBIDDEN_PHRASES.includes("무조건 신고"));
  assert.ok(RECOMMENDED_PHRASES.includes("의심 신호"));
  assert.ok(RECOMMENDED_PHRASES.includes("검토 필요"));
});

test("NEGATIVE_MARKERS 에 핵심 disclaimer 어휘가 포함된다", () => {
  assert.ok(NEGATIVE_MARKERS.test("이것은 부정수급 확정이 아닙니다"));
  assert.ok(NEGATIVE_MARKERS.test("범죄자로 단정하지 않습니다"));
  assert.ok(NEGATIVE_MARKERS.test("이 표현은 사용을 금지합니다"));
  assert.ok(NEGATIVE_MARKERS.test("sanitize 단계에서 치환됩니다"));
});

// ---------- 러너 ----------

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; error: unknown }> = [];

for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log(`  OK   ${t.name}`);
  } catch (err) {
    failed++;
    failures.push({ name: t.name, error: err });
    console.error(`  FAIL ${t.name}`);
    console.error(err);
  }
}

console.log(`\nLanguagePolicy tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
  }
  process.exit(1);
}
