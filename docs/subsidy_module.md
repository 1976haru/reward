# Subsidy Fraud Prototype Module (체크리스트 25)

## 1. Purpose

공공자료 기반 **보조금 부정수급 의심 후보**를 탐지하기 위한 프로토타입 모듈이다. 이번 단계의 목표는 "완성형 자동 탐지"가 아니라 **데이터 구조 / 소스 구조 / 매칭 구조 / 리스크 스코어링 구조 / 시범 지자체 1곳 분석 흐름**을 만드는 것이다.

**중요:**

- 부정수급 여부를 **확정하지 않는다.** 공개자료 기반 "검토 후보"만 만든다.
- 특정 단체/개인/사업자를 부정수급자로 단정하지 않는다.
- 자동 신고 제출 / 자동 민원 제출 / 공식기관 자동 로그인 / 무단 대량 크롤링을 수행하지 않는다.
- 주민등록번호 / 계좌번호 / 민감정보를 수집·저장하지 않는다.
- 공공데이터포털 인증키를 커밋하지 않는다.
- 포상금/보상 수령을 보장하지 않는다.

## 2. Scope

- 공고 / 교부 / 집행 / 정산 / 보조사업자 정보공시 / 결과물 URL (공개 영역만)
- 단체명·주소·반복 수급 패턴 (공개 정보 기준)

## 3. Out of Scope

- 비공개 보조금 자료
- 개인 거주 주소 / 주민번호 / 계좌번호 / 연락처 등 개인정보
- 자동 신고 / 자동 민원 / 자동 로그인
- 공공데이터포털 API 인증키 자동화

## 4. Official Sources

| 소스 | URL | 용도 |
|------|-----|------|
| 보조금통합포털 | https://www.bojo.go.kr/ | 공모/사업자/공시 진입점 |
| 공모사업찾기 | https://bojo.go.kr/hg/hg002/retrieveTaskReqstList.do | 공모 사업 목록 |
| 보조사업자 정보공시 | https://bojo.go.kr/opn/ii/ii001/getII001002QView.do | 공시 항목/결과보고 |
| e나라도움 | https://www.gosims.go.kr/ | 국고보조금 통합관리시스템 |
| 보탬e (지방보조금) | https://www.losims.go.kr/ | 지방보조금 관리/공시 |
| 공공데이터포털 | https://www.data.go.kr/ | 지자체별 데이터 (인증키 별도 신청, 본 모듈은 커밋 안 함) |

## 5. Pilot Region

**충청남도 당진시** (sample). 공공데이터포털에 당진시 지방보조금 데이터 예시가 공개되어 있음을 참고. `sample-data.json` 의 단체명·주소·대표자·금액은 모두 **합성 데이터**다.

## 6. Risk Signals (9)

`risk_signals.json` 정의:

| 코드 | 라벨 | 가중치 | 카테고리 |
|------|------|--------|----------|
| `repeated_recipient` | 반복 수급 패턴 | 20 | recipient_pattern |
| `same_address_multiple_entities` | 동일 주소 다단체 | 20 | address_pattern |
| `similar_project_titles` | 유사 사업명 반복 | 15 | project_pattern |
| `missing_result_evidence` | 결과물 증빙 부족 | 15 | evidence_gap |
| `high_amount_low_output` | 교부금액 대비 산출물 부족 | 15 | amount_output_imbalance |
| `related_vendor_signal` | 특수관계 의심 (용역업체) | 20 | related_vendor |
| `execution_pattern_anomaly` | 집행 패턴 이상 | 10 | execution_pattern |
| `disclosure_missing` | 공시 누락 의심 | 10 | disclosure_gap |
| `duplicate_content` | 결과보고 콘텐츠 중복 | 15 | content_duplication |

모든 신호는 **단정 근거가 아니다.** 각 신호는 `verificationHint` 로 사람 검토 지침을 함께 제공한다.

## 7. Scoring (총 100)

`scoring_rules.ts` 컴포넌트:

