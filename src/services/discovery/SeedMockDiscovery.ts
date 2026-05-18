import { nanoid } from "nanoid";
import type { DiscoveryCandidate, DiscoveryTopic } from "../../types/candidate.js";
import { scoreCandidate } from "./CandidateScorer.js";

/**
 * 외부 검색 API 키 없이도 동작하는 mock 후보 생성기.
 *
 * 중요:
 * - 생성되는 URL은 모두 RFC 6761 예약 도메인(.test/.example/.invalid)을 사용한다.
 *   실제 네트워크 호출이 일어나지 않으며, 분석을 시도해도 실패한다.
 *   즉, 이 어댑터는 "UI/스코어 흐름 검증용"이지 실 분석용이 아니다.
 * - 광고 작성용이 아니라 의심 후보 탐색 UI 시연용이다.
 */
const FAKE_SHOPS = [
  "best-health-shop.test",
  "premium-supplement-mall.example",
  "wellbeing-mart.test",
  "lifehack-deals.example",
  "smart-supplements.invalid"
];

const FAKE_BLOGS = [
  "wellness-blog.example",
  "healthy-life-diary.test",
  "supplement-review.example"
];

const TITLE_TEMPLATES = [
  "[광고] {keyword} – 즉시 효과 후기",
  "{keyword} – 약 없이 개선되는 방법",
  "{keyword} 정품 최저가 / 후기 모음",
  "{keyword} 완치 사례 모음",
  "기적의 {keyword} – 사용 후기"
];

const SNIPPET_TEMPLATES = [
  "이 영양제 하나로 {disease}가 완치되었다는 후기입니다. 100% 효과 보장.",
  "{disease} 치료를 약 없이도 가능하게 한다는 광고 문구가 포함되어 있습니다.",
  "복용 후 {disease} 증상이 즉시 사라졌다는 단정적 표현이 다수 발견됩니다.",
  "처방 없이 누구나 구매 가능 / 부작용 전혀 없는 치료라고 표시되어 있습니다."
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

export interface MockDiscoveryOptions {
  moduleId: string;
  topics: DiscoveryTopic[];
  maxCandidates: number;
}

export class SeedMockDiscovery {
  generate(opts: MockDiscoveryOptions): DiscoveryCandidate[] {
    const { moduleId, topics, maxCandidates } = opts;
    const now = new Date().toISOString();
    const out: DiscoveryCandidate[] = [];
    let i = 0;

    for (const topic of topics) {
      for (const keyword of topic.seedKeywords) {
        if (out.length >= maxCandidates) break;
        // 키워드당 1~2건 생성 — 쇼핑성 1건 + 블로그성 1건
        const variants = Math.min(2, maxCandidates - out.length);
        for (let v = 0; v < variants; v++) {
          const isBlog = v === 1;
          const host = isBlog
            ? pick(FAKE_BLOGS, i + v)
            : pick(FAKE_SHOPS, i + v);
          const slug = encodeURIComponent(keyword).replace(/%20/g, "-");
          const url = isBlog
            ? `https://${host}/post/${slug}-${i + v + 1}`
            : `https://${host}/product/${slug}-${i + v + 1}`;
          const title = pick(TITLE_TEMPLATES, i + v).replace("{keyword}", keyword);
          const disease = (topic.diseaseHints ?? [])[0] ?? "";
          const snippet = pick(SNIPPET_TEMPLATES, i + v).replace("{disease}", disease || keyword);
          const { score, reasons } = scoreCandidate({ title, snippet, url });
          out.push({
            id: nanoid(12),
            moduleId,
            topic: topic.label,
            keyword,
            title,
            url,
            snippet,
            source: "seed-mock",
            discoveryMethod: "seed",
            firstScore: score,
            reasons,
            foundAt: now,
            status: "NEW"
          });
          i++;
          if (out.length >= maxCandidates) break;
        }
      }
      if (out.length >= maxCandidates) break;
    }
    return out;
  }
}
