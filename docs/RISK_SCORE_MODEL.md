# 100점 위험점수 모델 가이드

## 1. 문서 목적
- 여러 룰 기반 탐지 결과를 통합하여 0~100점 위험점수와 A/B/C 검토 등급을 산출하는 기준을 정의한다.
- 본 모델은 위법 여부를 판단하지 않으며, 위험 후보, 우선 검토 대상, 추가 확인 필요 후보를 정렬하기 위한 보조 도구이다.
- 공개자료 중심 분석 원칙, 개인정보 최소수집 원칙, 중립 표현 원칙을 따른다.

## 2. 통합 대상 룰
| 룰 | 입력 후보 | 주요 신호 |
|---|---|---|
| 반복 수급 탐지 | repeat risk candidate | 반복성, 동일 기관, 유사 사업명, 금액 유사성 |
| 동일 주소 다수 단체 탐지 | address cluster candidate | 주소 유사성, 다수 단체, 공유공간 가능성 |
| 결과물 부족/정산 미흡 | output settlement candidate | 결과물 부족, 정산 확인 필요, 증빙 부족 |
| 예산 집행 이상 패턴 | spending anomaly candidate | 인건비/홍보비/용역비/장비구입비 과다 또는 반복 |
| 계약업체 연관성 탐지 | contractor network candidate | 수급단체-계약업체 반복 연결 |
| 데이터 품질 기준선 | quality report | 결측률, 중복률, 출처 커버리지 |

## 3. 100점 점수 구성
| 점수 항목 | 설명 | 기본 가중치 |
|---|---|---:|
| repetitionScore | 반복 수급유사 사업 반복 신호 | 20 |
| amountScore | 금액 규모금액 유사 반복특정 항목 과다 신호 | 15 |
| growthScore | 최근 연도 증가감 또는 반복 증가 추세 | 10 |
| outputScore | 결과물 부족성과보고서결과보고서증빙 부족 신호 | 15 |
| addressScore | 동일 주소주소 지역 키다수 단체 신호 | 15 |
| settlementScore | 정산서정산액집행액반납/환수액 확인 필요 신호 | 15 |
| contractorScore | 계약업체 반복 연결계약명 유사계약금액 유사 신호 | 10 |
| evidenceScore | 원문 URL, evidenceUrl, 첨부 근거 존재 보정 | 5 |

주의:
- 총점은 가중치를 합산하되 최종 0~100 범위로 clamp한다.
- evidenceScore는 근거가 충분하다는 의미이지 위법 가능성을 의미하지 않는다.
- 점수는 검토 우선순위이며 부정수급 확정이 아니다.

## 4. 등급 기준
| 등급 | 점수 범위 | 의미 | 처리 |
|---|---:|---|---|
| A | 80~100 | 우선 검토 후보 | 사람 검토 필수 |
| B | 60~79 | 추가 확인 필요 후보 | 증거 보강 |
| C | 0~59 | 낮은 우선순위 또는 보조 검토 후보 | 저장 또는 후순위 검토 |

## 5. 점수 산출 원칙
- 각 룰의 riskScore를 그대로 합산하지 않고, 점수 항목별로 정규화한다.
- 같은 신호가 여러 룰에서 반복되면 중복 과대평가를 줄인다.
- 실제 데이터가 아닌 fixture 결과는 fixture 기반 검증으로 표시한다.
- 점수 항목별 contribution을 반드시 남긴다.
- 최종 reason은 중립 표현만 사용한다.
- riskScore가 높아도 자동 신고하지 않는다.
- 모든 후보는 reviewRequired=true이다.

## 6. 입력 데이터 구조
- 개별 룰 후보를 직접 입력받을 수 있다.
- 또는 risk report JSON들을 통합 입력으로 받을 수 있다.
- candidateId, riskScore, riskLevel, matchedSignals/missingSignals/spendingSignals/networkSignals, evidence, reason을 표준화한다.
- recordId 또는 involvedRecordIds를 기준으로 같은 레코드 관련 후보를 묶을 수 있다.

## 7. 출력 데이터 구조
결과에는 다음을 포함한다.
- scoreId
- subjectKey
- sourceCandidateIds
- finalRiskScore
- riskGrade
- scoreBreakdown
- contributingSignals
- evidenceSummary
- reason
- reviewRequired
- createdAt

reason 문구는 다음처럼 중립적으로 작성한다.
- 여러 검토 신호가 함께 확인되어 우선 검토 후보로 분류되었습니다.
- 반복성, 주소 유사성, 정산 확인 필요 신호가 함께 확인되어 추가 확인이 필요합니다.
- 공개자료 기준의 검토 후보이며 사실관계 확인이 필요합니다.

## 8. 개인정보 제한
- evidenceSummary와 reason에는 개인정보 원문을 넣지 않는다.
- 상세주소, 전화번호, 대표자명, 주민번호, 계좌번호, 개인 이메일은 사용하지 않는다.
- 식별번호는 해시 또는 마스킹된 값만 사용한다.
- AI 프롬프트에는 원문 개인정보를 넣지 않는다.

## 9. 검증 기준
- fixture 기반 룰 후보를 통합해 100점 점수를 산출한다.
- 최종 점수는 항상 0~100 범위다.
- 등급 A/B/C가 자동 산출된다.
- A등급 fixture 후보, B등급 fixture 후보, C등급 fixture 후보가 모두 생성되어야 한다.
- scoreBreakdown 합계와 finalRiskScore가 일관되어야 한다.
- 정산 이상 항목은 정산 확인 필요 신호로만 표현하며 확정 판단으로 쓰지 않는다.
- reason에 단정 표현이 없어야 한다.
- reviewRequired는 항상 true여야 한다.

## 10. 후속 작업
- 실제 실데이터 기준선에 각 룰을 적용한 뒤 통합 점수 산출
- 가중치 튜닝
- 사용자 검토 피드백 기반 점수 조정
- 대시보드에서 점수 및 근거 표시
- 증거 패키지 생성기와 연결
- 사실관계 점검표와 연결
- 신고서 초안 생성 전 승인 게이트 연결
