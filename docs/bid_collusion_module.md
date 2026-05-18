# Bid Collusion Prototype Module (체크리스트 26)

## 1. Purpose

정형 공개 입찰 데이터(나라장터 등)에서 **입찰담합 의심 패턴**을 탐지하기 위한 프로토타입 모듈이다. 이번 단계의 목표는 "담합 확정 판단"이 아니라 데이터 구조 · 매칭 구조 · 패턴 분석 · 리스크 스코어링 · 위험 업체군 리포트 생성 흐름을 만드는 것이다.

**중요:**

- 담합 여부를 **확정하지 않는다.** 공개 입찰 데이터 기반 "검토 후보"만 만든다.
- 특정 업체/개인/발주기관을 담합 주체로 단정하지 않는다.
- 자동 신고 / 자동 민원 / 자동 로그인 / 무단 대량 크롤링 / 인증키 커밋 — 모두 금지.
- 신고포상금은 공정거래위원회 공식 기준·조치 결과·과징금·증거 수준에 따라 달라지며 보장하지 않는다.

## 2. Scope

- 입찰공고 / 개찰결과 / 낙찰률 / 업체별 투찰금액 / 개찰순위
- 동일 업체군 반복 참여, 낙찰자 순환, 좁은 투찰 간격, 들러리 후보 패턴
- 단일 낙찰자 지배 / 낙찰률 군집 / 낮은 경쟁 반복 / 형식 참여

## 3. Official Sources

| 소스 | URL | 비고 |
|------|-----|------|
| 나라장터 입찰공고정보서비스 | https://www.data.go.kr/data/15129394/openapi.do | API 활용신청 + 인증키 |
| 나라장터 낙찰정보서비스 | https://www.data.go.kr/data/15129397/openapi.do | API 활용신청 + 인증키 |
| 나라장터 계약과정통합공개서비스 | https://www.data.go.kr/data/15129459/openapi.do | API 활용신청 + 인증키 |
| 조달데이터허브 | https://data.g2b.go.kr/ | 공식 안내 진입점 |
| 공정거래위원회 신고포상금 | https://www.ftc.go.kr/www/contents.do?key=402 | 공식 기준 확인 필요 |
| 공정거래위원회 담합 신고 안내 | https://www.ftc.go.kr/www/contents.do?key=368 | 공식 절차·증거 요건 |

**인증키는 본 도구에 커밋하지 않는다.**

## 4. Risk Signals (9)

`risk_signals.json` 정의:

| 코드 | 라벨 | 가중치 |
|------|------|--------|
| `rotating_winner` | 순환 낙찰 | 25 |
| `repeated_bidder_group` | 반복 업체군 참여 | 20 |
| `cover_bid_pattern` | 들러리 후보 패턴 | 20 |
| `narrow_bid_spread` | 좁은 투찰 간격 | 15 |
| `stable_bid_rank_order` | 투찰 순위 안정성 | 15 |
| `single_winner_dominance` | 단일 낙찰자 지배 | 15 |
| `abnormal_award_rate_clustering` | 낙찰률 군집 | 15 |
| `low_competition_repeated` | 낮은 경쟁 반복 | 10 |
| `bid_participation_dropout` | 형식 참여 패턴 | 10 |

각 신호에 `verificationHint` (사람 검토 지침), `disclaimer` 에 "담합 확정 신호가 아니다" 명시.

## 5. Scoring (총 100)

`scoring_rules.ts` 컴포넌트:

| 컴포넌트 | 최대 |
|---------|------|
| rotationSignal | 25 |
| groupRepetitionSignal | 20 |
| coverBidSignal | 20 |
| spreadSignal (좁은 spread + 순위 안정성) | 15 |
| dominanceSignal | 10 |
| awardRateClusterSignal | 5 |
| competitionSignal (낮은 경쟁 + 형식 참여) | 3 |
| extractionQuality | 2 |

등급: VERY_HIGH ≥ 80 / HIGH ≥ 60 / REVIEW ≥ 30 / LOW.

## 6. Sample Data

`sample-bids.json` — **합성 데이터 only** (`isSyntheticSample: true`):

- 입찰 31건 / 업체 8개 (`샘플업체A`~`샘플업체H`) / 발주기관 3개 (`예시발주기관 1/2/3`)
- 카테고리: facility_maintenance / office_supplies / general
- 패턴 의도:
  - facility_maintenance 10건: 샘플업체A·B·C가 함께 참여하며 낙찰자가 순환 (A→B→C→A→...). 좁은 spread + 낙찰률 군집 88~89%
  - office_supplies (단독·다수): 샘플업체D 지배 + 단독참여 4건 + 들러리 후보 (E가 항상 2위)
  - general: 정상 다업체 경쟁 비교용 (점수 낮게 의도)

실제 업체명·발주기관 사용 금지.

## 7. Analyzer Functions

- `normalizeCompanyName` — 공백/특수문자 제거 + 소문자
- `calculateBidSpread` — 1·2위 투찰률 차이 (%p)
- `findRepeatedBidderGroups` — 동일 업체군이 ≥2회 함께 참여한 그룹
- `findRotatingWinners` — 그룹 입찰에서 낙찰자가 2명 이상으로 순환
- `findAwardRateClustering` — 낙찰률 범위 (max − min) ≤ 임계
- `findSingleWinnerDominance` — 특정 업체 점유율 ≥ 60% + 2회 이상
- `calculateBidCollusionRiskSignals` — 9개 신호를 그룹 단위로 산출
- `analyzeBidDataset` — sample 로드 → 그룹 → 신호 → 점수 → 정렬

## 8. APIs

- `GET /api/bids/sources` — 공식 / 시범 / 금지 소스
- `GET /api/bids/risk-signals` — 신호 사전
- `GET /api/bids/agency-config` — 신고처 후보
- `GET /api/bids/sample` — sample 입찰 데이터
- `POST /api/bids/analyze` — sample 기반 분석 (`useSampleData: false` 거부)
- `POST|GET /api/bids/groups/:groupId/report` — 위험 업체군 리포트 마크다운

요청 예 (`POST /api/bids/analyze`):

```json
{ "useSampleData": true, "category": "facility_maintenance" }
```

## 9. Report Draft

`buildBidCollusionReportMarkdown` 가 9개 섹션을 생성한다:
1. 분석 대상 요약 / 2. 위험 업체군 요약 / 3. 의심 패턴 표 / 4. 관련 입찰 목록 표 / 5. 추가 확인 필요 자료 / 6. 신고처 후보 / 7. 중립 검토 요청 문구 / 8. 다음 행동 추천 / 안전 고지. 상단 "자동 신고서가 아닙니다 / 담합 여부를 확정하지 않습니다."

## 10. Safety Rules

- 담합 / 들러리 / 불법 업체 — 모두 단정 금지
- 특정 업체·발주기관 단정 금지
- 비공개 자료 / 내부자료 / 개인정보 수집 금지
- 자동 신고 / 자동 민원 / 자동 로그인 금지
- 공공데이터포털 / 나라장터 인증키 커밋 금지
- 사람 검토 + 공식기관 확인 필수
- `safetyNotice` 가 응답·UI 양쪽에 항상 표시

## 11. Future Work

- 나라장터 API 인증키 연동 (env 분리, 절대 커밋 금지)
- 업종/지역별 정상 분포 학습
- 낙찰률 클러스터링 고도화 (kernel density)
- 업체 네트워크 그래프 (공동 입찰 관계)
- 기간별 변화 분석 (시간 윈도우 슬라이딩)
- 실제 신고 결과 기반 feedback loop
