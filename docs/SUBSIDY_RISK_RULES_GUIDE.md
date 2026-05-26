# 보조금 룰 5종 통합 실행 가이드 (SUBSIDY_RISK_RULES_GUIDE)

체크리스트 60 산출물. 정규화된 보조금 레코드에 **보조금 의심 신호 룰 5종**을 한 번에 실행하고,
룰 결과를 합쳐 **검토 후보 TOP 50**을 만드는 모듈의 사용·해석 가이드다.

> 본 모듈은 프로토타입(후순위 고급 모듈)이며 아직 완전 실전 버튼이 아니다. 자동 신고·자동 로그인·공식
> 양식 자동입력 기능은 없다. 결과는 모두 **사람 검토가 필요한 후보**이며 부정수급/위법 확정이 아니다.

---

## 1. 문서 목적

- 5종 룰이 **무엇을 의미하고 무엇을 의미하지 않는지** 정리한다.
- 왜 이 결과가 **부정수급 확정이 아닌지** 명확히 한다.
- 입력 형식, 실행 명령, 산출물 위치, TOP 50 해석법, 다음 단계(100점 위험점수) 연결을 안내한다.

## 2. 보조금 룰 5종 (탐지 대상)

| 코드 | 룰ID | 의미 | 의미하지 않는 것 |
| --- | --- | --- | --- |
| A | `repeat_recipient` | **반복수급** — 동일(정규화) 수급기관이 여러 회계연도/사업으로 2건 이상 반복 등장 | 정상 다년도·연속 사업이거나 동명이단체일 수 있음 — 동일 기관 확정 아님 |
| B | `same_address` | **동일주소 다단체** — 같은 주소(지역 단위 키)에 서로 다른 수급기관 2곳 이상 | 공유오피스·창업보육센터·복지관·회관 등 정상 공유 가능 — 상세주소 동일 여부는 별도 확인 |
| C | `missing_output_settlement` | **결과물·정산 증빙 누락** — 교부 기록은 있으나 정산액·결과물·결과보고가 공개자료에서 미확인 | 정산 전(진행 중)이거나 공시 시점 차이일 수 있음 — 누락이 곧 부정수급 아님 |
| D | `budget_anomaly` | **예산집행 이상치** — 교부금액이 절대 임계값 초과 또는 집합 평균+2σ 초과, 집행액>교부액 역전 | 대규모 시설·인프라 사업은 원래 금액이 큼 — 금액 크기만으로 부정수급 아님 |
| E | `similar_project_repeat` | **사업명 유사 반복** — 핵심 사업명 유사도 **≥ 0.85**인 사업이 묶임(동일 기관 반복은 가중) | 표준 명칭 공모·정형 사업은 명칭이 비슷할 수 있음 — 유사도는 동일 확정 아님 |

룰 A·B·E는 정규화 키(`normalizedRecipientName`, `addressRegionKey`, `projectNameCompactKey`)를 사용하며,
이 키는 **확정 병합이 아니라 사람 검토용 후보 키**다.

## 3. 왜 부정수급 확정이 아닌가

- 룰은 **공개·업로드 자료의 패턴 신호**만 본다. 사업 목적·집행 적정성·규정 적용 여부는 사람이 공식 자료로 확인해야 한다.
- 정규화 키는 표기 차이를 줄인 **후보 키**일 뿐 동일 기관/동일 주소를 확정하지 않는다.
- 공시 시점 차이, 다년도 연속 사업, 공유시설, 대규모 사업 등 **합리적 사유**가 있을 수 있다.
- 따라서 모든 룰 결과는 `reviewRequired: true`, `notLegalConclusion: true`를 항상 포함한다.
- 결과 문구는 "후보 / 검토 필요 / 사람 확인 필요 / 추가 확인 필요"처럼 중립적으로 작성한다.
- **부정수급 확정 / 위법 확정 / 포상금 보장 / 신고 성공 보장** 같은 표현은 쓰지 않는다.

## 4. 입력 형식

입력은 **정규화된 보조금 레코드** JSONL(한 줄 1레코드) 또는 fixture다.
사용 필드(개인정보 원문 제외):

```jsonc
{
  "recordId": "rec-0001",          // 필수 — 레코드 식별자(개인정보 아님)
  "fiscalYear": 2024,
  "projectName": "청년 창업 지원사업",
  "projectNameCompactKey": "청년창업지원",
  "recipientName": "○○협회",
  "normalizedRecipientName": "○○협회",   // 정규화 키(확정 병합 아님)
  "addressRegionKey": "서울특별시 가상구 가상동", // 상세주소(동·호수) 제외
  "subsidyAmount": 30000000,
  "executionAmount": 30000000,
  "settlementAmount": 29000000,
  "hasResultReport": true,
  "resultEvidenceUrl": "https://example.org/result/1",
  "publicListingUrl": "https://example.org/notice/1",
  "sourceFileName": "subsidy_2024.csv"
}
```

- 대표자명·전화번호·주민번호·계좌번호·**상세주소 원문**은 입력/저장하지 않는다.
- `data/upload-parser/runs/{runId}/records.jsonl`(업로드 파서 산출물)이나 수집기 산출물을 입력으로 쓸 수 있다.
- 입력 필드가 없으면 `grantAmount`, `projectTitle`, `resultEvidenceUrls` 등 별칭을 자동 매핑한다.

## 5. 실행 명령

```bash
# fixture 폴백(합성 데이터 — 실제 탐지 완료 아님)
npm run risk:rules -- --fixture 12
npm run risk:rules                # 인자 없으면 fixture 12 폴백

# 정규화된 실데이터(JSONL) 입력
npm run risk:rules -- --input data/upload-parser/runs/xxx/records.jsonl
```

