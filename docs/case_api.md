# Case API

## 1. Purpose

의심 건을 **사건 Case** 단위로 관리한다. 사용자는 분석 결과를 Case로 저장하거나 수동으로 등록하고, 목록·상세를 조회하며, 상태를 사람 검토 흐름에 따라 수동 변경한다.

> 본 API는 **자동 신고 기능이 아니다.** 외부 신고기관 자동 제출, 자동 로그인, 자동 민원 기능을 포함하지 않는다. `SUBMITTED` 상태는 사용자가 외부 기관에 직접 제출한 뒤 **수동으로 기록하는 내부 상태**일 뿐이다.

## 2. Case Lifecycle

```
DRAFT  ──▶  REVIEW  ──▶  APPROVED  ──▶  SUBMITTED
   │           │              │            │
   ▼           ▼              ▼            ▼
REJECTED    REJECTED       REJECTED      REVIEW   (잘못 기록한 경우 되돌리기)
   │
   ▼
 REVIEW  (재검토)
```

허용 전이:

| From | To |
|---|---|
| `DRAFT` | `REVIEW`, `REJECTED` |
| `REVIEW` | `APPROVED`, `REJECTED` |
| `APPROVED` | `SUBMITTED`, `REJECTED` |
| `SUBMITTED` | `REVIEW` (잘못 기록 복원) |
| `REJECTED` | `REVIEW` |

금지 전이 (예시):

- `DRAFT → SUBMITTED`
- `REVIEW → SUBMITTED`
- `REJECTED → SUBMITTED`
- `SUBMITTED → DRAFT`

`SUBMITTED`로 전이할 때는 **반드시** `confirmManualSubmission: true` 또는 "직접 제출"/"수동 제출"이 포함된 `note`를 요구한다.

