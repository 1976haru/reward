// Privacy Guard 테스트 (체크리스트 5).
//
// 실행: `npm run test:privacy` (tsx 로 실행).
// node:assert/strict 만 사용.
//
// 본 파일은 의도적으로 가짜 개인정보 예시(900101-1234567 등) 를 입력으로 사용한다.
// 정적 검사기의 FILE_WHITELIST 에 등록되어 check:privacy 에서 제외된다.

import assert from "node:assert/strict";
import {
  assertNoForbiddenPersonalData,
  detectForbiddenPersonalData,
  FORBIDDEN_PERSONAL_DATA_TYPES,
  maskBankAccount,
  maskDetailedAddress,
  maskEmail,
  maskKoreanName,
  maskName,
  maskPhoneNumber,
  maskResidentRegistrationNumber,
  maskSensitiveText,
  PrivacyGuardError,
  sanitizeForAI,
  sanitizeForStorage
} from "../src/policy/privacyGuard.js";

type TestFn = () => void;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

// ---------- 1. 주민등록번호 마스킹 ----------

test("주민등록번호는 앞 6자리만 남기고 마스킹된다", () => {
  assert.equal(maskResidentRegistrationNumber("주민번호 900101-1234567 입니다"), "주민번호 900101-******* 입니다");
});

test("주민등록번호는 하이픈 없이 13자리여도 마스킹된다", () => {
  // \b\d{6}-?\d{7}\b 형태 — 하이픈 없는 경우도 처리
  assert.equal(maskResidentRegistrationNumber("ID 9001011234567"), "ID 900101-*******");
});

// ---------- 2. 휴대폰번호 마스킹 ----------

test("휴대폰번호는 가운데 자리가 마스킹된다", () => {
  assert.equal(maskPhoneNumber("연락처: 010-1234-5678"), "연락처: 010-****-5678");
});

test("휴대폰번호 011/016/017/018/019 도 마스킹된다", () => {
  assert.equal(maskPhoneNumber("011-222-3333"), "011-***-3333");
  assert.equal(maskPhoneNumber("019-1234-5678"), "019-****-5678");
});

test("유선 02 번호는 maskPhoneNumber 로 마스킹되지 않는다 (정책상 휴대폰만)", () => {
  // 유선 번호는 일반적으로 공개 대표번호로 사용 — 마스킹 제외
  assert.equal(maskPhoneNumber("기관 대표 02-345-6789"), "기관 대표 02-345-6789");
});

// ---------- 3. 이메일 마스킹 ----------

test("이메일은 로컬파트 첫 글자만 남기고 마스킹된다", () => {
  assert.equal(maskEmail("이메일: user@example.com"), "이메일: u***@example.com");
});

test("이메일 도메인은 보존된다", () => {
  assert.equal(maskEmail("kim.minsoo@anthropic.com"), "k***@anthropic.com");
});

// ---------- 4. 계좌번호 마스킹 ----------

test("계좌 키워드 + 숫자 패턴은 마스킹된다", () => {
  assert.equal(maskBankAccount("계좌 123-456-789012"), "계좌 123-***-******");
});

test("국민은행 키워드 + 계좌번호 패턴도 마스킹된다", () => {
  assert.equal(maskBankAccount("국민은행 123-45-678901"), "국민은행 123-**-******");
});

test("단독 NNN-NNN-NNNNNN 패턴도 계좌로 마스킹된다 (전화번호 패턴 제외)", () => {
  // 전화번호 (010-1234-5678) 형태는 maskBankAccount 가 건드리지 않음
  assert.equal(maskBankAccount("010-1234-5678"), "010-1234-5678");
  // 계좌 형태는 마스킹
  assert.equal(maskBankAccount("123-456-789012"), "123-***-******");
});

// ---------- 5. 상세주소 마스킹 ----------

test("시/군/구 다음의 상세 주소는 제거된다", () => {
  assert.equal(
    maskDetailedAddress("서울시 OO구 OO로 10, 101동 202호"),
    "서울시 OO구"
  );
});

test("도로명·길이 없는 시/군/구 까지는 그대로 둔다", () => {
  assert.equal(maskDetailedAddress("서울시 강남구"), "서울시 강남구");
});

