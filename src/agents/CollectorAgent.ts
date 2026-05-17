import * as cheerio from "cheerio";
import type { CollectedDocument } from "../types/core.js";
import { normalizeText } from "../utils/text.js";

export class CollectorAgent {
  async collectUrl(url: string): Promise<CollectedDocument> {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("http/https URL만 분석할 수 있습니다.");
    }

    const response = await fetch(url, {
      headers: {
        "user-agent": "RewardAgentMVP/0.1 (+human-review; public-page-analysis)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`수집 실패: HTTP ${response.status}`);
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
      sourceType: "user_url"
    };
  }
}
