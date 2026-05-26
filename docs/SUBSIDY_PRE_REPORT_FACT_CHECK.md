# 보조금 신고 전 사실점검 11항목 가이드 (SUBSIDY_PRE_REPORT_FACT_CHECK)

체크리스트 65 산출물. 보조금 후보 Case가 **신고서 초안 생성**으로 넘어가기 전에 반드시 거쳐야 하는
**신고 전 사실점검 11항목** 게이트의 정의·기준·사용법이다.

> 이 점검은 신고서 초안 생성 전 **안전 확인 단계**입니다. **부정수급으로 단정하는 판단이 아닙니다.**
> 근거 부족, 개인정보 노출, 사람 검토 없음 상태에서는 신고서 초안을 생성하지 않습니다.
> 자동 신고/자동 제출 기능은 없으며, 실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다.
> 포상금 지급을 보장하지 않습니다.

---

## 1. 문서 목적
- 11항목이 무엇이고 각 항목의 PASS/WARNING/FAIL 기준이 무엇인지 정리한다.
- `canGenerateReportDraft`가 false가 되는 조건을 명확히 한다.
- 근거검증 strict, 개인정보 스캔, 사람 검토와의 관계를 설명한다.

## 2. 신고 전 사실점검 11항목

| # | itemId | 항목 | 통과(PASS) 기준 |
| --- | --- | --- | --- |
| 1 | `public_data` | 공개자료 여부 | 로그인 없이 접근 가능한 공개자료(`evidenceIsPublic=true`). 비공개/로그인/내부자료면 FAIL |
| 2 | `source_origin` | 원본 URL/파일 출처 | `sourceUrl` / `sourceFileName`+`sourceRowNumber` / `pageNumber` 중 하나 이상 |
| 3 | `collected_at` | 수집일시 | `collectedAt` / `parsedAt` / `capturedAt` 중 하나 이상 |
| 4 | `identification` | 수급기관/사업명 식별 | (정규화)수급기관명 + (정규화)사업명 식별 가능. 개인정보 원문 미사용 |
| 5 | `amount_year_agency` | 금액/연도/기관 | amount·fiscalYear·agency 중 2개 이상 |
| 6 | `risk_rule_hits` | 위험룰 근거 | 반복수급/동일주소/결과물·정산/예산집행/사업명 유사 중 1개 이상 hit (없으면 WARNING) |
| 7 | `risk_reward_scores` | 위험점수·보상가능성 점수 | `finalRiskScore`·`rewardPossibilityScore` 존재(우선 검토 참고 점수, 확정 판단 아님) |
| 8 | `llm_explanation` | LLM 설명형 분석 | `summary`·`whyFlagged`·`keyEvidence`·`additionalChecks` 존재(LLM 미호출 fallback 포함) |
| 9 | `citation_strict` | 근거검증 strict 통과 | `citationStrictPassed=true`. false면 FAIL(차단) |
| 10 | `privacy_api_scan` | 개인정보/API 키 스캔 | `privacyScanPassed=true`. false면 FAIL(차단) |
| 11 | `human_review` | 사람 검토 승인 | `reviewerName` + `reviewStatus=approved` 기록. 자동 승인/검토 없음 금지 → FAIL(차단) |

## 3. PASS / WARNING / FAIL 기준
- **PASS**: 항목 요건을 충족.
- **WARNING**: 신고 전 보강이 권장되지만 초안 생성을 막지는 않음(예: 수집일시 누락, 룰 hit 없음, 점수 일부 누락).
- **FAIL**: 요건 미충족. FAIL이 하나라도 있으면 `canGenerateReportDraft=false`.
- **NOT_APPLICABLE**: 해당 Case에 적용되지 않는 항목(현재 11항목은 기본적으로 모두 적용).

## 4. canGenerateReportDraft가 false가 되는 조건
- **FAIL 항목이 하나라도 있으면 false** 입니다(모든 항목이 PASS 또는 허용 WARNING일 때만 true).
- 특히 다음은 기본 **차단(BLOCKED)** 사유입니다:
  - 공개자료 아님(로그인/비공개 자료) — `public_data` FAIL
  - 원본 출처 없음 — `source_origin` FAIL
  - 근거검증 strict 미통과 — `citation_strict` FAIL
  - 개인정보/API 키 스캔 미통과 — `privacy_api_scan` FAIL
  - 사람 검토 승인 없음 — `human_review` FAIL
