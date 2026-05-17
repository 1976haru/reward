# Candidate Discovery

## 1. Purpose

사용자가 URL을 직접 찾아 입력하지 않아도, 모듈과 **탐색 주제**를 선택하면 시스템이 공개 자료 기반으로 신고 후보 URL을 발굴해 분석 대기열에 넣는다.
본 단계는 대량 크롤러가 **아니다**. 검색엔진 HTML 직접 스크래핑, 로그인 우회, CAPTCHA 우회, 차단 회피, 개인정보 수집을 일절 수행하지 않는다.

## 2. Workflow

```
모듈 선택 (false_ad만 active)
  → 탐색 주제 선택 (12개 중 1개 이상)
  → POST /api/discovery/candidates (1차 발굴)
  → 1차 점수화 (title/snippet/url만 보고 0~100)
  → 사용자가 후보 선택
  → POST /api/discovery/candidates/:id/analyze
      → CollectorAgent → RuleAgent → ScoringAgent → AnalyzerAgent → EvidenceService → Case 생성
  → 사람 검토 (Case API의 상태 전이 흐름)
```

수동 URL 입력 흐름도 동일 후보 테이블에 편입된다 (`POST /api/discovery/manual`, `discoveryMethod="manual"`). 기존 `POST /api/cases/analyze`도 그대로 동작한다.

## 3. Topics (false_ad)

12개 주제 + 주제별 시드 키워드. 정의는 [`src/modules/false-ad/topics.ts`](../src/modules/false-ad/topics.ts).

| id | label |
|---|---|
| `blood-sugar` | 혈당/당뇨 |
| `joint-cartilage` | 관절/연골 |
| `diet-body-fat` | 다이어트/체지방 |
| `liver-detox` | 간 건강/해독 |
| `immunity` | 면역력 |
| `sleep-insomnia` | 수면/불면 |
| `menopause` | 갱년기 |
| `prostate` | 전립선 |
| `gut-health` | 장 건강 |
| `cholesterol` | 콜레스테롤 |
| `blood-pressure` | 혈압 |
| `skin-atopy` | 피부/아토피 |

각 주제는 4~5개의 시드 키워드와 disease hints를 가진다.
**주의**: 시드 키워드는 광고 작성용이 아니라 **의심 후보 탐색용**이다.

## 4. Discovery Adapters

```
CandidateDiscoveryService
  ├─ MOCK_DISCOVERY=true  → SeedMockDiscovery
  └─ MOCK_DISCOVERY=false → SearchApiDiscovery (placeholder, NOT_IMPLEMENTED → mock으로 안전 폴백)
```

- **SeedMockDiscovery**: 검색 API 키 없이도 시연/테스트 가능. RFC 6761 예약 도메인(`.test`/`.example`/`.invalid`)으로 가짜 URL을 생성하므로 분석 단계에서 실제 네트워크 호출이 발생하지 않는다.
- **SearchApiDiscovery**: 실제 Naver/Bing/Google Custom Search/SerpAPI 등을 연결할 자리. 본 MVP에서는 `SearchApiDiscoveryNotImplementedError`를 throw하며, 서비스가 자동으로 mock으로 폴백한다. 향후 도입 시 다음 원칙 준수:
  - 공식 API만 사용 (HTML 직접 스크래핑 금지)
  - 차단 회피·CAPTCHA 우회·프록시 사용 금지
  - 요청 빈도 제한 준수

## 5. First-pass Scoring

본문을 열기 전 단계에서 title/snippet/url만 보고 0~100 점수.

| 신호 | 점수 |
|---|---|
| 건강기능식품 관련 표현 (영양제·보조제·건기식 등) | +20 |
| 질병명 포함 (당뇨·혈압·관절염·암 등) | +20 |
| 치료/완치/예방/약 대체 단정 표현 | +25 |
| 상품·구매·후기·가격 등 상거래 표현 | +15 |
| 공식기관/언론/학술 도메인 (`.go.kr`, `nih.gov` 등) | **-20** |
| URL 경로에 product/shop/sale 등 힌트 | +5 |

`clampRiskScore`로 0~100 제한. URL 단위 dedupe(`moduleId|url`)로 중복 제거.

## 6. Endpoints

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/discovery/topics?moduleId=false_ad` | 탐색 주제 목록 |
| `POST` | `/api/discovery/candidates` | 후보 발굴 (`{moduleId, topics, mode, maxCandidates?}`). mode: `quick`(10)/`standard`(30)/`deep`(50). `DISCOVERY_MAX_CANDIDATES` 상한 |
| `GET` | `/api/discovery/candidates?moduleId=&topic=&status=&minScore=&limit=` | 저장된 후보 목록 |
| `POST` | `/api/discovery/candidates/:id/analyze` | 후보 본문 분석 → Case 생성 (orchestrator 재사용), candidate.status=`ANALYZED` |
| `POST` | `/api/discovery/manual` | `{moduleId, url, title?, snippet?, topic?}`로 직접 URL을 후보 등록 |

응답에는 `safetyNotice` / `autoReport:false` / `humanReviewRequired:true`가 포함된다.

에러 코드:

| 코드 | 의미 |
|---|---|
| `VALIDATION_ERROR` | 입력 형식 오류 |
| `MODULE_NOT_FOUND` | 등록되지 않은 모듈 |
| `MODULE_NOT_READY` | planned/disabled 모듈 (분석 불가) |
| `MODULE_NOT_IMPLEMENTED` | active지만 분석기 미연결 |
| `CANDIDATE_NOT_FOUND` | 해당 후보 id 없음 |
| `INVALID_TOPIC` | 모듈에 속하지 않는 topic |
| `INVALID_URL` | http/https 아님 |
| `ANALYZE_FAILED` | 본문 수집 또는 분석 단계 예외 |

## 7. Storage

- `data/candidates/candidates.json` (단일 파일)
- `.gitignore`로 본문 제외 (`.gitkeep`만 추적)
- `USE_DB=true` 도입 시 Prisma 모델로 이관 가능 (체크리스트 후속)

## 8. Environment Variables

| 변수 | 기본 | 설명 |
|---|---|---|
| `MOCK_DISCOVERY` | `true` | 외부 검색 API 없이 mock 후보 사용 |
| `DISCOVERY_MAX_CANDIDATES` | `30` | mode-별 한도와 별개로 전체 상한 |

## 9. Safety Rules

- 대량 크롤링 금지
- 검색엔진 HTML 직접 스크래핑 금지
- 로그인/CAPTCHA/차단 회피 금지
- 프록시·스텔스 기능 금지
- 외부 신고기관 자동 제출 금지
- 개인정보 수집 금지
- 포상금 확정 표시 금지
- planned 모듈은 발굴·분석 모두 차단

## 10. TODO

- 실제 검색 API 연동 (Naver/Bing/Google Custom Search 등) + 키 관리
- 후보 클러스터링 (URL 도메인·키워드 패턴)
- Case API와 양방향 링크 (`candidate.caseId` 노출은 이미 구현)
- UI: 후보 상세 패널, 즐겨찾기, 반려 사유 기록
