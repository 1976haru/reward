# Scoring Agent

## 1. Purpose

RuleAgent · TextExtractor · AnalyzerAgent · Evidence · Candidate Discovery 결과를 종합해 **신고 후보 우선순위 점수**(0~100)를 계산한다.
이 점수는 **사람이 어떤 Case를 먼저 검토할지** 정하기 위한 보조 점수다.

## 2. Important Disclaimer

본 점수는 **법 위반 확정 점수가 아니다.** 본 점수는 **포상금 지급 가능성을 보장하지 않는다.**
UI/문서에서 "위험도 확정"이 아니라 "검토 우선순위" 또는 "신고 후보 우선순위"로 표시한다.

## 3. Inputs

| 입력 | 출처 | 영향 |
|---|---|---|
| RuleAgent 결과 (`ruleDetectionResult`) | `RuleAgent.detectDetailed` | ruleSignal (0~40) |
| AnalyzerAgent 결과 (`llmAnalysis`) | `AnalyzerAgent.analyzeWithContext` | llmSignal (0~20) |
| Evidence 요약 (`evidenceSummary`) | `EvidenceService` manifest | evidenceCompleteness (0~15) |
| TextExtractor 결과 (`extractionResult`) | `TextExtractor.extract` | commercialSignal, repetitionSignal, extractionQuality |
| Candidate Discovery (`candidate`) | `CandidateDiscoveryService` | repetitionSignal (도메인 반복) |
| Collector 요약 (`collectorSummary`) | (선택) | extractionQuality 감점 |

## 4. Score Components (총 100점)

| 컴포넌트 | 최대 | 핵심 기여 |
|---|---|---|
| Rule Signal | 40 | RuleAgent score × 0.4 + HIGH≥3 bonus(+4) + combo(+3) − MEDIUM-only(-2) |
| LLM Signal | 20 | overallRisk(VERY_HIGH=12/HIGH=9/MEDIUM=5/LOW=2/UNCERTAIN=0) + violationLikelihood(HIGH=4/MEDIUM=2/LOW=1) + confidence×4 |
| Evidence Completeness | 15 | hasUrl(2) + hasHtml(2) + hasText(2) + hasScreenshot(3) + hasPdf(3) + metadata/manifest/sha256(각 1) |
| Commercial Signal | 10 | hasPrice(+3) + URL 상거래 힌트(+2) + 후기≥3건(+3) + 판매자 표시(+2) |
| Repetition Signal | 10 | 같은 룰 반복(+3) + 의심 문구 5건+(+3) + 동일 도메인 후보 반복(+2) + 후기성 효능 단정 패턴(+2) |
| Extraction Quality | 5 | textLength≥500(+2) + claim 존재(+2) + warnings 적음(+1) − warnings 많음(−2) − collector 경고(−1) |

각 컴포넌트는 자체 상한으로 캡되며, 합산 후 다시 0~100으로 클램프된다.

## 5. Priority Levels

| 점수 | 라벨 | 코드 |
|---|---|---|
| 0~29 | 낮음 | `LOW` |
| 30~59 | 검토 필요 | `REVIEW_NEEDED` |
| 60~79 | 우선 검토 | `HIGH_PRIORITY` |
| 80~100 | 최우선 검토 | `VERY_HIGH_PRIORITY` |

## 6. Recommended Next Actions

각 등급에 대한 권장 후속 행동(`recommendedNextActions[]`):

- **LOW**: "현재 자료만으로는 신고 후보 우선순위가 낮습니다." / "추가 증거가 있으면 재분석하세요."
- **REVIEW_NEEDED**: "사람이 검토하세요" / "증거 보강" / "공식 기준 확인 필요"
- **HIGH_PRIORITY**: "우선 검토 후보입니다" / "원본 URL, 캡처, PDF, 판매자 정보, 문구 위치 확인"
- **VERY_HIGH_PRIORITY**: "최우선 검토 후보" / "증거 완성도 점검" / "외부 신고 전 공식 기준 사람이 재확인"

금지 표현: "신고하세요", "포상금 가능성 높음", "불법 확정", "위반 확정".

## 7. API

### `POST /api/score`

```json
{
  "moduleId": "false_ad",
  "url": "https://example.test/p",
  "extractionResult": { "productName":"...", "textLength":1200, "claimCandidates":["..."] },
  "ruleDetectionResult": { "riskScore": 90, "counts": { "HIGH": 2, "MEDIUM": 1 }, "matches": [...] },
  "llmAnalysis": { "overallRisk":"VERY_HIGH", "violationLikelihood":"HIGH", "confidence": 0.8 },
  "evidenceSummary": { "hasHtml": true, "hasScreenshot": true, "hasPdf": true }
}
```

응답:

```json
{
  "ok": true,
  "moduleId": "false_ad",
  "result": {
    "schemaVersion": "1.0.0",
    "moduleId": "false_ad",
    "priorityScore": 73,
    "priorityLabel": "우선 검토",
    "priorityLevel": "HIGH_PRIORITY",
    "components": [
      { "key": "ruleSignal", "label": "...", "maxPoints": 40, "score": 36, "reasons": ["..."] },
      ...
    ],
    "recommendedNextActions": ["..."],
    "notLegalConclusion": true,
    "rewardGuaranteed": false,
    "disclaimer": "...",
    "safetyWarnings": ["..."]
  },
  "safetyNotice": "...",
  "autoReport": false,
  "humanReviewRequired": true
}
```

에러 코드:

| 코드 | HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `MODULE_NOT_FOUND` | 404 |
| `SCORING_FAILED` | 500 |

## 8. Integration

`POST /api/cases/analyze` 응답의 `RewardCase`에 `scoringResult` 필드가 포함되며, `RewardCase.score`/`riskScore`/`riskLevel`은 헤드라인 우선순위 점수/라벨을 가리킨다.
`RewardCase.ruleDetection.riskScore`는 RuleAgent 단독 점수로 그대로 보존된다 (디버깅·진단용).

## 9. Safety Rules

- 법 위반 확정 표현 금지 (`notLegalConclusion: true` 강제)
- 포상금 보장 금지 (`rewardGuaranteed: false` 강제)
- 자동 신고 금지 (점수가 80+여도 외부 자동 호출 없음)
- 사람 검토 필수 — `safetyWarnings` 3개 안내 항상 포함
- 사용자 개인정보 기반 점수화 금지 — 입력 어디에도 개인정보 사용 안 함

## 10. Future Improvements

- 실제 신고/처분 결과 기반 가중치 조정 (피드백 루프)
- 도메인 신뢰도 데이터셋 반영
- 동일 판매자 반복 신호 (CandidateRepository에서 도메인 집계)
- 후기성 효능 단정의 정밀 탐지 (현재 단순 키워드 매칭)
- Case 점수 업데이트 전용 API (`PATCH /api/cases/:id/score`) — 현재는 분석 시점에만 계산
