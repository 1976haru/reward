# Counterfeit Goods Module (체크리스트 24)

위조상품 온라인 판매 **의심 후보**를 탐지하는 2차 분야 모듈이다. 위조 여부를 확정하지 않으며, 권리자 감정과 관계기관 판단을 대체하지 않는다.

## 구성 파일

- `config.ts` — 모듈 메타데이터 / 안전 원칙
- `index.ts` — `ModuleDefinition` 등록 진입점
- `sources.json` — 허용 / 금지 소스 정책
- `keywords.json` — 룰셋 (HIGH 20 / MEDIUM 20 / LOW 10 / combo 4)
- `keywordLoader.ts` — 키워드 로더 + 검증
- `scoring_rules.ts` — 점수 가중치 (총 100점)
- `report-template.md` — 신고서 초안 템플릿
- `agency_config.json` — 공식 기관 안내 (특허청 / 원스톱 신고상담센터)
- `scout_topics.ts` — 탐색 주제 8종

## 주의

- 자동 신고 / 자동 로그인 / 비공개 채팅방 수집 / 판매자 개인정보 추적 모두 수행하지 않는다.
- 포상금 수령을 보장하지 않는다. 공식 기준은 [`agency_config.json`](./agency_config.json) 안내 링크에서 직접 확인해야 한다.
- 위조상품 의심 후보에 대한 신고 여부는 사람이 공식 채널에서 직접 결정한다.
