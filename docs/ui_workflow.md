# UI Workflow

## 1. Purpose

공익레이더는 기능이 늘어나면서 초보자에게 첫 행동을 안내하기 어려워졌습니다. 이번 리디자인은 **기능 추가/삭제 없이 정보 구조만 재배치**합니다. 실제 사용 흐름인

> 후보 발굴 → 분석 → 증거화 → 신고서 초안 → 사람 검토 → 직접 제출 후 결과 기록

가 자연스럽게 보이도록 UI를 9개의 뷰(view)로 나누어 좌측 사이드바로 전환할 수 있게 했습니다. SPA 프레임워크는 도입하지 않으며 기존 `public/index.html` + `public/app.js` + `public/styles.css` 만 사용합니다.

## 2. Views

| 순서 | view | 메뉴명 | 주요 기능 |
|---|---|---|---|
| 1 | `home` | 홈 | 오늘 KPI 요약 · 다음 행동 추천 · Home/Notice · 공지사항 · 안전 공지 |
| 2 | `discover` | 후보 찾기 | 모듈 선택 · 선택된 모듈 가이드 · Scout 후보 자동 발굴 · 후보 목록 |
| 3 | `analyze` | 분석/증거 | 원스톱 프로세스 · 수동 URL 분석 · 분석 결과 · 증거 패키지 |
| 4 | `review` | 검토 대기열 | Human Review Queue |
| 5 | `report` | 신고서 초안 | 신고서 초안 흐름 안내 · 공식 신고처 빠른 이동 · 검토 대기열로 이동 |
| 6 | `outcome` | 결과 기록 | Outcome Tracker |
| 7 | `guide` | 가이드 | Guide/Q&A · Reward Registry · 모듈별 Practical Guide (아코디언) |
| 8 | `ops` | 운영/품질 | 운영 대시보드 · Eval · Feedback · 보조금/입찰 프로토타입 · Trace · Scheduler |
| 9 | `settings` | 설정 | Settings (Mock/Real · API 연결 · Storage · Approval Gate · Readiness) · Privacy |

뷰 전환은 `data-view-target` 속성이 붙은 어떤 버튼/링크에서든 동작합니다. 현재 뷰는 `localStorage` 와 URL `#hash` 에 저장되어 새로고침해도 유지됩니다.

## 3. Main Workflow

홈 → 후보 찾기 → 분석/증거 → 검토 대기열 → 신고서 초안 → 결과 기록 순서가 좌측 사이드바의 1~6번에 그대로 매핑됩니다. 각 단계는 독립 화면이지만, 홈의 "다음 행동 추천" 카드와 빠른 시작 버튼이 현재 상태에 맞는 화면으로 이동시켜 줍니다.

홈의 KPI/추천은 `GET /api/dashboard/summary` 응답을 기반으로 자동 갱신됩니다.

## 4. Operator Views

운영자 관점 기능은 **운영/품질** 과 **설정** 두 뷰에 모았습니다.

- 운영/품질: 운영 대시보드, Eval Set, Feedback DB 통계, 보조금/입찰 프로토타입 분석, Trace Log, Scheduler
- 설정: Settings (Runtime / API 연결 / Privacy retention / Storage / Safety / Readiness), Privacy 스캔·마스킹

가이드 7번 뷰는 일반 사용자용 안내(Q&A, Reward Registry, 모듈별 Practical Guide) 전용입니다. 모듈별 Practical Guide(False Ad / Counterfeit / Bid Collusion / Subsidy)는 기본 접힘(`<details>` 아코디언)으로 두어 가이드 뷰가 너무 길어지지 않도록 했습니다.

## 5. Safety Notice

- 상단 헤더에 항상 **자동신고 없음** 배지가 표시됩니다.
- 좌측 사이드바 하단에 "공익레이더는 자동 신고를 수행하지 않습니다. 모든 제출은 사람이 공식 창구에서 직접 진행해야 합니다." 문구가 고정 노출됩니다.
- 모든 뷰 하단 푸터에도 동일한 안전 문구가 유지됩니다.
- 홈 뷰의 안전 배너 + 신고서 초안 뷰의 경고 문구 + Outcome Tracker 안내 문구 모두 그대로 유지됩니다.

## 6. Responsive Layout

| breakpoint | 사이드바 | KPI 그리드 | 빠른 시작 |
|---|---|---|---|
| ≥ 1025px | 240px 고정 좌측 | 6열 | 4열 |
| 768~1024px | 헤더 아래 가로 스크롤 탭 | 3열 | 2열 |
| 480~768px | 가로 스크롤 탭 + 헤더 축약 | 2열 | 1열 |
| ≤ 480px | 가로 스크롤 탭 | 1열 | 1열 |

스타일은 `public/styles.css` 의 `/* ---------- App Shell (실전 재점검 10) ---------- */` 블록에 정의되어 있습니다.

## 7. Future Improvements

- 가이드 아코디언을 키보드 접근성(`role="button"`/`aria-expanded`)에 더 친화적으로 보강.
- 신고서 초안 뷰에 Case 선택 드롭다운을 추가해 Case 상세 → 다운로드 흐름을 한 화면에서 처리.
- 운영/품질 뷰를 sub-tab(`/ops/dashboard`, `/ops/eval`, `/ops/trace`) 으로 다시 쪼개기.
- 홈 KPI 카드에 미니 차트(스파크라인) 추가.
- `#hash` 라우팅을 `?view=` 쿼리 라우팅으로 옮길지 검토.
