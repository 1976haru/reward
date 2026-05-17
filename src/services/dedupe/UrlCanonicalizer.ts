import { createHash } from "node:crypto";

// 알려진 트래킹 쿼리 파라미터 — canonicalize 시 제거.
// utm_*, fbclid, gclid 등 일반 추적자 + 한국 쇼핑/검색 추적자.
const TRACKING_PARAMS_EXACT = new Set([
  "fbclid", "gclid", "msclkid", "dclid", "yclid", "wbraid", "gbraid",
  "mc_eid", "mc_cid",
  "_hsenc", "_hsmi", "__hssc", "__hstc", "hsCtaTracking",
  "ref", "ref_", "ref_src", "ref_url", "referrer",
  "spm", "scm",
  "igshid", "igsh",
  "naver_search_query", "ne_co_no", "ne_org_lc",
  "trk", "trk_url",
  "share", "share_token",
  "tt_medium", "tt_content",
  "from", "src", "src_pl", "src_app"
]);

const TRACKING_PARAM_PREFIX = ["utm_"];

const DEFAULT_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443"
};

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  if (TRACKING_PARAMS_EXACT.has(k)) return true;
  return TRACKING_PARAM_PREFIX.some((p) => k.startsWith(p));
}

export function removeTrackingParams(searchParams: URLSearchParams): { removed: string[]; remaining: URLSearchParams } {
  const removed: string[] = [];
  const remaining = new URLSearchParams();
  // 정렬해서 안정적인 표현 보장
  const entries = [...searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, val] of entries) {
    if (isTrackingParam(key)) {
      removed.push(key);
    } else {
      remaining.append(key, val);
    }
  }
  return { removed, remaining };
}

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  // 다중 슬래시 정리, 끝의 / 제거 (루트 제외)
  let p = pathname.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export interface CanonicalizeResult {
  ok: boolean;
  canonicalUrl: string;
  urlHash: string;
  host?: string;
  removedTrackingParams: string[];
  warning?: string;
}

export function canonicalizeUrl(input: string): CanonicalizeResult {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, canonicalUrl: "", urlHash: hashString(""), removedTrackingParams: [], warning: "empty url" };
  }
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    // 비URL 입력은 원문 trim 결과를 해시해 fallback
    const fallback = input.trim().toLowerCase();
    return { ok: false, canonicalUrl: fallback, urlHash: hashString(fallback), removedTrackingParams: [], warning: "invalid url" };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    const repr = `${u.protocol}//${u.hostname.toLowerCase()}${normalizePath(u.pathname)}`;
    return {
      ok: false, canonicalUrl: repr, urlHash: hashString(repr),
      host: u.hostname.toLowerCase(), removedTrackingParams: [],
      warning: `non-http(s) protocol: ${u.protocol}`
    };
  }

  // host 정규화
  u.hostname = u.hostname.toLowerCase();
  // 기본 포트 제거
  if (DEFAULT_PORTS[u.protocol] === u.port) u.port = "";
  // 경로 정규화
  u.pathname = normalizePath(u.pathname);
  // 쿼리 정규화 (트래킹 제거 + 정렬)
  const { removed, remaining } = removeTrackingParams(u.searchParams);
  // searchParams 재설정
  const rebuiltSearch = remaining.toString();
  u.search = rebuiltSearch ? `?${rebuiltSearch}` : "";
  // 프래그먼트 제거
  u.hash = "";

  const canonical = u.toString();
  return {
    ok: true,
    canonicalUrl: canonical,
    urlHash: hashString(canonical),
    host: u.hostname,
    removedTrackingParams: removed
  };
}

export function hashString(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// 도메인 + 경로 기반 near-duplicate 키 (쿼리 무시)
export function hostPathKey(canonicalUrl: string): string {
  try {
    const u = new URL(canonicalUrl);
    return `${u.hostname.toLowerCase()}${normalizePath(u.pathname)}`;
  } catch {
    return canonicalUrl;
  }
}
