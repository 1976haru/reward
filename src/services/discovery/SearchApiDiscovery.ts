import type { DiscoveryCandidate, DiscoveryTopic } from "../../types/candidate.js";

/**
 * 실제 외부 검색 API(Naver/Bing/Google Custom Search/SerpAPI 등) 어댑터 자리.
 *
 * 본 MVP에서는 placeholder만 둔다. 실제 키 연결과 호출은 다음 체크리스트에서 진행한다.
 * 안전 정책:
 *   - 검색엔진 HTML 직접 스크래핑 금지 → 반드시 공식 API 사용
 *   - 차단 회피·CAPTCHA 우회·프록시 사용 금지
 *   - 요청 빈도 제한 준수
 */
export interface SearchApiDiscoveryOptions {
  moduleId: string;
  topics: DiscoveryTopic[];
  maxCandidates: number;
}

export class SearchApiDiscoveryNotImplementedError extends Error {
  constructor(message = "Search API discovery is not implemented in this MVP build. Set MOCK_DISCOVERY=true to use seed mock candidates.") {
    super(message);
    this.name = "SearchApiDiscoveryNotImplementedError";
  }
}

export class SearchApiDiscovery {
  async generate(_opts: SearchApiDiscoveryOptions): Promise<DiscoveryCandidate[]> {
    throw new SearchApiDiscoveryNotImplementedError();
  }
}
