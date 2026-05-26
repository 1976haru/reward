# Approval Gate

## 1. Purpose

AI 또는 시스템이 외부 신고기관에 **직접 신고를 제출하지 못하도록 구조적으로 차단**한다.
시스템이 수행할 수 있는 동작은 "신고서 초안 복사 / 다운로드 / 공식 링크 열기 / 내부 상태 기록 / 사람 검토 메모"뿐이다.

본 정책은 이 프로젝트의 **핵심 안전장치**다. 코드, UI, 문서, API 응답 모두 이 정책을 따른다.

> **고정 안전 안내:** 자동신고 없음 / 사람 검토 필수 / 수동 제출 기록만 가능. 신고서 초안 생성은 신고가 아니며, 사용자가 공식 신고처 링크를 열어 직접 제출한 뒤 접수번호와 처리결과만 수동 기록한다.

## 2. Allowed Actions

| 코드 | 설명 |
|---|---|
| `copy_report_draft` | 사람이 클립보드로 신고서 본문(Text) 복사 |
| `download_report_draft` | Markdown / Plain Text / DOCX 파일 다운로드 |
| `open_official_reporting_link` | 단순 외부 링크 열기 (target=_blank, rel=noreferrer noopener) |
| `mark_as_submitted_manually` | 사용자가 외부 창구에서 직접 제출한 뒤 내부 상태를 `SUBMITTED`로 기록 |
| `add_review_note` | 사람 검토 메모 추가 |

## 3. Prohibited Actions

| 코드 | 설명 |
|---|---|
| `auto_submit_report` | 시스템이 외부 신고기관 API에 자동 제출 |
| `auto_login_agency` | 신고기관 사이트 자동 로그인 |
| `agency_form_autofill` | 공식 양식 자동 입력 |
| `reward_claim_automation` | 포상금 자동 신청 |
| `bypass_human_review` | 사람 검토를 우회한 상태 변경 |
| `circumvent_access_control` | 접근권한 우회 |

이 동작들을 구현하려는 어떤 코드도 본 정책 위반이며 거부된다. 런타임 가드: `assertNoAutoSubmission(actionName)` → `AutomaticSubmissionBlockedError` throw.

## 4. SUBMITTED State Meaning

`SUBMITTED` 상태는 **시스템이 외부에 제출했다는 뜻이 아니다.**
사용자가 외부 공식 창구(국민신문고/식약처/지자체 등)에서 직접 제출한 사실을 내부 기록으로 표시하는 상태다.

상태 변경 필수 조건:

1. `confirmManualSubmission === true` 또는 `note`에 "직접 제출"/"수동 제출" 단어 포함
2. `reviewerName` 존재 (외부에 직접 제출한 사람의 식별자)

위반 시 400 `MANUAL_SUBMISSION_CONFIRMATION_REQUIRED` 또는 `MANUAL_SUBMISSION_REVIEWER_REQUIRED`.

UI에서는 SUBMITTED 버튼 클릭 시 `window.confirm` 다이얼로그로 사용자 의사를 한 번 더 확인한다.

응답 메시지:

> "SUBMITTED 상태로 기록되었습니다. 이는 사용자가 외부 공식 창구에 직접 제출한 사실을 내부 기록으로 남긴 것이며, 시스템은 자동 제출을 수행하지 않았습니다."

## 5. UI Rules

### 권장 버튼 문구

- "신고서 초안 복사"
- "공식 신고처 열기"
- "MD/TXT/DOCX 다운로드"
- "직접 제출 완료로 기록"

### 금지 버튼 문구

- "신고하기"
- "자동 신고"
- "바로 제출"
- "제출하기"
- "포상금 신청"
- "신고 완료"
- "AI가 신고"

상단/모달에 항상 다음 안전 안내 표시:

> "자동신고 없음 · 사람 검토 필수 · 수동 제출 기록만 가능. 이 시스템은 외부 신고기관 자동 제출, 신고기관 자동 로그인, 공식 신고 양식 자동입력, 포상금 자동신청을 수행하지 않습니다. 실제 신고는 사용자가 공식 기관 사이트에서 직접 해야 합니다."

## 6. API Rules

| Endpoint | 정책 적용 |
|---|---|
| `GET /api/policy/approval-gate` | 정책 + 공식 링크 노출 |
| `PATCH /api/cases/:id/status` | SUBMITTED 전환 시 `confirmManualSubmission` + `reviewerName` 필수 |
| `PATCH /api/review/queue/:caseId/status` | 동일 (Case API wrapper) |
| 응답 공통 필드 | `autoReport: false`, `humanReviewRequired: true`, `safetyNotice` |

