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

## 11-2. CSV/PDF/엑셀 수동 업로드 변환기 연계 (체크리스트 12)

API로 제공되지 않고 지자체가 PDF·엑셀·CSV로만 공개한 보조금 자료는 수동 업로드 변환기로 표준화한다.

- 수동 업로드 파일 변환기: [`src/parsers/uploadSubsidyParser.ts`](../src/parsers/uploadSubsidyParser.ts)
- 운영 기준: [`docs/UPLOAD_PARSER_RUNBOOK.md`](./UPLOAD_PARSER_RUNBOOK.md)
- CSV/XLSX/PDF 공개자료를 표준 보조금 레코드(`StandardSubsidyRecordFromUpload`)로 변환한다. **원본 업로드 파일과 변환 결과 원본은 git에 커밋하지 않는다.**
- 테스트 fixture는 **가짜(합성) 데이터만** 사용한다.
- **PDF OCR은 구현하지 않는다** (텍스트 기반 PDF 기본 처리, 스캔 이미지 제외).
- 개인정보는 저장 전 `sanitizeForStorage`로 마스킹하며, `sourceText`는 반드시 마스킹 후 저장한다.
- 파싱 실패는 숨기지 않고 `error-log.json`에 사유와 함께 남긴다.
- 변환 결과는 의심 신호 분석의 입력 후보일 뿐이며 **단정 표현을 추가하지 않는다.**

## 11-3. 기관명·단체명 정규화 연계 (체크리스트 13)

업로드 parser, 공공 API 수집기, 나라장터 계약자료 매핑에서 기관명·단체명을 통합할 때 정규화 모듈을 사용한다.

- 정규화 모듈: [`src/normalizers/entityNameNormalizer.ts`](../src/normalizers/entityNameNormalizer.ts)
- 운영 가이드: [`docs/ENTITY_NORMALIZATION_GUIDE.md`](./ENTITY_NORMALIZATION_GUIDE.md)
- 주식회사/(주)/㈜/사단법인/재단법인/사회복지법인/협동조합/영농조합법인 등 법인 표기와 띄어쓰기·특수문자·괄호·대소문자 차이를 통합한다.
- 업로드 parser의 `recipientName`은 `normalizedRecipientName`(compactName)으로 연결되어 동일 기관 후보 키로 쓰인다.
- **동일 기관 후보는 사람 검토 대상**이며, 자동 확정 병합을 수행하지 않는다(동일 기관을 확정하지 않는다).
- **대표자명·전화번호·상세주소는 단독 병합 기준으로 사용하지 않는다.** 지역명(시군구)은 보조 신호로만 사용한다.

## 11-4. 주소 정규화 연계 (체크리스트 14)

업로드 parser, 공공 API 수집기, 나라장터 계약자료 매핑에서 주소를 통합하고 같은 주소 반복수급을 검토할 때 주소 정규화 모듈을 사용한다.

- 정규화 모듈: [`src/normalizers/addressNormalizer.ts`](../src/normalizers/addressNormalizer.ts)
- 운영 가이드: [`docs/ADDRESS_NORMALIZATION_GUIDE.md`](./ADDRESS_NORMALIZATION_GUIDE.md)
- 도로명/지번/층호수/약칭/괄호/특수문자/전각·반각/공백 차이를 통합한다.
- 향후 `address`/`recipientAddress`/`location` 컬럼이 업로드 parser 표준 스키마에 들어오면 `normalizeAddress`를 적용해 `StandardSubsidyRecordFromUpload.normalizedAddressKey`·`addressRegionKey`를 채운다(현재는 선택 필드로 준비).
- **상세주소(동·호수·층) 원문은 저장하지 않으며**, 반복수급 분석 키에 넣지 않는다. 반복 분석은 `addressRegionKey`(지역 단위)를 우선 사용한다.
- **동일 주소 후보는 사람 검토 대상**이며, 자동 확정 병합을 수행하지 않는다(동일 주소를 확정하지 않는다).
- 같은 주소 반복은 **검토 필요 신호**일 뿐이며, 주소만으로 부정수급을 단정하지 않는다.

## 11-5. 사업명 유사도 계산 연계 (체크리스트 15)

업로드 parser, 공공 API, 지자체 공고 자료에서 유사 사업명 반복 신청을 검토할 때 사업명 유사도 모듈을 사용한다.

