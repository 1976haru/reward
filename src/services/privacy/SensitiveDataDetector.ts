// 민감정보 탐지기 (체크리스트 28)
//
// 보수적인 정규식 기반 1차 탐지. 오탐 가능성 있음 — 사람 검토를 권장한다.
// 본 탐지기는 개인정보보호 법령 검토를 대체하지 않는다.

import {
  MASK_TOKENS,
  type PrivacyConfidence,
  type PrivacyFinding,
  type SensitiveDataType
} from "../../types/privacy.js";

interface DetectorRule {
  type: SensitiveDataType;
  pattern: RegExp;
  confidence: PrivacyConfidence;
  recommendedAction: string;
  // 결정적 마스킹 토큰
  replacement?: string;
  // 사용자 정의 길이 안전장치 (false positive 줄이기)
  guard?: (match: string, fullText: string, index: number) => boolean;
}

// 키 이름 기반 탐지 (객체 직렬화 텍스트에서) — "secret": "xxx" 패턴
const KEY_NAME_RE = /"(api[_-]?key|service[_-]?key|secret|token|password|cookie|set[_-]?cookie|authorization|auth[_-]?header|session[_-]?id|access[_-]?token|refresh[_-]?token|x[_-]?api[_-]?key|client[_-]?secret|jwt)"\s*:\s*"([^"]{1,500})"/gi;

// API key / token 패턴 — 너무 일반적이지 않은 형태만
const API_KEY_RE = /\b(sk-[A-Za-z0-9_\-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[apbs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_\-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,})\b/g;
// Bearer / Authorization 헤더
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]{20,}/g;
// JWT — eyJ로 시작하는 3 segment base64url
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

