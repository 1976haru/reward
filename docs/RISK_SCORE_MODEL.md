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

## 11. 보조금 룰 5종 결과 입력 (체크리스트 61)

체크리스트 60의 **보조금 룰 5종 결과**(`rule-results.json`)를 그대로 입력으로 받아 0~100 위험점수를 산출한다.

### 11.1 점수 항목 설명
- **반복성**: 반복수급 룰(`repeat_recipient`) → repetitionScore.
- **금액 규모**: 예산집행 이상치 룰(`budget_anomaly`) → amountScore.
- **동일주소/동일기관 신호**: 동일주소 룰(`same_address`) → addressScore.
- **사업명 유사도**: 사업명 유사 반복 룰(`similar_project_repeat`) → repetitionScore에 반영하고 `similar_project_name` 신호를 contributingSignals에 남긴다.
- **결과물/정산 근거 부족**: 결과물·정산 누락 룰(`missing_output_settlement`) → outputScore + settlementScore.
- **예산집행 이상 신호**: budget_anomaly → amountScore + settlement 검토.
- **근거자료 존재 여부**: evidenceRefs 유무 → evidenceScore.
- **데이터 품질 경고**: fixture 여부·근거 부족 등은 `cautionNotes`에 중립 문구로 남긴다.

룰 결과의 `severity`(low/medium/high)는 0~100 보조 점수(45/65/85)로 환산해 입력한다.

### 11.2 점수가 의미하는 것 / 의미하지 않는 것
- 의미하는 것: 여러 룰 신호를 합산한 **우선 검토 후보 정렬용 참고 점수**다.
- 의미하지 않는 것: 부정수급/위법 확정이 아니며, 점수가 높다고 위반이 확정되는 것이 아니다.

### 11.3 위험점수와 보상가능성 점수의 차이
- **위험점수(본 문서)**: "의심 신호가 얼마나 모였는가"를 본다 → 어떤 후보부터 검토할지 우선순위.
- **보상가능성 점수([REWARD_POSSIBILITY_SCORE_MODEL.md](REWARD_POSSIBILITY_SCORE_MODEL.md))**: "환수·손실방지·증거 명확성" 관점의 별도 점수이며 **포상금 지급 보장이 아니다.**
- 둘은 별개 축이며, 위험점수가 높아도 보상가능성이 낮을 수 있고 그 반대도 가능하다.

### 11.4 A등급/High가 확정 판단이 아닌 이유
A등급도 **법 위반 확정이 아니라 사람 검토 우선순위**일 뿐이다. 공유시설·다년도 사업·공시 시점 차이 등 합리적 사유가 있을 수 있어, 반드시 사람이 사실관계를 확인해야 한다.

### 11.5 입력 파일 형식
- 체크리스트 60 `data/risk/runs/{runId}/rule-results.json`(`{ ruleResults: [...] }`), 또는 개별 룰 리포트 JSON.
- 각 항목 필드: `ruleId`, `severity`, `involvedRecordIds`, `evidenceRefs`, `reason` 등.

### 11.6 실행 명령
```bash
npm run risk:score -- --fixture 1000                                  # fixture 검증
npm run risk:score -- --input data/risk/runs/<runId>/rule-results.json # 룰 5종 결과 입력
npm run test:risk-score
npm run check:risk-score
```

### 11.7 출력 파일 위치 (gitignore)
`data/risk/score/runs/{runId}/`
- `risk-score-report.json` — 전체 결과(candidateId / finalRiskScore / riskGrade / scoreBreakdown / contributingSignals / evidenceSummary / reason / cautionNotes / reviewRequired / notLegalConclusion 포함)
- `risk-score-summary.md` — 사람이 읽는 요약(TOP 50)
- `metadata.json` — runId·등급 요약·안내문

### 11.8 다음 단계: LLM 설명형 분석 연결
본 위험점수 결과(`risk-score-report.json`)와 보상가능성 점수를 입력으로 **LLM 설명형 분석 → 근거검증 strict → 신고 전 사실점검 → 신고서 초안**을 다음 단계에서 진행한다(이번 범위 밖). 자동 신고·자동 제출 기능은 사용하지 않는다.

### 11.9 API
- `POST /api/subsidy/risk/score/run` — 합성 데모(룰 5종)로 위험점수 실행, TOP N 반환.
- `GET /api/subsidy/risk/score/latest` — 최근 실행 결과.
- 응답에는 "부정수급으로 단정하지 않음 / 포상금 지급 보장하지 않음 / 사람 검토 필요" 안내 문구가 포함된다. 외부 호출·자동 신고를 하지 않는다.
