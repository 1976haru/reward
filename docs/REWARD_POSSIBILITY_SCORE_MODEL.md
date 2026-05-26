# 보상가능성 점수 모델 가이드

## 1. 문서 목적

- 신고 후보에 대해 환수 가능성, 공공기관 손실방지 가능성, 증거 명확성을 분리 평가하여 보상/포상 가능성 검토 우선순위를 산출하는 기준을 정의한다.
- 본 모델은 보상금 또는 포상금 지급 여부를 판단하지 않는다.
- 결과는 보상/포상 가능성 검토 후보, 추가 확인 필요, 기관 기준 확인 필요로만 표현한다.
- 공식 보상포상 기준은 국민권익위원회, 청렴포털, 해당 기관의 법령고시심사 절차를 확인해야 한다.
- 참고 공식 안내: https://www.clean.go.kr/menu.es?mid=a10304020000

## 2. 평가 대상

- 환수 가능성이 있는 신고 후보
- 공공기관 재정 손실을 방지할 가능성이 있는 신고 후보
- 원문 URL, 증빙자료, 정산자료, 결과보고서 등 증거가 명확한 신고 후보
- 반복 수급, 동일 주소, 결과물 부족, 예산 집행 이상, 계약업체 연관성 등의 위험 신호가 결합된 후보
- 단, 위험 신호가 있어도 보상포상 대상 확정이 아니다.

## 3. 점수 구성

| 점수 항목 | 설명 | 기본 가중치 |
|---|---|---:|
| recoveryPossibilityScore | 환수 가능성 검토 점수 | 35 |
| lossPreventionScore | 공공기관 손실방지 가능성 검토 점수 | 30 |
| evidenceClarityScore | 증거 명확성 점수 | 25 |
| legalFitScore | 신고 유형과 제도 적합성 검토 점수 | 10 |

주의:
- 총점은 0~100 범위로 제한한다.
- 이 점수는 지급 가능성 확정이 아니라 검토 우선순위이다.
- 보상/포상 가능성은 법령상 요건과 기관 심사에 의해 달라진다.

## 4. 환수 가능성 신호

| 신호 | 설명 | 점수 예시 | 주의사항 |
|---|---|---:|---|
| returnAmountPresent | 반납/환수액 정보 존재 | +20 | 실제 환수 확정 아님 |
| settlementIssueSignal | 정산 확인 필요 신호 존재 | +15 | 정산 자료 확인 필요 |
| highRiskScoreReference | 기존 위험점수 A 또는 고점수 후보 | +10 | 참고 신호 |
| repeatedPatternWithAmount | 반복 패턴과 금액 정보가 함께 존재 | +15 | 반복만으로 환수 가능성 단정 금지 |
| clearSubsidyAmount | 보조금액이 명확함 | +10 | 금액 단위 확인 필요 |
| missingAmountInfo | 금액 정보 부족 | 감점 | 추가 확인 필요 |

## 5. 공공기관 손실방지 가능성 신호

| 신호 | 설명 | 점수 예시 | 주의사항 |
|---|---|---:|---|
| ongoingOrRecentProject | 최근 또는 진행 중 사업 후보 | +15 | 사업기간 확인 필요 |
| repeatedRecipientPattern | 동일 기관 반복 수급 신호 | +10 | 정상 반복사업 가능성 |
| addressClusterPattern | 동일 주소 다수 단체 신호 | +10 | 공유공간 가능성 |
| contractorNetworkPattern | 계약업체 반복 연결 신호 | +10 | 장기계약 가능성 |
| largeSubsidyAmount | 보조금액 규모가 큼 | +15 | 규모만으로 판단 금지 |
| futurePaymentRisk | 향후 지급집행 가능성이 있는 후보 | +15 | 실제 지급계획 확인 필요 |

## 6. 증거 명확성 신호

