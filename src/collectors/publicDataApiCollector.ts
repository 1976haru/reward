// 공공데이터 API 수집기 (체크리스트 11).
//
// 본 모듈은 공공데이터포털(data.go.kr) 류의 오픈 API에서 공개자료를 안전하게 수집하기 위한
// 순수/주입형 유틸 모음이다. 핵심 안전 원칙:
//
//   - 인증키(serviceKey)는 코드에 하드코딩하지 않는다. 환경변수에서만 읽는다.
//   - 로그·에러 메시지에는 serviceKey 원문을 절대 남기지 않는다 (maskServiceKey 통과).
//   - 요청 간격(rate limit), 타임아웃, 재시도(429/5xx/네트워크)를 강제한다.
//   - 총 수집 건수는 maxRecords 를 초과하지 않는다 (무제한 호출 금지).
//   - 저장 전 개인정보는 sanitizeForStorage 로 마스킹한다 (개인정보 원문 저장 금지).
//
// 본 모듈은 자동 신고/로그인 우회/인증 우회/약관 위반 수집을 수행하지 않는다.
// 실제 수집은 활용신청·인증키·트래픽 제한·이용약관을 확인한 뒤에만 수행해야 한다.
//
// 테스트는 fetch 를 주입(fetchImpl)할 수 있어 네트워크 없이 결정적으로 검증된다.
// 본 모듈은 법률 자문이나 운영기관 공식 안내를 대체하지 않는다.

import path from "node:path";
import { appendFile, writeFile } from "node:fs/promises";
import { ensureDir } from "../utils/fs.js";
import { sanitizeForStorage } from "../policy/privacyGuard.js";

// ---------- fetch 추상화 (테스트 주입용) ----------

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> }
) => Promise<FetchLikeResponse>;

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

// ---------- 타입 ----------

export interface PublicDataApiCollectorConfig {
  /** 수집 결과 저장 루트 (기본 data/collector). 실행별 runs/{runId} 하위에 저장된다. */
  outputDir: string;
  /** 페이지당 요청 건수 (numOfRows). */
  pageSize: number;
  /** 최대 수집 건수 — 이 값을 초과해 수집하지 않는다. */
  maxRecords: number;
  /** 요청 간격(ms). 무제한 호출 금지를 위해 1초 이상 권장. */
  rateLimitMs: number;
  /** 요청 타임아웃(ms). */
  timeoutMs: number;
  /** 최대 재시도 횟수. */
  maxRetries: number;
}

export interface PublicDataApiRequestOptions {
  /** 실제 호출 가능한 API endpoint (data.go.kr 상세 페이지 URL 이 아님). */
  baseUrl: string;
  /** 페이지/사이즈 외 고정 쿼리 파라미터. */
  params?: Record<string, string | number>;
  /** 페이지 번호 파라미터명 (기본 "pageNo"). */
  pageParam?: string;
  /** 페이지 크기 파라미터명 (기본 "numOfRows"). */
  sizeParam?: string;
  /** 인증키 — 생략 시 환경변수에서 읽는다. 로그에는 절대 원문 출력 금지. */
  serviceKey?: string;
  /** 수집 대상 API 식별용 표시명 (로그/파일에 사용). */
  apiName?: string;
  /** config 개별 override (생략 시 환경변수/기본값). */
  outputDir?: string;
  pageSize?: number;
  maxRecords?: number;
  rateLimitMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** 실행 ID 직접 지정 (생략 시 createCollectorRunId). */
  runId?: string;
  /** 테스트/대체 fetch 구현 (생략 시 global fetch). */
  fetchImpl?: FetchLike;
  /** records.jsonl 에 원본 응답 텍스트도 함께 남길지 여부 (기본 false — 최소수집). */
  keepRawText?: boolean;
}

export interface PublicDataApiCollectionLog {
  runId: string;
  apiName: string;
  /** serviceKey 가 마스킹된 endpoint (원문 키 미노출). */
  endpointMasked: string;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "incomplete" | "error";
  totalRecords: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
  pageSize: number;
  maxRecords: number;
  rateLimitMs: number;
  timeoutMs: number;
  maxRetries: number;
  /** 마스킹으로 인해 변경된 레코드 수 (개인정보 탐지 신호). */
  sanitizedRecordCount: number;
  recordsFile: string;
  collectionLogFile: string;
  errorLogFile: string;
  notes: string[];
}

