# Counterfeit Goods Module (체크리스트 24)

## 1. Purpose

공개 판매게시글에서 **위조상품 의심 후보**를 탐지하고 증거를 정리하기 위한 모듈이다. 1차 모듈인 `false_ad` 구조를 복사하여 만들었으며, 공통 엔진(RuleAgent / ScoringAgent / ScoutAgent / ReportService)을 재사용한다.

**중요:**

- 본 모듈은 **위조 여부를 확정하지 않는다.**
- 권리자 감정과 관계기관 판단을 대체하지 않는다.
- 자동 신고 / 자동 로그인 / 비공개 채팅방 수집 / 판매자 개인정보 추적은 수행하지 않는다.
- 포상금 수령을 보장하지 않는다.

## 2. Scope

- 공개 판매게시글 (오픈마켓·SNS·중고거래 등 공개 게시글)
- 공개 상품 페이지

## 3. Out of Scope

- 비공개 채팅방 (텔레그램 / 카카오톡 / 디스코드 비공개방)
- 구매자 개인정보
- 판매자 개인정보 추적 / 식별 시도
- 자동 신고 제출 / 자동 로그인
- 위조 여부 확정 판단 / 권리자 침해 확정
- 포상금 지급 보장

## 4. Official References

- [특허청 위조상품 신고포상금 제도](https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346)
- [지식재산침해 원스톱 신고상담센터](https://koipa.re.kr/ippolice/)
- 대한민국 정책브리핑 — 온라인 판매게시물 신고 안내 (증거 유형 참고용)

포상금 금액·한도·신청 절차는 변경될 수 있으므로 공식 페이지에서 직접 확인해야 한다.

## 5. Module Files

| 파일 | 역할 |
|------|------|
| `config.ts` | 모듈 메타데이터, 안전 원칙, 기본 신고처/증거 요구사항 |
| `index.ts` | `ModuleDefinition` 등록 진입점 (status: `ready`) |
| `sources.json` | 허용/금지 소스 정책 |
| `keywords.json` | 룰셋 (HIGH 20 / MEDIUM 20 / LOW 10 / combo 4) |
| `keywordLoader.ts` | 룰셋 로드 + 검증 |
| `scoring_rules.ts` | 가중치 (counterfeitExpression 35 / brand 15 / commerce 15 / evidence 20 / sellerPattern 10 / extraction 5 = 100) |
| `report-template.md` | 신고서 초안 템플릿 |
| `agency_config.json` | 공식 기관 안내 (특허청 / 원스톱 신고상담센터 / 국민신문고 / 관할 지자체) |
| `scout_topics.ts` | 탐색 주제 8종 |

## 6. Keyword Rules (54+)

- **HIGH (20)**: 레플리카 / 미러급 / SA급 / S급 / 정품급 / 1:1 / 공장판 / 자체제작 로고 / 각인 구현 / 로고 구현 / 풀박스 구현 / 정품 동일 퀄리티 / 샤넬급·루이비통급·구찌급·롤렉스 미러급·나이키 정품급 / 단속 피해서 / 비밀배송 / 정품 문의 금지
- **MEDIUM (20)**: 명품 레플 / 브랜드 레플리카 / 병행 아닌 동일 / 카톡문의 / 텔레문의 / DM문의 / 오픈채팅 문의 / 사진 보고 주문 / 세관 문제 없음 / 정가 대비 초저가 / 풀박스 / 영수증 포함 / 보증서 포함 / 쇼핑백 포함 / 더스트백 포함 / 케어카드 포함 / 샤넬 / 루이비통 / 롤렉스 / 나이키 정품
- **LOW (10)**: 구성품 완비 / 1:1 제작 / 정품 동일 / 프리미엄급 / 한정판 / 직구 / 병행수입 / 샘플 / A급 / B급
- **Combo regex (4)**: 브랜드+위조표현 / 비공개 채널+거래 유도 / 정품 보증 모방 / 단속·세관 회피

## 7. Scoring (총 100)

| 컴포넌트 | 최대 점수 | 설명 |
|---------|-----------|------|
| `counterfeitExpressionSignal` | 35 | RuleAgent score(0..100) × 0.35 + HIGH/combo 보너스 |
| `brandSignal` | 15 | brand 카테고리 매치당 +5 (cap 15) |
| `commercialSignal` | 15 | URL 상거래 힌트 +8 / 가격 표시 +7 |
| `evidenceCompleteness` | 20 | HTML/TEXT/PNG/PDF/metadata/manifest 각 +4 (cap 20) |
| `sellerPatternSignal` | 10 | 비공개 채널 +5 / 단속·세관 회피 +5 |
| `extractionQuality` | 5 | 기본 3 + 경고 1건당 -1 |

## 8. Evidence Requirements

- 판매게시글 공개 URL
- 동일 판매자 추정 증거 화면
- 위조상품 의심 증거 화면
- 판매자 표시 정보 (공개 영역만)
- 상품명/모델명
- 가격 표시 캡처
- 상품 이미지 (공개 영역만)
- 로고/상표 표시 캡처
- PDF 저장본
- 수집일시

## 9. Scout Topics (8)

`luxury_bag` / `luxury_watch` / `shoes` / `apparel` / `cosmetics` / `electronics_accessory` / `golf` / `streetwear`

각 주제는 시드 키워드(예: "미러급 시계", "1:1 가방", "정품급 운동화")로 후보를 검색한다. Mock adapter는 실제 브랜드명을 과도하게 노출하지 않는 합성 후보를 생성한다 (RFC 6761 예약 도메인 사용).

## 10. APIs (재사용)

기존 API에 `moduleId=counterfeit_goods` 를 전달하면 동작한다.

- `POST /api/detect/rules { moduleId: "counterfeit_goods", text|claimCandidates|... }` → 위조상품 룰 매치
- `GET /api/rules/counterfeit_goods` → 룰셋 메타
- `GET /api/discovery/topics?moduleId=counterfeit_goods` → 위조상품 탐색 주제
- `GET /api/scout/topics?moduleId=counterfeit_goods`
- `POST /api/scout/discover { moduleId: "counterfeit_goods", topics: [...], mode: "quick" }`
- Report draft 생성 시 `moduleId=counterfeit_goods` 가 들어가면 위조상품 템플릿이 사용된다.

## 11. UI

`/api/modules` 응답에 `status: "ready"` 로 노출되며, 프론트에서 선택 가능한 모듈로 표시된다 (`available: true`). 가이드 패널에 탐지 예시 / 신고처 / 필요 증거 / 포상금 안내 / 주의사항을 표시한다.

## 12. Prohibited (이번 단계 절대 하지 않는 것)

- 실제 위조상품 구매 유도
- 비공개 채팅방 / 텔레그램 수집
- 판매자 개인정보 추적
- 자동 신고 제출
- 공식기관 자동 로그인
- 위조 확정 표현
- 포상금 지급 확정 표현
- 기존 `false_ad` 모듈 동작 변경
