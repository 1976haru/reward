# Outcome Tracker (체크리스트 30)

## 1. Purpose

사람이 외부 공식 신고 창구에 직접 제출한 이후, 제출일·접수번호·처리상태·처리결과·포상금/보상금 관련 여부를 **내부적으로 기록**하고, 성공/반려 패턴을 분석하기 위한 기능이다.

**중요:**

- 본 모듈은 **결과 기록 기능**이다. 시스템은 외부 신고기관에 자동 제출하거나 접수번호를 자동 조회하지 않는다.
- 접수번호와 처리결과는 사용자가 외부 공식 창구에서 직접 확인한 뒤 수동으로 입력한다.
- 포상금/보상금 지급 여부는 공식기관 판단과 처리 결과에 따라 달라지며, 본 도구는 **수령을 보장하지 않는다.**
- 접수번호, 메모 등에는 담당자 개인정보(이름·연락처·이메일·계좌 등)를 입력하지 않는다 — 입력 시 자동 마스킹된다.

## 2. What It Stores

- 제출일 / 접수일 / 다음 확인일 (YYYY-MM-DD)
- 신고처 (`agencyName`) / 신고 채널 (`agencyChannel`)
- 접수번호 (`referenceNumber`, PII 패턴 자동 마스킹)
- 처리 상태 (`status`) / 처리 결과 (`decision`)
- 보완 요청 (`supplementRequest`) / 반려 사유 (`rejectionReason`) / 처리결과 요약 (`resultSummary`) — 모두 저장 전 마스킹
- 포상/보상 결과 (`rewardOutcome`)
- 사용자 입력 지급 확인 금액 (`rewardAmount`, `rewardCurrency`) — **예측 아님, 사용자가 공식 확인한 금액만 입력**
- 메모 (`notes`) — 마스킹

## 3. What It Does Not Do

- 외부 신고기관 자동 제출 / 자동 민원 제출
- 신고처 자동 로그인
- 접수번호 자동 조회
- 포상금 신청 자동화
- 예상 포상금 계산기 / 수익 예측 차트
- 개인정보 원문 저장 (마스킹 우선)
- localStorage 에 outcome 데이터 저장 (UI 는 서버 API 만 사용)

## 4. Status Definitions (`OutcomeStatus`)

| 코드 | 라벨 | 의미 |
|------|------|------|
| `NOT_SUBMITTED` | 미제출 | 아직 외부 공식 창구에 제출하지 않음 |
| `SUBMITTED_MANUALLY` | 제출 기록 | 사용자가 직접 제출했다고 내부 기록 |
| `RECEIVED` | 접수 확인 | 접수번호 또는 접수 확인이 있음 |
| `IN_REVIEW` | 처리 중 | 기관 처리 중 |
| `SUPPLEMENT_REQUESTED` | 보완 요청 | 보완자료 요청 |
| `ACCEPTED` | 수용/인정 | 신고 내용이 일부 또는 전부 인정/처리됨 |
| `REJECTED` | 반려 | 반려 또는 불수용 |
| `CLOSED_NO_ACTION` | 조치 없이 종결 | |
| `TRANSFERRED` | 타 기관 이송 | |
| `REWARD_REVIEW` | 포상/보상 검토 | 포상금/보상금 검토 중 |
| `REWARD_PAID` | 지급 확인 | 포상금/보상금 지급 확인 (사용자 직접 확인) |
| `REWARD_REJECTED` | 지급 거절 | |
| `UNKNOWN` | 확인 불가 | |

상태명은 **내부 기록용**이며 외부기관 공식 상태명과 다를 수 있다.

## 5. Decision (`OutcomeDecision`)

`PENDING` / `ACCEPTED` / `PARTIAL_ACCEPTED` / `REJECTED` / `TRANSFERRED` / `CLOSED` / `UNKNOWN`

## 6. Reward Outcome Definitions

| 코드 | 의미 |
|------|------|
| `NOT_APPLICABLE` | 포상/보상 대상 아님 |
| `NOT_REQUESTED` | 신청 안 함 |
| `UNDER_REVIEW` | 검토 중 |
| `PAID` | 지급 확인 (사용자 직접 확인) |
| `REJECTED` | 지급 거절 |
| `UNKNOWN` | 확인 불가 |

## 7. APIs