## 7. Official Links (체크리스트 20)

`getOfficialReportingLinks("false_ad")` 반환 (건강기능식품 허위·과대광고 1차 MVP 신고처 후보):

| agencyId | 기관 | URL | 비고 |
|---|---|---|---|
| `mfds` | 식품의약품안전처 | https://www.mfds.go.kr/wpge/m_660/de010410l001.do | 온라인 불법유통 신고 안내 (단순 링크) |
| `epeople` | 국민신문고 | https://www.epeople.go.kr | 민원·공익신고 통합 창구 (사용자 직접 작성) |
| `acrc` | 국민권익위원회 | https://www.acrc.go.kr | 공익신고 제도 일반 안내 |
| `foodsafetykorea` | 식품안전나라 | https://www.foodsafetykorea.go.kr/portal/fooddanger/puff.do | 허위·과대광고 유형 안내·신고 |
| `local_government` | 관할 지자체 · 보건소 · 식품안전관리과 | https://www.gov.kr | 정부24 — 관할 부서 찾기 (지자체별 경로 상이) |

링크는 `target="_blank"` + `rel="noreferrer noopener"`로 열린다. **자동 로그인·자동 입력·자동 제출은 일절 하지 않는다.** 신고서 내용·API 키·개인정보를 링크 URL에 자동으로 붙이지 않는다.

### 7.1 링크 공식성 (Officiality)

- 모든 URL은 **정부/공공기관 공식 도메인(`*.go.kr`)** 만 사용한다. 블로그·뉴스·법무법인 홍보글·커뮤니티 링크는 금지한다.
- 최소 포함 요건(체크리스트 20): 식약처/식품안전 공식 신고 안내, 국민신문고, 관할 지자체·보건소·식품안전관리과 안내 — 현재 5개 모두 충족.
- 링크는 "단순 외부 링크 열기"만 허용한다. 코드 정의 위치: [`src/policy/approvalGate.ts`](../src/policy/approvalGate.ts) `FALSE_AD_LINKS`.

### 7.2 URL 관리 기준 (Maintenance)

- 공식 기관이 페이지 구조를 바꾸면 URL이 변경될 수 있다. 변경 시 `src/policy/approvalGate.ts`의 `FALSE_AD_LINKS` 와 본 표를 함께 갱신한다.
- 모듈별 신고처 메타데이터는 `src/modules/false-ad/agency_config.json` 에서도 관리한다 (스키마: [`agency_config_schema.md`](./agency_config_schema.md) §5 `primaryAgencies`, §12 `maintenancePolicy`).
- `maintenancePolicy.officialSourcesOnly = true`, 검토 주기 `before_each_release`, `staleAfterDays` 경과 시 사람 재검토 권고. URL 변경/검토 후 `lastReviewedAt` 을 갱신한다.

## 8. Static Safety Check

`scripts/check-approval-gate.js` — `src/`·`public/`에서 위험한 함수·식별자 사용을 정적 검사한다.

검사 대상:

- 식별자: `autoSubmit`, `sendToAgency`, `agencyLogin`, `autoLogin`, `submitReport`, `claimReward`
- "허용 문맥" (`-` 또는 "금지", "아닙니다", "수행하지 않" 등 부정 컨텍스트)은 제외

실행:

```bash
npm run check:policy
```

위험 식별자가 발견되면 비-0 종료 코드로 실패.

## 9. Runtime Guards

- `canAutoSubmit()` — 항상 `false` 반환. 코드가 분기 시 false branch만 타게 만든다.
- `assertNoAutoSubmission(actionName)` — 자동 제출 시도를 의미하는 함수 호출은 항상 `AutomaticSubmissionBlockedError` throw.
- `requireManualSubmissionConfirmation(input)` — SUBMITTED 전환 시 confirm + reviewerName 검증.

## 10. Future Reinforcement

- 코드 리뷰 가이드: PR 템플릿에 "본 PR이 자동 제출/자동 로그인을 도입하지 않음을 확인" 체크박스
- 의존성 정책: HTTP 클라이언트 사용 시 외부 신고기관 도메인 allowlist 차단 (현재 미구현, 향후 옵션)
- 빌드 시 `check:policy`를 `prepublish` 또는 CI에서 자동 실행

---

