# Dedupe Engine

## 1. Purpose

Scout가 수집한 후보 URL이나 사용자가 등록한 Case가 **같은 URL/상품을 반복 분석하지 않도록** 중복을 제거한다.

> 중복 제거는 분석 효율을 위한 보조 기능이며, 애매한 유사 후보는 사람이 확인해야 한다.
> Dedup Agent는 후보를 병합/제외할 뿐, 신고 대상 여부를 확정하지 않는다.
> 기존 Case는 자동 삭제하지 않는다.

## 2. Canonical URL

`canonicalizeUrl(input)`의 정규화 규칙:

- 프로토콜은 `http:` / `https:`만 정규화 대상 (기타는 best-effort)
- hostname 소문자
- 기본 포트 제거 (http:80, https:443)
- 경로의 다중 슬래시 정리, 끝의 `/` 제거 (루트 제외)
- 쿼리 파라미터: 트래킹 파라미터 제거 + 이름 사전순 정렬
- 프래그먼트(`#...`) 제거

## 3. Tracking Parameter Removal

다음 키는 canonicalize 시 제거된다 (대소문자 무시):

- `utm_*` (utm_source/medium/campaign/term/content)
- `fbclid`, `gclid`, `msclkid`, `dclid`, `yclid`, `wbraid`, `gbraid`
- `mc_eid`, `mc_cid`
- `_hsenc`, `_hsmi`, `__hssc`, `__hstc`, `hsCtaTracking`
- `ref`, `ref_`, `ref_src`, `ref_url`, `referrer`
- `spm`, `scm`
- `igshid`, `igsh`
- `naver_search_query`, `ne_co_no`, `ne_org_lc`
- `trk`, `trk_url`
- `share`, `share_token`
- `tt_medium`, `tt_content`
- `from`, `src`, `src_pl`, `src_app`

## 4. URL Hash

`hashString(canonicalUrl)` — SHA-256 hex. 두 URL이 같은 canonical로 정규화되면 같은 hash를 가진다.

## 5. Title / Product Similarity

`src/services/dedupe/TextSimilarity.ts`:

- `normalizeKoreanText` — 소문자화, 영문/숫자/한글/공백 외 제거
- `tokenize` — 공백 분리 + 길이 < 2 토큰 제거 (한글 단일 음절 노이즈 컷)
- `jaccardSimilarity(a, b)` — `|A ∩ B| / |A ∪ B|`
- `diceCoefficient(a, b)` — `2|A ∩ B| / (|A| + |B|)` (집합 기준)
- `similarity(a, b)` — Jaccard·Dice 평균. 두 입력 토큰 ≤2면 30% 페널티

외부 라이브러리 없이 한국어 상품명에서 MVP 충분.

## 6. Content Hash

`src/services/dedupe/ContentHasher.ts`:

- `normalizeContentForHash` — zero-width 문자 제거, 공백 정규화, 소문자화
- `hashText(text)` — SHA-256 hex
- `hashHtml(html)` — cheerio로 script/style/iframe 등 제거 후 본문만 hash

## 7. Dedupe Actions

`dedupeCandidate(candidate, existing)` 결정 우선순위:

1. **EXACT_URL_HASH** — canonical 동일 hash → `DUPLICATE`
2. **CANONICAL_URL_MATCH** — canonical 문자열 동일 → `DUPLICATE`
3. **CONTENT_HASH_MATCH** — contentText hash 동일 → `DUPLICATE`
4. **DOMAIN_PATH_MATCH** — host+path 동일, 쿼리 다름 → `POSSIBLE_DUPLICATE`
5. **TITLE_SIMILARITY** — `similarity ≥ 0.85` → `DUPLICATE`, `≥ 0.7` → `POSSIBLE_DUPLICATE`

`DUPLICATE`는 저장에서 제외 / `POSSIBLE_DUPLICATE`는 keep + 경고 / `UNIQUE`는 그대로 keep.

## 8. Scout Integration

`ScoutAgent.discover` 흐름:

```
adapters → candidates 수집
  → DedupeEngine.dedupeBatch(candidates, existingFromCandidateRepo)
  → DUPLICATE 제거 후 createMany
  → data/dedupe/latest-report.json 저장
  → 응답 dedupe summary {total, kept, duplicates, possibleDuplicates, duplicateRate}
```

## 9. Case API Warning

`POST /api/cases` — 새 Case 생성 시 같은 canonical URL의 기존 Case가 있으면 응답 `warnings[]`에 다음과 같은 안내를 추가한다 (Case 생성은 막지 않음):

```
"유사한 URL의 기존 Case가 있습니다 (id=XXX). 중복 분석 여부를 확인하세요."
```

## 10. API

| Method | Path | 동작 |
|---|---|---|
| `GET` | `/api/dedupe/canonicalize?url=...` | 단일 URL 정규화 + 제거 트래킹 파라미터 + hash |
| `POST` | `/api/dedupe/check` | 단일 후보 vs 저장된 candidates 중복 점검 |
| `POST` | `/api/dedupe/batch` | 배치 dedupe + report 저장 |
| `GET` | `/api/dedupe/report` | 최근 batch report 조회 |

응답에 `safetyNotice`, `autoReport:false` 포함.

## 11. Safety Rules

- 개인정보 기반 dedupe 금지 (전화·이메일 등 키로 사용 안 함)
- 판매자 개인정보 추적 금지
- 외부 검색엔진 HTML 직접 스크래핑 금지
- 자동 신고 금지
- 확실한 중복(`DUPLICATE`)만 자동 제외
- 애매한 유사 후보(`POSSIBLE_DUPLICATE`)는 사람 검토 권고
- 기존 Case 자동 삭제 금지 — 경고만 표시

## 12. Future Improvements

- contentHash를 Candidate에도 영구 저장 (현재는 입력 시 즉석 비교)
- 한국어 상품명 형태소 분석기(`hangul`/`mecab`) 도입 (지금은 토큰 기반)
- SimHash/MinHash로 대규모 dedupe (현재 후보 수가 적어 단순 비교로 충분)
- 도메인 신뢰도 매핑 (공식기관/언론 도메인은 우선 keep)
