# Human Review Queue

## 1. Purpose

AI가 찾은 신고 후보 Case를 **사람이 검토**하고 상태를 관리하는 대기열.
승인/보류/폐기/신고초안/제출(내부 기록)/결과확인 흐름을 한 화면에서 다룬다.

> **이 시스템은 자동 신고를 수행하지 않습니다.** 모든 제출은 사람이 공식 기관 사이트에서 직접 해야 합니다.
> `SUBMITTED` 상태는 외부 제출 사실을 **내부 기록**으로 표시할 뿐, 시스템이 외부에 어떤 요청도 보내지 않습니다.

## 2. Workflow

```
DRAFT(신규) ─▶ REVIEW(검토중) ─┬─▶ APPROVED(승인) ─┬─▶ REPORT_DRAFT(신고초안) ─▶ SUBMITTED(제출=내부 기록) ─▶ OUTCOME_CHECK(결과확인)
                                │                    └─▶ SUBMITTED (체크리스트 7 호환)
                                │
                                ├─▶ HOLD(보류) ─▶ REVIEW (재개)
                                │
                                └─▶ REJECTED(폐기) ─▶ REVIEW (복원)
```

`SUBMITTED → REVIEW`는 잘못 기록한 경우 되돌리기용. `OUTCOME_CHECK → REJECTED`는 종료/폐기.

## 3. Status Definitions

| 코드 | 표시명 | 설명 |
|---|---|---|
| `DRAFT` | 신규 | 분석 직후 또는 수동 등록 상태 |
| `REVIEW` | 검토중 | 사람이 검토 중 |
| `HOLD` | 보류 | 증거 보강 필요 등으로 일시 보류 |
| `APPROVED` | 승인 | 신고 후보로 승인됨 |
| `REPORT_DRAFT` | 신고초안 | 신고서 초안 생성 단계 |
| `SUBMITTED` | 제출(내부 기록) | **사용자가 외부 창구에 직접 제출한 사실을 내부에 기록**. 시스템 자동 제출 아님 |
| `OUTCOME_CHECK` | 결과확인 | 처분/회신 결과 확인 단계 |
| `REJECTED` | 폐기 | 신고 부적합/보류 만료 |

## 4. State Transition Rules

`src/utils/validation.ts`의 `ALLOWED_TRANSITIONS`:

| From | To allowed |
|---|---|
| DRAFT | REVIEW, REJECTED |
| REVIEW | APPROVED, HOLD, REJECTED |
| HOLD | REVIEW, REJECTED |
| APPROVED | REPORT_DRAFT, SUBMITTED *(체크리스트 7 호환)*, REJECTED |
| REPORT_DRAFT | SUBMITTED, APPROVED, REJECTED |
| SUBMITTED | OUTCOME_CHECK, REVIEW *(잘못 기록 복원)* |
| OUTCOME_CHECK | REJECTED, REVIEW |
| REJECTED | REVIEW |

위반 시 `INVALID_STATUS_TRANSITION` 400.

**SUBMITTED 변경 보호**: `confirmManualSubmission: true` 또는 `note`에 "직접 제출"/"수동 제출"/"manually submitted" 단어가 없으면 400 `MANUAL_SUBMISSION_CONFIRMATION_REQUIRED`.

## 5. Review Logs

- 상태 변경 시 `RewardCase.statusHistory[]`에 `{at, from, to, reviewerName, note}` append (체크리스트 7부터 기존 동작).
- 검토 메모는 `RewardCase.reviews[]`에 `ReviewRecord {id, at, reviewerName, decision:"PENDING", notes}` append.
- `GET /api/review/queue/:caseId/logs`는 두 배열을 통합·시간 내림차순 정렬해 `ReviewLogEntry[]` 반환 (`kind: "STATUS_CHANGE" | "NOTE"`).

## 6. UI

새 영역 "Human Review Queue":

- 상단 요약: 8개 상태별 카운트 카드
- 탭: 전체 + 8개 상태 (선택 상태는 `localStorage`에 저장)
- 정렬: 우선순위↓ / 최신순 (`localStorage` 저장)
- Case 카드: 제목, URL, 모듈, 우선순위 배지, 상태 배지, 증거/신고서 보유 여부, "상세보기" 버튼
- 상세 모달: Rule/AI/Score/Evidence/Report 요약 + 상태 전이 버튼 + 메모 입력 + 최근 로그 15건
- SUBMITTED 버튼 클릭 시 `window.confirm` 확인 다이얼로그 + 자동 `note` 부여

`localStorage`는 **UI 설정만** (탭 선택, 정렬). Case 데이터/개인정보/증거 원문은 저장하지 않는다.

## 7. Safety Rules

- **자동 신고 금지** — 어떤 라우트도 외부 신고기관 API를 호출하지 않는다.
- **SUBMITTED는 내부 기록** — UI/API 응답/문서/메시지에 명시.
- **사람 검토 필수** — 모든 응답에 `humanReviewRequired:true`, `safetyNotice` 포함.
- **포상금 보장 금지** — 본 흐름은 점수·라벨만 노출, 지급 보장 표현 없음.
- **법 위반 확정 표현 금지** — `summary`/`note`는 그대로 보존하되 UI에 인용 시 `escapeHtml`.

## 8. API

| Method | Path | 동작 |
|---|---|---|
| `GET` | `/api/review/queue` | 상태별 카운트 + 필터(status/moduleId/minPriorityScore/hasEvidence/hasReport) + 정렬(priority/recent) + 페이지(limit/offset). 응답: `{ok, summary:{total,counts}, items, page, statusLabels, allowedTransitions, safetyNotice, autoReport:false, humanReviewRequired:true}` |
| `GET` | `/api/review/queue/:caseId` | 상세 — Case + evidencePackage + reportSummary + logs + allowedFrom + statusLabels |
| `PATCH` | `/api/review/queue/:caseId/status` | 상태 변경 (Case API 래핑). SUBMITTED는 `confirmManualSubmission` 또는 적절한 `note` 필수 |
| `POST` | `/api/review/queue/:caseId/note` | 검토 메모 추가 → `reviews[]` append, `kind:"NOTE"` 로그 반환 |
| `GET` | `/api/review/queue/:caseId/logs` | 상태 변경 + 메모 통합 로그 (최신순) |

기존 Case API(`PATCH /api/cases/:id/status`, `POST /api/cases/:id/reviews` 등)는 그대로 유지. `/api/review/queue/*`는 그 위의 얇은 래퍼.

에러 코드:

| 코드 | HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `CASE_NOT_FOUND` | 404 |
| `INVALID_STATUS_TRANSITION` | 400 |
| `MANUAL_SUBMISSION_CONFIRMATION_REQUIRED` | 400 |
| `INTERNAL_ERROR` | 500 |

## 9. Local Storage

| 키 | 용도 |
|---|---|
| `rewardAgent.queueTab` | 마지막 선택한 상태 탭 |
| `rewardAgent.queueSort` | 정렬 기준 |

**저장하지 않는 것**: Case 데이터, 증거 원문, 개인정보, OpenAI 응답.

## 10. Future Improvements

- 다중 사용자 권한 분리 (검토자/관리자/외부)
- 만료/리마인더 (HOLD 14일 자동 알림)
- 통계 대시보드 (월별 처분 결과·점수 분포)
- OUTCOME_CHECK 후 결과 데이터로 룰셋 가중치 학습
- Case 일괄 폐기 UI (사람 확인 단계 거쳐)
