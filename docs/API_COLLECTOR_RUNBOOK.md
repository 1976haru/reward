# 공공데이터 API 수집기 Runbook (체크리스트 11)

본 문서는 공공데이터포털(data.go.kr) 류 오픈 API에서 공개자료를 안전하게 수집하기 위한 수집기의 설계·운영 기준을 정의한다.

본 수집기는 **공개자료 중심 분석 원칙**과 **개인정보 최소수집 원칙**을 따른다. 자동 신고, 로그인 우회, 인증 우회, 무제한 호출, 약관 위반 수집은 수행하지 않는다. 실제 수집은 활용신청·인증키·트래픽 제한·이용약관을 확인한 뒤 수행한다.

관련 코드/스크립트:

- 수집기 모듈: [`src/collectors/publicDataApiCollector.ts`](../src/collectors/publicDataApiCollector.ts)
- 실행 스크립트: [`scripts/collect-public-data-api.ts`](../scripts/collect-public-data-api.ts)
- 스모크 테스트: [`tests/publicDataApiCollector.test.ts`](../tests/publicDataApiCollector.test.ts)
- 정책 검사: [`scripts/check-collector-policy.js`](../scripts/check-collector-policy.js)
- API 후보 맵: [`docs/DATA_SOURCE_MAP_PUBLIC_API.md`](./DATA_SOURCE_MAP_PUBLIC_API.md), [`src/types/publicApiCandidate.ts`](../src/types/publicApiCandidate.ts)

## 1. 수집기 원칙

- 인증키는 코드에 하드코딩하지 않고 환경변수로만 관리한다.
- 로그·오류 메시지에 **serviceKey 원문을 절대 남기지 않는다.** 항상 마스킹(`maskServiceKey`)을 통과시킨다.
- 요청 제한(rate limit), 타임아웃, 재시도, 오류 로그를 강제한다.
- 총 수집 건수는 `COLLECTOR_MAX_RECORDS`를 초과하지 않는다.
- 저장 전 개인정보를 탐지·마스킹한다(`sanitizeRecordForStorage` → `sanitizeForStorage`).
- 수집 로그와 오류 로그를 분리해 남긴다.
- 실제 수집은 활용신청, 인증키, 트래픽 제한, 이용약관을 확인한 뒤 수행한다.

## 2. 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | (없음) | 공공데이터포털 인증키 |
| `PUBLIC_DATA_SERVICE_KEY` | (없음) | 대체 인증키 이름 |
| `COLLECTOR_OUTPUT_DIR` | `data/collector` | 수집 결과 저장 폴더 |
| `COLLECTOR_PAGE_SIZE` | `100` | 페이지당 요청 건수 (`numOfRows`) |
| `COLLECTOR_MAX_RECORDS` | `1000` | 최대 수집 건수 |
| `COLLECTOR_RATE_LIMIT_MS` | `1000` | 요청 간격(ms). 실제 수집은 500 이상 권장 |
| `COLLECTOR_TIMEOUT_MS` | `15000` | 요청 타임아웃(ms) |
| `COLLECTOR_MAX_RETRIES` | `3` | 최대 재시도 횟수 |
| `COLLECTOR_API_BASE_URL` | (없음) | **실제 호출 가능한** API endpoint (상세 페이지 URL 아님) |
| `COLLECTOR_API_NAME` | (P0 후보명) | 로그/파일 표시용 API명 |
| `COLLECTOR_PAGE_PARAM` | `pageNo` | 페이지 번호 파라미터명 |
| `COLLECTOR_SIZE_PARAM` | `numOfRows` | 페이지 크기 파라미터명 |
| `COLLECTOR_API_PARAMS` | (없음) | 고정 쿼리 파라미터 `a=1&b=2` 형태 |

## 3. API 키 관리 원칙

- API 키는 코드에 하드코딩하지 않는다.
- `.env` 파일은 git에 커밋하지 않는다. `.env.example`에는 실제 키가 아닌 자리표시자만 둔다.
- 로그에 **serviceKey 원문을 남기지 않는다.** 오류 메시지에도 serviceKey 원문이 출력되지 않도록 마스킹한다(`maskServiceKey` / `maskUrlServiceKey`).

