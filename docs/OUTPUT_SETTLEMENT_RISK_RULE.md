# 결과물 부족·정산 확인 필요 탐지 룰 가이드 (체크리스트 19)

## 1. 문서 목적

- 보조사업 데이터에서 성과보고서, 정산서, 결과보고서, 결과물 URL, 증빙 URL, 첨부파일 등 공개 근거가 부족한 검토 후보를 찾기 위한 룰을 정의한다.
- 본 룰은 위법 여부를 판단하지 않으며, **"결과물 누락 후보"**, **"정산 확인 필요 후보"**, **"증빙 보완 필요 후보"**를 만드는 보조 도구이다.
- 공개자료 중심 분석 원칙, 개인정보 최소수집 원칙, 중립 표현 원칙을 따른다.

관련 코드:

- 룰 모듈: [`src/rules/outputSettlementRiskRule.ts`](../src/rules/outputSettlementRiskRule.ts)
- 표준 타입: [`src/types/outputSettlementRisk.ts`](../src/types/outputSettlementRisk.ts)
- CLI: [`scripts/run-output-settlement-risk-rule.ts`](../scripts/run-output-settlement-risk-rule.ts)
- 테스트: [`tests/outputSettlementRiskRule.test.ts`](../tests/outputSettlementRiskRule.test.ts)
- 정책 검사: [`scripts/check-output-settlement-risk-policy.js`](../scripts/check-output-settlement-risk-policy.js)

## 2. 탐지 대상

- 성과보고서 URL 또는 첨부파일이 없는 보조사업 레코드
- 정산서 또는 정산 결과 자료가 없는 보조사업 레코드
- 결과보고서 또는 결과물 URL이 없는 보조사업 레코드
- evidenceUrl/sourceUrl이 없거나 원문 근거가 부족한 레코드
- 집행액·정산액·반납액·환수액 정보가 비어 있는 레코드
- 사업 종료 후 일정 기간이 지났는데 결과·정산 자료가 공개자료에서 확인되지 않는 레코드
- 단, 공개자료에 없다는 것은 "확인 필요"일 뿐 실제 미제출 확정이 아니다.

## 3. 사용 신호

| 신호 | 설명 | 점수 예시 | 주의사항 |
|---|---|---:|---|
| missingPerformanceReport | 성과보고서 또는 성과자료 URL/첨부파일 없음 | +20 | 공개자료 기준 확인 필요 |
| missingSettlementDocument | 정산서 또는 정산 결과 자료 없음 | +25 | 실제 제출 여부 단정 금지 |
| missingResultReport | 결과보고서 또는 결과물 URL 없음 | +20 | 공개자료 누락 가능성 |
| missingEvidenceUrl | evidenceUrl/sourceUrl 없음 | +15 | 사실관계 점검 필요 |
| missingAttachment | 첨부파일 메타데이터 없음 | +10 | 게시판 구조 차이 가능성 |
| missingSettlementAmount | settlementAmount 없음 | +10 | 자료 유형에 따라 정상일 수 있음 |
| missingExecutionAmount | executionAmount 없음 | +5 | 보조자료 필요 |
| missingReturnAmountAfterIssue | 환수/반납 관련 문맥은 있으나 금액 없음 | +10 | 단정 금지 |
| projectEndedLongAgo | 사업 종료 후 일정 기간 경과 | +10 | 기준일 필요 |
| publicSourceConfirmed | 공개자료 원문이 확인됨 | -5 | 근거 신뢰도 보조 |

## 4. 점수 기준

| riskScore | 등급 | 의미 | 처리 |
|---:|---|---|---|
| 80~100 | high | 결과물·정산 확인 우선순위 높음 | 사람 검토 필요 |
| 60~79 | medium | 추가 확인 필요 | 증거 보강 |
| 40~59 | low | 약한 누락 후보 | 보조 검토 |
| 0~39 | minimal | 후보 제외 또는 낮은 우선순위 | 저장 선택 |

## 5. 후보 산출 기준

- 레코드별 누락 신호를 평가한다.
- riskScore 내림차순으로 정렬한다.
- 기본 TOP 50 후보를 반환한다.
- 동일 사업·동일 기관·동일 출처가 중복되면 groupKey로 묶을 수 있다.
- 결과는 "결과물 누락 후보", "정산 확인 필요 후보", "증빙 보완 필요 후보"로 표현하며 확정 판단이 아니다.

## 6. 증거와 사유 구성

결과에는 다음을 포함한다.

- candidateId
- recordId
- groupKey
- riskScore
- riskLevel
- missingSignals
- evidence
- reason
- reviewRequired
- createdAt

reason 문구는 다음처럼 중립적으로 작성한다.

- "공개자료 기준으로 정산 관련 근거가 확인되지 않아 추가 확인이 필요합니다."
- "결과보고서 또는 결과물 URL이 확인되지 않아 증빙 보완 여부 확인이 필요합니다."
- "원문 URL 또는 첨부파일 정보가 부족하여 사실관계 점검이 필요합니다."

## 7. 개인정보·비공개자료 제한

- 로그인 필요 자료, 비공개 자료, 내부자료는 탐지 근거로 사용하지 않는다.
- 개인정보가 포함된 첨부파일은 저장하지 않거나 마스킹 후 제한적으로 처리한다.
- 주민번호, 계좌번호, 개인 연락처, 이메일, 상세주소는 저장하지 않는다.
- evidence와 reason에 개인정보 원문을 넣지 않는다.
- AI 프롬프트에는 원문 개인정보를 넣지 않는다.

## 8. 한계

- 공개자료에 없다고 해서 실제 결과물이나 정산서가 제출되지 않았다고 단정할 수 없다.
- 일부 지자체는 결과보고서나 정산서를 별도 공개하지 않을 수 있다.
- 정산 정보는 내부 시스템에만 존재할 수 있다.
- 사업 유형에 따라 결과물 URL이 없는 것이 정상일 수 있다.
- 룰 결과는 사람 검토와 원문 확인이 필요하다.

## 9. 검증 기준

- fixture 데이터 1,000건 이상에서 결과물 부족/정산 확인 필요 후보를 산출한다.
- 의도적으로 심은 결과물·정산 누락 그룹이 high 또는 medium으로 탐지되어야 한다.
- 원문과 증빙이 충분한 레코드는 낮은 점수 또는 후보 제외되어야 한다.
- reason에 단정 표현이 없어야 한다.
- reviewRequired는 항상 true여야 한다.

## 10. 후속 작업

- 실제 실데이터 1,000건 기준선에 적용
- 업로드 parser에서 첨부파일/URL 메타데이터 추출 강화
- API collector에서 resultUrl, settlementUrl, attachmentUrls 필드 매핑
- 증거 패키지 생성기와 연결
- 사실관계 점검표와 연결
- 사람 검토 UI에서 누락 신호 표시
- 리스크 스코어 가중치 튜닝

---

본 가이드는 결과물 부족·정산 확인 필요 검토 후보를 찾기 위한 보조 기준이며, 위법 여부를 판단하지 않는다. 공개자료에 없다는 것은 확인 필요일 뿐 실제 미제출 확정이 아니다. 정산 미이행/결과물 미제출/부정수급을 확정하지 않으며, 모든 후보는 사람 검토 대상이다. 로그인 필요 자료·비공개자료·내부자료는 탐지 근거로 사용하지 않고, 개인정보 원문은 저장·노출하지 않는다.