export interface PublicDataApiErrorEntry {
  at: string;
  /** serviceKey 가 마스킹된 URL. */
  urlMasked: string;
  attempt: number;
  status?: number;
  phase: "request" | "parse" | "extract";
  message: string;
}

export interface PublicDataApiErrorLog {
  runId: string;
  apiName: string;
  errorsCount: number;
  errors: PublicDataApiErrorEntry[];
}

export interface PublicDataApiCollectionResult {
  runId: string;
  apiName: string;
  endpointMasked: string;
  totalRecords: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
  /** maxRecords 목표에 도달했는지. */
  reachedTarget: boolean;
  startedAt: string;
  finishedAt: string;
  recordsFile: string;
  collectionLogFile: string;
  errorLogFile: string;
  log: PublicDataApiCollectionLog;
  errorLog: PublicDataApiErrorLog;
}

// ---------- 기본값 ----------

export const DEFAULT_PAGE_PARAM = "pageNo";
export const DEFAULT_SIZE_PARAM = "numOfRows";
export const DEFAULT_SERVICE_KEY_PARAM = "serviceKey";

/** 재시도 대상 HTTP 상태 코드. */
export const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function loadCollectorConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PublicDataApiCollectorConfig {
  const num = (v: string | undefined, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    outputDir: env.COLLECTOR_OUTPUT_DIR && env.COLLECTOR_OUTPUT_DIR.trim().length > 0
      ? env.COLLECTOR_OUTPUT_DIR
      : "data/collector",
    pageSize: num(env.COLLECTOR_PAGE_SIZE, 100),
    maxRecords: num(env.COLLECTOR_MAX_RECORDS, 1000),
    rateLimitMs: num(env.COLLECTOR_RATE_LIMIT_MS, 1000),
    timeoutMs: num(env.COLLECTOR_TIMEOUT_MS, 15000),
    maxRetries: num(env.COLLECTOR_MAX_RETRIES, 3)
  };
}

// ---------- 1. getPublicDataServiceKey ----------

export class MissingServiceKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingServiceKeyError";
  }
}

/**
 * DATA_GO_KR_SERVICE_KEY 또는 PUBLIC_DATA_SERVICE_KEY 에서 인증키를 읽는다.
 * 없으면 명확한 에러를 던진다. 반환 전/에러 시 로그에 원문 키를 출력하지 않는다.
 */
export function getPublicDataServiceKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = (env.DATA_GO_KR_SERVICE_KEY ?? env.PUBLIC_DATA_SERVICE_KEY ?? "").trim();
  if (!key) {
    throw new MissingServiceKeyError(
      "공공데이터 인증키가 없습니다. 환경변수 DATA_GO_KR_SERVICE_KEY 또는 PUBLIC_DATA_SERVICE_KEY 를 설정하세요. " +
        "(API 키는 코드에 하드코딩하거나 git 에 커밋하지 않습니다.)"
    );
  }
  return key;
}

// ---------- 2. maskServiceKey ----------

/**
 * 인증키를 로그에 남길 때 앞 4자리 + 뒤 4자리만 남기고 마스킹한다.
 * 8자 이하의 짧은 값은 전체 마스킹한다.
 */
export function maskServiceKey(value: string): string {
  if (typeof value !== "string" || value.length === 0) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  const head = value.slice(0, 4);
  const tail = value.slice(-4);
  return `${head}...${tail}`;
}

// ---------- 3. buildPublicDataUrl ----------

export interface BuiltUrl {
  /** 실제 호출용 URL (serviceKey 원문 포함). */
  url: string;
  /** 로그용 URL (serviceKey 마스킹). */
  maskedUrl: string;
}

/**
 * serviceKey 를 포함한 호출 URL 과, serviceKey 가 마스킹된 로그용 URL 을 함께 만든다.
 * data.go.kr 인증키는 이미 URL 인코딩된 경우가 많아 이중 인코딩을 피하려 직접 조립한다.
 */
