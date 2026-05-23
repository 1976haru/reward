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