| 신호 | 설명 | 점수 예시 | 주의사항 |
|---|---|---:|---|
| sourceUrlPresent | 원문 URL 존재 | +10 | 원문 확인 필요 |
| evidenceUrlPresent | 증거 URL 존재 | +15 | 접근 가능성 확인 필요 |
| attachmentPresent | 첨부파일 존재 | +10 | 개인정보 포함 여부 확인 |
| settlementDocumentPresent | 정산서 또는 정산자료 존재 | +10 | 해석 주의 |
| resultReportPresent | 결과보고서 또는 결과물 URL 존재 | +10 | 결과물 품질 판단 아님 |
| multipleIndependentSources | 서로 다른 공개 출처가 2개 이상 | +15 | 출처 신뢰도 확인 필요 |
| evidenceMissing | 증거 부족 | 감점 | 증빙 보완 필요 |

## 7. High/Medium/Low 표시 기준

| 등급 | 점수 범위 | 표시 문구 | 처리 |
|---|---:|---|---|
| High | 75~100 | 보상/포상 가능성 검토 우선순위 High | 사람 검토 필수 |
| Medium | 50~74 | 보상/포상 가능성 추가 확인 필요 Medium | 증거 보강 |
| Low | 0~49 | 보상/포상 가능성 낮은 우선순위 Low | 후순위 검토 |

주의:
- High는 지급 확정이 아니다.
- Low도 완전 제외가 아니라 자료 부족 또는 요건 미확인 상태일 수 있다.

## 8. 출력 데이터 구조

결과에는 다음을 포함한다.
- rewardScoreId
- subjectKey
- sourceCandidateIds
- rewardPossibilityScore
- rewardPossibilityLevel
- scoreBreakdown
- contributingSignals
- evidenceSummary
- reason
- disclaimers
- reviewRequired
- createdAt

reason 문구는 다음처럼 중립적으로 작성한다.
- 환수 가능성, 손실방지 가능성, 증거 명확성 신호가 함께 확인되어 보상/포상 가능성 검토 우선순위가 높습니다.
- 증거 보강 후 보상/포상 가능성 검토가 필요합니다.
- 공식 기준과 기관 심사 절차 확인이 필요합니다.

## 9. 금지 표현

아래 표현을 금지한다.
- 보상금 지급 확정
- 포상금 지급 확정
- 보상금 받을 수 있음
- 포상금 받을 수 있음
- 수령 보장
- 지급 보장
- 무조건 보상
- 신고하면 보상
- 보상 확정
- 포상 확정

## 10. 개인정보 제한

- evidenceSummary와 reason에는 개인정보 원문을 넣지 않는다.
- 상세주소, 전화번호, 대표자명, 주민번호, 계좌번호, 개인 이메일은 사용하지 않는다.
- 식별번호는 해시 또는 마스킹된 값만 사용할 수 있다.
- AI 프롬프트에는 원문 개인정보를 넣지 않는다.

## 11. 검증 기준

- fixture 기반 후보로 보상가능성 점수를 산출한다.
- 최종 점수는 항상 0~100 범위다.
- High/Medium/Low가 자동 산출된다.
- 환수 가능성, 손실방지 가능성, 증거 명확성 세부 점수가 각각 계산되어야 한다.
- High fixture 후보, Medium fixture 후보, Low fixture 후보가 모두 생성되어야 한다.
- reason에 보상포상 보장 표현이 없어야 한다.
- reviewRequired는 항상 true여야 한다.

## 12. 후속 작업

- 실제 실데이터 기준선과 실제 룰 결과에 적용
- clean.go.kr 및 관련 법령 기준 수동 검토
- 법무 검토 후 legalFitScore 보강
- 신고자 보호공직자 제한 조건과 연결
- 증거 패키지 생성기와 연결
- 사실관계 점검표와 연결
- 승인 게이트와 연결
- 대시보드에서 High/Medium/Low 표시

## 13. 보조금 룰 5종 결과 입력 (체크리스트 62)

