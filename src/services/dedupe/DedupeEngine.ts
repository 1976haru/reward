import path from "node:path";
import { canonicalizeUrl, hashString, hostPathKey } from "./UrlCanonicalizer.js";
import { hashText } from "./ContentHasher.js";
import { similarity } from "./TextSimilarity.js";
import { ensureDir, writeJson } from "../../utils/fs.js";
import type {
  DedupeBatchResult,
  DedupeCandidateInput,
  DedupeExistingCandidate,
  DedupeReason,
  DedupeResult,
  DedupeStatus
} from "../../types/dedupe.js";

const SAFETY_NOTICE =
  "중복 제거는 분석 효율을 위한 보조 기능이며, 애매한 유사 후보는 사람이 확인해야 합니다. 기존 Case를 자동 삭제하지 않습니다.";

const REPORT_FILE = path.join(process.cwd(), "data/dedupe/latest-report.json");

// 임계값 — 보수적으로 설정. 0.85 이상이면 거의 같은 제목.
const TITLE_DUPLICATE_THRESHOLD = 0.85;
const TITLE_POSSIBLE_THRESHOLD = 0.7;

export class DedupeEngine {
  /**
   * 단일 후보 dedupe.
   * 우선순위: exact URL hash → canonical URL → contentHash → domain+path → title similarity
   */
  dedupeCandidate(
    candidate: DedupeCandidateInput,
    existing: DedupeExistingCandidate[]
  ): DedupeResult {
    const reasons: DedupeReason[] = [];
    const canon = canonicalizeUrl(candidate.url);
    const canonicalUrl = canon.canonicalUrl;
    const urlHash = canon.urlHash;
    if (!canon.ok) {
      reasons.push({ code: "URL_INVALID", detail: canon.warning ?? "invalid url" });
    }
    const contentHash = candidate.contentText ? hashText(candidate.contentText) : undefined;

    let status: DedupeStatus = "UNIQUE";
    let duplicateOf: string | undefined;

    const candTitle = candidate.title ?? "";
    const candHostPath = hostPathKey(canonicalUrl);

    for (const ex of existing) {
      const exCanon = ex.canonicalUrl ?? canonicalizeUrl(ex.url).canonicalUrl;
      const exHash = ex.urlHash ?? hashString(exCanon);

      // 1) exact URL hash
      if (exHash === urlHash && urlHash.length > 0) {
        status = "DUPLICATE";
        duplicateOf = ex.id;
        reasons.push({ code: "EXACT_URL_HASH", detail: "same canonical URL hash" });
        break;
      }
      // 2) canonical URL string match
      if (exCanon && exCanon === canonicalUrl && canonicalUrl.length > 0) {
        status = "DUPLICATE";
        duplicateOf = ex.id;
        reasons.push({ code: "CANONICAL_URL_MATCH", detail: "canonical URL matches" });
        break;
      }
      // 3) content hash
      if (contentHash && ex.contentHash && ex.contentHash === contentHash) {
        status = "DUPLICATE";
        duplicateOf = ex.id;
        reasons.push({ code: "CONTENT_HASH_MATCH", detail: "same content hash" });
        break;
      }
    }

    if (status !== "DUPLICATE") {
      // 4) host + path 동일 (쿼리 무시) → POSSIBLE
      for (const ex of existing) {
        const exCanon = ex.canonicalUrl ?? canonicalizeUrl(ex.url).canonicalUrl;
        if (!exCanon) continue;
        if (hostPathKey(exCanon) === candHostPath && exCanon !== canonicalUrl) {
          status = "POSSIBLE_DUPLICATE";
          duplicateOf = duplicateOf ?? ex.id;
          reasons.push({ code: "DOMAIN_PATH_MATCH", detail: `same host+path as ${ex.id}` });
          break;
        }
      }
    }

    if (status !== "DUPLICATE") {
      // 5) title similarity
      let bestSim = 0;
      let bestId: string | undefined;
      for (const ex of existing) {
        if (!ex.title || !candTitle) continue;
        const sim = similarity(candTitle, ex.title);
        if (sim > bestSim) { bestSim = sim; bestId = ex.id; }
      }
      if (bestId && bestSim >= TITLE_DUPLICATE_THRESHOLD) {
        status = "DUPLICATE";
        duplicateOf = bestId;
        reasons.push({ code: "TITLE_SIMILARITY", detail: `title similarity ≥ ${TITLE_DUPLICATE_THRESHOLD}`, score: bestSim });
      } else if (bestId && bestSim >= TITLE_POSSIBLE_THRESHOLD) {
        if (status === "UNIQUE") status = "POSSIBLE_DUPLICATE";
        duplicateOf = duplicateOf ?? bestId;
        reasons.push({ code: "TITLE_SIMILARITY", detail: `title similarity ≥ ${TITLE_POSSIBLE_THRESHOLD}`, score: bestSim });
      }
    }

    return {
      status,
      duplicateOf,
      canonicalUrl,
      urlHash,
      contentHash,
      reasons
    };
  }

  /**
   * 배치 dedupe. 입력 배열을 순회하며 누적 known 집합에 대해 dedupe 한다.
   * UNIQUE는 known에 추가, DUPLICATE/POSSIBLE_DUPLICATE는 결과만 기록한다.
   */
  dedupeBatch(
    candidates: DedupeCandidateInput[],
    existing: DedupeExistingCandidate[] = []
  ): DedupeBatchResult {
    const known: DedupeExistingCandidate[] = existing.slice();
    const results: DedupeBatchResult["results"] = [];
    for (const c of candidates) {
      const r = this.dedupeCandidate(c, known);
      results.push({ ...r, inputId: c.id, inputUrl: c.url });
      if (r.status === "UNIQUE") {
        known.push({
          id: c.id ?? `auto-${results.length}`,
          url: c.url,
          canonicalUrl: r.canonicalUrl,
          urlHash: r.urlHash,
          title: c.title,
          contentHash: r.contentHash
        });
      }
    }
    const dup = results.filter((r) => r.status === "DUPLICATE").length;
    const possible = results.filter((r) => r.status === "POSSIBLE_DUPLICATE").length;
    const total = results.length;
    const rate = total === 0 ? 0 : (dup + possible) / total;
    return {
      summary: {
        total,
        kept: total - dup - possible,
        duplicates: dup,
        possibleDuplicates: possible,
        duplicateRate: Math.round(rate * 1000) / 1000
      },
      results,
      generatedAt: new Date().toISOString(),
      safetyNotice: SAFETY_NOTICE
    };
  }

  async writeReport(report: DedupeBatchResult): Promise<void> {
    await ensureDir(path.dirname(REPORT_FILE));
    await writeJson(REPORT_FILE, report);
  }

  async readLatestReport(): Promise<DedupeBatchResult | null> {
    try {
      const { readJson } = await import("../../utils/fs.js");
      return await readJson<DedupeBatchResult>(REPORT_FILE);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw error;
    }
  }
}

export const dedupeEngine = new DedupeEngine();
export { SAFETY_NOTICE as DEDUPE_SAFETY_NOTICE };