## 4. 요청 제한·재시도 원칙

- 기본 요청 간격은 1초 이상으로 둔다.
- 429, 500, 502, 503, 504 응답과 네트워크 오류는 재시도 대상이다.
- 재시도는 exponential backoff(지연 × 2^attempt)를 사용한다.
- 총 수집 건수는 `COLLECTOR_MAX_RECORDS`를 초과하지 않는다.
- API 약관·트래픽 제한을 우선한다.

## 5. 저장 원칙

- 원본 응답은 필요 최소 범위에서만 저장한다.
- 저장 전 개인정보 탐지·마스킹을 수행한다.
- 수집 결과는 JSONL로 저장한다.
- 수집 로그(`collection-log.json`)와 오류 로그(`error-log.json`)를 분리한다.
- 실행 ID(runId)에 API명·실행일시를 포함하고, 수집 건수는 `collection-log.json`에 기록한다.

저장 경로:

```
data/collector/runs/{runId}/
  records.jsonl        # 수집 레코드 (마스킹 후)
  collection-log.json  # 수집 로그
  error-log.json       # 오류 로그
```

## 6. 실행 방법

### API 키 설정

```powershell
Copy-Item .env.example .env
# .env 를 열어 DATA_GO_KR_SERVICE_KEY 또는 PUBLIC_DATA_SERVICE_KEY 를 채운다.
# 실제 호출 endpoint 를 COLLECTOR_API_BASE_URL 에 넣는다.
```

### 테스트 (API 키 불필요)

```bash
npm run test:collector     # mock fetch 로 수집기 핵심 기능 검증
npm run check:collector    # 수집기 정책(키 하드코딩/로그 마스킹) 정적 검사
```

### 실제 1,000건 수집

```bash
# 환경변수 설정 후
npm run collect:public-api
```

성공 시 콘솔에 `COLLECTOR_REAL_RUN_OK`, 1,000건 미만이면 `COLLECTOR_REAL_RUN_INCOMPLETE`,
키가 없으면 `COLLECTOR_API_KEY_REQUIRED`(exit 2), endpoint가 없으면 `COLLECTOR_ENDPOINT_REQUIRED`(exit 2)를 출력한다.

### 결과/오류 로그 확인

```bash
# 최신 실행 디렉터리 확인
ls data/collector/runs
# collection-log.json / error-log.json 열람
```

## 7. 완료 기준

- 실제 API 1개 이상에서 1,000건 이상 수집
- `records.jsonl` 생성, `collection-log.json`의 `totalRecords >= 1000`
- `error-log.json` 생성 (오류 없으면 `errorsCount: 0`)
- 인증키 원문 미노출 (`npm run check:collector` 통과)
- 테스트 통과 (`npm run test:collector`)

## 8. 주의사항

- 인증 우회·로그인 우회·무제한 호출 금지.
- 개인정보 원문 저장 금지 (저장 전 마스킹).
- API 응답만으로 부정수급을 단정하지 않는다 — 수집 결과는 사람 검토용 사실관계 점검의 원문 근거로만 연결된다.
- 진행 중인 감사·소송·민감 사안, 비공개 데이터는 수집 대상에서 제외한다.

## 9. 실제 실행 절차 (초보자용 단계별)

처음 실행하는 사람을 위한 순서입니다. **공공데이터포털 등 공식 API만** 사용하며, 검색엔진 HTML 스크래핑·로그인 우회·CAPTCHA 우회·비공개자료 수집은 하지 않습니다.

