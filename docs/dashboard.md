# Dashboard (체크리스트 23)

## 0. Home / Notice (체크리스트 01)

대시보드 상단의 `#homeNoticeCard` 카드는 운영자에게 현재 상태를 한 번에 보여준다.

표시 항목:

- 오늘 날짜 (UTC) — `todayDate` 또는 `today.date`
- 앱 이름 / 버전 / 환경 — `app.{name,version,environment}`
- 현재 모드 — `mode.runtimeMode` ∈ `MOCK | MIXED | REAL_READY`, `mode.label`
- API 연결 여부 — `apiConnections.openai.configured`, `apiConnections.naver.configured`
  - **API 키 값은 응답에 절대 포함되지 않는다.** `configured` boolean 만 노출.
- Scheduler / Scout / DB 상태 — `mode.schedulerEnabled`, `mode.scoutMode`, `mode.useDb`
- 실전 가능 단계 — `readiness.stage` ∈
  `SETUP_REQUIRED | MOCK_VALIDATION | MANUAL_URL_TEST | API_KEY_REQUIRED | REAL_DATA_TEST | HUMAN_REVIEW_READY | OPERATION_READY`
- 안전 공지 — `safetyNotice` (자동 신고 미수행 / 사람 검토 필수 / 포상금 보장 없음)
- 빠른 가이드 anchor 링크 — `guideLinks`
- 추가 공지 문구 — `homeNotices` (Mock 검증 안내, 사람 검토 안내, 포상금 안내)

판정 기준:

- `mockAi=true` 또는 `OPENAI_API_KEY` 없음 → OpenAI 미연결 / mock
- `mockScout=true` 또는 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 없음 → Scout mock
- 둘 다 실제 키가 있고 Mock false → `runtimeMode = REAL_READY`
- 하나만 실제 → `runtimeMode = MIXED`
- 기본 → `MOCK`

`readiness.canAutoSubmit`은 항상 `false`, `readiness.humanReviewRequired`는 항상 `true`이다.
`REAL_READY`라도 자동 실전 신고가 가능하다는 의미가 아니며, 사람이 공식 창구에서 직접 제출해야 한다.

## 1. Purpose

운영자가 한 화면에서 다음을 확인하기 위한 조회 전용 운영 대시보드.

- 오늘 수집 후보 / 오늘 생성 Case
- Review Queue 상태 분포 (DRAFT / REVIEW / HOLD / APPROVED / REPORT_DRAFT / SUBMITTED / OUTCOME_CHECK / REJECTED)
- 우선순위 점수 기준 후보 TOP 10
- 모듈별 성과 (`false_ad` active + planned 모듈)
- Eval 품질 지표 (Precision / Recall / F1 / Accuracy / FP / FN)
- Scheduler 최근 실행 / Dedupe 중복률 / Feedback 오탐·반려 카운트

**중요:** 조회 전용이다. 상태 변경 / 신고 제출 / 외부 호출 기능을 추가하지 않는다.

## 2. KPI Cards

| Key | 라벨 | 출처 |
|-----|------|------|
| `candidates_today` | 오늘 수집 후보 | `CandidateRepository.list().filter(foundAt today)` |
| `cases_today` | 오늘 생성 Case | `CaseRepository.list().filter(createdAt today)` |
| `in_review` | 검토 대기 | Case status ∈ `REVIEW, HOLD` |
| `report_drafts` | 신고서 초안 | Case status = `REPORT_DRAFT` |
| `submitted_records` | 제출 기록 | Case status = `SUBMITTED` (외부 직접 제출 후 내부 표시) |
| `feedback_fp` | 오탐/피드백 | Feedback `FALSE_POSITIVE` decision + `RULE_FALSE_POSITIVE` reason |
| `eval_f1` | 최신 F1 | `EvalRepository.getLatest()` |
| `dedupe_rate` | 중복률 | `data/dedupe/latest-report.json` |

문구 주의:

- "제출 기록"이라고 표시한다. "자동 제출", "신고 완료"처럼 오해될 표현은 금지.
- "포상금 예상", 수익 예측 카드는 추가하지 않는다.

## 3. Data Sources

| 소스 | 위치 | 사용 필드 |
|------|------|----------|
| Cases | `CaseRepository` (JSON @ `data/cases/`) | createdAt / status / statusHistory / riskScore / agencyCandidate |
| Candidates | `CandidateRepository` (JSON @ `data/candidates/candidates.json`) | foundAt / moduleId / status / firstScore |
| Scheduler | `SchedulerService` (JSON @ `data/scheduler/runs.json`) | latest status / totalFound / totalSaved / duplicatesRemoved |
| Dedupe | `data/dedupe/latest-report.json` | summary.duplicateRate / total / kept / duplicates |
| Feedback | `FeedbackRepository.stats()` (JSON @ `data/feedback/feedback.json`) | byDecision / byReasonCategory / topRuleFalsePositiveIds / evidenceIssueCounts |
| Eval | `EvalRepository.getLatest()` (JSON @ `data/eval/runs/latest.json`) | metrics.precision / recall / f1 / accuracy / confusion |
| Modules | `moduleRegistry.list()` | id / name / status |

모든 소스는 **없으면 0/빈값으로 graceful degrade** 한다 (DashboardService 의 try/catch 처리).

## 4. APIs

- `GET /api/dashboard/summary` — 통합 응답. `kpis`, `today`, `queue`, `topCandidates`, `modules`, `evalMetrics`, `scheduler`, `dedupe`, `feedback`, `safetyNotice` 포함.
- `GET /api/dashboard/top-candidates?limit=N` — Case 우선순위 TOP N (1..50).
- `GET /api/dashboard/module-performance` — 모듈별 후보/Case/신고서 초안/제출 기록 수.
- `GET /api/dashboard/quality` — Eval + Feedback 품질 요약.

이 API들은 모두 **조회 전용**이다. POST/PATCH/DELETE 가 없다.

## 5. Mobile Layout

CSS `@media` 쿼리 (MDN [CSS media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries) 기반):

| 뷰포트 | KPI 카드 열 | Queue 카드 열 | 메모 |
|--------|-----------|---------------|------|
| ≥ 1025px | 4 | 8 | 데스크톱 |
| 769–1024 | 4 | 4 | 태블릿 가로 |
| 481–768 | 2 | 4 | 태블릿 세로 |
| ≤ 480 | 1 | 2 | 모바일 |

- TOP10 행은 모바일에서 액션 버튼이 다음 줄로 떨어진다.
- 모듈별 성과 표는 가로 스크롤 (`.ops-table-wrap { overflow-x:auto }`).
- 긴 URL은 ellipsis (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`).
- 터치 버튼은 최소 36–40px 높이.

대시보드는 fetch API ([MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch))로 `/api/dashboard/summary` 를 호출하고, 실패 시 "데이터를 불러오지 못했습니다" 메시지를 표시한다 (`renderDashboard` 예외 처리).

## 6. Safety Rules

- 자동 신고 / 자동 제출 기능 없음
- "제출 기록"은 사람이 외부 공식 창구에서 직접 제출한 뒤 내부에 표시한 상태
- 포상금 예상 / 수익 예측 표시 없음
- 사람 검토 필수
- 외부 신고기관 호출 / 로그인 기능 추가 없음
- `safetyNotice` 가 응답과 UI 상단에 항상 표시

## 7. Future Improvements

- 기간 필터 (오늘 / 이번 주 / 이번 달)
- CSV export
- 모듈별 비교 차트 (외부 차트 라이브러리 도입 검토)
- 실패 로그 알림
- 운영자 권한 분리 (현재는 단일 사용자 가정)
