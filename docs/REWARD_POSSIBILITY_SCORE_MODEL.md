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
