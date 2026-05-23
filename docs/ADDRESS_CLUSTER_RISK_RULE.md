# 동일 주소 다수 단체 탐지 룰 가이드 (체크리스트 18)

## 1. 문서 목적

- 보조사업 데이터에서 같은 주소 또는 같은 지역 주소 키에 여러 단체가 반복 등장하는 검토 후보를 찾기 위한 룰을 정의한다.
- 본 룰은 위법 여부를 판단하지 않으며, **"동일 주소 다수 단체 후보"**와 **"추가 확인 필요 후보"**를 만드는 보조 도구이다.
- 공개자료 중심 분석 원칙, 개인정보 최소수집 원칙, 중립 표현 원칙을 따른다.

관련 코드:

- 룰 모듈: [`src/rules/addressClusterRiskRule.ts`](../src/rules/addressClusterRiskRule.ts)
- 표준 타입: [`src/types/addressClusterRisk.ts`](../src/types/addressClusterRisk.ts)
- CLI: [`scripts/run-address-cluster-risk-rule.ts`](../scripts/run-address-cluster-risk-rule.ts)
- 테스트: [`tests/addressClusterRiskRule.test.ts`](../tests/addressClusterRiskRule.test.ts)
- 정책 검사: [`scripts/check-address-cluster-risk-policy.js`](../scripts/check-address-cluster-risk-policy.js)

## 2. 탐지 대상

- 동일 normalizedAddressKey에서 여러 normalizedRecipientName이 등장하는 사례
- 동일 addressRegionKey에서 여러 단체가 반복 수급한 사례
- 같은 주소 후보에서 유사 사업명이 반복되는 사례
- 같은 주소 후보에서 여러 연도에 보조사업이 반복되는 사례
- 같은 주소 후보에서 보조금액이 반복적으로 유사한 사례
- 단, 이 모든 결과는 검토 후보이며 부정수급 판단이 아니다.

## 3. 사용 신호

| 신호 | 설명 | 점수 예시 | 주의사항 |
|---|---|---:|---|
| normalizedAddressKey 그룹 | 상세주소를 제외한 정규화 주소 키가 같음 | +30 | 공유오피스·공공시설 가능성 |
| addressRegionKey 그룹 | 시도·시군구·읍면동·도로명/지번 수준 키가 같음 | +15 | 단독 기준 사용 금지 |
| distinctRecipientCount | 같은 주소 후보 내 서로 다른 단체 수 | 단체 수에 따라 +10~25 | 단체명 정규화 품질 확인 필요 |
| repeatedYearCount | 여러 회계연도에 반복 등장 | +10 | 정상 반복사업 가능성 |
| similarProjectCount | 유사 사업명 후보가 여러 건 존재 | +15 | 사업 분야 유사 가능성 |
| totalSubsidyAmount | 같은 주소 후보의 총 보조금액 | 금액 구간별 +5~15 | 금액 단위 확인 필요 |
| evidenceCoverage | 원문 URL 또는 evidenceUrl 존재 비율 | +5 | 사실관계 점검 필요 |
| publicFacilityHint | 복지관, 회관, 센터, 공공시설 등 키워드 | 감점 또는 caution | 합리적 사유 가능성 |

## 4. 점수 기준

| riskScore | 등급 | 의미 | 처리 |
|---:|---|---|---|
| 80~100 | high | 동일 주소 다수 단체 검토 우선순위 높음 | 사람 검토 필요 |
| 60~79 | medium | 추가 확인 필요 | 증거 보강 |
| 40~59 | low | 약한 주소 반복 패턴 후보 | 보조 검토 |
| 0~39 | minimal | 후보 제외 또는 낮은 우선순위 | 저장 선택 |

## 5. 후보표 산출 기준

- normalizedAddressKey 또는 addressRegionKey로 그룹화한다.
- 그룹 내 서로 다른 normalizedRecipientName 개수를 계산한다.
- 서로 다른 단체가 2개 이상이면 후보로 볼 수 있다.
- 기본 후보 산출은 riskScore 내림차순으로 정렬한다.
- 최대 TOP 50을 반환한다.
- 결과는 "동일 주소 다수 단체 후보표" 또는 "동일 주소 다수 단체 TOP 50"으로 표현하며 확정 판단이 아니다.

## 6. 증거와 사유 구성

결과에는 다음을 포함한다.

- candidateId
- addressGroupKey
- addressKeyType
- involvedRecordIds
- distinctRecipientCount
- fiscalYears
- totalSubsidyAmount
- riskScore
- riskLevel
- matchedSignals
- evidence
- reason
- cautionNotes
- reviewRequired
- createdAt

reason 문구는 다음처럼 중립적으로 작성한다.

- "동일 주소 후보에서 여러 단체가 확인되어 추가 검토가 필요합니다."
- "동일 지역 주소 키에서 여러 보조사업 레코드가 확인되어 사실관계 확인이 필요합니다."
- "공유오피스·복지관·회관·공공시설 등 합리적 사유 가능성을 함께 검토해야 합니다."

## 7. 개인정보 제한

- 상세주소 원문은 groupKey와 report에 넣지 않는다.
- 대표자명과 전화번호는 단독 기준으로 사용하지 않는다.
- 원문 전화번호, 주민번호, 계좌번호, 개인 이메일은 저장하지 않는다.
- evidence와 reason에 개인정보 원문을 넣지 않는다.
- AI 프롬프트에는 원문 개인정보를 넣지 않는다.
- addressRegionKey처럼 개인정보 위험이 낮은 축약 키를 우선 사용한다.

## 8. 합리적 사유 가능성

- 같은 주소에 여러 단체가 있어도 공유오피스일 수 있다.
- 복지관, 회관, 주민센터, 행정복지센터, 공공시설, 창업센터, 협동조합 공간일 수 있다.
- 같은 시설을 여러 단체가 사용하는 경우 정상일 수 있다.
- 따라서 후보는 반드시 사람 검토와 원문 확인이 필요하다.

## 9. 검증 기준

- fixture 데이터 1,000건 이상에서 동일 주소 다수 단체 후보를 산출한다.
- 의도적으로 심은 동일 주소 다수 단체 그룹이 high 또는 medium으로 탐지되어야 한다.
- 공유오피스/공공시설 힌트가 있으면 cautionNotes에 반영되어야 한다.
- 무관한 주소 그룹은 낮은 점수 또는 후보 제외되어야 한다.
- reason에 단정 표현이 없어야 한다.
- reviewRequired는 항상 true여야 한다.

## 10. 후속 작업

- 실제 실데이터 1,000건 기준선에 적용
- 공유오피스·복지관·공공시설 사전 보강
- 주소 그룹 후보 검토 UI 연결
- 증거 패키지 생성기와 연결
- 사실관계 점검표와 연결
- 리스크 스코어 가중치 튜닝
- 반복 수급 탐지 룰과 통합 리포트 생성
- 신고서 초안 생성 전 승인 게이트 연결

---

본 가이드는 동일 주소 다수 단체 검토 후보를 찾기 위한 보조 기준이며, 위법 여부를 판단하지 않는다. 동일 주소/위장 단체/부정수급을 확정하지 않으며, 모든 후보는 사람 검토 대상이다. 같은 주소에 여러 단체가 있어도 공유오피스·복지관·회관·공공시설 등 합리적 사유가 있을 수 있다. 대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않고, 상세주소·개인정보 원문은 저장·노출하지 않는다.