## 3. Endpoints

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/cases` | 목록 + 필터(`status`, `moduleId`, `minRiskScore`) + 페이지(`limit`, `offset`) |
| `POST` | `/api/cases` | 수동 Case 생성 (항상 `DRAFT`로 시작) |
| `GET` | `/api/cases/:id` | 상세 |
| `PATCH` | `/api/cases/:id` | 안전 필드 수정 (title/summary/memo/agencyCandidate/rewardCaution/riskLevel/riskScore) |
| `PATCH` | `/api/cases/:id/status` | 상태 전이 |
| `POST` | `/api/cases/:id/reviews` | 사람 검토 기록 추가 |
| `POST` | `/api/cases/analyze` | 기존 분석 파이프라인 (URL 입력 → 분석 → Case 자동 저장) |

> `DELETE /api/cases/:id`는 현재 제공하지 않는다. 신고 부적합 처리는 `REJECTED` 상태를 사용한다. (Soft delete 도입은 후속 TODO)

## 4. Field Limits

| 필드 | 최대 길이 |
|---|---|
| `title` | 200 |
| `summary` | 2000 |
| `memo` | 3000 |
| `note` (status/review) | 3000 |
| `agencyCandidate` | 200 |
| `riskLevel` | 40 |
| `reviewerName` | 80 |
| `rewardCaution` | 1000 |

`riskScore`는 0~100 범위로 클램프된다(범위 밖은 자동 보정).

## 5. Error Format

```json
{ "ok": false, "error": "<CODE>", "message": "..." }
```

| 코드 | 의미 |
|---|---|
| `VALIDATION_ERROR` | 입력 형식 오류 |
| `CASE_NOT_FOUND` | 해당 ID의 Case 없음 |
| `MODULE_NOT_FOUND` | 등록되지 않은 모듈 |
| `MODULE_NOT_READY` | 등록되었지만 active 아님 (planned/disabled) |
| `INVALID_STATUS_TRANSITION` | 허용되지 않은 상태 전이 |
| `MANUAL_SUBMISSION_CONFIRMATION_REQUIRED` | SUBMITTED 전환 시 사람 확인 필요 |
| `INTERNAL_ERROR` | 기타 서버 오류 |

## 6. Examples (PowerShell)

```powershell
# 6.0 수동 URL 분석 (체크리스트 12) — 공개 URL 1개 → 분석 Case 1개 자동 생성
#  - 1차 실전 MVP 모듈: false_ad (건강기능식품 온라인 허위·과대광고)
#  - 공개 URL만 대상. 로그인/비공개/대량 크롤링/CAPTCHA 우회는 수행하지 않는다.
#  - 수집 실패 시에도 안전한 fallback 문서로 Case 생성 흐름이 끊기지 않는다(collection.status="fallback").
$analyze = @{ url = "https://example.com"; moduleId = "false_ad" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/analyze" -Method Post -ContentType "application/json" -Body $analyze
# (bash/curl)
#   curl -X POST http://localhost:3001/api/cases/analyze \
#     -H "content-type: application/json" \
#     -d '{"url":"https://example.com","moduleId":"false_ad"}'
#
# 응답 주요 필드:
#   caseId / id            — 생성된 Case ID
#   moduleId               — "false_ad"
#   originalUrl / url      — 입력한 공개 URL
#   createdAt              — 생성 시각 (collection.fetchedAt = 수집 시각)
#   pageTitle / title      — 페이지 제목
#   collection             — { status: "fetched"|"fallback", note? }
#   extraction             — 추출 본문 요약(textLength/claimCandidates/...)
#   ruleDetection.matches  — 의심 문구(keyword/riskLevel/reason) + counts(HIGH/MEDIUM/LOW/combo)
#   ruleDetection.riskScore / score / riskScore — 위험·우선순위 점수(0~100)
#   evidence               — 증거 패키지 요약(htmlPath/textPath/capturedAt 등)
#   notLegalConclusion: true, autoReport: false, humanReviewRequired: true
#   safetyNotice           — "법 위반 확정이 아니며 사람 검토 필요" 안내
#
# ⚠ 키워드 매칭/점수는 검토가 필요한 의심 후보를 의미하며 법 위반 확정이 아니다. 자동 신고는 없다.

# 6.1 수동 Case 생성
$body = @{
  moduleId = "false_ad"
  title    = "테스트 건강기능식품 광고"
  url      = "https://example.com/product"
  riskScore = 75
  riskLevel = "높음"
  agencyCandidate = "식품의약품안전처"
  summary  = "질병 치료 표현 의심"
  memo     = "체크리스트 7 테스트"
} | ConvertTo-Json
$created = Invoke-RestMethod -Uri "http://localhost:3001/api/cases" -Method Post -ContentType "application/json" -Body $body
$id = $created.case.id

# 6.2 목록
Invoke-RestMethod -Uri "http://localhost:3001/api/cases?limit=10" -Method Get

# 6.3 상세
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/$id" -Method Get

# 6.4 메모 수정
$patch = @{ memo = "검토 메모 갱신" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/$id" -Method Patch -ContentType "application/json" -Body $patch

# 6.5 상태 전이 DRAFT → REVIEW
$transit = @{ status = "REVIEW"; reviewerName = "tester"; note = "검토 시작" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/$id/status" -Method Patch -ContentType "application/json" -Body $transit

# 6.6 사람 검토 기록 추가
$review = @{ reviewerName = "tester"; decision = "APPROVED_TO_REPORT"; notes = "근거 충분" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/$id/reviews" -Method Post -ContentType "application/json" -Body $review

# 6.7 REVIEW → APPROVED → SUBMITTED (사람이 직접 제출 후 수동 기록)
$approve = @{ status = "APPROVED"; reviewerName = "tester"; note = "신고 후보 승인" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/$id/status" -Method Patch -ContentType "application/json" -Body $approve

$submit = @{ status = "SUBMITTED"; reviewerName = "tester"; note = "국민신문고에 직접 제출 후 수동 기록"; confirmManualSubmission = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/cases/$id/status" -Method Patch -ContentType "application/json" -Body $submit
```

## 7. Repository

현재 저장소는 **JSON 파일 기반** (`data/cases/*.json`)이며 `JsonCaseRepository`가 구현한다.

- 인터페이스: `ICaseRepository` (save / create / list / get / patch / transition / addReview)
- 환경변수: `USE_DB=false` (기본). Prisma 도입은 다음 체크리스트로 예정 — `USE_DB=true`여도 현재는 JSON으로 폴백한다.
- 레거시 lowercase 상태(`draft`/`needs_review`/...)는 로드 시 자동으로 새 enum으로 정규화된다.

## 8. Safety Rules

- 자동 외부 제출 없음.
- 자동 로그인 없음.
- 비공개 자료 수집 없음.
- 개인정보 대량 수집 없음.
- `SUBMITTED` 상태 변경은 사람 확인 필수.
- 사용자 입력은 길이 상한으로 클램프, URL은 http/https만 허용, 점수는 0~100 클램프.
- 응답에는 `humanReviewRequired: true` / `autoReport: false`를 명시한다.

## 9. TODO (다음 체크리스트 후보)

- Prisma 기반 `PrismaCaseRepository` 도입 + `USE_DB=true` 실제 분기
- Soft delete (`DELETE /api/cases/:id` 또는 ARCHIVED 상태)
- 라우터 단위 통합 테스트 (Supertest)
- UI Case 상세 화면 + 상태 전이 버튼 + 체크리스트 UX
