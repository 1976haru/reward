# agency_config.json Schema

본 문서는 `src/modules/{moduleId}/agency_config.json` 파일의 스키마를 정의한다.
새 모듈을 추가할 때 이 스키마를 그대로 복사해 채우면 UI와 ReportService가 동일한 방식으로 데이터를 사용할 수 있다.

- 현재 적용 모듈: `src/modules/false-ad/agency_config.json` (건강기능식품 온라인 허위·과대광고)
- 후속 모듈은 모듈별 폴더에 별도 파일을 둔다.
- 본 스키마와 함께 [`agency_research.md`](./agency_research.md)의 조사 원칙을 반드시 같이 따른다.

---

## 0. 공통 규칙

- 파일은 **유효한 JSON**이어야 한다. 주석은 사용하지 않는다.
- 모든 URL은 **공식 사이트**여야 한다 (블로그·뉴스·법무법인 홍보글·커뮤니티 금지).
- 포상금 금액·지급 보장 표현은 사용하지 않는다.
- 날짜는 `YYYY-MM-DD` 형식.

## 1. Top-level Fields

| 필드명 | 타입 | 필수 | 설명 | 예시 |
|---|---|---|---|---|
| `schemaVersion` | string | ✅ | 본 스키마 버전. semver 권장 | `"1.0.0"` |
| `moduleId` | string | ✅ | 모듈 식별자. 폴더명과 일치 (snake_case) | `"false_ad"` |
| `moduleName` | string | ✅ | 사람이 읽는 모듈 이름 | `"건강기능식품 온라인 허위·과대광고"` |
| `category` | string | ✅ | 카테고리 식별자 | `"health_functional_food"` |
| `jurisdiction` | string | ✅ | 관할국 (ISO 3166-1 alpha-2) | `"KR"` |
| `status` | string | ✅ | `"mvp"` / `"beta"` / `"stable"` / `"draft"` | `"mvp"` |
| `lastReviewedAt` | string (date) | ✅ | 사람이 마지막으로 검토한 날짜 | `"2026-05-17"` |
| `reviewRequiredBeforeUse` | boolean | ✅ | 사용 전 사람 재확인 필요 여부 (기본 `true`) | `true` |
| `disclaimer` | string | ✅ | 법적 면책·사용 한계 문구 | (아래 §2 참고) |
| `rewardPolicySummary` | object | ✅ | 포상금 정책 요약 (§3) | |
| `conceptDefinitions` | array<object> | ✅ | 보상금·포상금·신고포상금 개념 구분 (§4) | |
| `primaryAgencies` | array<object> | ✅ | 신고처·참고 기관 목록 (§5, 최소 4) | |
| `legalBasis` | array<object> | ✅ | 법령·고시·공식 안내 근거 (§6) | |
| `evidenceStandard` | object | ✅ | 최소·권장 증거, 수집 금지 항목 (§7) | |
| `reportReadinessChecklist` | array<string> | ✅ | UI 체크리스트 항목 (§8) | |
| `reportDraftGuidance` | object | ✅ | 신고서 초안 구성·금지 표현 (§9) | |
| `riskWarnings` | array<string> | ✅ | 위험·주의 문구 (§10) | |
| `futureModuleReferences` | array<object> | ✅ | 후속 모듈 참고 (§11) | |
| `maintenancePolicy` | object | ✅ | 유지보수 정책 (§12) | |

## 2. disclaimer

문자열. 다음 취지를 반드시 포함:

- 이 설정은 신고기관 후보와 공식 근거 정리를 위한 자료다.
- 법 위반 판단, 신고 접수, 포상금 지급을 보장하지 않는다.
- 실제 신고 가능 여부·포상금 지급 여부는 공식 기관 기준·조사 결과·처분 결과에 따라 달라진다.
- 외부 신고 전 사람이 공식 자료를 재확인해야 한다.

## 3. rewardPolicySummary

