# 신고 전 사실관계 점검표

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)
> 문서 종류: Pre-Submission Fact Checklist (체크리스트 6)
> 관련 문서: [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`approval_gate.md`](./approval_gate.md), [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md), [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md), [`privacy_policy.md`](./privacy_policy.md)

---

## 1. 문서 목적

- 신고서 초안이 **실제 신고로 이어지기 전에** 사람이 확인해야 할 **최소 사실관계 기준**을 정의한다.
- **무고, 허위신고, 명예훼손, 과잉신고 위험**을 줄이기 위한 내부 운영 기준이다.
- 본 점검표는 **법률 자문을 대체하지 않으며**, 신고 여부는 사람이 최종 판단한다.

## 2. 적용 범위

- 보조금 부정수급 의심사례
- 공공재정 부정청구 의심사례
- 그 외 모듈별 의심사례 (false_ad / counterfeit_goods / bid_collusion 등)
- 신고서 초안 생성 이후 사람 검토 단계
- 수동 제출 전 최종 승인 단계 (`human_review_required` → `human_approved` 사이 게이트)

## 3. 필수 확인 항목

| 번호 | 확인 항목 | 확인 내용 | 필수 여부 | 미확인 시 처리 |
|---|---|---|---|---|
| 1 | 공개자료 여부 | 자료가 공개자료, 공공기관 자료, 사용자가 적법하게 보유한 자료인지 확인 | 필수 | 보류 |
| 2 | 원문 URL | 공고문, 교부내역, 정산자료, 감사자료 등 원문 URL 존재 여부 확인 | 필수 | 보류 |
| 3 | 자료 수집일 | 자료 확인일과 수집일을 기록 | 필수 | 보류 |
| 4 | 수급기관 | 수급기관명, 단체명, 사업자명 등 대상 식별 정보 확인 | 필수 | 보류 |
| 5 | 사업명 | 보조사업명 또는 지원사업명 확인 | 필수 | 보류 |
| 6 | 금액 | 교부금액, 집행금액, 환수금액 가능성 등 금액 근거 확인 | 필수 | 보류 |
| 7 | 기간 | 사업 기간, 집행 기간, 정산 기간 확인 | 필수 | 보류 |
| 8 | 수급기관·사업명 일치 | 서로 다른 자료 간 기관명과 사업명이 같은 사안인지 확인 | 필수 | 보류 |
| 9 | 의심근거 | 반복 수급, 중복 가능성, 목적 외 사용 의심, 정산 누락 등 구체 근거 확인 | 필수 | 보류 |
| 10 | 반대 가능성 | 오해, 동명이인, 사업명 유사, 정당한 변경 가능성 검토 | 필수 | 보류 |
| 11 | 개인정보 제거 | 신고서 초안과 증거 패키지에 불필요한 개인정보가 없는지 확인 | 필수 | 보류 |
| 12 | 단정 표현 제거 | "확정", "범죄", "사기", "부정수급자" 등 단정 표현이 없는지 확인 | 필수 | 보류 |
| 13 | 증거 패키지 | 원문 URL, 캡처, 파일, 해시 등 근거 자료가 묶여 있는지 확인 | 필수 | 보류 |
| 14 | 검토자 의견 | 검토자가 승인/보류/폐기 사유를 작성했는지 확인 | 필수 | 보류 |
| 15 | 최종 판단 | "신고 검토 초안", "보완 필요", "신고 부적합" 중 하나로 판단 | 필수 | 보류 |

## 4. 신고서 초안과 확정의 구분

- **신고서 초안 (draft):** AI 가 자료를 정리해 만든 검토용 문서이다. 외부 제출 대상이 아니다.
- **신고서 확정 (approved for manual submission):** 사람이 사실관계와 증거를 확인하고 "수동 제출 가능" 하다고 승인한 상태이다 (`human_approved`).
- **실제 신고 제출 (manually submitted):** 사람이 외부 신고기관에 직접 제출하고 접수번호(`externalReceiptNo`) 를 기록한 상태이다.
- **AI 는 신고서 확정이나 실제 제출을 자동으로 수행할 수 없다.** 본 점검표 미완료 상태에서 `human_approved` 또는 `manually_submitted` 로 전이하는 동작은 [`approval_gate.md`](./approval_gate.md) §11 의 게이트에 의해 차단된다.

## 5. 승인 기준

신고서 초안은 아래 조건을 **모두** 충족해야 수동 제출 검토 대상(`human_approved`)으로 전환할 수 있다.

