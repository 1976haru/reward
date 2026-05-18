# Trace Log (체크리스트 27)

## 1. Purpose

Agent 실행, 판단, tool/service call, 사람 수정 내역을 **내부 감사·디버깅·품질 개선** 목적으로 기록한다.

**중요:**

- Trace Log 는 판단 과정 기록이지 **법적 판단 확정 근거가 아니다.**
- API 키 / 토큰 / 개인정보 / 전체 HTML / 증거파일 내용 / 외부 신고기관 로그인 정보 — 절대 저장하지 않는다.
- **전체 prompt 저장은 기본 비활성** (`TRACE_STORE_FULL_PROMPT=false`). true 로 두지 말 것.

## 2. Event Types

`TRACE_EVENT_TYPES` (`src/types/trace.ts`):

| 코드 | 의미 |
|------|------|
| `agent_start` | Agent 실행 시작 |
| `agent_end` | Agent 실행 정상 종료 |
| `agent_error` | Agent 실행 예외 |
| `tool_call` | 내부 tool 호출 |
| `service_call` | API/서비스 호출 |
| `llm_prompt` | LLM 프롬프트 (요약/메타만, 본문은 storeFullPrompt=false 일 때 미저장) |
| `llm_output` | LLM 출력 요약 |
| `guardrail` | 가드레일 / 정책 차단 / 마스킹 발생 |
| `human_action` | 사람 액션 (상태 변경, 피드백 저장 등) |
| `state_change` | Case/Candidate 상태 전이 |
| `http_request` / `http_response` | HTTP 트랜잭션 (예약) |

`TRACE_SEVERITIES`: `debug` / `info` / `warn` / `error`.

## 3. Storage

- 일자별 JSONL: `data/traces/{yyyy-mm-dd}.jsonl`
- 각 줄이 하나의 `TraceEvent` JSON
- append-only — 큰 로그도 줄 단위 처리 가능
- `.gitignore` 처리됨 (`data/traces/*`, `.gitkeep` 만 유지)

## 4. Trace Context

`TraceContextFields` (`src/types/trace.ts`):

- `traceId` — 요청/체인 단위 (필수)
- `runId` — batch / scheduler run
- `caseId`, `candidateId`, `moduleId`, `agentName`

`traceMiddleware` (`src/middleware/traceMiddleware.ts`):

- `x-trace-id` 헤더가 있으면 사용 (정규식 검증), 없으면 생성
- 응답 헤더 `x-trace-id` 설정
- `/api/*` 요청에 대해 응답 후 `service_call` 이벤트 기록
- 단, `/api/traces*`, `/api/dashboard/summary`, `/api/health`, `/styles.css`, `/app.js` 등은 제외 (재귀/노이즈 방지)
- request body / headers / cookies 는 trace 에 기록하지 않음 (개인정보·키 회피). `query` 는 안전 키만 화이트리스트.

`withAgentTrace(opts, fn)` (`src/services/trace/TraceContext.ts`):

- 함수 실행을 감싸 `agent_start` / `agent_end` / `agent_error` 자동 기록 + durationMs 계산
- 결과는 `summarizeForTrace` 로 슬림화 (큰 페이로드/PII 회피)

## 5. Masking Policy

`maskSensitive` (`src/services/trace/maskSensitive.ts`):

- API 키 패턴 (`sk-...`, `sk_live_...`, `AIza...`, `ghp_...`, `Bearer ...`) → `[masked-secret]`
- 이메일 / 전화번호 / 주민번호 → `[masked-email]` / `[masked-phone]` / `[masked-id]`
- 객체 키 이름이 `api_key`, `secret`, `token`, `password`, `cookie`, `authorization`, `auth_header`, `session_id`, `access_token`, `refresh_token`, `client_secret` 와 매치되면 값 통째로 `[masked-secret]`
- 문자열은 `TRACE_MAX_INPUT_CHARS` / `TRACE_MAX_OUTPUT_CHARS` 로 트렁케이트
- 배열은 100개까지만, 객체는 깊이 6~8 단계까지만

`TraceLogger.log` 가 input/output/meta 에 자동 적용. `sensitiveMasked: true` 플래그로 마스킹 발생 여부를 응답에 포함.

## 6. What Not to Store

- **전체 HTML / 전체 PDF / 증거 파일 내용** — 절대 안 됨
- **전체 LLM prompt** — `TRACE_STORE_FULL_PROMPT=false` 기본
- **외부 신고기관 로그인 정보 / 자동 로그인 토큰** — 없음
- **개인정보 원문** — 마스킹 후 저장
- **API 인증키** — 객체 키 이름과 값 패턴 둘 다로 마스킹

## 7. APIs

- `GET /api/traces` — 목록 (`traceId`, `runId`, `caseId`, `candidateId`, `moduleId`, `agentName`, `eventType`, `severity`, `from`, `to`, `limit` 필터)
- `GET /api/traces/summary` — `byAgent` / `byEventType` / `bySeverity` / `byModule` / `recentErrors`
- `GET /api/traces/dates` — 사용 가능한 일자
- `GET /api/cases/:caseId/traces` — Case 별 감사로그 (최근 7일)

## 8. Wired Flows

다음 흐름에 trace 가 연결되어 있다:

- **ReviewQueue 상태 변경** (`PATCH /api/review/queue/:caseId/status`) → `state_change` + `human_action`
- **Feedback 저장** (`POST /api/cases/:caseId/feedback`) → `human_action` (memo 본문 미저장)
- **SubsidyAnalyzer** (`POST /api/subsidy/analyze`) → `agent_start` / `agent_end` / `agent_error`
- **BidCollusionAnalyzer** (`POST /api/bids/analyze`) → `agent_start` / `agent_end` / `agent_error`
- **EvalRunner** (`POST /api/eval/run`) → `agent_start` / `agent_end` / `agent_error`
- **traceMiddleware** → 그 외 `/api/*` 요청에 `service_call` 자동 기록 (제외 목록 제외)

## 9. UI

`public/index.html` 의 "Agent 실행 추적 / 감사로그" 카드:

- Agent / Severity / Event Type / Case ID 필터
- 상단 통계 뱃지 (총 이벤트 / info / warn / error / agent 수 / module 수)
- 최근 50개 이벤트 (eventType / agent / severity / message / ts / traceId / caseId / moduleId / actor / masking 표시)
- 안전 문구 상단 노출

## 10. Retention

- 초기 MVP 는 **로컬 JSONL 보관**
- 운영 시 보존 기간 정책 별도 필요 (예: 90일 후 cold storage 이동 또는 삭제)
- 민감정보 누락 발견 시 해당 줄 제거 또는 마스킹 처리 (수동 운영)
- 자동 삭제 API 는 만들지 않는다 (실수로 감사로그가 사라지는 사고 방지)

## 11. Safety Rules

- API 키 / 토큰 / 전체 prompt / 전체 HTML / 증거파일 내용 / 외부 로그인 정보 — 저장 금지
- 개인정보 원문 저장 금지 (마스킹 후 저장)
- 자동 신고기관 제출 / 자동 로그인 기능 없음
- Trace 삭제 API 없음 (운영자가 파일 단위 관리)
- `safetyNotice` 가 응답·UI 양쪽에 항상 표시
