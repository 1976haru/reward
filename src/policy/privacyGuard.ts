// Privacy Guard — 개인정보 최소수집 정책 유틸 (체크리스트 5).
//
// 본 모듈은 src/services/privacy/* (MaskingService / SensitiveDataDetector / PrivacyScanService)
// 와 별개의 정책 레벨 진입점이다. 두 모듈의 역할 분리:
//
//   - services/privacy/*  : 데이터 스캔/마스킹/보존기간 등 인프라성 서비스
//   - policy/privacyGuard : 저장 전 / AI 호출 전에 항상 통과해야 하는 정책 게이트
//
// 본 모듈은 순수 함수로만 구성되어 테스트가 결정적이다. 영속화/로깅은 호출자가 책임진다.
//
// 마스킹 형식은 docs/privacy_policy.md §5 표를 따른다:
//   - 주민등록번호  900101-1234567   → 900101-*******
//   - 휴대폰번호    010-1234-5678    → 010-****-5678
//   - 이메일        user@example.com → u***@example.com
//   - 계좌번호      123-456-789012   → 123-***-******
//   - 상세주소      서울시 OO구 OO로 10, 101동 202호 → 서울시 OO구
//   - 이름          홍길동           → 홍*동
//
// 본 모듈은 법률 자문을 대체하지 않는다.

// ---------- 타입 ----------

export const FORBIDDEN_PERSONAL_DATA_TYPES = [
  "resident_registration_number",
  "foreign_registration_number",
  "passport_number",
  "driver_license_number",
  "bank_account",
  "card_number",
  "phone_number",
  "email",
  "detailed_address",
  "date_of_birth",
  "sensitive_keyword"
] as const;

export type ForbiddenPersonalDataType = (typeof FORBIDDEN_PERSONAL_DATA_TYPES)[number];

export class PrivacyGuardError extends Error {
  constructor(
    public readonly detectedTypes: ForbiddenPersonalDataType[],
    message: string
  ) {
    super(message);
    this.name = "PrivacyGuardError";
  }
}

export interface SanitizeResult {
  sanitizedText: string;
  detectedTypes: ForbiddenPersonalDataType[];
  changed: boolean;
}

// ---------- 정규식 ----------

// 13자리 주민등록번호 (검증 X, 형태만)
const RRN_RE = /\b(\d{6})[-\s]?(\d{7})\b/g;

// 한국 휴대폰: 010/011/016/017/018/019 + (3~4)+ (4)
const PHONE_MOBILE_RE = /\b(01[016789])[-\s.]?(\d{3,4})[-\s.]?(\d{4})\b/g;

