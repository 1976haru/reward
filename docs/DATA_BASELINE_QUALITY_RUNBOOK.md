# 실데이터 1차 기준선 및 품질검증 Runbook (체크리스트 16)

## 1. 문서 목적

- 최근 2~3년 보조사업 데이터를 표준 저장소에 적재하고, 수집건수·중복률·결측률을 계산하는 기준을 정의한다.
- 본 문서는 실데이터 기준선 구축 전후의 품질검증 절차를 설명한다.
- 실제 데이터가 없는 경우 fixture 기반 적재 경로 검증과 실데이터 기준선 구축을 구분한다.
- 공개자료 중심 분석 원칙과 개인정보 최소수집 원칙을 따른다.

관련 코드:

- 품질검증 모듈: [`src/quality/dataBaselineQuality.ts`](../src/quality/dataBaselineQuality.ts)
- 표준 타입: [`src/types/dataQualityBaseline.ts`](../src/types/dataQualityBaseline.ts)
- CLI: [`scripts/build-data-baseline.ts`](../scripts/build-data-baseline.ts)
- 테스트: [`tests/dataBaselineQuality.test.ts`](../tests/dataBaselineQuality.test.ts)
- 정책 검사: [`scripts/check-data-baseline-policy.js`](../scripts/check-data-baseline-policy.js)

## 2. 기준선 데이터 범위

- 최근 2~3년 보조사업 데이터
- e나라도움/공공데이터포털/지자체 공개자료/수동 업로드 변환 결과
- 보조사업명, 수급기관명, 지자체명, 회계연도, 보조금액, 원문 URL 또는 출처 파일
- 개인정보 또는 비공개 자료는 제외
- 1차 기준선 목표는 **1,000건 이상** 적재이다.

## 3. 표준 저장소 원칙

- 1차 구현은 경량 JSONL 기반 표준 저장소를 사용한다.
- 향후 SQLite/PostgreSQL 등 DB로 이전 가능하게 스키마를 분리한다.
- 원본 파일은 저장하지 않고 표준화된 레코드만 저장한다.
- 저장 전 `sanitizeForStorage`를 통과해 개인정보를 **마스킹**한다(주민번호/계좌번호/휴대폰/이메일/상세주소 원문 미저장).
- runId 단위로 `records.jsonl`, `quality-report.json`, `quality-report.md`, `error-log.json`을 생성한다.

## 4. 표준 기준선 레코드 필드

| 필드명 | 설명 | 필수 여부 | 결측률 계산 대상 |
|---|---|---|---|
| id | 기준선 레코드 ID | 필수 | 예 |
| sourceType | api/upload/manual/fixture | 필수 | 예 |
| sourceName | 데이터 출처명 | 필수 | 예 |
| sourceFileName | 업로드 파일명 | 선택 | 아니오 |
| sourceUrl | 원문 URL 또는 API URL | 권장 | 예 |
| collectedAt | 수집 또는 적재 일시 | 필수 | 예 |
| fiscalYear | 회계연도 | 권장 | 예 |
| localGovName | 지자체명 | 권장 | 예 |
| ministryName | 부처명 | 선택 | 아니오 |
| agencyName | 기관명 | 선택 | 아니오 |
| projectName | 보조사업명 | 필수 | 예 |
| projectNameCompactKey | 사업명 정규화 키 | 권장 | 예 |
| recipientName | 수급기관명/보조사업자명 | 권장 | 예 |
| normalizedRecipientName | 기관명 정규화 키 | 권장 | 예 |
| normalizedAddressKey | 주소 정규화 키 | 선택 | 아니오 |
| addressRegionKey | 지역 주소 키 | 선택 | 아니오 |
| subsidyAmount | 보조금액 | 권장 | 예 |
| executionAmount | 집행액 | 선택 | 아니오 |
| settlementAmount | 정산액 | 선택 | 아니오 |
| returnAmount | 환수/반납액 | 선택 | 아니오 |
| documentType | 자료유형 | 필수 | 예 |
| evidenceUrl | 증거 URL | 권장 | 예 |
| privacyDetectedTypes | 탐지된 개인정보 유형 | 필수 | 예 |
| qualityWarnings | 품질 경고 | 선택 | 아니오 |

## 5. 품질 지표

