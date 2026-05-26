# Citation Validation / 근거 검증 가이드 (체크리스트 25)

## 1. 문서 목적

- AI 리포트, LLM 설명형 분석, 위험점수 리포트, 보상가능성 리포트의 모든 핵심 주장에 공개자료 근거를 연결하는 기준을 정의한다.
- 본 모듈은 AI 환각을 줄이고, 사람이 원문 URL / 파일명 / 행번호 / 레코드 ID를 따라 사실관계를 확인할 수 있게 하는 보조 도구이다.
- 공개자료 중심 분석 원칙, 개인정보 최소수집 원칙, 중립 표현 원칙을 따른다.
- 근거 검증은 deterministic하게 동작하며 실제 LLM API를 호출하지 않는다.

## 2. 검증 대상

아래 항목을 포함한다.

- LLM 설명형 분석 summary
- whyFlagged
- keyEvidence
- additionalChecks
- 위험점수 모델 reason
- 보상가능성 점수 reason
- 룰 기반 탐지 report의 reason
- Markdown 리포트의 후보 설명 문장
- JSON 리포트의 evidenceSummary
- 단, 시스템 안내문, 면책문구, 일반 정책 설명은 citation 필수 대상에서 제외할 수 있다(disclaimer claim).

## 3. 근거로 인정되는 항목

| 근거 유형 | 예시 | 인정 여부 |
|---|---|---|
| sourceUrl | 지자체 공고 URL, 공공데이터 API URL | 인정(강한 근거) |
| evidenceUrl | 원문 증거 URL | 인정(강한 근거) |
| sourceFileName + sourceRowNumber | 업로드 CSV/XLSX/PDF 파일명과 행번호/페이지 번호 | 인정(강한 근거) |
| attachmentUrl | 공개 첨부파일 URL | 인정(강한 근거) |
| evidenceId | 증거 패키지 ID | 인정(강한 근거) |
| recordId | 표준 기준선 레코드 ID | 보조 인정 |
| computed_model | 모델 계산 결과 / 검토 신호 | 보조 인정(외부 사실 아님) |
| privateUrl / loginRequiredUrl | 로그인 필요 또는 비공개 URL | 불인정 |
| personalInfoRaw | 주민번호, 계좌번호, 전화번호 등 | 불인정 |

- 원문 URL, evidenceUrl, sourceUrl, sourceFileName, sourceRowNumber, recordId, evidenceId 같은 식별 가능한 공개 근거만 사용한다.
- 점수 계산 결과와 내부 판단은 computed_model(모델 계산 결과 / 검토 신호)로 표시하고 외부 사실처럼 쓰지 않는다.

## 4. 핵심 주장 정의

핵심 주장(core claim)은 외부 공개자료 사실을 주장하는 문장이며 강한 근거가 필요하다. 예:

- "동일 기관명 키가 반복됨"
- "동일 주소 후보가 확인됨"
- "성과보고서 URL이 확인되지 않음"
- "정산서 근거가 부족함"
- "유사 사업명 후보가 존재함"
- "계약업체 반복 연결 후보가 존재함"
- "보조금액 또는 계약금액이 유사함"
- "위험점수 A/B/C로 분류됨"(모델 계산 결과 → computed)
- "보상/포상 가능성 검토 우선순위 High/Medium/Low로 분류됨"(모델 계산 결과 → computed)

주의:

- 위 문장은 모두 후보·검토 신호로 표현해야 하며 확정 판단이 아니다.
- "확인됨", "제출됨", "미제출", "위반", "불법", "부정수급" 같은 단정 표현은 근거가 있어도 확정 표현으로 쓰지 않는다.

## 5. Citation 요구 기준

- 핵심 주장마다 최소 1개 강한 citation(sourceUrl / evidenceUrl / sourceFileName+행번호 / attachmentUrl / evidenceId)이 필요하다.
- recordId와 computed_model은 보조 근거이며 핵심 주장을 단독으로 통과시키지 못한다(보조/모델 계산 주장에는 인정).
- 문장 단위 citation이 어려우면 claim 단위 citation을 사용한다.
- citation이 없으면 warning 또는 fail로 처리한다.
- P0 리포트는 기본적으로 citation 없는 핵심 주장을 strict 모드에서 실패 처리한다.
- fixture 기반 데이터는 fixture citation으로 표시하고 실데이터 근거처럼 표현하지 않는다.

