# LLM 설명형 분석 가이드

## 1. 문서 목적

- 위험점수, 보상가능성 점수, 룰 기반 탐지 결과를 바탕으로 사람이 이해할 수 있는 설명형 분석을 생성하는 기준을 정의한다.
- 본 모듈은 위법 여부를 판단하지 않으며, 의심 신호 설명, 검토 후보 요약, 추가 확인사항을 정리하는 보조 도구이다.
- 설명에는 왜 검토 후보인지, 어떤 근거가 있는지, 추가 확인사항은 무엇인지가 포함되어야 한다.
- 공개자료 중심 분석 원칙, 개인정보 최소수집 원칙, 중립 표현 원칙을 따른다.

## 2. 입력 대상

- 100점 위험점수 결과
- 보상가능성 점수 결과
- 반복 수급 탐지 결과
- 동일 주소 다수 단체 탐지 결과
- 결과물 부족/정산 미흡 탐지 결과
- 예산 집행 이상 패턴 탐지 결과
- 계약업체 연관성 탐지 결과
- 데이터 품질 리포트
- 단, 개인정보민감정보비공개자료는 입력에서 제외하거나 마스킹한다.

## 3. 출력 구성

| 출력 항목 | 설명 | 필수 여부 |
|---|---|---|
| summary | 전체 요약 | 필수 |
| whyFlagged | 왜 검토 후보로 분류되었는지 | 필수 |
| keyEvidence | 어떤 공개자료 근거가 있는지 | 필수 |
| riskSignals | 사용된 위험 신호 | 필수 |
| rewardPossibilityNote | 보상/포상 가능성 검토 참고 | 선택 |
| additionalChecks | 추가 확인사항 | 필수 |
| limitations | 한계와 주의사항 | 필수 |
| humanReviewRequired | 사람 검토 필요 여부 | 필수 |
| safetyDisclaimers | 법률 자문기관 판단 비대체 문구 | 필수 |

## 4. 설명 원칙

- 확정이 아니라 후보, 신호, 검토 필요로 표현한다.
- 공개자료 기준으로 확인된 내용만 설명한다.
- 없는 자료는 공개자료에서 확인되지 않음으로 표현한다.
- 제출하지 않았다, 위법이다, 허위다처럼 단정하지 않는다.
- 보상금이나 포상금 수령을 보장하지 않는다.
- AI 설명은 법률 자문, 수사 판단, 기관 심사 판단을 대체하지 않는다.

## 5. 금지 표현

아래 표현을 금지한다.
- 부정수급 확정
- 불법 확정
- 사기 확정
- 횡령 확정
- 담합 확정
- 유착 확정
- 환수 대상 확정
- 신고 확정
- 보상금 지급 확정
- 포상금 지급 확정
- 보상금 받을 수 있음
- 무조건 신고
- 반드시 신고 표현 금지

## 6. 권장 표현

- 의심 신호
- 검토 후보
- 추가 확인 필요
- 공개자료 기준
- 사실관계 확인 필요
- 정산 자료 확인 필요
- 증빙 보완 여부 확인 필요
- 사람 검토 필요
- 기관 기준 확인 필요
- 보상/포상 가능성 검토

## 7. 프롬프트 안전 기준

- LLM 프롬프트에는 주민번호, 계좌번호, 전화번호, 이메일, 상세주소, 대표자명 등 개인정보 원문을 넣지 않는다.
- 프롬프트 입력 전 sanitizeForAI 또는 sanitizeForStorage를 통과한다.
- LLM 응답 후 금지 표현 검사를 수행한다.
- 금지 표현이 있으면 fallback 문구로 대체하거나 오류로 처리한다.
- LLM API 키는 코드에 하드코딩하지 않는다.
- 이번 단계에서는 실제 LLM 호출을 하지 않고 fallback 분석기로 검증한다.

## 8. fallback 분석기 기준

- LLM 호출 없이 동일 입력이면 동일 출력이 나와야 한다.
- riskScore, rewardPossibilityScore, 주요 룰 신호를 기반으로 설명을 조합한다.
- reason은 중립 템플릿으로 생성한다.
- additionalChecks에는 원문 확인, 정산서 확인, 결과보고서 확인, 증빙 URL 확인, 계약자료, 기관 기준, 공식 신고 기준 확인을 포함한다.
- safetyDisclaimers에는 법률 자문기관 판단 비대체 문구를 포함한다.

## 9. 리포트 생성 기준

- LLM 분석 요약 리포트는 JSON과 Markdown으로 생성한다.
- 제목은 LLM 설명형 분석 요약으로 한다.
- 각 후보별 summary, whyFlagged, keyEvidence, additionalChecks를 표시한다.
- 단정 표현과 개인정보 원문은 포함하지 않는다.
- fixture 기반이면 fixture 기반 검증이라고 명시한다.