- 출력 폴더는 환경변수 `RISK_RULES_OUTPUT_DIR` 또는 기본 `data/risk`.
- 입력 파일이 없거나 유효 레코드가 0건이면 **명확한 오류 메시지 후 종료**(exit 2)한다.
- 1000건 미만 입력 또는 fixture는 "실데이터 추정: 아니오"로 표기하고 **사람 검토 필요** 경고를 출력한다.

## 6. 산출물 위치

출력은 **gitignore 처리된** 경로 `data/risk/runs/{runId}/`에 4개 파일로 저장한다(커밋하지 않는다).

| 파일 | 내용 |
| --- | --- |
| `rule-results.json` | 5종 룰이 만든 전체 룰 결과(필드: ruleId, ruleName, severity, candidateId, involvedRecordIds, evidenceRefs, reason, caution, reviewRequired, notLegalConclusion, suggestedNextCheck) |
| `top50-candidates.json` | 룰 기반 정렬 보조 점수 상위 **TOP 50** 검토 후보 |
| `rule-summary.md` | 룰별 후보 수 + TOP 50 표 + 다음 단계 안내(사람이 읽는 요약) |
| `metadata.json` | runId, 실행시각, 입력모드, 레코드 수, 룰별 카운트, 안전 안내문 |

## 7. 룰 결과 구조

각 룰 결과(candidate)는 다음 필드를 갖는다.

- `ruleId` / `ruleName` — 룰 식별/표시명
- `severity` — `low|medium|high` (룰 기반 정렬 보조 등급, **위법 확정 등급 아님**)
- `candidateId` — 후보 식별자(룰ID + 그룹 키 해시)
- `involvedRecordIds` — 연루 레코드 식별자(개인정보 아님)
- `evidenceRefs` — 사람이 다시 확인할 **근거 위치 참조**(공시 URL / 결과물 URL / 출처 파일+레코드)
- `reason` — 후보로 잡힌 이유(중립 표현)
- `caution` — 오탐 가능성/주의(공유오피스·다년도 사업·공시 시점 차이 등)
- `reviewRequired: true` / `notLegalConclusion: true` — 항상 고정
- `suggestedNextCheck` — 사람이 다음에 확인할 점검 항목

## 8. TOP 50 해석

- TOP 50은 룰 결과를 **연루 레코드 묶음** 단위로 합쳐, **여러 룰에 동시에 걸린 후보를 위로** 정렬한 목록이다.
- 정렬 키 순서: ① 적중 룰 종류 수 → ② high 심각도 수 → ③ 룰 기반 점수 → ④ 근거 수.
- `ruleBasedScore`는 **룰 기반 정렬 보조 점수**이며 **100점 위험점수가 아니다.** 절대 등급/확률이 아니다.
- 상위에 있다고 해서 부정수급 가능성이 높다는 뜻이 아니라, **사람이 먼저 들여다볼 순서**를 제안하는 것뿐이다.
- 모든 TOP 후보는 `reviewRequired: true` — 검토 없이 신고/판단에 쓰면 안 된다.

## 9. 개인정보·비공개자료 제한

- 대표자명/전화번호/주민번호/계좌번호/상세주소 원문은 **근거로 저장하지 않는다**(정규화 키만 사용).
- 비공개 보조금 자료, **로그인 필요** 페이지, 무단 대량 크롤링은 범위 밖이다.
- 산출물은 전량 gitignore 처리되어 커밋되지 않는다.

## 10. 한계

- 합성 fixture 또는 소규모 입력의 결과는 **실제 부정수급 탐지 완료가 아니다.**
- 정규화 키 기반 묶기는 오탐(동명이단체·공유시설)과 누락(표기 심한 차이)이 모두 가능하다.
- 금액 이상치는 사업 규모·회계연도 이월·추경을 반영하지 못한다.

## 11. 검증 기준

- `npm run test:subsidy-risk-rules` — 5종 룰 적중, 룰 결과 필수 필드, TOP 50 정렬, 개인정보 미포함, 산출물 4종, CLI 동작.
- `npm run check:subsidy-risk-rules` — 필수 파일/섹션/키워드 존재, 단정적 금지 표현 없음.

## 12. 후속 작업 (이번 범위 밖)

이번 작업은 **'보조금 룰 5종 실행'까지만** 진행한다. 다음 단계에서 이 룰 결과(`rule-results.json`)를
입력으로 아래를 진행한다.

- **100점 위험점수 통합** — 5종 룰 신호를 가중 합산해 0~100 위험점수로 환산.
- **보상가능성 점수** — 환수·처분 가능성 등 공식 기준 기반 추정(수령 보장 아님).
- **LLM 설명형 분석** — 후보별 자연어 설명(근거검증 strict 연계).
- **신고서 초안 생성** — 사람이 검토·제출하는 초안(자동 제출 없음).

---

관련 문서: [REPEAT_SUBSIDY_RISK_RULE.md](REPEAT_SUBSIDY_RISK_RULE.md) ·
[ADDRESS_CLUSTER_RISK_RULE.md](ADDRESS_CLUSTER_RISK_RULE.md) ·
[OUTPUT_SETTLEMENT_RISK_RULE.md](OUTPUT_SETTLEMENT_RISK_RULE.md) ·
[SPENDING_ANOMALY_RISK_RULE.md](SPENDING_ANOMALY_RISK_RULE.md) ·
[RISK_SCORE_MODEL.md](RISK_SCORE_MODEL.md) · [subsidy_guide.md](subsidy_guide.md)