| 컴포넌트 | 최대 |
|---------|------|
| recipientPatternSignal | 25 |
| addressSimilaritySignal | 20 |
| projectSimilaritySignal | 15 |
| evidenceCompleteness | 15 |
| amountOutputImbalance | 10 |
| disclosureSignal | 10 |
| extractionQuality | 5 |

신호 → 컴포넌트 매핑은 `SUBSIDY_SIGNAL_TO_COMPONENT` 에 정의. 우선순위 등급: VERY_HIGH ≥ 80 / HIGH ≥ 60 / REVIEW ≥ 30 / LOW.

## 8. Report Draft

`report-template.md` 와 `collector.buildSubsidyReportMarkdown` 가 다음 섹션을 생성한다:

1. 신고 후보 요약 / 2. 의심 신호 표 / 3. 공공자료 근거 / 4. 추가 확인 필요 자료 / 5. 신고처 후보 / 6. 사람 검토 체크리스트 / 7. 중립 검토 요청 문구 / 8. 피해야 할 표현. 상단 안내문 "자동 신고서가 아닙니다 / 부정수급 여부를 확정하지 않습니다."

## 9. APIs

- `GET /api/subsidy/sources` — 공식/시범/금지 소스 정책
- `GET /api/subsidy/risk-signals` — 리스크 신호 사전
- `GET /api/subsidy/agency-config` — 신고처 후보
- `GET /api/subsidy/sample` — 시범 지자체 sample 레코드
- `POST /api/subsidy/analyze` — sample 기반 분석 실행 (외부 API 호출 없음)
- `POST /api/subsidy/candidates/:recordId/report` — 후보 리포트 초안 마크다운
- `GET /api/subsidy/candidates/:recordId/report` — convenience GET

요청 예 (`POST /api/subsidy/analyze`):

```json
{ "regionId": "dangjin", "useSampleData": true }
```

`useSampleData: false` 는 명시적으로 거부된다 (`PROTOTYPE_ONLY_SAMPLE`).

## 10. Safety Rules

- 부정수급 / 횡령 / 사기 — 모두 단정 금지
- 특정 단체·개인·사업자 단정 금지
- 개인정보 (주민번호 / 계좌 / 연락처 / 거주 주소) 수집 금지
- 자동 신고 / 자동 민원 / 자동 로그인 금지
- 사람 검토 필수
- `safetyNotice` 가 응답·UI 양쪽에 항상 표시

## 11. 공공데이터 API 수집기 연계 (체크리스트 11)

본 모듈의 실데이터 확장은 공공데이터 API 수집기를 통해 이루어진다.

- 수집기 모듈: [`src/collectors/publicDataApiCollector.ts`](../src/collectors/publicDataApiCollector.ts)
- 운영 기준: [`docs/API_COLLECTOR_RUNBOOK.md`](./API_COLLECTOR_RUNBOOK.md)
- 실제 수집 전 **API 명세 / 활용신청 / 인증키 / 트래픽 제한 / 이용약관**을 확인한다.
- 인증키는 환경변수(`DATA_GO_KR_SERVICE_KEY` / `PUBLIC_DATA_SERVICE_KEY`)로만 관리하고 절대 커밋하지 않으며, 로그에 원문을 남기지 않는다.
- 수집 응답은 **저장 전 개인정보를 마스킹**한다(`sanitizeRecordForStorage` → `sanitizeForStorage`).
- 수집 결과(`records.jsonl`)는 보조금 의심 후보의 **사실관계 점검 원문 근거**로 연결될 수 있다. 단, **API 응답만으로 부정수급을 단정하지 않는다.**

## 12. Future Work

- 실제 공공데이터포털 API 연동 (인증키는 env로 분리, 절대 커밋 금지)
- 보조사업자 정보공시 자동 수집 (공식 안내 준수)
- PDF/첨부파일 파싱
- 주소 정규화 고도화 (지번/도로명/번지 변환, 띄어쓰기 변형)
- 단체명 유사도 고도화 (편집거리/n-gram/별칭 사전)
- 결과물 존재 여부 자동 확인 (HTTP HEAD, 공개 영역만)
- 다른 시범 지자체 확장 (사전 안내 + sample 우선)
