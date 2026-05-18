# Feedback DB (체크리스트 21)

## 1. Purpose

검토자가 AI가 찾은 후보(Case)를 **승인/보류/폐기**한 이유를 구조화해서 저장한다.
이 데이터는 다음 목적을 위해 누적된다.

- **RuleAgent** 의 false positive 누적 근거
- **AnalyzerAgent (LLM)** 의 과장/축소 판단 누적 근거
- **ScoringAgent** 의 점수 과대/과소 평가 누적 근거
- **Evidence Package** 보강 우선순위 판단 근거
- 신고처 매핑(agency_config) 개선 근거

**중요:**
이 기능은 내부 품질 개선 데이터다. 외부 신고기관 자동 제출, 자동 신고, 자동 룰 변경 기능이 아니다.
피드백은 *사람이* Rule/Prompt/Score를 개선하기 위한 근거로만 사용한다.

## 2. Feedback Decisions

| 코드 | 의미 |
|------|------|
| `APPROVE` | 검토 통과 — 신고초안/제출 흐름으로 진행 가능하다고 사람이 판단 |
| `HOLD` | 보류 — 추가 검토가 필요 |
| `REJECT` | 폐기 — 신고 후보로 부적합 |
| `NEEDS_MORE_EVIDENCE` | 증거 부족 — 캡처/문구/URL 보강 필요 |
| `DUPLICATE` | 중복 — 이미 처리된 후보와 동일 |
| `NOT_RELEVANT` | 관련 없음 — 모듈/카테고리 미스매치 |
| `FALSE_POSITIVE` | 오탐 — RuleAgent/LLM이 잘못 매칭 |

## 3. Reason Categories

검토자가 다중 선택 가능한 사유 카테고리. `src/types/feedback.ts` 의 `FEEDBACK_REASON_CATEGORIES` 와 일치한다.

| 코드 | 라벨 | 권장 액션 |
|------|------|----------|
| `NOT_HEALTH_FUNCTIONAL_FOOD` | 건강기능식품 아님 | RuleAgent 카테고리 판정 기준 보강 |
| `NOT_ADVERTISEMENT` | 광고 아님 | 후보 발굴 필터에서 광고/판매 신호 강화 |
| `NO_PROHIBITED_CLAIM` | 금지표현 없음 | false positive 예시로 기록, threshold 조정 |
| `GENERAL_HEALTH_EXPRESSION` | 일반 건강 표현 | 일반 표현 vs 치료 표현 구분 규칙 강화 |
| `CONTEXT_ALLOWED` | 문맥상 허용 가능 | 인용/부정/반박 등 문맥 예외 추가 검토 |
| `EVIDENCE_INSUFFICIENT` | 증거 부족 | Evidence Package 생성 기준 보강 |
| `URL_INACCESSIBLE` | URL 접근 불가 | 후보 검증 단계 접근성 확인 보강 |
| `DUPLICATE_CANDIDATE` | 중복 후보 | Dedupe Engine 임계값 검토 |
| `LOW_SELL_SIGNAL` | 판매 신호 낮음 | ScoringAgent commerceSignal 가중치 조정 |
| `RULE_FALSE_POSITIVE` | 룰 오탐 | keywords.json 조정 후보 |
| `LLM_OVERSTATED` | AI 판단 과장 | analysis_prompt.md 보수적 판단 강화 |
| `SCORE_TOO_HIGH` | 점수 과대평가 | scoring_rules.ts 가중치 조정 |
| `AGENCY_MISMATCH` | 신고처 부정확 | agency_config.json 매핑 점검 |
| `PII_RISK` | 개인정보 위험 | PII 마스킹 단계 보강 |
| `OTHER` | 기타 | 검토자 메모 확인, 새 카테고리화 검토 |

## 4. Data Storage

- **기본:** 로컬 JSON 저장소 — `data/feedback/feedback.json`
- **선택:** Prisma 모델 (현재 미연결. `FEEDBACK_USE_DB=true` 여도 JSON 폴백)
- `data/feedback/feedback.json` 은 `.gitignore` 대상. GitHub에 올라가지 않는다.
- 환경변수:
  - `FEEDBACK_DIR` — 저장 경로 (기본 `./data/feedback`)
  - `FEEDBACK_USE_DB` — Prisma 사용 여부 (기본 `false`)

### Entry Schema

`src/types/feedback.ts` 의 `FeedbackEntry`.

핵심 필드:

- `id` (`fb_xxxxxx`)
- `caseId`, `moduleId`
- `decision` (`APPROVE`/`HOLD`/`REJECT`/`NEEDS_MORE_EVIDENCE`/`DUPLICATE`/`NOT_RELEVANT`/`FALSE_POSITIVE`)
- `reasonCategories[]`
- `reviewerName`, `memo`
- `relatedRuleIds[]`, `relatedKeywords[]`
- `llmIssueNotes`, `scoringIssueNotes`
- `suggestedRuleChanges[]`, `suggestedPromptChanges[]`, `suggestedScoringChanges[]`
- `caseStatusAtFeedback` — 피드백 시점의 Case 상태
- `piiMasked` — memo/notes 자동 마스킹 발생 여부
- `createdAt`, `safetyNotice`

