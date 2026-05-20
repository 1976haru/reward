# UI Workflow (Field-first Redesign)

## 1. Purpose

공익레이더는 신고 분야가 5종(건강기능식품 / 위조상품 / 보조금 / 입찰담합 / 원산지) 으로 늘면서, 이전 워크플로우 중심 좌측 사이드바(홈/후보찾기/분석/검토/신고서/결과/가이드/운영/설정 9버튼)로는 사용자가 "어느 분야의 어느 단계인가"를 한눈에 파악하기 어려웠습니다. 이번 재설계는 **신고분야 → 분야별 단계 워크플로우** 흐름을 메인으로 끌어올립니다. 백엔드 API는 변경하지 않으며, `public/index.html` + `public/app.js` + `public/styles.css` 안에서만 정보 구조를 재배치합니다.

## 2. Views

| 순서 | view | 메뉴 | 주요 기능 |
|---|---|---|---|
| 0 (기본) | `field` | 분야 | 좌측 신고분야 목록 + 중앙 9단계 워크플로우 + 우측 컨텍스트 패널 |
| 1 | `home` | 대시보드 | 오늘 상태 KPI · 다음 행동 추천 · Home/Notice · 공지사항 |
| 2 | `guide` | 가이드 | Q&A · Reward Registry · 모듈별 Practical Guide (아코디언) |
| 3 | `ops` | 운영/품질 | 운영 대시보드 · Eval · Feedback · Trace · Scheduler · 프로토타입 분석 |
| 4 | `settings` | 설정 | Settings · Privacy |
| (보조) | `discover`, `analyze`, `review`, `report`, `outcome` | — | 각 단계 액션 버튼이나 다른 뷰에서 진입 |

기본 진입 뷰는 `field` 입니다. 상단 헤더의 보조 메뉴(분야 / 대시보드 / 가이드 / 운영·품질 / 설정 5개)로 1차 뷰를 전환하며, 신고분야 워크플로우 패널의 액션 버튼(예: "후보 찾기 화면 열기")이 보조 뷰로 진입시킵니다.

## 3. Main Workflow (Field-first)

각 신고 분야는 다음 9단계 워크플로우를 공유합니다.

1. **제도 확인** — 신고처 / 공식 링크 / 필요 증거 / 포상금 보장 없음 안내
2. **후보 찾기** — Scout/Mock 후보 발굴 또는 수동 URL 분석
3. **수집/추출** — 본문 수집 + 텍스트 추출
4. **룰 탐지** — RuleAgent 의심 문구
5. **AI 분석/점수화** — AnalyzerAgent + ScoringAgent
6. **증거 패키지** — HTML/TEXT/Screenshot/PDF/Manifest
7. **신고서 초안** — Markdown/Text/DOCX, 복사·다운로드, 공식 링크
8. **사람 검토** — Review Queue 의 승인/보류/폐기 + 메모
9. **결과 기록** — Outcome Tracker (사용자가 직접 입력)

각 분야의 `enabledStepsCount` 에 따라 가능한 단계 범위가 다릅니다.

- 사용 가능(`false_ad`, `counterfeit_goods`): 1~9 모두 가능
- 프로토타입(`subsidy_fraud`, `bid_collusion`): 1~2 가능, 3~9 비활성
- 준비 중(`origin_labeling`): 1만 가능, 2~9 비활성

단계 진행 상태(현재 단계)는 분야별로 `localStorage` 에 저장됩니다.

## 4. Field Definitions

`public/app.js` 의 `FIELD_DEFINITIONS` 배열에 5종 분야의 메타가 정의됩니다. 각 분야는 다음 필드를 가집니다.

- `id`, `label`, `short`, `statusLabel`, `statusKind` (`available` / `prototype` / `upcoming`)
- `agency`, `description`, `reward`
- `guideViewTarget`, `guideApi`
- `enabledStepsCount`
- `evidence[]` — 컨텍스트 패널 "수집해야 할 자료"
- `reportingChannels[]` — 컨텍스트 패널 "신고처"
- `cautions[]` — 컨텍스트 패널 "주의사항"
- `officialUrl`
- `workflowNote` — 워크스페이스 헤더에 표시되는 분야 소개 문구

## 5. Reporting Channels per Field

| 분야 | 신고처 |
|---|---|
| `false_ad` | 식품의약품안전처 · 국민신문고 · 관할 보건소/지자체 |
| `counterfeit_goods` | 특허청 · 지식재산침해 원스톱 신고상담센터 |
| `subsidy_fraud` | 국민권익위원회·청렴포털 · 국민신문고 · 보조금 관리기관/관할 지자체 감사부서 |
| `bid_collusion` | 공정거래위원회 (신고포상금/담합 신고) · 국민신문고 |
| `origin_labeling` | 국립농산물품질관리원 · 관세청 · 관할 지자체 (준비 중) |

## 6. Safety Notice

- 상단 헤더의 `자동신고 없음` 배지는 항상 노출됩니다.
- 분야 뷰 하단의 `field-shell-note` 가 "공익레이더는 자동 신고를 수행하지 않습니다. 모든 신고 제출은 사람이 공식 창구에서 직접 진행합니다." 를 고정 표시합니다.
- 각 단계 패널 하단의 `step-panel-safety` 가 같은 안전 안내를 단계별로 반복 표시합니다.
- 우측 컨텍스트 패널의 `context-card-safety` 가 분야별 안전 안내를 표시합니다.

## 7. Responsive Layout

| breakpoint | 필드 사이드바 | 워크스페이스 / 컨텍스트 | 워크플로우 stepper |
|---|---|---|---|
| ≥ 1201px | 좌측 280px 고정 | 1fr / 320px | 가로 |
| 900~1200px | 좌측 260px | workspace 1fr, 컨텍스트 카드는 workspace 아래로 이동 | 가로 |
| 600~900px | 상단 가로 스크롤 카드 | 1열 | 가로 (overflow-x) |
| ≤ 600px | 상단 가로 스크롤 카드 | 1열 | 세로 |

스타일은 `public/styles.css` 의 `/* ---------- Field-first layout (실전 재점검 11) ---------- */` 블록에 정의되어 있습니다.

## 8. Migration Notes

이전 좌측 사이드바(워크플로우 9버튼)는 제거되었습니다. 이전 뷰(home/discover/analyze/review/report/outcome/guide/ops/settings) 9개는 모두 그대로 존재하며, 다음 두 경로로 접근할 수 있습니다.

1. 상단 보조 메뉴 5버튼 (분야 / 대시보드 / 가이드 / 운영·품질 / 설정) — 직접 진입
2. 분야 워크스페이스의 단계 액션 버튼 (`data-view-target="<view>"`) — 분야 워크플로우 진행 중 진입

기존 API와 모든 기존 id 는 그대로 유지되어 app.js 의 핸들러들이 깨지지 않습니다.

## 9. Future Improvements

- 분야 워크스페이스 단계 패널이 현재는 안내 + 액션 버튼 중심. 향후 각 단계의 결과 요약(예: 후보 수, 룰 매치 수)을 단계 패널 안에서도 보여주기.
- 분야 사이드바 카드에 "오늘 후보 수 / Case 수" 미니 카운터 추가 (현재 `state.dashboard.summary` 와 결합 필요).
- 단계 완료 체크를 사용자 수동이 아니라 실제 데이터 상태(분석 완료/증거 패키지 생성/Case 상태 등)와 연동.
- 컨텍스트 패널에 분야별 "현재 단계 권장 조치" 자동 생성 로직.
- 모바일 분야 카드 가로 스크롤에 스냅(scroll-snap) 적용.
