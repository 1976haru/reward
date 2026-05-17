# Module Registry

## 1. Purpose

탐지 모듈을 플러그인처럼 등록·조회하기 위한 공통 구조 설명.
런타임에서 외부 코드를 동적으로 로드하지 않는다. 모듈은 `src/modules/index.ts`에서 명시적으로 `register()` 호출로 등록된다.

핵심 구성:

- 타입 정의: [`src/core/moduleRegistry.ts`](../src/core/moduleRegistry.ts)
- 등록 부트스트랩: [`src/modules/index.ts`](../src/modules/index.ts)
- Active 모듈 entry: [`src/modules/false-ad/index.ts`](../src/modules/false-ad/index.ts)
- 모듈별 정책 데이터: `src/modules/{slug}/agency_config.json`
- 모듈별 보고서 템플릿: `src/modules/{slug}/report-template.md`

## 2. Current Active Module

| id | name | category | status |
|---|---|---|---|
| `false_ad` | 건강기능식품 온라인 허위·과대광고 탐지 | `health_functional_food` | `active` |

기본 모듈(`moduleRegistry.getDefault()`)도 `false_ad`로 설정되어 있다.

## 3. Planned Modules

| id | name | category | status |
|---|---|---|---|
| `counterfeit_goods` | 위조상품 온라인 판매 | `intellectual_property` | `planned` |
| `origin_labeling` | 원산지 표시 위반 | `food_labeling` | `planned` |
| `subsidy_fraud` | 보조금 부정수급 | `public_funds` | `planned` |
| `bid_collusion` | 입찰담합 의심 | `antitrust` | `planned` |

분석 API(`POST /api/cases/analyze`)는 planned 모듈이 요청되면 다음을 반환한다.

```json
{
  "ok": false,
  "error": "MODULE_NOT_READY",
  "message": "해당 모듈은 아직 준비 중입니다.",
  "moduleId": "<requested>",
  "moduleStatus": "planned"
}
```

## 4. Module Definition Fields

`ModuleDefinition` (TypeScript):

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `id` | string | ✅ | 안정 식별자 (snake_case) |
| `slug` | string | ✅ | 폴더명 (kebab-case) |
| `name` | string | ✅ | 사람이 읽는 모듈명 |
| `category` | string | ✅ | 카테고리 키 |
| `status` | `"active" \| "planned" \| "disabled"` | ✅ | 모듈 상태 |
| `capabilities` | object | ✅ | `publicUrlAnalysis`, `ruleBasedDetection`, `aiAnalysis`, `evidencePackage`, `reportDraft` (boolean × 5) |
| `configPath` | string | optional | 탐지 룰 설정 파일 경로 |
| `agencyConfigPath` | string | optional | 기관/근거 설정 JSON 경로 |
| `reportTemplatePath` | string | optional | 신고서 초안 템플릿 Markdown 경로 |
| `supportedInputTypes` | array<string> | ✅ | `"public_url"` 등 |
| `safetyNotes` | array<string> | ✅ | 안전 정책 메모 (자동 신고 금지 등) |
| `ui` | object | ✅ | `agency`, `target`, `difficulty`, `rewardLikelihood`, `guide` (각 optional) |

## 5. How to Add a New Module

1. `src/modules/{slug}/` 폴더 생성 (예: `src/modules/counterfeit-goods/`).
2. `config.ts` 작성 — 모듈 메타데이터와 탐지 룰.
3. `agency_config.json` 작성 — [`docs/agency_config_schema.md`](./agency_config_schema.md) 스키마 준수.
4. `report-template.md` 작성 — 신고서 초안 골격.
5. `index.ts`에서 `ModuleDefinition`을 export.
6. `src/modules/index.ts`의 `plannedModules` 또는 active 등록 위치에 추가.
7. `npm run check`로 build + smoke test 통과 확인.
8. `GET /api/modules`에서 노출 확인.
9. 분석 파이프라인 연결은 별도 체크리스트에서 진행한다. (active 등록만으로 분석이 자동 동작하지 않는다 — `false_ad` 외 모듈은 `MODULE_NOT_IMPLEMENTED`로 안전 차단된다.)

## 6. Safety Rules

- `planned`/`disabled` 모듈은 분석 API에서 **절대 실행되지 않는다.**
- 자동 신고 기능 금지 — 어떤 모듈도 외부 신고기관에 자동 제출하지 않는다.
- 자동 로그인 금지.
- 포상금 보장 문구 금지 — 모든 모듈의 UI/보고서에서 "수령 보장" 표현 사용 안 함.
- 사람 검토 필수 — Submitted 상태는 사용자가 외부 제출 후 수동으로 변경한다.
- 비공개 자료 수집 금지, 로그인 우회 금지, 개인정보 수집 금지.

## 7. API Surface

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/modules` | 등록된 모듈 전체 + 기본 모듈 ID |
| `GET` | `/api/modules/:moduleId` | 특정 모듈 상세. 없으면 404 `MODULE_NOT_FOUND` |
| `POST` | `/api/cases/analyze` | `moduleId` 미지정 시 `getDefault()` 사용. planned는 409 `MODULE_NOT_READY`, 미구현 active는 501 `MODULE_NOT_IMPLEMENTED` |

## 8. Non-Goals

본 registry는 다음을 **하지 않는다.**

- 외부 코드 동적 로딩
- npm 플러그인 시스템 도입
- 런타임 모듈 교체
- 분석 로직 자동 와이어링 (active 모듈이라도 분석 코드는 명시적으로 작성·연결해야 한다)