| 지표 | 설명 | 산식 |
|---|---|---|
| totalRecords | 전체 적재 건수 | records.length |
| uniqueRecords | 중복 제거 후 건수 | dedupeKey 기준 unique |
| duplicateCount | 중복 의심 건수 | totalRecords - uniqueRecords |
| duplicateRate | 중복률 | duplicateCount / totalRecords |
| missingRate | 결측률 | 필수·권장 필드 중 빈 값 비율 |
| fieldMissingRates | 필드별 결측률 | 필드별 missing / totalRecords |
| privacyDetectedCount | 개인정보 탐지 건수 | privacyDetectedTypes.length > 0 |
| parseWarningCount | 파싱 경고 건수 | qualityWarnings 개수 |
| sourceCoverage | 출처별 건수 | sourceType/sourceName별 group by |
| yearCoverage | 연도별 건수 | fiscalYear별 group by |

## 6. 중복 판정 기준

- 기본 dedupeKey는 sourceType + fiscalYear + localGovName + projectNameCompactKey + normalizedRecipientName + subsidyAmount 조합이다.
- sourceUrl 또는 evidenceUrl이 같으면 강한 중복 후보이다.
- 같은 사업명 키와 같은 기관명 키, 같은 금액, 같은 연도이면 중복 후보이다.
- 중복은 삭제가 아니라 duplicate candidate로 표시한다.
- 중복률은 품질지표이며 부정수급 판단 근거가 아니다.

## 7. 결측률 기준

- 필수 필드가 비어 있으면 해당 레코드는 qualityWarnings에 기록한다.
- 권장 필드 결측은 경고로만 기록한다.
- projectName, sourceType, collectedAt, documentType은 필수다.
- 결측률이 높으면 parser 또는 수집기 필드 매핑 보강이 필요하다.

## 8. 실데이터와 fixture 구분

- fixture 데이터는 테스트용이며 실데이터 기준선으로 간주하지 않는다.
- sourceType=fixture인 경우 품질검증 기능 테스트로만 사용한다.
- 실제 기준선 완료는 sourceType이 api/upload/manual 중 하나이고 1,000건 이상일 때만 인정한다.
- 실제 1,000건이 없으면 **"기준선 구축 보류"**로 표시한다.

## 9. 실행 방법

```bash
# 업로드 parser 결과 records.jsonl 을 입력으로 사용
npm run build:baseline -- --input data/upload-parser/runs/xxx/records.jsonl --sourceType upload --sourceName local-upload

# API collector 결과 records.jsonl 을 입력으로 사용
npm run build:baseline -- --input data/collector/runs/xxx/records.jsonl --sourceType api --sourceName data-go-kr

# fixture 1,000건 생성 후 적재 경로/품질 리포트 검증
npm run build:baseline -- --fixture 1000

# 테스트
npm run test:data-baseline
```

- 출력 폴더는 `DATA_BASELINE_OUTPUT_DIR` 또는 `data/baseline` 기본값이며, `data/baseline/runs/{runId}/`에 결과가 생성된다.
- 결과 파일: `records.jsonl`, `quality-report.json`, `quality-report.md`, `error-log.json`.
- 실행 메시지:
  - `DATA_BASELINE_RUN_OK` (+ totalRecords / duplicateRate / missingRate / status / outputDir)
  - 실데이터 1,000건 이상: `DATA_BASELINE_REAL_1000_OK`
  - fixture 1,000건: `DATA_BASELINE_FIXTURE_1000_OK_BUT_REAL_BASELINE_PENDING`
  - 1,000건 미만: `DATA_BASELINE_INCOMPLETE`

## 10. 주의사항

- 개인정보 원문 저장 금지.
- 비공개 자료 적재 금지.
- 실데이터와 fixture 혼동 금지 — fixture를 실데이터로 간주하지 않는다.
- 중복률·결측률을 부정수급 판단처럼 표현하지 않는다.
- 기준선은 분석 입력이며 신고 근거 확정 자료가 아니다.
- 실제 원본 데이터 파일은 git에 커밋하지 않는다.

## 11. 후속 작업

- 실제 API 1,000건 수집(체크리스트 11) 후 기준선 재생성
- 실제 지자체 업로드 자료 1,000건 적재
- SQLite 또는 PostgreSQL 저장소 전환
- 대시보드에서 품질 리포트 표시
- 리스크 스코어링(기관명/주소/사업명 정규화 결합)과 연계