1. **API 키 발급·입력**
   - 공공데이터포털(<https://www.data.go.kr>)에서 원하는 데이터셋을 활용신청하고 인증키를 발급받습니다.
   - `.env` 파일을 열어 `DATA_GO_KR_SERVICE_KEY=` (또는 `PUBLIC_DATA_SERVICE_KEY=`) 뒤에 발급받은 키를 붙여넣습니다. (`.env` 없으면 `Copy-Item .env.example .env`)
   - ⚠️ 키 원문을 코드·문서·로그·git 에 넣지 마세요. `.env` 는 커밋되지 않습니다.
2. **endpoint 입력**
   - `.env` 의 `COLLECTOR_API_BASE_URL=` 에 **실제 호출 가능한 API endpoint** 를 넣습니다.
   - ⚠️ data.go.kr 데이터셋 **상세 페이지 URL** 이 아니라, 활용신청 후 발급된 **호출용 endpoint** 여야 합니다. (예: `https://api.odcloud.kr/api/...` 형태)
   - 필요하면 `COLLECTOR_PAGE_PARAM` / `COLLECTOR_SIZE_PARAM` / `COLLECTOR_API_PARAMS` 로 파라미터명을 맞춥니다.
3. **실제 수집 실행**
   ```bash
   npm run collect:public-api
   ```
4. **종료 메시지 의미**
   | 메시지 | 의미 | 종료코드 |
   |---|---|---|
   | `COLLECTOR_API_KEY_REQUIRED` | 인증키 미설정 — `.env` 에 키 입력 필요 | 2 |
   | `COLLECTOR_ENDPOINT_REQUIRED` | 호출용 endpoint 미설정 — `COLLECTOR_API_BASE_URL` 입력 필요 | 2 |
   | `COLLECTOR_REAL_RUN_OK` | 1,000건 이상 수집 성공 | 0 |
   | `COLLECTOR_REAL_RUN_INCOMPLETE` | 1,000건 미만 수집 (실패 아님 — 사유 출력) | 1 |
   - 미완료(`INCOMPLETE`)는 실패가 아닙니다. API 한도·총량 부족·응답 구조·파라미터 불일치가 원인일 수 있으니 `error-log.json` 과 응답 구조를 확인합니다.
5. **수집 결과 저장 위치**
   - `data/collector/runs/{runId}/records.jsonl` (수집 레코드, 마스킹 후)
   - `data/collector/runs/{runId}/collection-log.json` (수집 로그, `totalRecords` 포함)
   - `data/collector/runs/{runId}/error-log.json` (오류 로그, `errorsCount`)

## 10. GitHub 에 올리면 안 되는 파일

- `.env` (API 키 포함) — `.gitignore` 로 차단됨
- `data/collector/**` (실데이터 수집 결과: records.jsonl / collection-log.json / error-log.json) — `.gitignore` 로 차단됨 (`.gitkeep`/`sample/` 만 추적)
- `data/baseline/**`, `data/evidence/**`, `data/reports/**`, `data/cases/**`, `data/outcomes/**` 등 산출물 전반
- GitHub 에는 **코드·문서·테스트만** 올립니다. 커밋 전 `git status --ignored` 로 산출물이 ignored 상태인지 확인하세요.

## 11. 다음 단계: baseline build 연결

수집된 `records.jsonl` 은 다음 단계의 표준 기준선(baseline) 빌드 입력으로 사용합니다. (이번 단계에서 baseline 전체 실행은 필수가 아닙니다.)

```bash
npm run build:baseline -- --input data/collector/runs/{runId}/records.jsonl --sourceType api --sourceName public-data-api
```

### mapping 필요 항목 (수집 필드가 표준 보조금 레코드와 다를 때)

공공데이터 API 응답 필드는 데이터셋마다 다릅니다. 표준 보조금 레코드(사업명/보조사업자/교부기관/교부금액/집행내역/정산·결과보고/원본 공시 URL 등)와 바로 맞지 않으면 다음을 문서화하고 baseline build 단계에서 매핑합니다.

- 사업명 ← 응답의 어떤 필드인지
- 보조사업자/수급기관 ← 어떤 필드인지
- 교부기관 ← 어떤 필드인지
- 교부/집행 금액 ← 어떤 필드인지(숫자/문자 형식 확인)
- 기간·연도 ← 어떤 필드인지
- 원본 공시/상세 URL ← 어떤 필드인지(없으면 수집 endpoint·식별자로 보완)
- 필드 누락·형식 차이(쉼표 포함 금액, 날짜 포맷 등)는 별도 표로 기록

> 본 단계는 "수집 준비·실행 검증"까지이며, 업로드 파서·정규화·위험점수·신고서 초안·실제 신고 흐름은 다음 단계에서 진행합니다.