## 11. Workflow Gate States (체크리스트 3)

본 절은 §4 의 Case 상태 머신(`DRAFT/REVIEW/.../SUBMITTED/REJECTED`) 과는 별개로, **신고 보상형 흐름의 승인 게이트 상태**를 정의한다. AI 가 직접 신고하지 못하도록 단계 사이에 명시적 "사람 승인" 단계를 강제한다.

### 11.1 허용 상태 (Allowed Gate States)

| 상태값 | 의미 |
|---|---|
| `draft_created` | 신고서 초안 생성 (사람 검토 대상 아님 — 생성만 됨) |
| `evidence_packaged` | 증거 패키지 생성 완료 |
| `human_review_required` | 사람 검토 필요. 자동 단계는 여기서 멈춘다 |
| `human_approved` | 사람이 "외부 창구에 직접 제출 가능" 하다고 승인 |
| `manually_submitted` | 사람이 외부 기관에 직접 제출 후 접수번호 기록 |
| `rejected` | 사람이 신고 부적합으로 폐기 |
| `needs_more_evidence` | 증거 보완 필요 |

### 11.2 금지 상태 (Forbidden Gate States)

다음 값은 **상태 머신·코드·UI 어디에서도 사용되지 않는다.** 정적 검사(`npm run check:policy`)가 src/public 에서 이 리터럴을 발견하면 실패한다.

| 금지 상태값 | 사유 |
|---|---|
| `ai_submitted` | AI 가 외부 기관에 제출했다는 의미 — 본 시스템은 수행하지 않음 |
| `auto_submitted` | 시스템 자동 제출 — 금지 |
| `submitted_without_review` | 사람 검토 없이 제출됨 — 금지 |
| `reward_claim_auto_submitted` | 보상금/포상금 자동 신청 — 금지 |

### 11.3 필수 승인 로그 (Required Approval Log)

`approveForManualSubmission`, `rejectCase`, `requestMoreEvidence`, `confirmManualSubmission` 호출 시 반환되는 승인 로그 엔트리는 최소한 다음 필드를 포함한다.

| 필드 | 필수 | 비고 |
|---|---|---|
| `caseId` | ✅ | Case 식별자 |
| `reviewerId` 또는 `reviewerName` | ✅ | 검토자(사람) 식별. 둘 중 하나는 반드시 존재 |
| `decision` | ✅ | `approved` / `rejected` / `needs_more_evidence` / `manually_submitted_confirmed` |
| `reviewedAt` | ✅ | ISO 8601 UTC 타임스탬프 |
| `reason` | ✅ | 결정 사유 (자유 텍스트, 마스킹 권장) |
| `evidencePackageId` | ✅ (approve/confirm 단계) | 검토 대상 증거 패키지 ID |
| `draftReportId` | ✅ (approve/confirm 단계) | 검토 대상 신고서 초안 ID |
| `manualSubmissionConfirmed` | confirm 단계에서 `true` 고정 | 사람이 외부 창구에 직접 제출했다는 확인 |
| `externalReceiptNo` | confirm 단계에서만 입력 | 외부 기관에서 부여한 접수번호 (수동 제출 후에만) |

승인 로그는 호출자가 영속화한다(예: `data/approval/{yyyy-mm-dd}.jsonl` 또는 기존 Trace Log 와 연결). 본 모듈은 순수 함수로 구성되어 테스트 결정성을 보장하며, 영속화는 별도 어댑터의 책임이다.

### 11.4 운영 원칙 (Operational Principles)

- 신고서 **초안 생성은 신고가 아니다.** `draft_created` / `evidence_packaged` 는 단순 산출물 생성 상태다.
- 증거 패키지 생성은 신고가 아니다.
- 사람이 외부 신고기관에 **직접 제출하고 접수번호를 입력**해야 `manually_submitted` 상태가 된다.
- 접수번호(`externalReceiptNo`)가 없으면 `manually_submitted` 상태로 변경할 수 없다.
- `human_approved` 가 아닌 상태에서 `confirmManualSubmission` 호출은 거부된다.
- `submittedByHuman === true` 가 아니면 `confirmManualSubmission` 은 거부된다.
- `aiSubmitted` / `autoSubmitted` / `submittedWithoutReview` / `rewardClaimAutoSubmitted` 플래그가 truthy 이면 `blockAutoSubmission` 이 `ApprovalGateError` 를 throw 한다.
- AI 는 신고 가능성 판단·우선순위 점수화·초안 생성·증거 정리까지의 **보조 작업만** 수행한다.