test("기관명·법인명은 주소 마스킹의 영향을 받지 않는다", () => {
  // "한국보조금공단" 같은 기관명은 그대로
  assert.equal(maskDetailedAddress("한국보조금공단"), "한국보조금공단");
  // "보조사업명: 청년 일자리 사업" 같은 공개 사업명도 보존
  assert.equal(maskDetailedAddress("보조사업명: 청년 일자리 사업"), "보조사업명: 청년 일자리 사업");
});

// ---------- 6. 이름 마스킹 (키워드 컨텍스트만) ----------

test("키워드 컨텍스트 안의 한국식 이름은 마스킹된다", () => {
  assert.equal(maskName("신고자: 홍길동"), "신고자: 홍*동");
  assert.equal(maskName("검토자: 김민수"), "검토자: 김*수");
});

test("이름 키워드가 없으면 한국식 단어를 마스킹하지 않는다 (기관명 보호)", () => {
  assert.equal(maskName("한국보조금공단이 발표한 결과"), "한국보조금공단이 발표한 결과");
  assert.equal(maskName("청년일자리 사업 결과"), "청년일자리 사업 결과");
});

test("maskKoreanName 직접 호출 — 2자/3자/4자 처리", () => {
  assert.equal(maskKoreanName("김민"), "김*");
  assert.equal(maskKoreanName("홍길동"), "홍*동");
  assert.equal(maskKoreanName("남궁석민"), "남**민");
});

// ---------- 7. 민감정보 키워드 탐지 ----------

test("민감정보 키워드가 탐지된다", () => {
  const found = detectForbiddenPersonalData("이 사람은 정치적 견해가 ... 종교는 ...");
  assert.ok(found.includes("sensitive_keyword"));
});

test("건강정보·범죄경력·노동조합 가입 등도 탐지된다", () => {
  assert.ok(detectForbiddenPersonalData("건강정보 포함").includes("sensitive_keyword"));
  assert.ok(detectForbiddenPersonalData("범죄경력 조회").includes("sensitive_keyword"));
  assert.ok(detectForbiddenPersonalData("노동조합 가입 여부").includes("sensitive_keyword"));
});

// ---------- 8. sanitizeForStorage ----------

test("sanitizeForStorage 는 변경 시 changed=true 와 detectedTypes 를 반환한다", () => {
  const out = sanitizeForStorage("주민번호 900101-1234567, 연락처 010-1234-5678");
  assert.equal(out.changed, true);
  assert.ok(out.detectedTypes.includes("resident_registration_number"));
  assert.ok(out.detectedTypes.includes("phone_number"));
  assert.match(out.sanitizedText, /900101-\*{7}/);
  assert.match(out.sanitizedText, /010-\*{4}-5678/);
});

test("sanitizeForStorage 는 변경 없으면 changed=false", () => {
  const out = sanitizeForStorage("보조사업명: 청년 일자리 지원 사업");
  assert.equal(out.changed, false);
  assert.equal(out.detectedTypes.length, 0);
  assert.equal(out.sanitizedText, "보조사업명: 청년 일자리 지원 사업");
});

// ---------- 9. sanitizeForAI ----------

test("sanitizeForAI 는 개인정보를 마스킹하고 민감정보 키워드를 [민감정보 제거] 로 대체한다", () => {
  const out = sanitizeForAI("신청자 홍길동의 정치적 견해와 연락처 010-1234-5678");
  assert.equal(out.changed, true);
  // 민감정보 키워드는 [민감정보 제거] 로 대체
  assert.match(out.sanitizedText, /\[민감정보 제거\]/);
  assert.doesNotMatch(out.sanitizedText, /정치적\s*견해/);
  // 휴대폰은 마스킹
  assert.match(out.sanitizedText, /010-\*{4}-5678/);
});

test("sanitizeForAI 는 깨끗한 텍스트는 그대로 둔다", () => {
  const out = sanitizeForAI("보조사업명: 청년 일자리 지원 사업");
  assert.equal(out.changed, false);
  assert.equal(out.sanitizedText, "보조사업명: 청년 일자리 지원 사업");
});