## 5. API

### POST `/api/cases/:caseId/feedback`

검토자가 Case에 대한 피드백 저장.

Request body 예시:

```json
{
  "decision": "REJECT",
  "reasonCategories": ["NO_PROHIBITED_CLAIM", "RULE_FALSE_POSITIVE"],
  "reviewerName": "tester",
  "memo": "일반 건강관리 표현으로 보임",
  "relatedRuleIds": ["H004"],
  "relatedKeywords": ["당뇨 완치"],
  "suggestedRuleChanges": ["문맥 예외 보강"],
  "suggestedPromptChanges": [],
  "suggestedScoringChanges": ["LOW-only 후보는 40점 이상 주지 않기"]
}
```

Response:

```json
{
  "ok": true,
  "feedback": { /* FeedbackEntry */ },
  "piiMasked": false,
  "piiHits": { "email": 0, "phone": 0, "rrn": 0 },
  "message": "피드백이 저장되었습니다. 이 정보는 룰/프롬프트/점수 개선 근거로 사용되며, 시스템이 자동으로 룰을 변경하지 않습니다.",
  "safetyNotice": "..."
}
```

### GET `/api/cases/:caseId/feedback`

특정 Case의 피드백 목록.

### GET `/api/feedback`

전체 피드백 목록. 쿼리 필터: `decision`, `reasonCategory`, `ruleId`, `keyword`, `caseId`, `limit`, `offset`.

### GET `/api/feedback/stats`

집계 통계:

```json
{
  "ok": true,
  "stats": {
    "total": 10,
    "byDecision": { "REJECT": 5, "HOLD": 2, ... },
    "byReasonCategory": { "RULE_FALSE_POSITIVE": 4, ... },
    "topRuleFalsePositiveIds": [{ "ruleId": "H004", "count": 4 }],
    "topKeywordFalsePositives": [{ "keyword": "당뇨 완치", "count": 4 }],
    "evidenceIssueCounts": { "EVIDENCE_INSUFFICIENT": 2, "URL_INACCESSIBLE": 1 }
  }
}
```

### GET `/api/feedback/improvements`

룰/프롬프트/점수/증거 개선 *후보* 리포트. 자동 변경이 아니라 사람 검토용이다.

### GET `/api/feedback/meta`

UI가 사용하는 카테고리 사전과 안전 고지를 함께 제공.

## 6. Review Queue Integration

1. UI에서 Human Review Queue 상세 모달을 연다.
2. 결정 (`APPROVE`/`HOLD`/`REJECT`/...), 반려 사유 카테고리(다중), 메모, 관련 룰/키워드, 개선 제안을 입력한다.
3. **상태 변경**과 **피드백 저장**은 별도 액션이다. 상태 변경 후 또는 그 전에 피드백을 자유롭게 저장할 수 있다.
4. 폼은 결정값을 현재 Case 상태에 따라 자동 추정 (`HOLD`→HOLD, `APPROVED`→APPROVE, 그 외 REJECT).
5. 메모/노트에 이메일/전화번호/주민번호 패턴이 포함되면 자동 마스킹된 채로 저장된다.

## 7. Improvement Loop

피드백 → (사람이 보고) → Rule/Prompt/Score 개선 후보 → (별도 체크리스트에서) 코드 반영.

- `RULE_FALSE_POSITIVE` 5건 이상인 ruleId → `keywords.json` 임계값/예외 검토 후보
- `LLM_OVERSTATED` 누적 → `analysis_prompt.md` 보수적 판단 보강 후보
- `SCORE_TOO_HIGH` 누적 → `scoring_rules.ts` 가중치 조정 후보
- `EVIDENCE_INSUFFICIENT` 누적 → Evidence Package 흐름 UX 보강 후보

⚠ **시스템은 피드백에 따라 룰/프롬프트/가중치를 자동 변경하지 않는다.**
모든 변경은 사람이 검토한 뒤 별도 체크리스트(코드 변경)로 반영해야 한다.

## 8. PII Masking

`src/utils/piiMask.ts` 에서 다음 패턴을 마스킹한다.

- 이메일 → `[masked-email]`
- 전화번호 → `[masked-phone]`
- 주민등록번호 형태 → `[masked-id]`

이 함수는 완벽한 PII 탐지가 아닌 1차 방어선이다. 검토자가 개인정보 자체를 메모에 넣지 않는 것이 원칙이다.

## 9. Prohibited (이번 단계에서 절대 하지 않는 것)

- 피드백에 따라 룰/프롬프트/점수 가중치를 *자동* 변경하지 않는다.
- 외부 신고기관에 자동 제출하지 않는다.
- 신고기관 계정/로그인 정보를 저장하지 않는다.
- 개인정보 원문을 저장하지 않는다 (마스킹 후 저장).
- Feedback JSON 파일을 Git에 커밋하지 않는다 (`data/feedback/*` 는 gitignore).