### 11.5 코드 위치

- 정책/타입/런타임 가드: [`src/policy/approvalGate.ts`](../src/policy/approvalGate.ts)
- 워크플로우 함수(체크리스트 3): [`src/policy/approvalWorkflow.ts`](../src/policy/approvalWorkflow.ts)
- 정적 검사: [`scripts/check-approval-gate.js`](../scripts/check-approval-gate.js) (`npm run check:policy`)
- 테스트: [`tests/approvalGate.test.ts`](../tests/approvalGate.test.ts) (`npm run test:approval`)

---

## 12. Pre-Submission Fact Check Gate (체크리스트 6)

본 절은 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) 의 운영 기준을 승인 게이트로 코드화한 것이다. `human_review_required → human_approved` 전이 사이에 **사실관계 점검 게이트(`fact_check_completed`)** 가 강제된다.

### 12.1 게이트 흐름

```
draft_created
    ↓ (증거 패키지 / 신고서 초안 생성)
evidence_packaged
    ↓ (Review Queue 에 등록)
human_review_required
    ↓ (체크리스트 6: 사실관계 점검 — createFactCheckResult)
fact_check_completed   ← 본 게이트
    ↓ (approveForManualSubmission, factCheckResult 첨부 필수)
human_approved
    ↓ (사람이 외부 공식 창구에서 직접 제출)
    ↓ (confirmManualSubmission, externalReceiptNo + submittedByHuman)
manually_submitted
```

### 12.2 통과 조건

`requireFactCheckBeforeApproval(reviewData)` 가 다음을 모두 검증한다 ([`../src/policy/factCheckGate.ts`](../src/policy/factCheckGate.ts)).

- `reviewData.factCheckResult` 가 존재
- `factCheckResult.status === "completed"` — 11개 필수 확인 플래그가 모두 `true`
- `factCheckResult.decision === "approved"` — 검토자가 수동 제출 가능으로 판단
- `factCheckResult.caseId === reviewData.caseId` — Case 일치

위 조건 중 하나라도 어긋나면 `FactCheckGateError` 가 throw 된다. 따라서:

- **`fact_check_completed` 없이 `human_approved` 불가.**
- **`manually_submitted` 는 `human_approved` + `externalReceiptNo` + `submittedByHuman === true` 가 모두 있어야 가능** (`confirmManualSubmission` §11.4 운영 원칙).

### 12.3 11개 필수 확인 플래그

`FACT_CHECK_REQUIRED_FLAGS`:

`publicSourceConfirmed`, `originalUrlConfirmed`, `amountConfirmed`, `periodConfirmed`, `recipientConfirmed`, `projectNameConfirmed`, `suspicionBasisConfirmed`, `counterExplanationReviewed`, `privacyChecked`, `neutralLanguageChecked`, `evidencePackageConfirmed`

세부 정의는 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3.

### 12.4 승인 로그 보강

`ApprovalLogEntry` 가 `factCheckId`, `factCheckSummary` 필드를 가질 수 있다. `approveForManualSubmission(reviewData)` 가 `reviewData.factCheckResult` 를 받으면 자동으로:

- 사실관계 게이트 통과 검증
- 로그에 `factCheckId` 와 `factCheckSummary` (중립 표현 한 줄) 첨부

`summarizeFactCheck(result)` 가 만들어내는 요약 예시:

> "사실관계 점검 11/11 항목 확인 완료 — 수동 제출 검토 가능."
> "사실관계 점검 보완 필요 (8/11 확인, 누락: amountConfirmed, periodConfirmed, recipientConfirmed)."

### 12.5 코드 위치

- 게이트 함수 / 타입: [`../src/policy/factCheckGate.ts`](../src/policy/factCheckGate.ts) (`createFactCheckResult`, `requireFactCheckBeforeApproval`, `summarizeFactCheck`, `FactCheckResult`, `FactCheckSummary`, `FactCheckGateError`)
- 승인 워크플로우 연계: [`../src/policy/approvalWorkflow.ts`](../src/policy/approvalWorkflow.ts) (`ReviewData.factCheckResult`, `ApprovalLogEntry.factCheckId/factCheckSummary`)
- 테스트: [`../tests/preSubmissionFactCheck.test.ts`](../tests/preSubmissionFactCheck.test.ts) (`npm run test:fact-check`)
- 정책 문서: [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md), [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §12