- 유사도 모듈: [`src/normalizers/projectNameSimilarity.ts`](../src/normalizers/projectNameSimilarity.ts)
- 운영 가이드: [`docs/PROJECT_NAME_SIMILARITY_GUIDE.md`](./PROJECT_NAME_SIMILARITY_GUIDE.md)
- 연도/차수/괄호/특수문자/띄어쓰기/공모·지원·사업 같은 일반 표현 차이를 정규화하고, 형태소 분석기 없이 문자열 기반으로 유사도를 계산한다.
- 업로드 parser의 `projectName`은 `projectNameCompactKey`(연도/차수 제외 compactName)로 연결된다.
- **유사도 0.85 이상은 "반복 신청 검토 후보"**이며, 사업명 유사도만으로 반복 신청 또는 부정수급을 단정하지 않는다.
- 기관명 정규화(체크리스트 13), 주소 정규화(체크리스트 14)와 결합하면 반복 신청 리스크 신호로 활용할 수 있다(같은 기관 후보 + 유사 사업명 후보 + 같은/인접 연도 등). 모든 결과는 사람 검토 대상이다.

## 11-6. 실데이터 1차 기준선 / 데이터 품질검증 연계 (체크리스트 16)

수집기(API)·업로드 parser 결과를 표준 기준선 저장소로 적재하고 품질을 검증한다.

- 품질검증 모듈: [`src/quality/dataBaselineQuality.ts`](../src/quality/dataBaselineQuality.ts)
- 운영 Runbook: [`docs/DATA_BASELINE_QUALITY_RUNBOOK.md`](./DATA_BASELINE_QUALITY_RUNBOOK.md)
- 수집기/API/parser 결과(records.jsonl)를 표준 `BaselineRecord`로 적재하며, 저장 전 `sanitizeForStorage`로 개인정보를 마스킹한다.
- 수집건수, 중복률, 결측률, 출처별(sourceCoverage)/연도별(yearCoverage) 커버리지를 계산해 `quality-report.json`/`quality-report.md`를 생성한다.
- **fixture와 실데이터 기준선을 구분**한다: `fixture`는 적재 경로 검증용이며, 실제 기준선은 sourceType이 api/upload/manual이고 1,000건 이상일 때만 인정한다(그 전엔 "기준선 구축 보류").
- 사업명 정규화(체크리스트 15)·기관명 정규화(체크리스트 13)·주소 정규화(체크리스트 14) 키를 레코드에 포함해 중복 판정과 반복 신청 검토 후보 분석에 활용한다.
- 중복률·결측률은 데이터 품질 지표이며 부정수급 판단 근거가 아니다. 기준선은 분석 입력이며 신고 근거 확정 자료가 아니다.

## 11-7. 반복 수급 탐지 룰 연계 (체크리스트 17)

기준선 데이터에서 반복 수급 검토 후보를 탐지한다.

- 룰 모듈: [`src/rules/repeatSubsidyRiskRule.ts`](../src/rules/repeatSubsidyRiskRule.ts)
- 운영 가이드: [`docs/REPEAT_SUBSIDY_RISK_RULE.md`](./REPEAT_SUBSIDY_RISK_RULE.md)
- 동일 기관명(normalizedRecipientName)·동일 주소(normalizedAddressKey)·유사 사업명(projectNameCompactKey/유사도)·연도·금액 신호를 결합해 점수화한다.
- **반복 수급 후보 TOP 50**을 산출하며, 각 후보에 riskScore/riskLevel/groupKey/matchedSignals/evidence/reason/reviewRequired를 포함한다.
- **대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않는다**(보조 신호만, 원문 미사용). groupKey·reason·evidence에 개인정보 원문을 넣지 않는다.
- 결과는 "반복 수급 후보 / 검토 필요 후보"이며 위법 여부를 단정하지 않는다. 사실관계 점검과 사람 검토로 넘긴다.

## 11-8. 동일 주소 다수 단체 탐지 룰 연계 (체크리스트 18)

기준선 데이터에서 동일 주소 다수 단체 후보를 탐지한다.

- 룰 모듈: [`src/rules/addressClusterRiskRule.ts`](../src/rules/addressClusterRiskRule.ts)
- 운영 가이드: [`docs/ADDRESS_CLUSTER_RISK_RULE.md`](./ADDRESS_CLUSTER_RISK_RULE.md)
- `normalizedAddressKey` 또는 `addressRegionKey` 기준으로 그룹화한다.
- 여러 `normalizedRecipientName`이 같은 주소 후보에 존재하면 검토 후보로 산출한다(서로 다른 단체 2개 이상).
- **공유오피스·복지관·회관·공공시설 가능성**을 `cautionNotes`에 중립적으로 반영한다(점수를 올리지 않고 주의·감점으로 처리).
- **대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않으며**, addressGroupKey·reason·evidence에 상세주소·개인정보 원문을 넣지 않는다.
- 결과는 "동일 주소 다수 단체 후보표 / 추가 확인 필요 후보"이며 위법 여부를 단정하지 않는다. 사실관계 점검과 사람 검토로 넘긴다.

## 11-9. 결과물 부족·정산 확인 필요 탐지 룰 연계 (체크리스트 19)

