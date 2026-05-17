# Analyzer Agent

## 1. Purpose

RuleAgent가 탐지한 의심 표현과 TextExtractor 결과를 LLM이 **문맥상 재검토**해, 구조화된 **신고 후보 검토 의견**(`AnalysisResult`)을 생성한다.

본 모듈은 다음을 **하지 않는다**:

- 법 위반 확정 판정
- 포상금 지급 확정
- 신고처 확정
- 외부 신고기관 자동 호출

## 2. Input Sources

| 입력 | 출처 |
|---|---|
| `extractionResult` | `TextExtractor` (productName, claim/review candidates, mainText 앞부분) |
| `ruleDetectionResult` | `RuleAgent.detectDetailed` (riskScore/level, counts, matches 상위 20) |
| `evidenceSummary` | `EvidenceService` (productName, prices, capture status) |
| `agencyCandidates` | 프롬프트에 사전 주입 (식약처/국민신문고/지자체 — 모두 "후보") |
| `memo` | 사용자가 입력한 검토 메모 |

LLM에 전달되는 컨텍스트는 길이 제한이 있다 (mainText 3000자, claim 상위 20, review 상위 10, matches 상위 20).

## 3. Prompt Policy

[`src/modules/false-ad/analysis_prompt.md`](../src/modules/false-ad/analysis_prompt.md) — Korean prompt.

절대 원칙:

1. 법 위반 확정 금지 — "의심"/"검토 필요"/"오인 가능성"으로만 표현
2. 포상금 지급 단정 금지
3. 신고처 확정 금지 — "후보"로만
4. 근거 없는 추정 금지 — RuleAgent matches와 추출 텍스트에 한정
5. 정보 부족 시 `"UNCERTAIN"` + 낮은 `confidence` + `missingEvidence` 기록
6. 개인정보 마스킹/배제
7. 사람 최종 검토 필수 명시
8. **지정 JSON Schema를 따른 단일 JSON 객체**만 출력

## 4. Output Schema

[`src/modules/false-ad/analysis_schema.json`](../src/modules/false-ad/analysis_schema.json) (Draft 2020-12)

핵심 필드:

| 필드 | 타입 | 설명 |
|---|---|---|
| `schemaVersion` | const `"1.0.0"` | 스키마 버전 |
| `moduleId` | string | `"false_ad"` |
| `notLegalConclusion` | const `true` | **항상 true** — 위반 확정 금지 |
| `rewardGuaranteed` | const `false` | **항상 false** — 포상금 보장 금지 |
| `overallRisk` | enum | `LOW`/`MEDIUM`/`HIGH`/`VERY_HIGH`/`UNCERTAIN` |
| `violationLikelihood` | enum | `LOW`/`MEDIUM`/`HIGH`/`UNCERTAIN` |
| `confidence` | number 0~1 | 신뢰도 |
| `summary` | string | 객관적 한 단락 요약 |
| `findings[]` | array | `{issue, evidence, reason, riskLevel, sourceSection?}` |
| `missingEvidence[]` | string[] | 보완 증거 권고 |
| `recommendedAgency` | string | 1순위 신고처 후보 |
| `agencyCandidates[]` | string[] | 다수 후보 (모두 "후보" 표기) |
| `reportDraftSummary` | string | 신고서 초안용 중립 문구 |
| `prohibitedPhrases[]` | string[] | "불법 확정"/"포상금 확정"/"범죄자" 등 사용 금지 표현 |
| `humanReviewChecklist[]` | string[] | 사람 검토 체크리스트 |
| `safetyWarnings[]` | string[] | 3개 안내 문구 항상 포함 |

## 5. Validation & Sanitization

`validateAnalysisResult(raw, moduleId)`는 LLM/Mock 출력을 **그대로 신뢰하지 않는다**:

