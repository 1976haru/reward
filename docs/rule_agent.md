# Rule Agent

## 1. Purpose

건강기능식품 온라인 허위·과대광고 의심 문구를 탐지한다.
탐지 결과는 **검토가 필요한 후보**이며, **법 위반 여부를 확정하지 않는다**. 최종 판단은 사람이 한다.

## 2. Rule Sources

| 파일 | 역할 |
|---|---|
| [`src/modules/false-ad/keywords.json`](../src/modules/false-ad/keywords.json) | 50개 키워드 룰 + 4개 combo/regex 룰 + diseaseTerms / actionTerms / exaggerationTerms / productTerms |
| [`src/modules/false-ad/keywordLoader.ts`](../src/modules/false-ad/keywordLoader.ts) | JSON 로더 (sync/async), 스키마 검증, 정규식 사전 컴파일 검증 |
| [`src/agents/RuleAgent.ts`](../src/agents/RuleAgent.ts) | 룰 적용, 점수 계산, 하이라이트 |

룰 구성:

- **HIGH (20)**: 질병 치료/완치/예방, 의약품 영역 단정 표현
- **MEDIUM (20)**: 의약품 대체, 과장 효능, 해독·체중 감량 단정
- **LOW (10)**: 마케팅성 모호 표현 (활력 개선/피로 회복/체질 개선 등)
- **COMBO/REGEX (4)**:
  - `C001`: 질병 + (치료/완치/예방/억제/제거) 같은 문장 내 동시 등장 (HIGH +25)
  - `C002`: (치료/완치/예방/억제/제거) + 질병 역순 동시 등장 (HIGH +25)
  - `C003`: 약 대신 / 혈압약 대체 / 병원 갈 필요 없 (HIGH +25)
  - `C004`: 하루 만에 / 기적의 효과 / 먹기만 하면 (MEDIUM +12)

## 3. Risk Levels

| 등급 | 가중치 | 의미 |
|---|---|---|
| HIGH | 25 | 질병 치료·예방 단정 / 의약품 오인 가능성 |
| MEDIUM | 12 | 의약품 대체·과장 효능 단정 |
| LOW | 5 | 마케팅성 모호 표현 (맥락 검토 필요) |
| 조합 보너스 | +25 / +15 / +10 | disease+treatment / product+disease / 반복 등장 |

키워드 매칭만으로 위반을 단정하지 않는다 — 문맥과 사람 검토가 필수.

## 4. Scoring Policy

```
raw = Σ(matched rule weight)              # High +25 / Medium +12 / Low +5
   + 10 × (반복 매칭된 룰 수)              # 동일 문구(룰) 2회 이상 → +10
   + 15 × (상품(군) 표현 + 질병명 동시 등장)  # productAndDiseaseCombo (체크리스트 15)
   # 치료/완치/예방 표현 + 질병명 동시 등장(+25)은 combo 룰 C001/C002 가중치로 이미 가산
riskScore = clamp(raw, 0, 100)
```

이 정책은 [`mvp_scope.md` §8 Risk Scoring Policy](../mvp_scope.md)와 일치한다.
(High +25 / Medium +12 / Low +5 / 반복 +10 / 상품명+질병명 +15 / 치료표현+질병명 +25 / 상한 100)

`detectDetailed()` 결과에 다음을 함께 노출한다(체크리스트 14~15):
- `repeatedPhrases`: 2회 이상 반복된 (keyword, ruleId, count)
- `cooccurrence`: `{ productAndDisease, treatmentAndDisease }` 동시 등장 여부

> 참고 — 두 가지 점수의 구분
> - **RuleAgent `riskScore`(위험도)**: 위 mvp_scope 위험도 정책. 등급 낮음/검토 필요/높음/매우 높음.
> - **ScoringAgent `priorityScore`(우선순위, `POST /api/score`)**: rule/llm/evidence/commercial/repetition/extraction 6개 구성요소 합(0~100)으로
>   "사람이 먼저 검토할 후보"를 정렬하는 별도 점수. 등급 낮음/검토 필요/우선 검토/최우선 검토.
>   `POST /api/score` 는 `text` 만 받으면 RuleAgent 탐지를 먼저 실행하고 `explanation`(위험도 요소 설명)을 함께 반환한다.