```json
{
  "rewardGuaranteed": false,
  "estimatedRewardDisplayAllowed": false,
  "recommendedUiText": "...",
  "doNotUsePhrases": ["...", "..."],
  "notes": ["...", "..."]
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `rewardGuaranteed` | boolean | ✅ | 항상 `false`. 보장 단정 금지 |
| `estimatedRewardDisplayAllowed` | boolean | ✅ | 예상 포상금 금액 UI 노출 허용 여부. 본 정책상 `false` |
| `recommendedUiText` | string | ✅ | UI에 그대로 사용 가능한 안전 문구 |
| `doNotUsePhrases` | array<string> | ✅ | UI·문서에서 금지된 표현 목록 |
| `notes` | array<string> | ✅ | 분야별 규정·요건 차이 등 보조 메모 |

## 4. conceptDefinitions

배열. 각 원소는:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `term` | string | ✅ | 개념 명칭 (예: 신고포상금) |
| `definition` | string | ✅ | 일반 정의 |
| `applicabilityNote` | string | ✅ | 본 프로그램에서의 적용 한계·주의 |

필수로 포함해야 할 개념: `신고포상금`, `공익신고 보상금`, `공익신고 포상금`, `프로그램의 역할`.

## 5. primaryAgencies

배열 (최소 4개). 각 원소:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `agencyId` | string | ✅ | 안정적 식별자 (snake_case) |
| `agencyName` | string | ✅ | 기관/채널 명칭 |
| `role` | string | ✅ | 프로그램 내 역할 설명 |
| `reportingChannels` | array<object> | ✅ | 채널 목록 (`channelName`, `url`, `notes`) |
| `evidenceRequirements` | array<string> | ✅ | 해당 기관 신고 시 권장 증거 항목 |
| `rewardNotes` | array<string> | ✅ | 포상금 관련 주의·확인 안내 (단정 금지) |

## 6. legalBasis

배열. 각 원소:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `title` | string | ✅ | 자료 제목 (법령·고시·공식 안내) |
| `source` | string | ✅ | 출처 기관/사이트 |
| `url` | string | ✅ | 공식 URL |
| `relevantKeywords` | array<string> | ✅ | 조문·키워드 후보 |
| `usage` | string | ✅ | 프로그램 내 사용 목적 |
| `caution` | string | ✅ | 개정 가능성 등 주의 |

## 7. evidenceStandard

```json
{
  "minimumEvidence": ["..."],
  "recommendedEvidence": ["..."],
  "avoidCollecting": ["..."]
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `minimumEvidence` | array<string> | ✅ | 최소 증거 |
| `recommendedEvidence` | array<string> | ✅ | 권장 증거 |
| `avoidCollecting` | array<string> | ✅ | 수집 금지 항목 |

## 8. reportReadinessChecklist

배열<string>. UI에서 체크박스로 표시할 항목.
필수 포함: 공개 URL 여부, 원본 URL 저장 여부, 수집일시 기록 여부, 캡처/PDF 보유 여부, 포상금 보장 표현 제거 여부, 사람 검토 여부.

## 9. reportDraftGuidance

```json
{
  "summaryFields": ["..."],
  "evidenceFields": ["..."],
  "cautionText": "...",
  "recommendedTone": ["..."],
  "prohibitedTone": ["..."]
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `summaryFields` | array<string> | ✅ | 초안 요약 영역에 들어갈 필드 |
| `evidenceFields` | array<string> | ✅ | 초안 증거 영역에 들어갈 필드 |
| `cautionText` | string | ✅ | 초안 상단/하단에 들어갈 주의 문구 |
| `recommendedTone` | array<string> | ✅ | 권장 표현 톤 |
| `prohibitedTone` | array<string> | ✅ | 금지 표현 톤 (범죄자 단정, 포상금 요구 전면화 등 포함 필수) |

## 10. riskWarnings

배열<string>. 오탐 가능성, 공식 기준 변경 가능성, 중복 신고 포상 제외 가능성, 신고기관 관할 불일치 가능성, 포상금 지급 제외 가능성, 허위·악의적 신고 금지, 명예훼손성 표현 주의 등을 포함.

## 11. futureModuleReferences

배열. 후속 모듈마다:

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `moduleId` | string | ✅ | 후속 모듈 식별자 |
| `moduleName` | string | ✅ | 사람이 읽는 이름 |
| `primaryAgencyHint` | string | ✅ | 1차 신고처 후보 (조사 전 가설 가능, 표시 시 "후보"임을 명시) |
| `officialSourceHint` | string | ✅ | 공식 사이트 후보 URL 또는 안내 |
| `note` | string | ✅ | 본 모듈에서 다루지 않는다는 메모 |

## 12. maintenancePolicy

```json
{
  "officialSourcesOnly": true,
  "reviewCycle": "before_each_release",
  "lastReviewedAt": "YYYY-MM-DD",
  "staleAfterDays": 90,
  "requiredReviewer": "Human reviewer",
  "note": "..."
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `officialSourcesOnly` | boolean | ✅ | 항상 `true` |
| `reviewCycle` | string | ✅ | 검토 주기 (예: `"before_each_release"`) |
| `lastReviewedAt` | string (date) | ✅ | 마지막 사람 검토일 |
| `staleAfterDays` | number | ✅ | 이 기간 경과 시 재검토 권고 |
| `requiredReviewer` | string | ✅ | 검토 책임 (사람) |
| `note` | string | ✅ | 보조 메모 |

---

## How to Add a New Module

1. `src/modules/{moduleId}/agency_config.json` 파일을 생성한다.
2. 본 스키마를 그대로 복사하고 모든 필드를 채운다.
3. 공식 URL과 법령은 **사람이 직접 조사한 자료**만 등록한다. 추정·블로그·뉴스 인용 금지.
4. 포상금·보상금 표현은 단정하지 않는다. 모든 금액 표현은 "확인 필요"로 둔다.
5. 검증:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('src/modules/<moduleId>/agency_config.json','utf8')); console.log('OK')"
   npm run build
   npm test
   ```
6. `docs/agency_research.md`에 모듈별 요약을 추가한다.
7. 변경 후 사람 검토자가 `lastReviewedAt`을 갱신한다.

## Backward Compatibility

- 필수 필드를 제거하면 **major 버전 증가**. (`schemaVersion`의 첫 자리)
- 선택 필드 추가는 **minor 버전 증가**.
- 표현 변경/오타 수정은 **patch 버전 증가**.
- UI·ReportService 측 코드는 `schemaVersion`을 읽고 호환성을 확인한다.
