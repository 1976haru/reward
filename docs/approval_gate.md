# Approval Gate

## 1. Purpose

AI 또는 시스템이 외부 신고기관에 **직접 신고를 제출하지 못하도록 구조적으로 차단**한다.
시스템이 수행할 수 있는 동작은 "신고서 초안 복사 / 다운로드 / 공식 링크 열기 / 내부 상태 기록 / 사람 검토 메모"뿐이다.

본 정책은 이 프로젝트의 **핵심 안전장치**다. 코드, UI, 문서, API 응답 모두 이 정책을 따른다.

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

> "이 시스템은 자동 신고를 수행하지 않습니다. 모든 제출은 사람이 공식 기관 사이트에서 직접 해야 합니다."

## 6. API Rules

| Endpoint | 정책 적용 |
|---|---|
| `GET /api/policy/approval-gate` | 정책 + 공식 링크 노출 |
| `PATCH /api/cases/:id/status` | SUBMITTED 전환 시 `confirmManualSubmission` + `reviewerName` 필수 |
| `PATCH /api/review/queue/:caseId/status` | 동일 (Case API wrapper) |
| 응답 공통 필드 | `autoReport: false`, `humanReviewRequired: true`, `safetyNotice` |

## 7. Official Links

`getOfficialReportingLinks("false_ad")` 반환:

| 기관 | URL | 비고 |
|---|---|---|
| 식품의약품안전처 | https://www.mfds.go.kr/wpge/m_660/de010410l001.do | 온라인 불법유통 신고 안내 (단순 링크) |
| 국민신문고 | https://www.epeople.go.kr | 민원·공익신고 통합 창구 (사용자 직접 작성) |
| 국민권익위원회 | https://www.acrc.go.kr | 공익신고 제도 일반 안내 |

링크는 `target="_blank"` + `rel="noreferrer noopener"`로 열린다. 자동 로그인·자동 입력은 일절 하지 않는다.

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