등급 변환 (RuleAgent riskScore):

| score | 등급 |
|---|---|
| 80~100 | 매우 높음 |
| 60~79 | 높음 |
| 30~59 | 검토 필요 |
| 0~29 | 낮음 |

## 5. Detection Flow

```
입력 (DetectInput)
  ├ claimCandidates → 우선 분석
  ├ reviewCandidates → 후순위
  ├ mainText → 폴백
  └ text → 위 3개가 없을 때 최후 폴백

각 섹션 → splitSentences → 문장별로:
  ├ keyword 룰 (sentence.includes)
  └ regex/combo 룰 (precompiled RegExp)

ruleId + sentence 단위로 dedupe → matches
matches 합산 + 반복 보너스 → riskScore (0~100)
matches 문장 단위로 묶기 → highlightedSegments
```

OrchestratorAgent는 `TextExtractor` 결과의 `claimCandidates / reviewCandidates / mainText`를 RuleAgent에 넘긴다 — 광고 문구가 우선 분석된다.

## 6. Highlight Policy

- `matches`: 룰 매치 카드 (keyword/riskLevel/sentence/reason/category/sourceSection)
- `highlightedSegments`: 동일 문장에 매치된 키워드 묶음 (최고 위험도로 표시)
- 응답에 `safetyNotice` 명시: **"이 결과는 법 위반 확정이 아니라 신고 후보 검토용입니다."**
- 코드/UI/문서 어디에도 "불법 확정", "위반 확정", "포상금 지급 확정" 같은 표현은 사용하지 않는다.

UI 측은 모든 사용자 텍스트를 `textContent` 또는 `escapeHtml`을 거쳐 렌더링한다 (XSS 방지).

## 7. API

### GET `/api/rules/:moduleId`

룰셋 설정(요약 + 전체) 조회.

```bash
curl http://localhost:3001/api/rules/false_ad
```

응답:

```json
{
  "ok": true,
  "moduleId": "false_ad",
  "summary": { "totalRules": 54, "counts": { "HIGH": 20, "MEDIUM": 20, "LOW": 10, "combo": 4 }, ... },
  "config": { "schemaVersion": "1.0.0", "rules": [...], "diseaseTerms": [...], ... },
  "safetyNotice": "..."
}
```

### POST `/api/detect/rules`

텍스트 또는 추출 섹션에 대해 탐지 실행.

```json
{
  "moduleId": "false_ad",
  "text": "당뇨 완치에 도움. 약 대신 먹는 영양제. 100% 효과 보장.",
  "claimCandidates": ["..."],
  "reviewCandidates": ["..."],
  "mainText": "..."
}
```

응답: `{ ok, ruleDetection, matches, highlightedSegments, riskScore, riskLevel, counts, safetyNotice, autoReport:false, humanReviewRequired:true }`.

에러:

| 코드 | 의미 |
|---|---|
| `VALIDATION_ERROR` | 입력 형식 오류 (모든 필드가 비어 있음 등) |
| `MODULE_NOT_FOUND` | false_ad 외 모듈 요청 |
| `DETECT_FAILED` | 내부 예외 |

## 8. Safety Rules

- 자동 신고 금지 — RuleAgent는 신고서를 만들지 않는다 (`ReportService`만 초안 생성)
- 포상금 보장 금지 — 룰셋·응답·UI 어디에도 금액·확정 표현 없음
- 법 위반 확정 표현 금지 — 모든 reason은 "의심", "오인 가능성", "검토 필요"로 작성
- 사람 검토 필수 — 응답 `humanReviewRequired:true`, `safetyNotice` 명시
- 개인정보 수집 금지 — RuleAgent는 입력 텍스트의 PII 마스킹은 TextExtractor가 사전에 처리

## 9. Future Improvements

- OCR 텍스트 룰 탐지 (이번 단계 미포함)
- 쇼핑몰별 문구 위치 가중치 (claim 영역의 매치는 가중치 높임 등)
- 반복 판매자 패턴 분석 (CandidateRepository의 동일 도메인 빈도)
- 법령·고시 변경 시 룰셋 정기 리뷰 (`lastReviewedAt` 갱신)
- AI 보조 점검 — AnalyzerAgent가 매치 결과를 받아 false positive 후보를 표시
