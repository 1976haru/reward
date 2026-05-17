# Scheduler

## 1. Purpose

매일 정해진 시간에 Scout Agent로 신규 후보 URL을 수집한다.
스케줄러는 **후보 발굴만** 수행하며, 외부 신고기관에 자동 제출하지 않는다.

## 2. MVP Design

- 단일 서버 in-process `node-cron` 기반
- 실행 로그는 `data/scheduler/runs.json`에 append (gitignored)
- 재시도 + 중복 실행 방지 + 수동 트리거 지원
- `NODE_ENV=test` 또는 `SCHEDULER_ENABLED=false`이면 자동 시작하지 않음

## 3. Why Not BullMQ Yet

초기 MVP에서는 Redis 의존성을 피하고 단순 `node-cron`을 사용한다.
향후 운영 확장(분산 처리·지속성·외부 큐 필요) 단계에서 BullMQ + Redis Job Scheduler 전환을 고려한다.

## 4. Environment Variables

| 변수 | 기본 | 설명 |
|---|---|---|
| `SCHEDULER_ENABLED` | `false` | `true`일 때만 node-cron 등록 |
| `SCHEDULER_CRON` | `0 9 * * *` | cron 표현식 (5필드, node-cron 표준) |
| `SCHEDULER_TIMEZONE` | `Asia/Seoul` | IANA 타임존 |
| `SCHEDULER_MODE` | `standard` | Scout discover mode (`quick`/`standard`/`deep`) |
| `SCHEDULER_TOPICS` | `blood-sugar,joint-cartilage,diet-body-fat,liver-detox,immunity` | 콤마 구분 |
| `SCHEDULER_SOURCES` | `mock` | Scout source 타입 (mock/naver/...) |
| `SCHEDULER_MAX_CANDIDATES` | `30` | 한 실행 후보 상한 |
| `SCHEDULER_RETRY_ATTEMPTS` | `2` | 추가 재시도 횟수 (총 시도 = 1 + retryAttempts) |
| `SCHEDULER_RETRY_DELAY_MS` | `2000` | 재시도 사이 대기 |
| `SCHEDULER_MAX_RUN_LOG` | `200` | 보관할 실행 기록 수 |

`SCHEDULER_TOPICS`에 underscore(`_`)를 써도 hyphen(`-`)으로 자동 정규화된다 (`blood_sugar` → `blood-sugar`).

## 5. Workflow

```
cron 발화 (또는 POST /api/scheduler/run-once)
  → SchedulerService.runWithRetry(reason)
     → executeScoutRun() = ScoutAgent.discover(...)
        → SearchSourceRegistry → adapters
     → 결과 기록 (RUNNING → SUCCESS / FAILED / SKIPPED)
  → data/scheduler/runs.json append/update
```

이미 실행 중이면 새 호출은 `SKIPPED` 상태로 기록되고 즉시 반환한다 (409).

## 6. Retry Policy

- 총 시도 횟수 = `1 + SCHEDULER_RETRY_ATTEMPTS`
- 시도 사이 `SCHEDULER_RETRY_DELAY_MS` 만큼 sleep
- 각 attempt는 `attempts[]`에 `{attempt, at, error?}` 형태로 기록
- 모든 시도 실패 시 status=`FAILED`, 마지막 에러를 `error` 필드에 저장

## 7. Run Log Storage

`data/scheduler/runs.json` 단일 파일:

```json
{
  "runs": [
    {
      "id": "...",
      "reason": "cron" | "manual:..." | "manual:<note>|SKIPPED:already_running",
      "startedAt": "ISO",
      "finishedAt": "ISO",
      "status": "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED",
      "attempts": [{ "attempt": 1, "at": "ISO", "error?": "..." }],
      "result?": {
        "totalFound": number,
        "totalSaved": number,
        "duplicatesRemoved": number,
        "usedSources": ["mock"],
        "sourceFallbacks": ["naver"],
        "warnings": [...]
      },
      "error?": "...",
      "safetyNotice": "..."
    }
  ]
}
```

오래된 기록은 `SCHEDULER_MAX_RUN_LOG` 한도로 잘린다.
Git ignored — `.gitkeep`만 추적.

## 8. API

| Method | Path | 동작 |
|---|---|---|
| `GET` | `/api/scheduler/status` | enabled/running/cron/topics + 최근 실행 1건 |
| `GET` | `/api/scheduler/runs?limit=N` | 최근 실행 기록 (최신순) |
| `POST` | `/api/scheduler/run-once` | 수동 실행 — 본문은 옵션 (`reason`, `topics`, `sources`, `mode`, `maxCandidates`) |

응답에 `autoReport:false`, `humanReviewRequired:true`, `safetyNotice` 포함.

HTTP 코드:
- `200` 정상 완료
- `409` 이미 실행 중 (SKIPPED)
- `400` validation
- `500` 내부 실행 실패

## 9. Concurrency Protection

`SchedulerService.running` 플래그로 동시 실행 방지. 동시에 두 번 Scout가 돌지 않는다.

## 10. Safety Rules

- 외부 신고기관 자동 제출 없음
- 자동 로그인 / CAPTCHA 우회 / 차단 회피 / 프록시·스텔스 없음
- 대량 크롤링 없음 (`SCHEDULER_MAX_CANDIDATES` 강제, ScoutAgent의 `SCOUT_DAILY_LIMIT` 추가 강제)
- 검색 결과 HTML 직접 스크래핑 없음 (Scout 어댑터 정책 그대로 상속)
- 일일 후보 50건은 운영 목표 — API 키·소스·약관에 따라 실제 수집량 달라짐

## 11. Local Testing

```bash
# 1) 환경
SCHEDULER_ENABLED=false  # 자동 시작 안 함
NODE_ENV != "test"

# 2) 서버 시작
npm run dev

# 3) 상태 확인
curl http://localhost:3001/api/scheduler/status

# 4) 수동 1회 실행
curl -X POST http://localhost:3001/api/scheduler/run-once \
  -H "content-type: application/json" \
  -d '{"reason":"manual_test","topics":["blood-sugar"],"sources":["mock"],"maxCandidates":5,"mode":"quick"}'

# 5) 실행 로그 조회
curl http://localhost:3001/api/scheduler/runs?limit=10
```

## 12. Future Improvements

- 다음 실행 시각(`nextRunAt`) 정확한 표시 — `cron-parser` 추가 검토
- BullMQ/Redis 전환 (분산 처리·재시작 안전성 필요 시)
- Slack/이메일 알림 어댑터 (실패 시)
- 통계 대시보드 (일/주/월 누적 발굴 수)
- Per-source rate limiter