- 공개자료 또는 적법한 자료 기반이다 (`publicSourceConfirmed`).
- 원문 URL 또는 원본 문서가 확인된다 (`originalUrlConfirmed`).
- 금액, 기간, 수급기관, 사업명이 확인된다 (`amountConfirmed` / `periodConfirmed` / `recipientConfirmed` / `projectNameConfirmed`).
- 의심근거가 구체적이다 (`suspicionBasisConfirmed`).
- 반대 가능성 또는 오인 가능성을 검토했다 (`counterExplanationReviewed`).
- 개인정보가 제거 또는 마스킹되었다 (`privacyChecked`).
- 단정·비방 표현이 제거되었다 (`neutralLanguageChecked`).
- 검토자가 승인 사유를 작성했다 (`reviewerComment`).
- `decision` 이 `approved` 다.

## 6. 보류 또는 폐기 기준

다음 중 하나라도 해당하면 **보류** (`needs_more_evidence`) 또는 **폐기** (`rejected`) 한다.

- 원문 URL 이 없다.
- 금액이나 기간이 불명확하다.
- 수급기관이 특정되지 않는다.
- 의심근거가 추측뿐이다.
- 단순 정책 불만 또는 민원성 제보이다.
- 개인정보 또는 민감정보가 과도하게 포함되어 있다.
- 명예훼손 또는 무고 위험이 크다.
- 이미 사실관계가 반박된 사안이다.

## 7. 표준 검토자 확인 문구

> "검토자는 본 신고서 초안이 실제 신고가 아니라 검토용 문서임을 확인했습니다. 공개자료, 원문 URL, 금액, 기간, 수급기관, 의심근거를 확인했으며, 개인정보와 단정 표현을 점검했습니다. 실제 신고 여부는 관계 법령과 기관 안내를 확인한 후 사람이 최종 판단합니다."

이 문구는 신고서 초안의 머리말, 승인 로그 메모, UI 의 사실관계 점검 모달에 동일하게 사용한다.

## 8. 체크리스트 데이터 구조

`src/policy/factCheckGate.ts` 의 `FactCheckResult` 인터페이스로 코드화되어 있다.

| 필드명 | 설명 | 필수 여부 |
|---|---|---|
| `caseId` | 케이스 ID | 필수 |
| `reviewerId` 또는 `reviewerName` | 검토자 식별값 | 필수 (둘 중 하나) |
| `checkedAt` | 점검 일시 (ISO 8601) | 필수 (자동 기록 가능) |
| `publicSourceConfirmed` | 공개자료 여부 확인 | 필수 |
| `originalUrlConfirmed` | 원문 URL 확인 | 필수 |
| `amountConfirmed` | 금액 확인 | 필수 |
| `periodConfirmed` | 기간 확인 | 필수 |
| `recipientConfirmed` | 수급기관 확인 | 필수 |
| `projectNameConfirmed` | 사업명 확인 | 필수 |
| `suspicionBasisConfirmed` | 의심근거 확인 | 필수 |
| `counterExplanationReviewed` | 반대 가능성 검토 | 필수 |
| `privacyChecked` | 개인정보 제거 확인 | 필수 |
| `neutralLanguageChecked` | 단정 표현 제거 확인 | 필수 |
| `evidencePackageConfirmed` | 증거 패키지 확인 | 필수 |
| `reviewerComment` | 검토자 의견 | 필수 |
| `decision` | `approved` / `rejected` / `needs_more_evidence` | 필수 |

파생 필드:

| 필드명 | 설명 |
|---|---|
| `status` | `completed` (모든 필수 항목 충족) / `incomplete` (하나 이상 누락) |
| `missingFields` | 누락 항목 이름 배열 (incomplete 일 때만) |

## 9. 코드/검증 위치

| 역할 | 위치 |
|---|---|
| 타입 / 게이트 함수 | [`../src/policy/factCheckGate.ts`](../src/policy/factCheckGate.ts) (`createFactCheckResult`, `requireFactCheckBeforeApproval`, `summarizeFactCheck`) |
| 승인 게이트 연계 | [`../src/policy/approvalWorkflow.ts`](../src/policy/approvalWorkflow.ts) (`approveForManualSubmission` 의 선택 인자 `factCheckResult` / `factCheckId`) |
| 테스트 | [`../tests/preSubmissionFactCheck.test.ts`](../tests/preSubmissionFactCheck.test.ts) (`npm run test:fact-check`) |
| 정책 문서 | 본 문서, [`approval_gate.md`](./approval_gate.md) §11, [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §12 |

---

> 본 점검표는 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §12 (신고 전 사실관계 점검 원칙) 의 운영 기준을 항목 수준으로 구체화한 내부 운영 문서다. 본 문서와 모듈별 가이드가 충돌하면 본 문서·운영정책·`approval_gate.md` 가 우선한다.
