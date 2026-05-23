# 수집 로그 샘플 (체크리스트 11)

실제 수집 결과(1,000건 원본 `records.jsonl`)는 **git에 커밋하지 않는다.** 대신 수집 로그의 형태와 필드를 보여주는 샘플만 문서/샘플 파일로 남긴다.

- 샘플 로그 파일: [`data/collector/sample/collection-log.sample.json`](../data/collector/sample/collection-log.sample.json)
- 본 샘플에는 **실제 API 키나 원본 개인정보가 포함되지 않는다.** endpoint의 serviceKey는 마스킹된 형태(`ABCD...WXYZ`)로만 표시한다.

## 수집 로그(collection-log.json) 필드

| 필드 | 설명 |
|---|---|
| `runId` | 실행 ID (API명 + 실행일시 + 랜덤) |
| `apiName` | 수집 대상 API 표시명 |
| `endpointMasked` | serviceKey가 마스킹된 endpoint |
| `startedAt` / `finishedAt` | 수집 시작/종료 시각 (ISO 8601) |
| `status` | `ok`(목표 도달) / `incomplete`(미달) / `error` |
| `totalRecords` | 총 수집 건수 |
| `requestCount` | 총 요청 횟수 (success / failure 분리) |
| `pageSize` / `maxRecords` / `rateLimitMs` / `timeoutMs` / `maxRetries` | 적용된 수집 설정 |
| `sanitizedRecordCount` | 개인정보 마스킹이 적용된 레코드 수 |
| `recordsFile` / `collectionLogFile` / `errorLogFile` | 산출물 경로 |
| `notes` | 수집 중 메모(마지막 페이지 판단, 마스킹 안내 등) |

## 오류 로그(error-log.json) 필드

| 필드 | 설명 |
|---|---|
| `runId` / `apiName` | 실행 식별 |
| `errorsCount` | 오류 건수 (0이면 오류 없음) |
| `errors[]` | `{ at, urlMasked, attempt, status?, phase, message }` — URL은 항상 마스킹 |

## 샘플 요약

아래 값은 형태 예시이며, 실제 수집 결과가 아니다.

- `runId`: `재정경제부_국고보조금-집행_20260523T091500_a1b2c3`
- `apiName`: 재정경제부_국고보조금 집행 및 보조사업 현황
- `endpointMasked`: `https://api.example.go.kr/openapi/service?serviceKey=ABCD...WXYZ&...`
- `totalRecords`: 1000
- `requestCount`: 10
- `startedAt`: 2026-05-23T09:15:00.000Z
- `finishedAt`: 2026-05-23T09:15:18.000Z
- `status`: ok
- `errorsCount`: 0
- note: 실제 데이터는 git에 커밋하지 않음