기준선 데이터에서 결과물·정산 공개 근거 부족 후보를 탐지한다.

- 룰 모듈: [`src/rules/outputSettlementRiskRule.ts`](../src/rules/outputSettlementRiskRule.ts)
- 운영 가이드: [`docs/OUTPUT_SETTLEMENT_RISK_RULE.md`](./OUTPUT_SETTLEMENT_RISK_RULE.md)
- 성과보고서, 정산서, 결과보고서, 결과물 URL, 증빙 URL(evidenceUrl/sourceUrl), 첨부파일 누락 여부를 `missingSignals`로 평가한다.
- `missingSignals`를 기반으로 `riskScore`를 계산하고 "결과물 누락 후보 / 정산 확인 필요 후보 / 증빙 보완 필요 후보"로 표현한다.
- **공개자료에 없다고 해서 실제 미제출로 단정하지 않는다**(공개자료 기준 "확인 필요"). 로그인 필요 자료·비공개자료·내부자료는 탐지 근거로 사용하지 않는다.
- BaselineRecord에 resultUrl/resultReportUrl/performanceReportUrl/settlementDocumentUrl/attachmentUrls 등 선택 필드를 추가했다(향후 collector/parser에서 매핑).
- 결과는 사실관계 점검과 사람 검토로 넘긴다.

## 11-10. 예산 집행 이상 패턴 탐지 룰 연계 (체크리스트 20)

기준선 데이터에서 예산 집행 이상 패턴 후보를 탐지한다.

- 룰 모듈: [`src/rules/spendingAnomalyRiskRule.ts`](../src/rules/spendingAnomalyRiskRule.ts)
- 운영 가이드: [`docs/SPENDING_ANOMALY_RISK_RULE.md`](./SPENDING_ANOMALY_RISK_RULE.md)
- 인건비·홍보비·용역비·장비구입비 비중 및 반복 지출(동일 항목/유사 금액/특정 지급처 반복) 후보를 탐지한다.
- `spendingSignals`를 기반으로 `riskScore`를 계산하고 "예산 집행 이상 패턴 후보 / 정산 확인 필요 후보"로 표현한다.
- **특정 항목 비중이 높다고 해서 문제로 단정하지 않는다**(인건비 중심 사업·홍보 캠페인·전문 용역·장비 지원 사업은 비중이 높을 수 있음).
- 지급처명은 마스킹 값(vendorNameMasked)만 사용하고, 로그인 필요/비공개 자료는 탐지 근거로 사용하지 않으며, evidence/reason에 개인정보 원문을 넣지 않는다.
- BaselineRecord에 laborCostAmount/promotionCostAmount/serviceCostAmount/equipmentCostAmount/spendingLineItems 등 선택 필드를 추가했다(향후 collector/parser에서 매핑).
- 결과는 사실관계 점검과 사람 검토로 넘긴다.

## 11-11. 계약업체 연관성 탐지 룰 연계 (체크리스트 21)

기준선 데이터와 나라장터/G2B 계약연계 데이터에서 수급단체-계약업체 반복 연결 후보를 탐지한다.

- 룰 모듈: [`src/rules/contractorNetworkRiskRule.ts`](../src/rules/contractorNetworkRiskRule.ts)
- 운영 가이드: [`docs/CONTRACTOR_NETWORK_RISK_RULE.md`](./CONTRACTOR_NETWORK_RISK_RULE.md)
- 보조사업자명, 계약상대자명, 용역업체명, 계약명, 사업명, 계약금액, 계약일자, 기관명, 주소 키를 사용해 계약업체 연관성 후보와 반복 연결 검토 후보를 만든다.
- `networkSignals`를 기반으로 `riskScore`를 계산하고 업체-사업 반복 네트워크 후보를 생성한다.
- 사업자등록번호와 법인등록번호는 원문 저장 금지이며 해시만 사용할 수 있다.
- 대표자명, 전화번호, 상세주소는 단독 기준으로 사용하지 않으며 evidence/reason/report에 개인정보 원문을 넣지 않는다.
- 로그인 필요 자료, 비공개자료, 내부자료는 탐지 근거로 사용하지 않는다.
- 결과는 확정 판단이 아니라 사실관계 점검과 사람 검토로 넘긴다.

## 12. Future Work

- 실제 공공데이터포털 API 연동 (인증키는 env로 분리, 절대 커밋 금지)
- 보조사업자 정보공시 자동 수집 (공식 안내 준수)
- PDF/첨부파일 파싱
- 주소 정규화 고도화 (지번/도로명/번지 변환, 띄어쓰기 변형)
- 단체명 유사도 고도화 (편집거리/n-gram/별칭 사전)
- 결과물 존재 여부 자동 확인 (HTTP HEAD, 공개 영역만)
- 다른 시범 지자체 확장 (사전 안내 + sample 우선)