- `notLegalConclusion`을 항상 `true`로 강제
- `rewardGuaranteed`를 항상 `false`로 강제
- enum 값(`overallRisk`/`violationLikelihood`/`riskLevel`) 검증, 잘못된 값은 `UNCERTAIN`으로 폴백
- `confidence`를 0~1 범위로 클램프 (0~100 입력은 100으로 나눠 자동 정규화)
- 금지 표현 정규식 매치 시 `(검토 필요 표현으로 치환됨)`으로 sanitize + `safetyWarnings`에 경고 추가
- "포상금/수령/지급 보장" 표현 sanitize
- 누락 필드는 안전한 기본값으로 채움 (recommendedAgency 기본 "식품의약품안전처 (후보)", `safetyWarnings`에 3개 필수 안내 자동 머지)
- 모든 문자열 필드는 최대 길이로 truncate

금지 표현 정규식:

- `불법 확정`, `위반 확정`, `포상금 확정`, `무조건 지급`, `건당 ○○원 확정`, `범죄자`, `사기꾼`

## 6. Mock Mode

`MOCK_AI=true` 또는 `OPENAI_API_KEY` 미설정 시 mock 사용.

Mock 결정성:

- `riskScore >= 80` → `overallRisk: VERY_HIGH, violationLikelihood: HIGH, confidence: 0.75`
- `60..79` → `HIGH, MEDIUM, 0.65`
- `30..59` → `MEDIUM, MEDIUM, 0.5`
- `0..29` (matches > 0) → `LOW, LOW, 0.35`
- matches 0 → `UNCERTAIN, UNCERTAIN, 0.2`

findings는 RuleAgent matches 상위 8건을 그대로 매핑. missingEvidence는 evidenceSummary의 hasScreenshot/hasPdf/productName/matches 여부로 자동 생성.

동일 입력 → 동일 출력 (Mock).

## 7. API

### `POST /api/analyze/llm`

```json
{
  "moduleId": "false_ad",
  "title": "혈당 관리 건강기능식품",
  "url": "https://example.test/p",
  "memo": "체크",
  "extractionResult": {
    "productName": "프리미엄 혈당 케어",
    "claimCandidates": ["당뇨 완치에 도움", "혈압약 대체"],
    "reviewCandidates": ["먹어보니 좋아졌어요"],
    "mainText": "..."
  },
  "ruleDetectionResult": {
    "riskScore": 90,
    "riskLevel": "매우 높음",
    "counts": { "HIGH": 1, "MEDIUM": 2 },
    "matches": [
      { "ruleId": "H004", "keyword": "당뇨 완치", "riskLevel": "HIGH", "sentence": "당뇨 완치에 도움", "reason": "...", "sourceSection": "claim" }
    ]
  },
  "evidenceSummary": { "hasScreenshot": true, "hasPdf": false }
}
```

응답: `{ ok, moduleId, result: AnalysisResult, mode: "mock" | "llm", safetyNotice, autoReport: false, humanReviewRequired: true }`

에러 코드:

| 코드 | HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `MODULE_NOT_FOUND` | 404 |
| `ANALYZE_LLM_FAILED` | 500 |

기존 `POST /api/cases/analyze` 응답에도 `RewardCase.llmAnalysis` 필드가 포함된다.

## 8. Environment Variables

| 변수 | 기본 | 설명 |
|---|---|---|
| `MOCK_AI` | `true` | true면 OpenAI 호출 없이 mock 사용 |
| `OPENAI_API_KEY` | (없음) | 실제 호출에 필요 |
| `OPENAI_MODEL` | `gpt-4.1-mini` | 사용 모델 (없으면 `AI_MODEL` fallback) |
| `LLM_TEMPERATURE` | `0.1` | 출력 안정성을 위해 낮게 설정 |

LLM 호출 실패 시 mock 결과로 안전 폴백하고 `safetyWarnings`에 사유 기록.

## 9. Future Improvements

- OpenAI Structured Output (response_format `json_schema`)으로 schema 강제
- 같은 입력 해시 캐시 (재현성 + 비용 절감)
- AnalyzerAgent ↔ RuleAgent feedback 루프 (false positive 자동 표시)
- 다국어 신고서 초안 (영문 요약 옵션)