// 일반 이메일
const EMAIL_RE = /([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g;

// 계좌번호 키워드 + 숫자 (12~20자리, 구분자 허용)
const BANK_KEYWORDS_SRC =
  "계좌(?:번호)?|은행계좌|입금(?:계좌)?|출금(?:계좌)?|이체|송금|국민은행|우리은행|신한은행|하나은행|농협(?:은행)?|기업은행|카카오뱅크|토스뱅크|케이뱅크|씨티(?:은행)?|SC제일(?:은행)?|새마을금고|우체국";
const BANK_CTX_RE = new RegExp(
  `((?:${BANK_KEYWORDS_SRC})\\s*[:：]?\\s*)(\\d{2,6}(?:[-\\s]\\d{2,6}){1,3})`,
  "gu"
);
// 단독 계좌번호 형태 (NNN-NN/NNN-NNNN+) — 전화번호 패턴(3-4-4) 은 제외
const BANK_STANDALONE_RE = /\b(\d{3})-(\d{2,3})-(\d{5,8})\b/g;

// 상세주소: 시/군/구 다음에 도로명·길 + 숫자 + (동·호·번지·층) 패턴
const ADDRESS_DETAIL_RE = /\s+[^\s,，]+(?:로|길)\s*\d+(?:[,，]?\s*\d+[가-힣]{1,3})*/gu;

// 한국식 이름 마스킹 — 키워드 컨텍스트 안에서만 동작
const NAME_KW_SRC = "성명|이름|성함|신청자|대표자|신고자|검토자|reviewer|reviewerName";
// \b 는 ASCII word boundary 만 인식 — 한글 뒤에서는 작동하지 않으므로 lookahead 사용
const NAME_CTX_RE = new RegExp(`((?:${NAME_KW_SRC})\\s*[:：]?\\s*)([가-힣]{2,4})(?![가-힣])`, "gu");

// 민감정보 키워드 (개인정보보호법 민감정보 카테고리 일부 + 일반적인 민감 표현)
const SENSITIVE_KEYWORDS = [
  "건강정보",
  "진단명",
  "의료기록",
  "처방전",
  "병력",
  "범죄경력",
  "전과기록",
  "정치적 견해",
  "정치적견해",
  "종교",
  "노동조합",
  "성생활",
  "성적 지향",
  "성적지향",
  "임신 사실",
  "출산 사실"
];
const SENSITIVE_KEYWORDS_RE = new RegExp(`(${SENSITIVE_KEYWORDS.map(escapeRegex).join("|")})`, "gu");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- 1. maskResidentRegistrationNumber ----------

export function maskResidentRegistrationNumber(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  return text.replace(RRN_RE, (_m, head, _tail) => `${head}-*******`);
}

// ---------- 2. maskPhoneNumber ----------

export function maskPhoneNumber(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  return text.replace(PHONE_MOBILE_RE, (_m, p1, p2, p3) => {
    const middleMask = "*".repeat(p2.length);
    return `${p1}-${middleMask}-${p3}`;
  });
}

// ---------- 3. maskEmail ----------

export function maskEmail(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  return text.replace(EMAIL_RE, (_m, local, domain) => {
    const head = local.charAt(0) || "";
    return `${head}***@${domain}`;
  });
}

// ---------- 4. maskBankAccount ----------

function maskAccountDigits(s: string): string {
  // 첫 번째 숫자 그룹만 남기고, 나머지 숫자 그룹은 * 로 치환. 구분자는 보존.
  const parts = s.split(/([-\s])/);
  let firstNumIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+$/.test(parts[i])) {
      firstNumIdx = i;
      break;
    }
  }
  return parts
    .map((p, i) => {
      if (/^\d+$/.test(p) && i !== firstNumIdx) return "*".repeat(p.length);
      return p;
    })
    .join("");
}

export function maskBankAccount(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  // 1) 키워드 + 숫자열
  let out = text.replace(BANK_CTX_RE, (_m, prefix, digits) => `${prefix}${maskAccountDigits(digits)}`);
  // 2) 단독 NNN-NN/NNN-NNNN+ 패턴 (전화번호 NNN-NNNN-NNNN 제외)
  out = out.replace(BANK_STANDALONE_RE, (m, a, b, c) => {
    if (b.length === 4 && c.length === 4) return m; // 전화번호 패턴은 건너뜀
    return `${a}-${"*".repeat(b.length)}-${"*".repeat(c.length)}`;
  });
  return out;
}

// ---------- 5. maskDetailedAddress ----------

export function maskDetailedAddress(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  // 시/군/구 다음의 도로명·길 + 숫자 + (동/호/번지/층) 토큰을 제거
  return text.replace(ADDRESS_DETAIL_RE, "");
}

// ---------- 6. maskName ----------