## 6. 개인정보·비공개자료 제한

- citation에는 개인정보 원문을 넣지 않는다.
- sourceUrl/evidenceUrl이 로그인 필요·비공개·내부자료이면 근거로 인정하지 않는다. 비공개자료를 근거로 허용하지 않으며, 로그인 자료를 근거로 허용하지 않는다.
- 주민번호, 계좌번호, 전화번호, 이메일, 상세주소, 대표자명은 citation text에 포함하지 않는다. 개인정보를 근거로 허용하지 않는다.
- 개인정보가 포함된 citation은 차단(fail) 처리한다.
- 첨부파일명에 개인정보가 포함되면 마스킹 후 사용하거나 제외한다.
- AI 프롬프트에는 원문 개인정보를 넣지 않는다. 개인정보 수집을 허용하지 않으며, 계좌번호 저장과 주민번호 저장을 하지 않는다.

## 7. 검증 결과 등급

| 결과 | 의미 | 처리 |
|---|---|---|
| pass | 모든 핵심 주장에 근거 있음 | 리포트 생성 가능 |
| warning | 일부 보조 주장에 근거 부족 | 경고 표시 후 사람 검토 |
| fail | 핵심 주장에 근거 없음 또는 개인정보 차단 | 리포트 생성 차단 또는 수정 필요 |

## 8. 근거 없는 문장 처리

- 근거 없는 핵심 주장은 자동 경고를 생성한다.
- fail 모드(strict)에서는 리포트 생성을 중단한다.
- warning 모드에서는 "근거 보강 필요" 문구를 추가한다.
- 근거 없는 문장을 그대로 통과시키지 않는다.
- 자동으로 단정 표현을 생성하지 않는다.
- 근거가 없으면 "공개자료 기준 추가 확인 필요"로 표현한다.

## 9. 리포트 생성 기준

- citation validation report는 JSON과 Markdown으로 생성한다.
- 제목은 "AI 리포트 근거 검증 결과"로 한다.
- 전체 claims 수, citation 보유 claims 수, 누락 claims 수, 개인정보 차단 건수, pass/warning/fail 상태를 표시한다.
- 누락 claim 목록과 필요한 보강 항목을 표시한다.
- 단정 표현과 개인정보 원문은 포함하지 않는다.
- 리포트 생성 전 citation validation을 통과해야 한다(strict 모드에서 fail이면 생성 중단).

## 10. 검증 기준

- 근거 있는 claim은 pass 처리되어야 한다.
- 근거 없는 핵심 claim은 strict에서 fail, warning에서 warning 처리되어야 한다.
- 개인정보가 포함된 citation은 차단되어야 한다.
- 로그인 필요/비공개 URL은 citation으로 인정하지 않는다.
- fixture citation은 fixture 기반으로 표시되어야 한다.
- JSON 리포트와 Markdown 리포트가 생성되어야 한다.
- 위험점수, 보상가능성 점수, LLM 설명형 분석 결과에 citation/evidence 검증을 연결한다.

## 11. 후속 작업

- 실제 증거 패키지 생성기와 연결
- 신고서 초안 생성 전 citation validation gate 적용
- UI에서 claim별 citation 표시
- LLM 응답 실연동 시 응답 문장별 citation 강제
- 공개자료 원문 스냅샷 보관(공개 영역만)

## 12. 실행 방법

```bash
npm run test:citations
npm run validate:citations -- --fixture
npm run validate:citations -- --fixture --strict
npm run validate:citations -- --input data/analysis/llm-explanation/runs/xxx/llm-explanation-report.json
npm run validate:citations -- --input data/risk/score/runs/xxx/risk-score-report.json
npm run check:citations
```

