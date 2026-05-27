# 보조금 신고서 초안 생성 가이드 (SUBSIDY_REPORT_DRAFT_GUIDE)

체크리스트 66 산출물. **신고 전 사실점검 11항목(체크리스트 65)을 통과한 후보**에 한해 사람이
검토·수정할 수 있는 **보조금 신고서 초안**을 생성하는 게이트형 생성기의 사용·해석 가이드다.

> 신고서 초안은 **실제 신고 제출이 아닙니다.** 부정수급으로 단정하는 판단이 아닙니다.
> 사람이 근거와 개인정보를 다시 확인해야 하며, 실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다.
> 자동 신고/자동 제출 기능은 없고 포상금 지급을 보장하지 않습니다.

---

## 1. 신고서 초안 생성 조건
- 초안 생성 전 반드시 [신고 전 사실점검 11항목](SUBSIDY_PRE_REPORT_FACT_CHECK.md) 결과를 확인한다.
- **`canGenerateReportDraft=true`인 후보만** 초안 생성이 가능하다(FAIL 항목이 하나라도 있으면 생성 불가).
- 다음 중 하나라도 해당하면 생성을 차단하고 보강 필요 상태로 반환한다:
  - 근거검증 strict fail
  - 개인정보/API 키 스캔 fail
  - 사람 검토 기록 없음
  - 공개자료 근거 없음(로그인/비공개 자료)
  - 원본 URL 또는 `sourceFileName`/`sourceRowNumber` 없음
  - 수급기관/사업명/금액/연도 등 핵심 필드 부족
- 차단 시 서버/프로세스는 죽지 않고 안전 오류 코드 `REPORT_DRAFT_BLOCKED_BY_FACT_CHECK`와
  사람이 이해할 수 있는 한국어 `blockedReason`을 반환한다.

## 2. fact check 11항목과의 관계
초안 생성기는 입력 Case에 대해 사실점검 11항목을 먼저 실행하고, `canGenerateReportDraft`를 그대로 게이트로 사용한다.
- `PASS` / `PASS_WITH_WARNINGS` → 초안 생성(WARNING은 `warnings`로 함께 표시).
- `NEEDS_FIX` / `BLOCKED` → 초안 생성 차단, `blockedReason` 반환.

## 3. 초안에 포함되는 항목
제목 · 신고 후보 요약 · 원본 공개자료 출처 · 수집일시 · 수급기관(정규화) · 사업명(정규화) ·
보조금 금액 · 사업연도 · 담당/지원 기관 · 지역 정보 · 위험룰 5종 탐지 결과 · 위험점수(0~100) ·
보상가능성 점수 · LLM 설명형 분석 요약 · 핵심 근거 목록 · 근거검증 결과 · 개인정보 스캔 결과 ·
신고 전 사실점검 11항목 결과 · 추가 확인 필요 사항 · 사람이 직접 확인해야 할 항목 ·
중립 신고 문구 예시 · 피해야 할 표현 · "부정수급으로 단정하지 않음" · "포상금 지급을 보장하지 않음" ·
"실제 신고는 사용자가 공식 창구에서 직접 제출".

## 4. 초안이 의미하는 것 / 의미하지 않는 것
- 의미하는 것: 사람이 **검토·수정해서 공식 창구에 직접 제출**할 때 참고하는 초안.
- 의미하지 않는 것: 부정수급/위법 확정, 제출 완료, 포상금 지급 보장. 자동 제출은 없다.

## 5. 차단 사유별 해결 방법
| 차단 사유 | 해결 방법 |
| --- | --- |
| 근거검증 strict fail | 근거 없는 핵심 주장에 공개자료 근거 보강 후 strict 재검증 |
| 개인정보/API 키 스캔 fail | 개인정보·키·상세주소 원문 마스킹/제거 후 재스캔 |
| 사람 검토 없음 | 검토자가 검토하고 `reviewStatus=approved` 기록 |
| 공개자료 근거 없음 | 로그인/비공개 자료 제거, 공개자료로 교체 |
| 원본 출처 없음 | 원문 URL 또는 파일명+행번호 보강 |
| 핵심 필드 부족 | 수급기관/사업명/금액/연도 보강 |

## 6. 생성 파일 위치
`data/reports/subsidy/{candidateId}/`
- `report.md` — 신고서 초안 본문(검토·수정용)
- `report.txt` — 텍스트 버전
- `report.docx` — 워드 버전(생성 실패 시 md/txt만)
- `report_metadata.json` — candidateId/caseId/moduleId(subsidy_fraud)/생성시각/사실점검 상태/점수/파일목록/`isDraft:true`/`autoSubmitted:false`/`rewardGuaranteed:false`/`notLegalConclusion:true`

## 7. GitHub에 올리면 안 되는 파일
`data/reports/`(초안 전체)는 gitignore 처리되어 커밋되지 않는다. 개인정보·근거 원문이 포함될 수 있으므로
초안 산출물은 절대 커밋하지 않는다(`.env`, API 키, `data/*` 산출물 포함).

## 8. 사용 방법
```bash
npm run test:subsidy-report-draft
npm run subsidy:report-draft -- --fixture                       # PASS는 생성, 차단 케이스는 안내
npm run subsidy:report-draft -- --input data/cases/<id>/draft-input.json
npm run check:subsidy-report-draft
```
선택 API:
- `POST /api/subsidy/report-draft/run` — 합성 데모(또는 cases 입력) 게이트 초안 생성.
- `GET /api/subsidy/candidates/:id/report-draft` — 후보 데모 초안 생성 상태.
- 응답: `draftCreated` / `blockedReason` / `reportFiles` / `metadata` / `warnings` /
  `humanReviewRequired:true` / `autoSubmitted:false` / `rewardGuaranteed:false` / `notLegalConclusion:true`.

## 9. 다음 단계: 수동 신고 기록 연결 (이번 범위 밖)
초안을 사람이 검토·수정한 뒤, 다음 단계에서 **실제 신고처 수동 제출 → 수동 신고 기록 → 결과·보상 기록**을 진행한다.
자동 신고·자동 로그인·공식 양식 자동입력은 추가하지 않는다.

---
관련 문서: [SUBSIDY_PRE_REPORT_FACT_CHECK.md](SUBSIDY_PRE_REPORT_FACT_CHECK.md) · [CITATION_VALIDATION_GUIDE.md](CITATION_VALIDATION_GUIDE.md) · [SUBSIDY_RISK_RULES_GUIDE.md](SUBSIDY_RISK_RULES_GUIDE.md)