// 이메일
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 한국 휴대폰/일반전화: 010-1234-5678 / 02-123-4567 / 010 1234 5678
const PHONE_RE = /\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
// 주민번호 형태 (검증 X)
const RRN_RE = /\b\d{6}-\d{7}\b/g;
// 계좌번호 후보 — 10~16자리 숫자 (하이픈 포함 가능). MEDIUM confidence.
const ACCOUNT_RE = /\b\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,8}\b/g;
// IPv4
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\b/g;
// 한국 주소성 — 시/도 + 시/군/구 + 도로명/지번 + 번지/호
const ADDRESS_RE = /(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|강원도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s*\S{1,20}(?:시|군|구)\s*\S{1,30}(?:로|길|동|읍|면)\s*\d{1,4}(?:[-\s]?\d{1,4})?(?:\s*\d{1,4}\s*호)?/g;

const DETECTOR_RULES: DetectorRule[] = [
  {
    type: "KOREAN_RRN",
    pattern: RRN_RE,
    confidence: "HIGH",
    recommendedAction: "주민번호 형태가 탐지되었습니다. 즉시 마스킹/삭제 권장."
  },
  {
    type: "API_KEY",
    pattern: API_KEY_RE,
    confidence: "HIGH",
    recommendedAction: "API 키로 보이는 문자열입니다. 즉시 마스킹/삭제 권장. 키가 유출되었다면 즉시 회전(rotate)하세요."
  },
  {
    type: "AUTH_HEADER",
    pattern: BEARER_RE,
    confidence: "HIGH",
    recommendedAction: "Authorization 헤더 토큰입니다. 즉시 마스킹/삭제 권장."
  },
  {
    type: "TOKEN",
    pattern: JWT_RE,
    confidence: "HIGH",
    recommendedAction: "JWT 형태 토큰입니다. 즉시 마스킹/삭제 권장."
  },
  {
    type: "EMAIL",
    pattern: EMAIL_RE,
    confidence: "HIGH",
    recommendedAction: "이메일이 탐지되었습니다. 필요 없으면 마스킹/삭제 권장."
  },
  {
    type: "PHONE",
    pattern: PHONE_RE,
    confidence: "HIGH",
    recommendedAction: "전화번호가 탐지되었습니다. 필요 없으면 마스킹/삭제 권장."
  },
  {
    type: "ACCOUNT_NUMBER",
    pattern: ACCOUNT_RE,
    confidence: "MEDIUM",
    recommendedAction: "계좌번호 후보 (오탐 가능 — 사업자번호/상품번호와 혼동될 수 있음). 사람 검토 권장.",
    // guard: 같은 위치에서 RRN/전화/IP/날짜 매칭이면 그쪽이 우선되도록 후처리 (overlap drop)
  },
  {
    type: "IP_ADDRESS",
    pattern: IPV4_RE,
    confidence: "LOW",
    recommendedAction: "IPv4 주소 후보. 공개 IP/사설 IP 구분이 필요합니다."
  },
  {
    type: "ADDRESS_LIKE",
    pattern: ADDRESS_RE,
    confidence: "MEDIUM",
    recommendedAction: "한국 주소성 패턴. 공개 사업장 주소일 수 있으니 사람 검토 권장."
  }
];

export interface DetectorOptions {
  excerptRadius?: number;       // 매치 주변 컨텍스트 길이
  maxFindings?: number;         // 최대 finding 수 (성능/메모리 보호)
}

const DEFAULT_OPTIONS: Required<DetectorOptions> = {
  excerptRadius: 24,
  maxFindings: 500
};

export function detectSensitive(
  text: string,
  opts: DetectorOptions = {}
): PrivacyFinding[] {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  if (!text || typeof text !== "string") return [];
  const out: PrivacyFinding[] = [];

  // 1) 키-이름 기반 탐지 (JSON 직렬화된 secret)
  let m: RegExpExecArray | null;
  KEY_NAME_RE.lastIndex = 0;
  while ((m = KEY_NAME_RE.exec(text)) !== null) {
    if (out.length >= o.maxFindings) break;
    const keyName = m[1].toLowerCase();
    let type: SensitiveDataType = "API_KEY";
    if (/cookie/i.test(keyName)) type = "COOKIE";
    else if (/authorization|auth[_-]?header/i.test(keyName)) type = "AUTH_HEADER";
    else if (/token|jwt|access|refresh/i.test(keyName)) type = "TOKEN";
    else if (/cookie|session/i.test(keyName)) type = "COOKIE";
    out.push({
      type,
      confidence: "HIGH",
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      excerpt: safeExcerpt(text, m.index, m.index + m[0].length, o.excerptRadius),
      replacement: `"${m[1]}": "${MASK_TOKENS[type]}"`,
      recommendedAction: `JSON 직렬화된 "${keyName}" 키의 값을 마스킹/삭제 권장.`
    });
  }

  // 2) 패턴 기반 탐지
  for (const rule of DETECTOR_RULES) {
    rule.pattern.lastIndex = 0;
    while ((m = rule.pattern.exec(text)) !== null) {
      if (out.length >= o.maxFindings) break;
      if (rule.guard && !rule.guard(m[0], text, m.index)) continue;
      // ACCOUNT_NUMBER guard — 다른 HIGH 매치와 겹치면 skip
      if (rule.type === "ACCOUNT_NUMBER" || rule.type === "IP_ADDRESS") {
        const s = m.index, e = m.index + m[0].length;
        if (out.some((f) =>
          (f.confidence === "HIGH") && overlaps(f.startIndex, f.endIndex, s, e)
        )) continue;
      }
      out.push({
        type: rule.type,
        confidence: rule.confidence,
        startIndex: m.index,
        endIndex: m.index + m[0].length,
        excerpt: safeExcerpt(text, m.index, m.index + m[0].length, o.excerptRadius),
        replacement: MASK_TOKENS[rule.type],
        recommendedAction: rule.recommendedAction
      });
    }
    if (out.length >= o.maxFindings) break;
  }

  // 정렬: 위치 오름차순
  out.sort((a, b) => a.startIndex - b.startIndex);
  return out;
}

function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

function safeExcerpt(text: string, start: number, end: number, radius: number): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  const before = text.slice(s, start);
  const after = text.slice(end, e);
  // 매치 부분 자체는 [match] 자리표시로 노출 — 원문 secret 노출 방지
  return `${before}[match]${after}`.replace(/\s+/g, " ").slice(0, 120);
}

export { DETECTOR_RULES, KEY_NAME_RE };
