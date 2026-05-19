# Guide and Q&A (실전 재점검 03)

## 1. Purpose

공익레이더(`reward-agent-mvp`)의 사용자가 다음을 빠르게 이해할 수 있도록 가이드/Q&A 화면과 API를 제공한다.

- 무엇을 수집하고 어디에 신고하는지
- 어떤 증거가 필요한지
- 포상금/보상금 공식 기준을 어디서 확인하는지
- 자동 신고가 아니라는 점, 사람 검토가 필수라는 점
- 개인정보 처리 원칙

데이터 소스는 `src/services/guide/GuideService.ts` 의 정적 빌더이며,
`GET /api/guide/qa` 엔드포인트로 노출된다. UI 는 `#guideQaSection` 카드에서 렌더링된다.

## 2. First Run Steps

처음 사용자는 아래 순서로 흐름을 검증한다. **실제 신고 전에는 Mock 검증과 수동 URL 테스트를 먼저 진행한다.**

1. Home/Notice 확인 — 현재 모드/API 연결 상태/실전 가능 단계 확인
2. 공지사항 확인 — 공식 기준 재확인, 자동신고 금지, 실데이터 검증 상태
3. 신고 분야 선택
4. Mock 후보 발굴 실행
5. 후보를 Review Queue 로 이동
6. 분석 결과 · 증거 패키지 · 신고서 초안 확인
7. 공식 기준 확인 후 사람이 직접 신고 여부 결정 (자동 제출 없음)
8. 제출 후 Outcome Tracker 에 사람이 결과 기록

## 3. Module Guides

`moduleGuides[]` 에 모듈별로 다음 필드를 채운다.

| 필드 | 의미 |
|---|---|
| `whatToCollect` | 공개 URL/문구/캡처 등 수집 대상 |
| `whereToReport` | 공식 신고처 (식약처/특허청/공정위/권익위 등) |
| `evidence` | 증거 체크리스트 |
| `rewardGuide` | 포상/보상 공식 기준 확인 위치 + 수령 보장 없음 명시 |
| `officialLinks` | 해당 모듈에 대응하는 공식 링크 |

현재 등록된 모듈 4종:

- `false_ad` — 건강기능식품 온라인 허위·과대광고 탐지
- `counterfeit_goods` — 위조상품 온라인 판매 의심 탐지
- `subsidy_fraud` — 보조금 부정수급 의심 후보 탐지
- `bid_collusion` — 입찰담합 의심 패턴 분석

## 4. Official Links

공익레이더는 4개 이상의 공식 링크를 안내한다. 각 링크에는 `caution` 문구로
"공식 기준은 변경될 수 있으므로 실전 신고 전 재확인하세요." 가 포함된다.

| ID | 기관 | URL |
|---|---|---|
| `mfds-online-illegal-trade` | 식품의약품안전처 | https://www.mfds.go.kr/wpge/m_660/de010410l001.do |
| `kipo-counterfeit-reward` | 특허청 | https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346 |
| `ftc-reward-guide` | 공정거래위원회 | https://www.ftc.go.kr/www/contents.do?key=402 |
| `clean-acrc-portal` | 국민권익위원회 청렴포털 | https://www.clean.go.kr/menu.es?mid=a10613010000 |

## 5. FAQ

`faqs[]` 에는 자동 신고 여부, 포상금 보장 여부, 수집 대상/금지, 제출 방법, API 키 필요 여부, 개인정보 처리,
AI 판단의 한계, 신고 전 체크리스트, 초보자 첫 실행 순서 등 최소 10개 Q&A 를 담는다.

특히 다음 Q&A 는 회귀 테스트로 강제된다.

- "공익레이더가 자동으로 신고하나요?" → 아닙니다 (자동 신고 미수행)
- "포상금을 받을 수 있나요?" → 공익레이더는 포상금 수령을 보장하지 않습니다

## 6. Safety Rules

UI 와 응답 모두에 다음 안전 원칙을 노출한다.

- 공익레이더는 자동 신고를 수행하지 않습니다.
- 포상금 수령을 보장하지 않습니다.
- AI 분석은 참고용이며, 최종 신고 여부는 사람이 검토해야 합니다.
- 공식 기준은 변경될 수 있으므로 신고 전 반드시 재확인하세요.

**금지 표현 (긍정문 형태로 들어가서는 안 됨):**
"포상금 확정", "수익 확정", "포상금 지급 보장", "포상금 수령 보장합니다",
"AI가 신고", "신고하면 지급", "무조건 받을", "무조건 지급".
부정문 ("포상금 수령을 보장하지 않습니다", "자동 신고를 수행하지 않습니다") 은 허용/장려된다.

## 7. Future Improvements

- 모듈 등록 시 자동으로 가이드 카드가 생성되도록 `moduleRegistry` 연동 (현재는 정적 4종)
- 공식 링크의 마지막 사람 검토일 (`lastReviewedAt`) 메타데이터 추가
- Q&A 에 외부 공식 페이지 인용 링크 보강
- 모듈별 신고서 초안 템플릿 다운로드 버튼
- 다국어 (영문) 가이드