export function buildPublicDataUrl(
  baseUrl: string,
  params: Record<string, string | number> = {},
  serviceKey: string,
  serviceKeyParam: string = DEFAULT_SERVICE_KEY_PARAM
): BuiltUrl {
  const qs: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  // serviceKey 는 보통 이미 인코딩되어 제공되므로 원문 그대로 부착한다.
  const keyPart = `${encodeURIComponent(serviceKeyParam)}=${serviceKey}`;
  const sep = baseUrl.includes("?") ? "&" : "?";
  const query = [keyPart, ...qs].join("&");
  const url = `${baseUrl}${sep}${query}`;
  const maskedKeyPart = `${encodeURIComponent(serviceKeyParam)}=${maskServiceKey(serviceKey)}`;
  const maskedUrl = `${baseUrl}${sep}${[maskedKeyPart, ...qs].join("&")}`;
  return { url, maskedUrl };
}

/** URL 문자열에서 serviceKey 값을 마스킹한다 (로그 안전용 방어 함수). */
export function maskUrlServiceKey(url: string, serviceKeyParam: string = DEFAULT_SERVICE_KEY_PARAM): string {
  if (typeof url !== "string") return "";
  const re = new RegExp(`(${escapeRegExp(serviceKeyParam)}=)([^&\\s]+)`, "gi");
  return url.replace(re, (_m, p1, val) => `${p1}${maskServiceKey(val)}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- 4. sleep ----------

export function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 5. fetchWithTimeout ----------

function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  const g = (globalThis as { fetch?: unknown }).fetch;
  if (typeof g !== "function") {
    throw new Error("global fetch 를 사용할 수 없습니다. Node 18+ 또는 fetchImpl 주입이 필요합니다.");
  }
  return g as unknown as FetchLike;
}

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl?: FetchLike
): Promise<FetchLikeResponse> {
  const doFetch = resolveFetch(fetchImpl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json, text/xml;q=0.9, */*;q=0.5" }
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 6. fetchWithRetry ----------

export interface FetchWithRetryOptions {
  maxRetries: number;
  timeoutMs: number;
  /** 재시도 사이 기본 지연(ms). exponential backoff 의 베이스. */
  retryDelayMs?: number;
  fetchImpl?: FetchLike;
  /** 로그용 마스킹된 URL (에러 기록용). 미지정 시 url 을 마스킹해 사용. */
  maskedUrl?: string;
  /** 재시도/실패 시 호출되는 에러 기록 콜백. */
  onError?: (entry: PublicDataApiErrorEntry) => void;
  serviceKeyParam?: string;
}

/**
 * 429/5xx/네트워크 오류에 대해 재시도한다. 최대 재시도 초과 시 마지막 에러를 던진다.
 * 모든 에러는 onError 콜백으로 마스킹된 형태로 전달된다 (serviceKey 원문 미노출).
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions
): Promise<FetchLikeResponse> {
  const {
    maxRetries,
    timeoutMs,
    retryDelayMs = 500,
    fetchImpl,
    onError,
    serviceKeyParam = DEFAULT_SERVICE_KEY_PARAM
  } = options;
  const maskedUrl = options.maskedUrl ?? maskUrlServiceKey(url, serviceKeyParam);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const res = await fetchWithTimeout(url, timeoutMs, fetchImpl);
      if (res.ok) return res;
      if (RETRYABLE_STATUS.has(res.status) && attempt <= maxRetries) {
        onError?.({
          at: new Date().toISOString(),
          urlMasked: maskedUrl,
          attempt,
          status: res.status,
          phase: "request",
          message: `재시도 대상 응답 status=${res.status}`
        });
        await sleep(retryDelayMs * Math.pow(2, attempt - 1));
        continue;
      }
      // 비재시도 상태이거나 재시도 소진
      const err = new Error(`HTTP ${res.status} (재시도 불가 또는 소진)`);
      onError?.({
        at: new Date().toISOString(),
        urlMasked: maskedUrl,
        attempt,
        status: res.status,
        phase: "request",
        message: err.message
      });
      throw err;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // 마스킹: 에러 메시지에 serviceKey 가 섞일 가능성 차단
      lastError.message = maskUrlServiceKey(lastError.message, serviceKeyParam);
      if (attempt <= maxRetries) {
        onError?.({
          at: new Date().toISOString(),
          urlMasked: maskedUrl,
          attempt,
          phase: "request",
          message: `네트워크/요청 오류 재시도: ${lastError.message}`
        });
        await sleep(retryDelayMs * Math.pow(2, attempt - 1));
        continue;
      }
      onError?.({
        at: new Date().toISOString(),
        urlMasked: maskedUrl,
        attempt,
        phase: "request",
        message: `최대 재시도 초과: ${lastError.message}`
      });
      throw lastError;
    }
  }
  throw lastError ?? new Error("fetchWithRetry: 알 수 없는 오류");
}

// ---------- 7. normalizePublicDataResponse ----------

export interface NormalizedResponse {
  format: "json" | "xml" | "text";
  payload: unknown;
  /** XML/text 의 경우 원본 텍스트 (필요 시 보존). */
  rawText?: string;
}

/**
 * JSON/XML/text 응답을 공통 구조로 정규화한다.
 * - JSON 이면 파싱해 payload 로 둔다.
 * - XML 이면 라이브러리 없이 방어적으로 <item> 블록을 추출해 객체 배열로 만든다.
 * - 그 외에는 text 로 보존한다.
 */
export function normalizePublicDataResponse(responseText: string): NormalizedResponse {
  const text = typeof responseText === "string" ? responseText : String(responseText ?? "");
  const trimmed = text.trim();
  if (trimmed.length === 0) return { format: "text", payload: null, rawText: text };

  // JSON 우선
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { format: "json", payload: JSON.parse(trimmed) };
    } catch {
      // fallthrough — JSON 아님
    }
  }

  // XML 방어적 처리 (외부 라이브러리 없음)
  if (trimmed.startsWith("<")) {
    const items = parseXmlItems(trimmed);
    return {
      format: "xml",
      payload: { items: { item: items } },
      rawText: text
    };
  }

  return { format: "text", payload: trimmed, rawText: text };
}

/** <item>...</item> 블록을 추출해 { tag: value } 객체 배열로 변환 (방어적, 단순 케이스만). */
function parseXmlItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1];
    const obj: Record<string, string> = {};
    const tagRe = /<([A-Za-z_][\w.\-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(body)) !== null) {
      const tag = t[1];
      let val = t[2].trim();
      val = val.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
      obj[tag] = val;
    }
    items.push(obj);
  }
  return items;
}

// ---------- 8. extractRecordsFromPublicDataResponse ----------

/**
 * 공공데이터 응답의 흔한 구조에서 레코드 배열을 방어적으로 추출한다.
 * 지원: response.body.items.item / body.items.item / items.item / items / item / data / 최상위 배열.
 * 배열이 아니면 배열로 변환한다.
 */
export function extractRecordsFromPublicDataResponse(payload: unknown): unknown[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object") return [payload];

  const obj = payload as Record<string, unknown>;

  // data.go.kr 표준: response.body.items.item
  const candidates: unknown[] = [
    dig(obj, ["response", "body", "items", "item"]),
    dig(obj, ["response", "body", "items"]),
    dig(obj, ["body", "items", "item"]),
    dig(obj, ["body", "items"]),
    dig(obj, ["items", "item"]),
    dig(obj, ["items"]),
    dig(obj, ["item"]),
    dig(obj, ["data"]),
    dig(obj, ["records"]),
    dig(obj, ["list"])
  ];

  for (const c of candidates) {
    if (c == null) continue;
    if (Array.isArray(c)) return c;
    // items 가 { item: [...] } 형태인 경우
    if (typeof c === "object") {
      const inner = (c as Record<string, unknown>).item;
      if (Array.isArray(inner)) return inner;
      if (inner != null) return [inner];
      // 단일 객체 레코드
      return [c];
    }
  }
  return [];
}

function dig(obj: Record<string, unknown>, pathKeys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of pathKeys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

// ---------- 9. sanitizeRecordForStorage ----------

export interface SanitizedRecord {
  record: unknown;
  changed: boolean;
  detectedTypes: string[];
}

/**
 * 레코드를 저장 전 정제한다. 문자열 필드 단위로 sanitizeForStorage(privacyGuard)를 적용해
 * 개인정보 원문이 저장되지 않게 한다. 중첩 객체/배열도 재귀 처리한다.
 */
export function sanitizeRecordForStorage(record: unknown): SanitizedRecord {
  const detected = new Set<string>();
  let changed = false;

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const res = sanitizeForStorage(value);
      if (res.changed) changed = true;
      for (const t of res.detectedTypes) detected.add(t);
      return res.sanitizedText;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };

  return { record: walk(record), changed, detectedTypes: Array.from(detected) };
}

// ---------- 11. createCollectorRunId ----------

/** 실행 ID 를 만든다. 파일 경로에 안전한 형태로 날짜·랜덤을 포함한다. */
export function createCollectorRunId(prefix?: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 8);
  const safePrefix = (prefix ?? "run").replace(/[^a-zA-Z0-9가-힣._-]+/g, "_").slice(0, 40);
  return `${safePrefix}_${stamp}_${rand}`;
}

// ---------- 12. writeJsonl ----------

/** 레코드 배열을 JSONL 로 저장한다 (한 줄에 한 JSON). */
export async function writeJsonl(filePath: string, records: unknown[]): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const lines = records.map((r) => JSON.stringify(r)).join("\n");
  await writeFile(filePath, records.length > 0 ? lines + "\n" : "", "utf8");
}

/** 레코드 한 건을 JSONL 파일에 append 한다 (스트리밍 저장용). */
export async function appendJsonl(filePath: string, record: unknown): Promise<void> {
  await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
}

// ---------- 13. writeCollectorLog ----------

/** 실행 로그/오류 로그 JSON 을 저장한다. */
export async function writeCollectorLog(
  filePath: string,
  log: PublicDataApiCollectionLog | PublicDataApiErrorLog
): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(log, null, 2), "utf8");
}

// ---------- 10. collectPublicDataApi ----------

/**
 * 공공데이터 API 를 페이지 단위로 반복 수집한다.
 * - 요청 간격(rate limit)·타임아웃·재시도를 적용한다.
 * - 저장 전 개인정보를 마스킹한다.
 * - records.jsonl / collection-log.json / error-log.json 을 저장한다.
 * - 총 수집 건수는 maxRecords 를 초과하지 않는다.
 */
export async function collectPublicDataApi(
  options: PublicDataApiRequestOptions,
  env: NodeJS.ProcessEnv = process.env
): Promise<PublicDataApiCollectionResult> {
  const cfg = loadCollectorConfigFromEnv(env);
  const pageSize = options.pageSize ?? cfg.pageSize;
  const maxRecords = options.maxRecords ?? cfg.maxRecords;
  const rateLimitMs = options.rateLimitMs ?? cfg.rateLimitMs;
  const timeoutMs = options.timeoutMs ?? cfg.timeoutMs;
  const maxRetries = options.maxRetries ?? cfg.maxRetries;
  const outputRoot = options.outputDir ?? cfg.outputDir;

  const apiName = options.apiName ?? "public-data-api";
  const pageParam = options.pageParam ?? DEFAULT_PAGE_PARAM;
  const sizeParam = options.sizeParam ?? DEFAULT_SIZE_PARAM;
  const serviceKey = options.serviceKey ?? getPublicDataServiceKey(env);
  const runId = options.runId ?? createCollectorRunId(apiName);

  const runDir = path.join(outputRoot, "runs", runId);
  const recordsFile = path.join(runDir, "records.jsonl");
  const collectionLogFile = path.join(runDir, "collection-log.json");
  const errorLogFile = path.join(runDir, "error-log.json");

  await ensureDir(runDir);
  // records.jsonl 초기화 (이전 잔여물 방지)
  await writeFile(recordsFile, "", "utf8");

  const startedAt = new Date().toISOString();
  const errors: PublicDataApiErrorEntry[] = [];
  const onError = (e: PublicDataApiErrorEntry) => errors.push(e);

  let total = 0;
  let requestCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let sanitizedRecordCount = 0;
  const notes: string[] = [];

  // 무한 루프 방지 — maxRecords/pageSize 기반 상한 + 여유
  const maxPages = Math.ceil(maxRecords / Math.max(1, pageSize)) + 5;
  let endpointMasked = "";

  for (let page = 1; page <= maxPages && total < maxRecords; page++) {
    const remaining = maxRecords - total;
    const rows = Math.min(pageSize, remaining);
    const params: Record<string, string | number> = {
      ...(options.params ?? {}),
      [pageParam]: page,
      [sizeParam]: rows
    };
    const { url, maskedUrl } = buildPublicDataUrl(options.baseUrl, params, serviceKey);
    if (!endpointMasked) endpointMasked = maskedUrl;

    requestCount++;
    let res: FetchLikeResponse;
    try {
      res = await fetchWithRetry(url, {
        maxRetries,
        timeoutMs,
        fetchImpl: options.fetchImpl,
        maskedUrl,
        onError
      });
    } catch (e) {
      failureCount++;
      const msg = e instanceof Error ? e.message : String(e);
      onError({
        at: new Date().toISOString(),
        urlMasked: maskedUrl,
        attempt: maxRetries + 1,
        phase: "request",
        message: `페이지 ${page} 수집 실패: ${msg}`
      });
      // 한 페이지 실패 시 수집 중단 (부분 결과는 보존)
      notes.push(`페이지 ${page} 에서 수집 중단 (요청 실패)`);
      break;
    }

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (e) {
      failureCount++;
      onError({
        at: new Date().toISOString(),
        urlMasked: maskedUrl,
        attempt: 1,
        phase: "parse",
        message: `본문 읽기 실패: ${e instanceof Error ? e.message : String(e)}`
      });
      break;
    }

    let records: unknown[] = [];
    try {
      const normalized = normalizePublicDataResponse(bodyText);
      records = extractRecordsFromPublicDataResponse(normalized.payload);
    } catch (e) {
      onError({
        at: new Date().toISOString(),
        urlMasked: maskedUrl,
        attempt: 1,
        phase: "extract",
        message: `레코드 추출 실패: ${e instanceof Error ? e.message : String(e)}`
      });
      records = [];
    }

    successCount++;

    if (records.length === 0) {
      notes.push(`페이지 ${page} 응답에 레코드 없음 — 수집 종료`);
      break;
    }

    for (const rec of records) {
      if (total >= maxRecords) break;
      const sanitized = sanitizeRecordForStorage(rec);
      if (sanitized.changed) sanitizedRecordCount++;
      const stored = options.keepRawText
        ? { ...(sanitized.record as object), _collectedAt: new Date().toISOString() }
        : sanitized.record;
      await appendJsonl(recordsFile, stored);
      total++;
    }

    // 마지막 페이지로 보이면(요청보다 적게 옴) 종료
    if (records.length < rows) {
      notes.push(`페이지 ${page} 가 요청(${rows})보다 적은 ${records.length}건 — 마지막 페이지로 판단`);
      break;
    }

    // 다음 요청 전 rate limit 적용 (목표 도달 시엔 생략)
    if (total < maxRecords) {
      await sleep(rateLimitMs);
    }
  }

  const finishedAt = new Date().toISOString();
  const reachedTarget = total >= maxRecords;
  const status: PublicDataApiCollectionLog["status"] =
    successCount === 0 ? "error" : reachedTarget ? "ok" : "incomplete";

  if (sanitizedRecordCount > 0) {
    notes.push(`${sanitizedRecordCount}건 레코드에서 개인정보 패턴이 마스킹되었습니다.`);
  }

  const log: PublicDataApiCollectionLog = {
    runId,
    apiName,
    endpointMasked: endpointMasked || maskUrlServiceKey(options.baseUrl),
    startedAt,
    finishedAt,
    status,
    totalRecords: total,
    requestCount,
    successCount,
    failureCount,
    pageSize,
    maxRecords,
    rateLimitMs,
    timeoutMs,
    maxRetries,
    sanitizedRecordCount,
    recordsFile,
    collectionLogFile,
    errorLogFile,
    notes
  };

  const errorLog: PublicDataApiErrorLog = {
    runId,
    apiName,
    errorsCount: errors.length,
    errors
  };

  await writeCollectorLog(collectionLogFile, log);
  await writeCollectorLog(errorLogFile, errorLog);

  return {
    runId,
    apiName,
    endpointMasked: log.endpointMasked,
    totalRecords: total,
    requestCount,
    successCount,
    failureCount,
    reachedTarget,
    startedAt,
    finishedAt,
    recordsFile,
    collectionLogFile,
    errorLogFile,
    log,
    errorLog
  };
}

// ---------- 안내문 ----------

export const PUBLIC_DATA_COLLECTOR_NOTICE =
  "본 수집기는 공개자료 중심 분석 원칙과 개인정보 최소수집 원칙을 따릅니다. " +
  "인증키는 환경변수로만 관리하며 로그에 원문을 남기지 않습니다. " +
  "실제 수집은 활용신청·인증키·트래픽 제한·이용약관을 확인한 뒤 요청 간격을 두고 안전하게 수행합니다. " +
  "로그인/인증 우회, 무제한 호출, 약관 위반 수집은 수행하지 않습니다.";