- 그 외 FAIL은 `NEEDS_FIX`(보강 후 가능)로 표시됩니다.

## 5. 종합 상태(overallStatus)
- `PASS`: FAIL·WARNING 없음.
- `PASS_WITH_WARNINGS`: FAIL 없음, WARNING 있음 → 초안 생성 가능.
- `NEEDS_FIX`: 차단 항목이 아닌 FAIL 존재 → 초안 생성 불가, 보강 후 가능.
- `BLOCKED`: 차단 항목(위 5종) FAIL 존재 → 초안 생성 불가.

## 6. 근거검증 strict와의 관계
9번 항목은 [근거검증 strict](CITATION_VALIDATION_GUIDE.md) 결과(`strictPassed`)를 그대로 게이트로 사용합니다.
근거 없는 핵심 주장이 있으면 strict가 fail → 사실점검도 FAIL → 신고서 초안을 만들지 않습니다.

## 7. 개인정보 스캔과의 관계
10번 항목은 개인정보/API 키/토큰/상세주소 원문 스캔 결과(`privacyScanPassed`)를 게이트로 사용합니다.
또한 사실점검 결과 자체에도 대표자명·전화번호·주민번호·계좌번호·상세주소 원문을 넣지 않습니다(식별 가능 여부만 표시).

## 8. 사람 검토가 필요한 이유
점수·룰·설명형 분석은 보조 도구일 뿐이며, 합리적 사유(공유시설·다년도 사업·공시 시점 차이 등)가 있을 수 있습니다.
따라서 **사람이 사실관계를 확인하고 승인**해야 신고서 초안 단계로 넘어갑니다. 자동 승인은 금지됩니다.

## 9. 결과 구조
- `caseId`/`candidateId`, `checkedAt`, `checklistItems[{itemId,itemName,status,reason,requiredAction,evidenceRefs}]`,
  `overallStatus`, `canGenerateReportDraft`, `blockingReasons`,
  `reviewRequired:true`, `notLegalConclusion:true`, `autoSubmitAvailable:false`, `rewardGuaranteed:false`.

## 10. 사용 방법(신고서 초안 생성 전)
```bash
npm run subsidy:fact-check -- --fixture                       # 합성 fixture(PASS/WARNING/FAIL/BLOCKED)
npm run subsidy:fact-check -- --input data/cases/<id>/fact-check-input.json
npm run test:subsidy-fact-check
npm run check:subsidy-fact-check
```
출력(gitignore): `data/fact-check/runs/{runId}/` 에 `fact-check-report.json` · `fact-check-summary.md` · `metadata.json`.

선택 API:
- `POST /api/subsidy/fact-check/run` — 합성 데모(또는 cases 입력) 11항목 점검.
- `GET /api/subsidy/fact-check/latest` — 최근 점검 결과.
- `GET /api/subsidy/candidates/:id/fact-check` — 후보 데모 점검 결과.
- 응답에 `canGenerateReportDraft` / `autoSubmitAvailable:false` / `rewardGuaranteed:false` / "사람 검토 필요" 안내가 포함됩니다.

## 11. 검증 기준
- `npm run test:subsidy-fact-check` — 11항목 반환, 상태 표시, 차단 조건(strict/privacy/review) → canGenerateReportDraft=false, 안전 플래그 고정.
- `npm run check:subsidy-fact-check` — 필수 파일/섹션/키워드 존재, 단정적 금지 표현 없음.

## 12. 다음 단계 (이번 범위 밖)
사실점검을 통과(`canGenerateReportDraft=true`)한 Case에 대해서만 다음 단계에서 **보조금 신고서 초안 생성 → 실제 신고처 연결 → 결과·보상 기록**을 진행합니다. 자동 신고·자동 제출은 없습니다.

---
관련 문서: [SUBSIDY_RISK_RULES_GUIDE.md](SUBSIDY_RISK_RULES_GUIDE.md) · [RISK_SCORE_MODEL.md](RISK_SCORE_MODEL.md) · [REWARD_POSSIBILITY_SCORE_MODEL.md](REWARD_POSSIBILITY_SCORE_MODEL.md) · [LLM_EXPLANATION_ANALYSIS_GUIDE.md](LLM_EXPLANATION_ANALYSIS_GUIDE.md) · [CITATION_VALIDATION_GUIDE.md](CITATION_VALIDATION_GUIDE.md)