- 분석 모듈: [`src/analysis/citationValidator.ts`](../src/analysis/citationValidator.ts)
- 표준 타입: [`src/types/citationValidation.ts`](../src/types/citationValidation.ts)
- CLI: [`scripts/validate-report-citations.ts`](../scripts/validate-report-citations.ts)
- 정책 검사: [`scripts/check-citation-validation-policy.js`](../scripts/check-citation-validation-policy.js)

본 가이드는 법률 자문을 대체하지 않으며, 모든 결과는 사람 검토 대상이다.

## 13. strict 모드 표준 결과 + 룰 5종 입력 (체크리스트 64)

### 13.1 strict 모드의 의미
- strict 모드는 **근거 없는 핵심 주장(core)이 하나라도 있으면 fail** 처리합니다. 환각·오류를 신고 전에 걸러내는 장치이며, **법 위반 확정이 아닙니다.**
- 핵심 주장에는 다음 중 하나 이상의 **공개자료 근거**가 있어야 합니다: `sourceUrl` / `sourceFileName`+`sourceRowNumber` / `evidenceId` / `recordId` / `candidateId` / `originalTextSnippet` / `computed_model`(계산 주장) / `ruleResultId`.
- 로그인 필요 URL, 비공개·내부자료, 개인정보 원문은 근거로 인정하지 않습니다(차단).

### 13.2 검증 결과 표준 필드
`totalClaims`, `supportedClaims`, `unsupportedClaims`, `warningClaims`, `failedClaims`, `strictPassed`, `suggestedFixes`, `privacyBlockedCitations`.

### 13.3 검증 대상이 되는 핵심 주장(룰 5종 연계)
반복수급 후보 · 동일주소 후보 · 결과물/정산 근거 부족 · 예산집행 이상치 후보 · 사업명 유사 반복 후보 · 위험점수 산출 근거 · 보상가능성 점수 산출 근거 · 공개자료 출처/수집일시 — 모두 근거가 연결돼야 합니다. `rule-results.json`(체크리스트 60)을 직접 입력으로 받아 룰 후보 주장을 추출합니다.

### 13.4 unsupportedClaims가 있을 때 처리 방법
- `suggestedFixes`에 해당 주장이 "근거 보강 필요"로 표시됩니다.
- strict 모드에서는 fail로 끝나며(CLI exit 1), 사람이 공개자료 근거(원문 URL·파일명+행번호·evidenceId 등)를 보강한 뒤 재검증합니다.

### 13.5 개인정보 원문을 근거에 넣지 않는 이유
근거에 개인정보가 남으면 유출·오남용 위험이 있습니다. 개인정보가 포함된 citation은 `privacyBlockedCitations`로 차단되고 근거로 인정되지 않습니다.

### 13.6 strict 통과 예시(실제 파이프라인)
`rule-results.json`(공개 URL 근거 포함) → `analysis:llm-explain` → 생성된 설명 리포트를 strict 검증하면 핵심 주장이 공개 URL 근거를 가지므로 통과합니다.
```bash
npm run analysis:llm-explain -- --input data/risk/runs/<id>/rule-results.json
npm run validate:citations -- --input data/analysis/llm-explanation/runs/<id>/llm-explanation-report.json --strict
```
> `--fixture --strict`는 근거 누락 사례를 일부러 포함해 strict가 fail을 어떻게 처리하는지 보여주는 데모이며, 위 실제 파이프라인 명령으로 strict 통과를 확인할 수 있습니다.

### 13.7 다음 단계: 신고 전 사실점검 11항목 연결
strict 통과한 설명형 분석 결과를 입력으로 **신고 전 사실점검 11항목 → 보조금 신고서 초안**을 다음 단계에서 진행합니다(이번 범위 밖).

### 13.8 API
- `POST /api/citations/validate`(claims/report/fixture, strict 옵션), `GET /api/citations/latest`.
- 응답에 `strictPassed` / `suggestedFixes` / `privacyBlockedCitations` / `notLegalConclusion:true` / `rewardGuaranteed:false` 와 "부정수급으로 단정하지 않음 / 포상금 지급 보장하지 않음 / 사람 검토 필요" 안내가 포함됩니다.