export function maskKoreanName(name: string): string {
  if (typeof name !== "string" || name.length === 0) return name;
  if (name.length === 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  // 3 chars: 홍길동 → 홍*동, 4 chars: 홍길동길 → 홍**길
  return `${name[0]}${"*".repeat(name.length - 2)}${name[name.length - 1]}`;
}

export function maskName(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  // 키워드 컨텍스트 안에서만 마스킹 (기관명/법인명 오탐 방지)
  return text.replace(NAME_CTX_RE, (_m, kw, name) => `${kw}${maskKoreanName(name)}`);
}

// ---------- 7. maskSensitiveText ----------

/**
 * 모든 마스킹 규칙을 통합 적용한다. 순서는 의도적이다 — RRN/계좌가 전화/이메일 보다 먼저.
 */
export function maskSensitiveText(text: string): string {
  if (typeof text !== "string") return text as unknown as string;
  let out = text;
  out = maskResidentRegistrationNumber(out);
  out = maskBankAccount(out);
  out = maskPhoneNumber(out);
  out = maskEmail(out);
  out = maskDetailedAddress(out);
  out = maskName(out);
  return out;
}

// ---------- 8. detectForbiddenPersonalData ----------

export function detectForbiddenPersonalData(text: string): ForbiddenPersonalDataType[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const found = new Set<ForbiddenPersonalDataType>();
  // 정규식은 stateful 하므로 매 사용 시 lastIndex=0 으로 재설정 또는 새로 생성.
  if (new RegExp(RRN_RE.source).test(text)) found.add("resident_registration_number");
  if (new RegExp(PHONE_MOBILE_RE.source).test(text)) found.add("phone_number");
  if (new RegExp(EMAIL_RE.source).test(text)) found.add("email");
  if (new RegExp(BANK_CTX_RE.source, "u").test(text) || new RegExp(BANK_STANDALONE_RE.source).test(text)) {
    found.add("bank_account");
  }
  if (new RegExp(ADDRESS_DETAIL_RE.source, "u").test(text)) found.add("detailed_address");
  if (new RegExp(SENSITIVE_KEYWORDS_RE.source, "u").test(text)) found.add("sensitive_keyword");
  // 생년월일 패턴: YYYY-MM-DD 또는 YYYY.MM.DD 또는 YYYY년 M월 D일 출생/생
  if (
    /\b(19|20)\d{2}[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}(일)?(\s*(?:출생|생|생일|태생))?/.test(text) &&
    /(출생|생일|태생|생\b)/.test(text)
  ) {
    found.add("date_of_birth");
  }
  return Array.from(found);
}

// ---------- 9. assertNoForbiddenPersonalData ----------

/**
 * 저장 또는 AI 호출 직전에 호출한다. 금지 개인정보가 발견되면 에러.
 * (sanitizeForStorage 는 throw 대신 마스킹 — 호출자가 정책에 따라 선택.)
 */
export function assertNoForbiddenPersonalData(text: string): void {
  const detected = detectForbiddenPersonalData(text);
  if (detected.length > 0) {
    throw new PrivacyGuardError(
      detected,
      `저장 금지 개인정보가 감지되었습니다: ${detected.join(", ")}. 본 도구는 공개자료 중심으로 운영되며, 원문 개인정보를 저장하지 않습니다.`
    );
  }
}

// ---------- 10. sanitizeForStorage ----------

export function sanitizeForStorage(input: string): SanitizeResult {
  if (typeof input !== "string") {
    return { sanitizedText: "", detectedTypes: [], changed: false };
  }
  const detectedTypes = detectForbiddenPersonalData(input);
  const sanitizedText = maskSensitiveText(input);
  return {
    sanitizedText,
    detectedTypes,
    changed: sanitizedText !== input
  };
}

// ---------- 11. sanitizeForAI ----------

/**
 * AI 프롬프트 전송 전 정제.
 * - 식별성 정보는 마스킹 (sanitizeForStorage 와 동일)
 * - 민감정보 키워드는 "[민감정보 제거]" 로 대체 (AI 응답 누출 방지)
 */
export function sanitizeForAI(input: string): SanitizeResult {
  if (typeof input !== "string") {
    return { sanitizedText: "", detectedTypes: [], changed: false };
  }
  const detectedTypes = detectForbiddenPersonalData(input);
  let out = maskSensitiveText(input);
  out = out.replace(SENSITIVE_KEYWORDS_RE, "[민감정보 제거]");
  return {
    sanitizedText: out,
    detectedTypes,
    changed: out !== input
  };
}

// ---------- export 모음 ----------

export const PRIVACY_GUARD_NOTICE =
  "본 도구는 공개자료 중심 분석을 원칙으로 합니다. 주민등록번호 / 계좌번호 / 민감정보 / 연락처 / 상세 주소 등 불필요한 개인정보는 수집·저장하지 않으며, 입력에 포함된 경우 저장 전 마스킹됩니다. 본 정책은 개인정보보호 법령에 대한 법률 자문을 대체하지 않습니다.";