- `POST /api/cases/:caseId/outcome` — Case 별 outcome upsert (생성 또는 갱신)
- `GET /api/cases/:caseId/outcome` — Case 별 outcome 목록 + 최신 1건
- `GET /api/outcomes/meta` — 상태/결정/포상 사전
- `GET /api/outcomes` — 전체 목록 + 필터 (`caseId`/`moduleId`/`agencyName`/`status`/`decision`/`rewardOutcome`/`followUpDue`/`limit`/`offset`)
- `GET /api/outcomes/stats` — KPI 통계
- `GET /api/outcomes/patterns` — 모듈별·신고처별·반려 사유별 패턴
- `GET /api/outcomes/follow-up?graceDays=14` — 다음 확인일이 지났거나 임박한 건
- `GET /api/outcomes/:outcomeId` — 단건 조회
- `PATCH /api/outcomes/:outcomeId` — 단건 갱신

요청 예 (`POST /api/cases/:caseId/outcome`):

```json
{
  "moduleId": "false_ad",
  "agencyName": "식품의약품안전처",
  "agencyChannel": "온라인 불법유통 신고",
  "submittedAt": "2026-05-17",
  "referenceNumber": "ABC-2026-0001",
  "status": "SUBMITTED_MANUALLY",
  "decision": "PENDING",
  "rewardOutcome": "UNKNOWN",
  "notes": "국민신문고에 직접 제출 후 기록"
}
```

응답:

```json
{
  "ok": true,
  "outcome": { /* OutcomeEntry */ },
  "piiMasked": false,
  "recommendedFeedback": { /* REJECTED/CLOSED 시 */ },
  "message": "제출 결과가 내부 기록으로 저장되었습니다.",
  "safetyNotice": "...",
  "autoReport": false,
  "humanReviewRequired": true
}
```

## 8. Dashboard Integration

`GET /api/dashboard/summary` 응답에 `outcome` 객체 포함:

- `total / submittedCount / receivedCount / inReviewCount`
- `supplementRequestedCount / acceptedCount / rejectedCount`
- `rewardReviewCount / rewardPaidCount / followUpDueCount`
- `rewardPaidAmountTotal` (예측 아님 — 사용자 직접 확인 금액 합산만)

문구 주의: "수익", "예상 수익", "포상금 확정" 같은 표현은 금지. `rewardAmount` 는 "사용자 입력 지급 확인 금액" 으로만 표시.

## 9. Feedback Loop

`POST /api/cases/:caseId/outcome` 응답이 `decision: REJECTED` 또는 `status: CLOSED_NO_ACTION` 일 때 `recommendedFeedback` 객체를 함께 반환한다 (자동 저장은 안 함):

```json
{
  "recommendedFeedback": {
    "decision": "REJECT",
    "reasonCategories": ["EVIDENCE_INSUFFICIENT", "AGENCY_MISMATCH"]
  }
}
```

UI 에서 검토자가 Feedback DB 에 사유를 입력하도록 안내한다.

## 10. Privacy Rules

- `notes` / `resultSummary` / `rejectionReason` / `supplementRequest` / `referenceNumber` 모두 **저장 전 `MaskingService.maskText` 적용**
- 이메일 / 전화번호 / 주민번호 / API 키 / Bearer / JWT / 키 이름 기반 (`secret`/`token`/`password`/`cookie`/`authorization` 등) → 자동 마스킹
- 마스킹 발생 시 `piiMasked: true` 플래그 응답
- UI 입력창 placeholder 에 "담당자 개인정보 입력 금지" 안내
- **localStorage 에 outcome 데이터를 저장하지 않는다.** UI 는 모든 데이터를 서버 API 에서만 읽고 쓴다.

## 11. Trace Integration

`/api/cases/:caseId/outcome` (POST) / `PATCH /api/outcomes/:id` 호출 시 다음 trace 이벤트가 자동 기록된다:

- `state_change` — `Outcome 저장 → status=...`, 메타: `outcomeId/status/decision/rewardOutcome/agencyName/referenceNumberPreview/piiMasked`
- `human_action` — "사용자 수동 결과 입력"

**referenceNumber 전체는 trace 에 저장되지 않으며**, 앞 4자리 + `***` preview 만 메타에 포함된다.

## 12. Safety Rules

- **외부 신고기관 자동 제출 / 자동 로그인 / 접수번호 자동 조회 — 모두 없음**
- 포상금 신청 자동화 / 예상 포상금 계산기 / 수익 예측 차트 — 없음
- `rewardAmount` 는 사용자가 공식 확인한 금액만 입력, "예측" 아님
- 개인정보 원문 저장 회피 (마스킹 우선)
- localStorage 에 outcome 데이터 저장 금지
- 본 도구는 법률 자문이 아니며, 포상금 수령을 보장하지 않는다

## 13. Future Improvements

- Outcome → Feedback DB 자동 연결 (사용자 확인 후)
- 신고처별 평균 처리 기간 통계
- 보완 요청 응답 마감일 알림 (별도 알림 채널)
- Prisma 모델로 이관 (`OUTCOME_USE_DB=true`)
- 모듈별 성공률 시계열 차트
