// Trace Log 민감정보 마스킹 (체크리스트 27)
//
// 1차 방어선이며 완벽한 PII 탐지가 아니다. 검토자/개발자가 trace 에 민감정보를 직접 넣지 않는 것이 원칙이다.

export interface MaskResult<T> {
  value: T;
  changed: boolean;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
const RRN_RE = /\b\d{6}[-]\d{7}\b/g;

// API 키/토큰 패턴 — 대표적인 prefix 들
const API_KEY_RE = /\b(sk-[A-Za-z0-9_\-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|xox[apbs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_\-]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._\-]{20,})/g;

// 32+ hex (sha/uuid 류는 보존, 명확한 secret 만 대상) — 너무 공격적이지 않게 일반 long-hex 만
// → 적용은 객체 key 가 secret/token/password 일 때로 제한해서 false positive 줄임.

const SENSITIVE_KEY_RE = /(api[_-]?key|service[_-]?key|secret|token|password|cookie|authorization|auth[_-]?header|session[_-]?id|access[_-]?token|refresh[_-]?token|x[_-]?api[_-]?key|client[_-]?secret)$/i;

export function maskString(s: string): MaskResult<string> {
  if (typeof s !== "string" || s.length === 0) return { value: s, changed: false };
  let changed = false;
  let out = s;
  if (API_KEY_RE.test(out)) {
    out = out.replace(API_KEY_RE, "[masked-secret]");
    changed = true;
  }
  if (EMAIL_RE.test(out)) {
    out = out.replace(EMAIL_RE, "[masked-email]");
    changed = true;
  }
  if (PHONE_RE.test(out)) {
    out = out.replace(PHONE_RE, "[masked-phone]");
    changed = true;
  }
  if (RRN_RE.test(out)) {
    out = out.replace(RRN_RE, "[masked-id]");
    changed = true;
  }
  return { value: out, changed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

export interface MaskOptions {
  enabled?: boolean;
  maxStringLen?: number;
  maxDepth?: number;
}

const DEFAULT_OPTIONS: Required<MaskOptions> = {
  enabled: true,
  maxStringLen: 2000,
  maxDepth: 8
};

// 객체/배열을 재귀적으로 순회하면서 민감정보 마스킹 + 길이 제한
export function maskSensitive<T = unknown>(input: T, opts: MaskOptions = {}): MaskResult<T> {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  if (!o.enabled) return { value: input, changed: false };
  let changed = false;

  function walk(v: unknown, depth: number, parentKey?: string): unknown {
    if (depth > o.maxDepth) return "[masked-truncated]";
    if (v == null) return v;
    if (typeof v === "string") {
      // 키 자체가 민감하면 통째로 마스킹
      if (parentKey && SENSITIVE_KEY_RE.test(parentKey)) {
        changed = true;
        return "[masked-secret]";
      }
      const r = maskString(v);
      if (r.changed) changed = true;
      const s = r.value;
      if (s.length > o.maxStringLen) {
        changed = true;
        return s.slice(0, o.maxStringLen) + `…[+${s.length - o.maxStringLen} chars truncated]`;
      }
      return s;
    }
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      const MAX_ITEMS = 100;
      for (let i = 0; i < Math.min(v.length, MAX_ITEMS); i++) {
        out.push(walk(v[i], depth + 1, parentKey));
      }
      if (v.length > MAX_ITEMS) {
        changed = true;
        out.push(`[masked-truncated: +${v.length - MAX_ITEMS} more items]`);
      }
      return out;
    }
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        // 키가 민감 카테고리이고 값이 string/숫자면 통째로 마스킹
        if (SENSITIVE_KEY_RE.test(k)) {
          changed = true;
          out[k] = "[masked-secret]";
        } else {
          out[k] = walk(val, depth + 1, k);
        }
      }
      return out;
    }
    // 그 외 (function, symbol 등) — 직렬화 불가 표시
    return "[unserializable]";
  }

  const value = walk(input, 0) as T;
  return { value, changed };
}

// 단순 문자열에 대해 길이 제한만 적용 (input/output 요약)
export function truncate(s: unknown, maxLen: number): { value: string; truncated: boolean } {
  const str = typeof s === "string" ? s : (() => {
    try { return JSON.stringify(s); } catch { return String(s); }
  })();
  if (str.length <= maxLen) return { value: str, truncated: false };
  return { value: str.slice(0, maxLen) + `…[+${str.length - maxLen} chars truncated]`, truncated: true };
}