위험점수와 **별도로**, 체크리스트 60의 보조금 룰 5종 결과(`rule-results.json`) 또는 위험점수 결과(`risk-score-report.json`)를 입력으로 받아 보상가능성(보상/포상 검토 우선순위) 점수를 산출한다.

### 13.1 점수 항목 설명
- **환수 가능성**(recovery_possibility): 결과물·정산 누락, 예산집행 이상, 반복수급 등 환수·반납으로 이어질 수 있는 신호.
- **공공기관 손실방지 가능성**(loss_prevention): 동일주소 다단체, 반복수급, 사업명 유사 반복 등 손실 확대 방지 관점 신호.
- **증거 명확성**(evidence_clarity): 공시 URL·결과물·첨부 등 근거자료의 명확성.
- **공식 신고 기준 확인 필요 여부**(legal_fit): 공식 기준·기관 심사 확인이 필요한 정도.
- **신고 전 추가확인 필요 항목**: 결과의 `nextChecks` 배열로 제공.
- **데이터 품질**: fixture 여부·근거 부족은 점수·disclaimers에 반영한다.

룰 결과의 `severity`(low/medium/high)는 0~100 보조 점수(45/65/85)로 환산해 입력한다.

### 13.2 점수가 의미하는 것 / 의미하지 않는 것
- 의미하는 것: 보상/포상 가능성 **검토 우선순위 참고 점수**(High/Medium/Low).
- 의미하지 않는 것: **포상금 지급 보장이 아니다**(`rewardGuaranteed=false`). 지급 여부는 법령·기관 심사·신고자 요건 등에 따라 달라진다.

### 13.3 위험점수와 보상가능성 점수의 차이
- 위험점수: 의심 신호가 얼마나 모였는가(검토 우선순위).
- 보상가능성 점수: 환수·손실방지·증거 관점의 별도 축이며 지급 보장이 아니다.
- 두 점수는 별개이며, High여도 지급이 확정되지 않는다.

### 13.4 High가 확정 판단이 아닌 이유
High도 **지급 확정이 아니라 검토 우선순위**일 뿐이다. 공식 기준과 기관 심사 절차 확인이 반드시 필요하다.

### 13.5 입력 파일 형식
- `data/risk/runs/{runId}/rule-results.json`(룰 5종), 또는 `data/risk/score/runs/{runId}/risk-score-report.json`(위험점수 결과).

### 13.6 실행 명령
```bash
npm run reward:score -- --fixture 1000                                       # fixture 검증
npm run reward:score -- --input data/risk/score/runs/<runId>/risk-score-report.json
npm run test:reward-score
npm run check:reward-score
```

### 13.7 출력 파일 위치 (gitignore)
`data/reward/score/runs/{runId}/`(CLI) 또는 `data/reward-score/runs/{runId}/`(API)
- `reward-possibility-score-report.json` — candidateId / rewardPossibilityScore / rewardPossibilityLevel / scoreBreakdown / contributingSignals / evidenceSummary / reason / nextChecks / disclaimers / rewardGuaranteed=false / reviewRequired / notLegalConclusion 포함
- `reward-score-summary.md` — 사람이 읽는 요약
- `metadata.json` — runId·레벨 요약·rewardGuaranteed=false·안내문

### 13.8 다음 단계: LLM 설명형 분석 연결
위험점수·보상가능성 점수 결과를 입력으로 **LLM 설명형 분석 → 근거검증 strict → 신고 전 사실점검 → 신고서 초안**을 다음 단계에서 진행한다(이번 범위 밖). 자동 신고·자동 제출 기능은 사용하지 않는다.

### 13.9 API
- `POST /api/subsidy/reward-score/run` — 합성 데모(룰 5종)로 보상가능성 점수 실행, TOP N 반환.
- `GET /api/subsidy/reward-score/latest` — 최근 실행 결과.
- 응답에는 `rewardGuaranteed=false`와 "부정수급으로 단정하지 않음 / 포상금 지급 보장하지 않음 / 사람 검토 필요" 안내 문구가 포함된다. 외부 호출·자동 신고를 하지 않는다.
