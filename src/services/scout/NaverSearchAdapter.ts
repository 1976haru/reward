// Naver Search API 어댑터 — 공식 블로그 검색 API 사용.
//
// 안전 정책:
//   - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 둘 다 있을 때만 활성화 (둘 다 없으면 disabled)
//   - display는 limit에 맞춰 제한, 최대 10건/호출 (네이버 공식 권장 기본값)
//   - 검색 결과 HTML 직접 스크래핑 없음 — 공식 JSON API만 사용
//   - 자동 대량 수집 금지, 호출 간 sleep 등 운영 보호는 후속 단계
//   - 후보는 신고 대상 확정이 아님

import { nanoid } from "nanoid";
import { config } from "../../utils/config.js";
import { scoreCandidate } from "../discovery/CandidateScorer.js";
import { getTopicById } from "../../modules/false-ad/topics.js";
import type { DiscoveryCandidate } from "../../types/candidate.js";
import type { SearchOptions, SearchSourceAdapter } from "./SearchSourceAdapter.js";

interface NaverBlogItem {
  title?: string;
  link?: string;
  description?: string;
  bloggername?: string;
  postdate?: string;
}

interface NaverBlogResponse {
  total?: number;
  start?: number;
  display?: number;
  items?: NaverBlogItem[];
}

function stripHtml(s?: string): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

export class NaverSearchAdapter implements SearchSourceAdapter {
  sourceType = "naver" as const;
  sourceName = "Naver Search API (블로그)";
  status: "active" | "disabled" | "planned" = "disabled";
  disabledReason?: string;

  constructor() {
    if (!this.hasKeys()) {
      this.status = "disabled";
      this.disabledReason = "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되어 있지 않습니다.";
    } else {
      this.status = "active";
    }
  }

  private hasKeys(): boolean {
    return Boolean(config.scout.naverClientId && config.scout.naverClientSecret);
  }

  isEnabled(): boolean {
    return this.hasKeys();
  }

  async search(query: string, options: SearchOptions): Promise<DiscoveryCandidate[]> {
    if (!this.hasKeys()) return [];
    const display = Math.max(1, Math.min(options.limit, 10));
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${display}`;
    const topic = getTopicById(options.topicId);
    const now = new Date().toISOString();
    try {
      const res = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": config.scout.naverClientId,
          "X-Naver-Client-Secret": config.scout.naverClientSecret,
          accept: "application/json"
        }
      });
      if (!res.ok) {
        console.warn(`Naver Search API non-OK: ${res.status}`);
        return [];
      }
      const data = (await res.json()) as NaverBlogResponse;
      const items = Array.isArray(data.items) ? data.items : [];
      const out: DiscoveryCandidate[] = [];
      for (const it of items) {
        const title = stripHtml(it.title) || query;
        const snippet = stripHtml(it.description);
        const link = (it.link ?? "").trim();
        if (!/^https?:\/\//i.test(link)) continue;
        const { score, reasons } = scoreCandidate({ title, snippet, url: link });
        out.push({
          id: nanoid(12),
          moduleId: options.moduleId,
          topic: topic?.label ?? options.topicId,
          keyword: query,
          title,
          url: link,
          snippet,
          source: "scout-naver",
          discoveryMethod: "search_api",
          firstScore: score,
          reasons: [`Naver 블로그 검색 결과(${it.bloggername ?? "blog"})`, ...reasons],
          foundAt: now,
          status: "NEW"
        });
      }
      return out;
    } catch (error) {
      console.warn("Naver Search API 호출 실패:", (error as Error).message);
      return [];
    }
  }
}