## 10. 검증 기준

- fixture 기반 후보로 설명형 분석을 생성한다.
- whyFlagged, keyEvidence, additionalChecks가 모두 생성되어야 한다.
- 금지 표현이 없어야 한다.
- 개인정보 원문이 없어야 한다.
- fallback 분석기는 deterministic해야 한다.
- JSON 리포트와 Markdown 리포트가 생성되어야 한다.
- reviewRequired는 항상 true여야 한다.

## 11. 후속 작업

- 실제 LLM API 연동
- 프롬프트 버전 관리
- LLM 응답 품질 평가
- 사람 검토 피드백 반영
- 증거 패키지 생성기와 연결
- 사실관계 점검표와 연결
- 신고서 초안 생성 전 승인 게이트 연결
- 대시보드에서 설명형 분석 표시

## 12. 위험점수·보상가능성·룰 5종 입력 (체크리스트 63)

### 12.1 설명형 분석이 하는 일
- 위험점수(체크리스트 61), 보상가능성 점수(체크리스트 62), 룰 5종 결과(체크리스트 60 `rule-results.json`)를 입력으로 받아, "왜 검토 후보인지 / 어떤 공개자료 근거가 있는지 / 추가로 무엇을 확인해야 하는지"를 사람이 읽기 쉬운 한국어로 분리해 보여줍니다.
- 결과 항목: `candidateId`, `summary`, `whyFlagged`, `keyEvidence`, `riskSignals`, `rewardPossibilityNote`, `additionalChecks`, `limitations`, `safetyDisclaimers`, `reviewRequired:true`, `notLegalConclusion:true`, `rewardGuaranteed:false`.

### 12.2 설명형 분석이 하지 않는 일
- 부정수급/위법을 확정하지 않습니다. 공개자료 기반 **검토 보조 의견**일 뿐입니다.
- 포상금 지급을 보장하지 않으며(`rewardGuaranteed:false`), 자동 신고·자동 제출을 하지 않습니다.
- 대표자명·전화번호·주민번호·계좌번호·상세주소 원문은 설명에 넣지 않습니다(마스킹/제외).

### 12.3 deterministic fallback과 실제 LLM 호출의 차이
- **deterministic fallback(기본값)**: 입력 점수·신호를 규칙 기반 템플릿으로 정리합니다. 같은 입력이면 항상 같은 결과이고, 외부 API·키가 필요 없습니다.
- **실제 LLM 호출(미사용)**: OpenAI 등 외부 모델을 호출하는 방식. 본 단계에서는 사용하지 않습니다.

### 12.4 기본 검증에서 실제 LLM을 호출하지 않는 이유
- 검증 재현성(같은 입력→같은 출력), 비용·키 노출 방지, 개인정보의 외부 전송 차단, 환각 위험 축소를 위해 기본 검증은 deterministic fallback만 사용합니다. metadata.json에 `llmApiCalled:false`, `deterministicFallbackOnly:true`로 표시됩니다.

### 12.5 입력 형식 / 실행 명령 / 출력 위치
```bash
npm run analysis:llm-explain -- --fixture 100                                  # fixture 검증(LLM 미호출)
npm run analysis:llm-explain -- --input data/risk/score/runs/<id>/risk-score-report.json
npm run analysis:llm-explain -- --input data/risk/runs/<id>/rule-results.json   # 룰 5종 결과 입력
npm run test:llm-explanation
npm run check:llm-explanation
```
출력(gitignore): `data/analysis/llm-explanation/runs/{runId}/` 에 `llm-explanation-report.json` · `llm-explanation-summary.md` · `metadata.json`.

### 12.6 개인정보 원문을 근거/설명에 넣지 않는 이유
개인정보가 분석 결과·로그·산출물에 남으면 유출·오남용 위험이 있습니다. 따라서 정규화 키·공개 URL·recordId만 사용하고 원문은 마스킹/제외합니다.

### 12.7 다음 단계: 신고 전 사실점검 11항목 연결
설명형 분석 결과와 근거검증(strict) 통과 결과를 입력으로 **신고 전 사실점검 11항목 → 보조금 신고서 초안**을 다음 단계에서 진행합니다(이번 범위 밖). 자동 신고·자동 제출은 없습니다.

### 12.8 API
- `POST /api/subsidy/analysis/explain/run`(합성 데모, deterministic), `GET /api/subsidy/analysis/explain/latest`.
- 응답에 `deterministicFallbackOnly:true` / `llmApiCalled:false` / `notLegalConclusion:true` / `rewardGuaranteed:false` 와 "부정수급으로 단정하지 않음 / 포상금 지급 보장하지 않음 / 사람 검토 필요" 안내가 포함됩니다.

근거검증 연계는 [CITATION_VALIDATION_GUIDE.md](CITATION_VALIDATION_GUIDE.md)를 참고하세요.