// ---------- 10. assertNoForbiddenPersonalData ----------

test("assertNoForbiddenPersonalData 는 원문 주민번호가 있으면 throw 한다", () => {
  let caught: unknown = null;
  try {
    assertNoForbiddenPersonalData("주민번호 900101-1234567");
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof PrivacyGuardError);
  assert.ok(
    (caught as PrivacyGuardError).detectedTypes.includes("resident_registration_number")
  );
});

test("assertNoForbiddenPersonalData 는 깨끗한 텍스트에는 throw 하지 않는다", () => {
  assert.doesNotThrow(() => assertNoForbiddenPersonalData("공시자료: 사업명 청년 일자리"));
});

test("assertNoForbiddenPersonalData 는 이메일/계좌/민감정보에도 throw 한다", () => {
  assert.throws(() => assertNoForbiddenPersonalData("user@somecompany.com"), PrivacyGuardError);
  assert.throws(() => assertNoForbiddenPersonalData("010-1234-5678"), PrivacyGuardError);
  assert.throws(() => assertNoForbiddenPersonalData("정치적 견해 기록"), PrivacyGuardError);
});

// ---------- 11. 공개자료 중심 텍스트는 과도하게 마스킹되지 않는다 ----------

test("공개 사업명/기관명/공시자료 텍스트는 그대로 둔다 (PRIVACY-007)", () => {
  const publicTexts = [
    "보조사업명: 2025 청년 일자리 도약 사업",
    "교부기관: 충청남도 당진시",
    "한국재정정보원 공시자료",
    "사업기간: 2025-01-01 ~ 2025-12-31",
    "지원금액: 5,000,000원",
    "공고URL: https://www.bokjiro.go.kr/example-program-id-12345"
  ];
  for (const t of publicTexts) {
    const out = sanitizeForStorage(t);
    assert.equal(out.changed, false, `should not mask: ${t} → ${out.sanitizedText}`);
    assert.equal(out.detectedTypes.length, 0, `should not detect PII in: ${t}`);
  }
});

// ---------- 12. 통합 maskSensitiveText ----------

test("maskSensitiveText 는 모든 마스킹을 순차 적용한다", () => {
  const input =
    "신고자: 홍길동, 주민번호 900101-1234567, 연락처 010-1234-5678, 이메일 user@somecompany.com, 계좌 123-456-789012, 주소 서울시 OO구 OO로 10, 101동 202호";
  const out = maskSensitiveText(input);
  assert.match(out, /신고자: 홍\*동/);
  assert.match(out, /900101-\*{7}/);
  assert.match(out, /010-\*{4}-5678/);
  assert.match(out, /u\*{3}@somecompany\.com/);
  assert.match(out, /계좌 123-\*{3}-\*{6}/);
  assert.match(out, /서울시 OO구/);
  assert.doesNotMatch(out, /101동/);
  assert.doesNotMatch(out, /202호/);
});

// ---------- 13. 상수 export ----------

test("FORBIDDEN_PERSONAL_DATA_TYPES 가 노출되며 필수 타입을 포함한다", () => {
  assert.ok(Array.isArray(FORBIDDEN_PERSONAL_DATA_TYPES));
  assert.ok(FORBIDDEN_PERSONAL_DATA_TYPES.includes("resident_registration_number"));
  assert.ok(FORBIDDEN_PERSONAL_DATA_TYPES.includes("phone_number"));
  assert.ok(FORBIDDEN_PERSONAL_DATA_TYPES.includes("email"));
  assert.ok(FORBIDDEN_PERSONAL_DATA_TYPES.includes("bank_account"));
  assert.ok(FORBIDDEN_PERSONAL_DATA_TYPES.includes("sensitive_keyword"));
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

console.log(`\nPrivacyGuard tests: ${passed} passed, ${failed} failed (total ${tests.length})`);

if (failed > 0) {
  console.error("\nFailures:");
  for (const f of failures) {
    console.error(` - ${f.name}: ${(f.error as Error)?.message ?? f.error}`);
  }
  process.exit(1);
}
