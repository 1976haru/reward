import * as cheerio from "cheerio";
import type { CollectedDocument } from "../types/core.js";
import { normalizeText } from "../utils/text.js";

const DEFAULT_TIMEOUT_MS = Number(process.env.COLLECTOR_TIMEOUT_MS ?? 10000);

export class CollectorAgent {
  /**
   * 공개 URL 1개를 수집한다.
   *
   * 안전 원칙:
   * - http/https 공개 페이지만 대상으로 한다. 로그인/비공개/대량 크롤링/CAPTCHA 우회는 수행하지 않는다.
   * - 네트워크 실패·HTTP 오류·타임아웃이 발생해도 throw 하지 않고 안전한 fallback 문서를 반환해
   *   분석 Case 생성 흐름이 끊기지 않게 한다. fallback 여부는 collectionStatus 로 알린다.
   * - 잘못된 프로토콜(http/https 외)만 입력 오류로 throw 한다.
   */
  async collectUrl(url: string): Promise<CollectedDocument> {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("http/https URL만 분석할 수 있습니다.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "RewardAgentMVP/0.1 (+human-review; public-page-analysis)",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) {
        return this.buildFallback(url, parsed, `수집 실패: HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      $("script,style,noscript,svg").remove();
      const title = normalizeText($("title").first().text() || parsed.hostname);
      const text = normalizeText($("body").text());

      return {
        url,
        title,
        html,
        text,
        fetchedAt: new Date().toISOString(),
        sourceType: "user_url",
        collectionStatus: "fetched"
      };
    } catch (error) {
      const reason = controller.signal.aborted
        ? `수집 시간 초과(${DEFAULT_TIMEOUT_MS}ms)`
        : `수집 실패: ${(error as Error).message}`;
      return this.buildFallback(url, parsed, reason);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 안전한 fallback 문서.
   * 실제 본문이 없으므로 룰 탐지/점수는 0에 가깝게 나오며, 사용자에게 "수집 실패 → 사람이 직접 페이지 확인 필요"임을 알린다.
   * 외부에서 가져온 본문이 아니라 안내 문구만 담으므로 개인정보·약관 위반 수집과 무관하다.
   */
  private buildFallback(url: string, parsed: URL, note: string): CollectedDocument {
    const text =
      `[수집 안내] 이 공개 URL의 본문을 자동으로 가져오지 못했습니다 (${note}). ` +
      `분석은 빈 본문 기준으로 진행되며, 의심 문구·위험점수는 참고용입니다. ` +
      `법 위반 확정이 아니며, 사람이 해당 페이지를 직접 열어 확인한 뒤 검토해야 합니다.`;
    const html =
      `<!doctype html><html lang="ko"><head><title>${escapeHtml(parsed.hostname)}</title></head>` +
      `<body><main><p>${escapeHtml(text)}</p></main></body></html>`;
    return {
      url,
      title: parsed.hostname,
      html,
      text,
      fetchedAt: new Date().toISOString(),
      sourceType: "user_url",
      collectionStatus: "fallback",
      collectionNote: note
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
