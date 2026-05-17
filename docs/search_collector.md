# Search Collector / Scout Agent

## 1. Purpose

사용자가 URL을 직접 찾지 않아도, 모듈과 탐색 주제를 선택하면 **공개적으로 접근 가능한 검색/API/RSS/Mock 소스**를 통해 신고 후보 URL을 자동 발굴한다.

> 본 단계는 **무제한 크롤러가 아니다.** 검색 결과 페이지 HTML 직접 스크래핑은 금지하며, 공식 API·허용 RSS·수동 Seed·Mock만 사용한다.

## 2. Workflow

```
모듈 선택 → 탐색 주제 선택 → 소스 선택 (Mock/Naver/...) → 후보 발굴 → 1차 점수화 → Review Queue로 보내기 (DRAFT Case 생성) → 사람 검토
```

후보 발굴은 **신고 대상 확정이 아니다.** 본문 분석·증거 저장·사람 검토를 거쳐야 한다.

## 3. Sources

| sourceType | 이름 | 상태 | 활성 조건 |
|---|---|---|---|
| `mock` | Mock Scout (개발/시연용) | active | `MOCK_SCOUT` 환경변수 기본 true |
| `naver` | Naver Search API (블로그) | active when keys present | `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` 둘 다 필요 |
| `openai_web_search` | OpenAI Web Search | planned | placeholder. 다음 체크리스트에서 structured output 기반 구현 |
| `rss` | RSS Scout | planned | placeholder. 다음 체크리스트에서 RSS 파서 + seed URL 등록 |
| `manual` | 수동 Seed | (별도 흐름) | `POST /api/discovery/manual` 사용 |

Mock 후보 URL은 RFC 6761 예약 도메인(`.test/.example/.invalid`)을 사용해 실 네트워크 호출이 발생하지 않는다.

## 4. Topics (false_ad)

체크리스트 9의 12개 주제(`src/modules/false-ad/topics.ts`)를 그대로 재사용한다:

`blood-sugar`, `joint-cartilage`, `diet-body-fat`, `liver-detox`, `immunity`, `sleep-insomnia`, `menopause`, `prostate`, `gut-health`, `cholesterol`, `blood-pressure`, `skin-atopy`.

각 주제는 4~5개 시드 키워드와 disease hints를 가진다. **시드 키워드는 광고 작성용이 아니라 의심 후보 탐색용**임을 코드/문서에 명시한다.

## 5. Scoring

체크리스트 9의 `scoreCandidate` (CandidateScorer)를 재사용한다.
title/snippet/url만 보고 0~100점:

- 건강기능식품 관련 표현: +20
- 질병명 포함: +20
- 치료/완치/예방/억제 단정 표현: +25
- 상품·구매·후기·가격 표현: +15
- 공식기관/언론/학술 도메인: −20
- URL 경로에 product/shop/sale 등 힌트: +5

URL 단위 dedupe(`moduleId|url`)로 중복 제거. 본문 정밀 분석은 ScoreCalculator와 별개로 OrchestratorAgent에서 수행.

## 6. Daily Target

- **운영 목표**: 일일 후보 50건 (`SCOUT_DAILY_LIMIT=50` 환경변수)
- 실제 수집량은 API 키 보유 여부, 소스별 호출 제한, 약관, 운영 정책에 따라 달라질 수 있다.
- ScoutAgent는 단일 호출에서 `min(요청 limit, SCOUT_DAILY_LIMIT)`로 자동 제한한다.

## 7. Safety Rules

- 검색 결과 페이지 HTML 직접 스크래핑 **금지**
- 쿠팡/네이버쇼핑 등 약관 위반 소지 큰 무단 크롤링 **금지**
- 자동 대량 크롤링 **금지** — 호출 빈도 제한 준수
- 로그인 우회 / CAPTCHA 우회 **금지**
- 프록시/스텔스 기능 **금지**
- robots.txt / 이용약관 존중
- 후보는 **신고 대상 확정이 아니다** — 사람 검토 필수
- 응답에 `autoReport:false`, `humanReviewRequired:true`, `safetyNotice` 명시

## 8. API

| Method | Path | 동작 |
|---|---|---|
| `GET` | `/api/scout/topics?moduleId=false_ad` | 주제 목록 |
| `GET` | `/api/scout/sources` | 소스(어댑터) 목록 + 활성 상태 + 일일 목표 |
| `POST` | `/api/scout/discover` | 후보 발굴 (`{moduleId, topics, mode, sourceTypes?, maxCandidates?}`) |
| `GET` | `/api/scout/candidates` | 저장된 후보 목록 (필터: status/topic/minScore) |
| `POST` | `/api/scout/candidates/:id/queue` | 후보를 DRAFT Case로 등록 + 후보 상태 `QUEUED` |
| `POST` | `/api/scout/candidates/:id/reject` | 후보 상태 `REJECTED` |

기존 `/api/discovery/*` 라우트는 호환을 위해 유지 (체크리스트 9 그대로 동작).

응답에는 `safetyNotice`/`autoReport:false`/`humanReviewRequired:true` 포함.

## 9. Environment Variables

| 변수 | 기본 | 설명 |
|---|---|---|
| `MOCK_SCOUT` | `true` | Mock Scout 어댑터 활성 |
| `SCOUT_DAILY_LIMIT` | `50` | 운영 목표 / 단일 호출 상한 |
| `NAVER_CLIENT_ID` | (없음) | 네이버 검색 API client id |
| `NAVER_CLIENT_SECRET` | (없음) | 네이버 검색 API client secret |
| `OPENAI_WEB_SEARCH_ENABLED` | `false` | OpenAI Web Search adapter 토글 (현재 placeholder) |
| `RSS_SCOUT_ENABLED` | `false` | RSS adapter 토글 (현재 placeholder) |

## 10. Future Improvements

- OpenAI Web Search structured output 실 구현
- RSS 파서 + seed RSS URL 목록 (식약처 보도자료, 공정거래위 보도자료 등 공식 채널)
- 어댑터별 호출 빈도 제한·캐시
- Case 생성 실패 시 retry 큐
- 일일/주간 후보 통계 대시보드 (지표 누적)
