# Eval Set (체크리스트 22)

## 1. Purpose

정답 라벨이 있는 합성 광고 문구로 **RuleAgent + ScoringAgent** 의 탐지 품질을 측정한다. 측정 지표는 Precision / Recall / F1 / Accuracy / Confusion Matrix 이다.

**중요:** 평가셋은 내부 품질 측정용이다. 실제 신고 판단을 대체하지 않으며, 평가 결과로 룰/프롬프트/점수를 자동 변경하지 않는다.

## 2. Eval Set Composition

기본 평가셋: `health_false_ad_synthetic_v1`

- `VIOLATION_CANDIDATE`: 100건
- `NORMAL`: 100건
- **총 200건**

VIOLATION 카테고리 (9종):

- `DISEASE_TREATMENT` — 질병 치료/완치 표현
- `DISEASE_PREVENTION` — 질병 예방 단정
- `DRUG_SUBSTITUTION` — 약 대신/병원 갈 필요 없음
- `EXAGGERATED_EFFECT` — 100% 효과/기적의 효과 등 과장
- `DETOX_OVERSTATEMENT` — 독소 배출/완벽 해독
- `TESTIMONIAL_OVERSTATEMENT` — 후기성 효능 단정
- `DIET_OVERSTATEMENT` — 다이어트/체지방 과장
- `INFLAMMATION_TUMOR` — 염증 완전 제거/종양 감소
- `BP_BS_CHOL` — 혈압/혈당/콜레스테롤 의약품 오인 표현

NORMAL 카테고리 (9종):

- `GENERAL_HEALTH`, `FUNCTIONAL_INGREDIENT`, `USAGE_WARNING`, `GENERIC_REVIEW`, `PRICE_SHIPPING`, `EXPERT_CONSULT`, `NUTRITION_INFO`, `SELLER_INFO`, `EXCHANGE_RETURN`

NORMAL 샘플은 일부러 “혈당”, “관절”, “피로” 같은 단어를 포함하도록 설계되어 있어 단순 키워드 기반 오탐을 측정할 수 있다.

## 3. Synthetic Data Policy

- 모든 상품명/문구는 **가상**이다. 예: `프리미엄 혈당 케어 A`, `조인트 밸런스 B`, `데일리 비타민 C`, `굿나잇 허브 D`.
- 실제 업체명/판매자/상품명/개인정보는 포함하지 않는다.
- 평가셋 JSON 은 코드 성격이므로 Git 에 커밋한다 (`src/modules/false-ad/eval/*.json`).
- 평가 실행 결과 JSON (`data/eval/runs/*.json`)은 gitignored.
- `EvalRepository.checkEvalSetForPii` 가 email/phone/rrn/주소 정규식을 점검해 합성 데이터에 개인정보가 섞이지 않았는지 1차 방어한다.

## 4. Metrics

- `precision = TP / (TP + FP)`
- `recall = TP / (TP + FN)`
- `f1 = 2 * precision * recall / (precision + recall)`
- `accuracy = (TP + TN) / total`
- `confusion = { TP, FP, TN, FN }`

라벨 → 양/음성 매핑:

- `VIOLATION_CANDIDATE` → positive
- `NORMAL` → negative

예측 → 양/음성 매핑:

- `priorityScore >= threshold` **OR** `ruleRiskScore >= threshold` → POSITIVE
- 두 점수 모두 미만 → NEGATIVE

LLM/Evidence/Seller 신호가 없는 평가에서는 `priorityScore` 가 낮게 나오기 때문에, RuleAgent 자체 `riskScore` 도 임계값 비교에 포함한다. 두 점수 중 하나라도 threshold 를 넘으면 양성으로 예측한다. 결과의 `priorityScore` / `ruleRiskScore` 는 각각 별도 필드로 노출되므로, 외부 분석에서 다른 cut-off 를 적용할 수도 있다.

`safeDivide` 가 0 분모를 0 으로 처리한다.

## 5. Threshold

기본 `EVAL_THRESHOLD=60` (`config.eval.threshold`). API 요청에서 `threshold` 로 override 가능 (0..100).

threshold 를 낮추면 recall ↑, precision ↓ 경향. 평가 실행 후 FP/FN 분포를 보고 사람이 조정 후보를 결정한다.

## 6. False Positives and False Negatives

- **FP**: NORMAL 인데 POSITIVE 예측. → `RULE_FALSE_POSITIVE` / `SCORE_TOO_HIGH` 개선 후보
- **FN**: VIOLATION_CANDIDATE 인데 NEGATIVE 예측. → 키워드/정규식 미보강 후보 or score 가중치 보강 후보

각 후보는 `feedbackCandidates[]` 로 응답되며, `suggestedImprovement` 텍스트와 `feedbackReasonCategories` 를 포함한다. **자동 저장 없음**. 사람이 검토 후 Feedback DB 에 반영해야 한다.

## 7. API

- `GET /api/eval/sets` — 평가셋 목록 (요약)
- `GET /api/eval/sets/:evalSetId` — 평가셋 요약 + 상위 50건 미리보기
- `POST /api/eval/run` — 평가 실행. body: `{ evalSetId?, threshold?, useLlm?, maxSamples? }`
- `GET /api/eval/runs` — 최근 실행 목록 (메트릭만)
- `GET /api/eval/runs/:runId` — 개별 실행 결과 (results 50건까지)
- `GET /api/eval/runs/:runId/feedback-candidates` — FP/FN 개선 후보
- `GET /api/eval/latest` — 최신 결과 (FP/FN 상위 10개)

## 8. EvalRunner 구조

```
EvalRunner.run(evalSet, opts)
  ├─ RuleAgent.detectDetailed({ claimCandidates, mainText })  // 룰 기반 매치 + riskScore
  ├─ ScoringAgent.computePriority({ ruleDetectionResult, extractionResult, evidenceSummary })
  ├─ predict: priorityScore >= threshold → POSITIVE
  ├─ classifyOutcome(label, prediction) → TP/FP/TN/FN
  ├─ buildMetrics(results, threshold)
  └─ buildFeedbackCandidates(FPs, FNs)
```

LLM 호출은 비활성화 상태다. `useLlm: true` 옵션을 받더라도 이번 단계에서는 호출하지 않고 warning 로그만 남긴다.

## 9. Run Storage

`data/eval/runs/<runId>.json` 에 저장되고 `latest.json` 포인터가 최신 runId 를 가리킨다. `runId` 형식: `run_<ISO timestamp>_<nanoid>`. 패스 트래버설 차단을 위해 `isSafeRunId` 정규식으로 검증한다.

## 10. Prohibited (이번 단계에서 절대 하지 않는 것)

- 실제 사이트 대량 수집 / 외부 신고기관 자동 제출 / 자동 로그인 / 개인정보 수집 — 일체 없음
- 평가 결과로 룰/프롬프트/점수 가중치 *자동* 변경 — 절대 없음. 사람 검토 후 별도 체크리스트에서 반영
- LLM 호출을 기본 테스트에 포함 — 없음. `useLlm=true` 도 이번 단계에서는 무시
- 평가 실행 결과 JSON (`data/eval/runs/*.json`) Git 커밋 — `.gitignore` 처리
