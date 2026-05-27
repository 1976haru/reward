# 보조금 결과·보상 기록 가이드 (SUBSIDY_OUTCOME_TRACKING_GUIDE)

체크리스트 68 산출물. 사용자가 외부 공식 창구에서 **직접 신고한 뒤**, 접수번호·처리상태·결과·보상 여부를
내부에 **수동으로 기록**하는 흐름과 상태 전이 안전장치 가이드다.

> 공익레이더는 신고를 자동 제출하지 않습니다. 사용자가 외부 공식 창구에서 직접 제출한 뒤 접수번호를 기록합니다.
> 포상금 지급 여부와 금액은 기관 판단에 따르며 보장되지 않습니다. 이 기록은 내부 추적용이며 부정수급/위법 확정이 아닙니다.

---

## 1. 결과 기록 항목
`candidateId` · `caseId` · `moduleId: subsidy_fraud` · `submittedManually` · `confirmManualSubmission` ·
`recorderName`/`reviewerName` · `agencyName` · `officialUrl` · `externalReceiptNo`/`referenceNumber` ·
`submittedAt` · `status` · `decision`/`result` · `rewardRelated` · `rewardAmount` · `rewardConfirmedAt` ·
`memo` · `updatedAt` · `autoSubmitted:false` · `rewardGuaranteed:false` · `notLegalConclusion:true`.

## 2. 상태 흐름 (상태 전이 안전장치)
후보 상태: Draft → Review → Approved → Report Draft → Ready For Manual Submission →
Submitted Manually → Under Review → Completed / Rejected.
- **자동으로 Submitted 상태가 되지 않는다.**
- outcome 상태(`draft`/`submitted_manually`/`under_review`/`completed`/`rejected`/`unknown`)는 허용된 전이만 가능하다.
- `submitted_manually` 전환에는 반드시 다음이 모두 필요하다:
  `confirmManualSubmission: true` · `recorderName` 또는 `reviewerName` · `agencyName` ·
  `externalReceiptNo` 또는 `referenceNumber` · `manualSubmissionNote`.
- 상태 변경 로그(`state-log.jsonl`)에 `candidateId`/`fromStatus`/`toStatus`/`changedAt`/`changedBy`/`reason`/`confirmManualSubmission` 를 남기며, 개인정보/API 키는 마스킹한다.

## 3. 접수번호 기록 방법
- 외부 공식 창구에서 받은 접수번호를 `externalReceiptNo`(또는 `referenceNumber`)에 입력한다.
- 외부 접수번호 등 **직접 제출 근거가 없으면 `submitted_manually` 상태로 전환하지 않는다**(draft 유지).

## 4. 처리상태 기록 방법
- `PATCH /api/subsidy/candidates/:id/outcome` 로 `status` 를 단계적으로 갱신한다
  (submitted_manually → under_review → completed/rejected).
- 허용되지 않은 전이는 `INVALID_STATE_TRANSITION` 으로 거부된다.

## 5. 포상금 기록 시 주의사항
- `rewardAmount` 는 **실제 지급을 확인한 뒤(`rewardConfirmedAt` 동반)** 입력한 값만 저장한다.
- **포상금 예상액·자동 산정액을 실제 지급액처럼 저장하지 않는다**(rewardConfirmedAt 없으면 저장 거부 + 경고).
- 포상금 지급 여부·금액은 기관 판단에 따르며 보장되지 않는다(`rewardGuaranteed:false`).

## 6. 개인정보 마스킹 원칙
- `recorderName`/`agencyName`/`externalReceiptNo`/`manualSubmissionNote`/`decision`/`result`/`memo` 등 모든 텍스트는 저장 전 마스킹한다.
- 대표자명·전화번호·주민번호·계좌번호·상세주소 원문은 outcome/로그에 저장하지 않는다.

## 7. GitHub에 결과 산출물을 올리면 안 되는 이유
- 결과 기록에는 접수번호·기관·메모 등 민감 정보가 포함될 수 있다.
- `data/outcomes/**` 는 gitignore 처리되어 커밋되지 않는다. 절대 커밋하지 않는다(`.env`, API 키, `data/*` 산출물 포함).

## 8. API
- `POST /api/subsidy/candidates/:id/outcome` — 직접 제출 결과 수동 기록(가드 미충족 시 `MANUAL_SUBMISSION_NOT_CONFIRMED`).
- `GET /api/subsidy/candidates/:id/outcome` — 후보 결과 조회.
- `PATCH /api/subsidy/candidates/:id/outcome` — 처리상태/결과/포상 업데이트(상태 전이 가드).
- `GET /api/subsidy/outcomes` — 결과 기록 목록(내부 추적용).
- 모든 응답에 `autoSubmitted:false` · `rewardGuaranteed:false` · `notLegalConclusion:true` 와 내부 추적 안내가 포함된다.

## 9. 검증
```bash
npm run test:subsidy-outcome
npm run check:subsidy-manual-reporting
```

## 10. 다음 단계
운영 대시보드·일일 운영 루틴·릴리즈 준비 단계에서 이 결과 기록을 집계·모니터링한다(이번 범위 밖).

---
관련 문서: [SUBSIDY_MANUAL_REPORTING_GUIDE.md](SUBSIDY_MANUAL_REPORTING_GUIDE.md) · [SUBSIDY_REPORT_DRAFT_GUIDE.md](SUBSIDY_REPORT_DRAFT_GUIDE.md)
