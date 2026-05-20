# Settings

## 1. Purpose

공익레이더의 설정 / 실행 환경 상태를 한눈에 확인하기 위한 **조회 전용 화면**입니다. 사용자가 실전 신고 전에 Mock/Real 모드, API 키 연결 여부, 스케줄러, 개인정보 보호 설정, 저장소 경로, Approval Gate 상태, Readiness 단계를 확인할 수 있도록 합니다.

이 화면은 **상태 표시 전용**이며, 다음 기능은 만들지 않습니다.

- API 키 입력 폼 / API 키 저장 기능
- .env 직접 수정 기능
- 자동 신고 기능을 켜는 버튼 / 외부 신고기관 로그인 설정 / 포상금 신청을 자동화하는 설정
- 실제 신고 제출 설정

## 2. Runtime Mode

`runtime.runtimeMode` 는 다음 환경변수를 기준으로 판정됩니다.

| 환경변수 | 의미 |
|---|---|
| `MOCK_AI` | OpenAI 호출 mock 여부 |
| `MOCK_SCOUT` | Scout (Naver Search 등) 호출 mock 여부 |
| `OPENAI_API_KEY` | OpenAI 키 존재 여부 (값 자체는 응답에 포함되지 않음) |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | Naver Search API 키 (값 자체는 응답에 포함되지 않음) |

판정 규칙:

- `MOCK_AI=false` + `OPENAI_API_KEY` 존재 → OpenAI 실제 키 준비됨
- `MOCK_SCOUT=false` + `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` 둘 다 존재 → Naver 실제 키 준비됨
- 둘 다 실제 키 준비됨 → `REAL_READY`
- 하나만 실제 키 준비됨 → `MIXED`
- 그 외 → `MOCK`

## 3. API Connection Status

`apiConnections.openai.configured`, `apiConnections.naver.configured` 는 boolean 값만 노출합니다.

- API 키 원문은 응답에 포함되지 않습니다.
- 일부 마스킹 (예: `sk-***xxx`) 형식조차 제공하지 않습니다.
- `mock=true` 는 해당 어댑터가 mock 으로 동작 중임을 의미합니다.

## 4. Scheduler Settings

다음 환경변수가 노출됩니다 (값은 노출되지만 시크릿이 아닙니다).

| 환경변수 | 설명 |
|---|---|
| `SCHEDULER_ENABLED` | 정기 수집 활성화 여부 |
| `SCHEDULER_CRON` | cron 표현식 |
| `SCHEDULER_TIMEZONE` | 타임존 (기본 `Asia/Seoul`) |
| `SCHEDULER_MODE` | quick / standard / deep 등 모드 |
| `SCHEDULER_MAX_CANDIDATES` | 1회 실행 최대 후보 수 |

스케줄러는 자동 신고 기능이 아닙니다. 후보 발굴만 수행하며, 외부 신고기관에는 자동 제출하지 않습니다.

## 5. Privacy Settings

| 환경변수 | 설명 |
|---|---|
| `PRIVACY_MASKING_ENABLED` | PII 마스킹 활성화 여부 |
| `PRIVACY_DRY_RUN` | 개인정보 삭제 dry-run (기본 true) |
| `PRIVACY_*_RETENTION_DAYS` | 카테고리별 보존기간 |

`PRIVACY_DRY_RUN=true` 가 기본값이며, 실데이터 검증 전에는 dry-run 사용을 권장합니다.

## 6. Storage Paths

| 환경변수 | 설명 |
|---|---|
| `DATA_DIR` | 데이터 루트 (기본 `./data`) |
| `EVIDENCE_DIR` | 증거 패키지 저장 경로 |
| `REPORTS_DIR` | 신고서 초안 저장 경로 |
| `TRACE_DIR` | Trace JSONL 저장 경로 |
| `FEEDBACK_DIR` | 피드백 저장 경로 |

기본값은 모두 `./data/...` 하위입니다. 모두 gitignore 대상이며, `.gitkeep` 만 추적됩니다.

## 7. Safety Settings

`safety` 는 다음 값을 항상 노출합니다.

| 키 | 값 | 의미 |
|---|---|---|
| `autoSubmitAllowed` | `false` | 외부 신고기관 자동 제출은 금지 |
| `humanReviewRequired` | `true` | 사람 검토 필수 |
| `approvalGate` | `"enabled"` | Approval Gate 활성화 |

`notes` 에는 자동 신고 / 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 흐름이 모두 금지됨을 명시합니다.

## 8. Readiness

`readiness.stage` 는 다음 enum 중 하나입니다.

- `SETUP_REQUIRED`
- `MOCK_VALIDATION`
- `MANUAL_URL_TEST`
- `API_KEY_REQUIRED`
- `REAL_DATA_TEST`
- `HUMAN_REVIEW_READY`
- `OPERATION_READY`

`blockingItems[]` 에는 실전 단계 이동을 막고 있는 항목 (예: 미연결 API 키, PRIVACY_DRY_RUN off 등) 이 들어갑니다. `nextActions[]` 는 사용자가 다음에 수행해야 할 안전한 권장 작업입니다.

## 9. What Settings Does Not Do

- 외부 신고기관 자동 제출 기능을 제공하지 않습니다.
- 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 기능을 제공하지 않습니다.
- API 키 입력·저장·수정 기능을 제공하지 않습니다 (사용자가 직접 `.env` 를 수정해야 합니다).
- 설정 변경 기능을 제공하지 않습니다. 본 화면은 상태 조회 전용입니다.

## 10. API

```
GET /api/settings
```

응답 형식 (요약):

```json
{
  "ok": true,
  "settings": {
    "schemaVersion": "1.0.0",
    "generatedAt": "...",
    "app":   { "name": "공익레이더", "version": "...", "environment": "...", "port": 3001 },
    "runtime": { "runtimeMode": "MOCK", "mockAi": true, "mockScout": true, "useDb": false, "nodeEnv": "development", "scoutMode": "mock", "label": "..." },
    "apiConnections": {
      "openai": { "configured": false, "mock": true, "label": "미연결" },
      "naver":  { "configured": false, "mock": true, "label": "미연결" }
    },
    "scheduler": { "enabled": false, "cron": "0 9 * * *", "timezone": "Asia/Seoul", "mode": "standard", "topics": [], "sources": [], "maxCandidates": 30 },
    "privacy":  { "maskingEnabled": true, "dryRun": true, "retentionDays": { "default": 90, "trace": 30, "evidence": 90, "report": 90, "feedback": 180, "case": 180 } },
    "storage":  { "dataDir": "./data", "evidenceDir": "./data/evidence", "reportsDir": "./data/reports", "traceDir": "./data/traces", "feedbackDir": "./data/feedback" },
    "safety":   { "autoSubmitAllowed": false, "humanReviewRequired": true, "approvalGate": "enabled", "notes": ["..."] },
    "readiness":{ "stage": "API_KEY_REQUIRED", "label": "...", "blockingItems": ["..."], "nextActions": ["..."] }
  },
  "safetyNotice": "설정 화면은 상태만 표시하며 API 키 원문을 표시하지 않습니다. 외부 신고기관 자동 제출 기능은 제공하지 않습니다.",
  "autoReport": false,
  "humanReviewRequired": true
}
```

`Cache-Control: no-store` 가 적용됩니다.

응답에는 `OPENAI_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 등 시크릿 원문이 **절대 포함되지 않습니다.** 일부 마스킹 형태도 노출하지 않으며, `configured` boolean 만 제공합니다.
