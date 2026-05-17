# Reward Agent MVP

이 프로젝트는 "포상금 자동화 프로그램"이 아니라 **공개자료 기반 신고 후보 탐지·증거정리·신고서 초안 생성 도구**입니다.
사용자가 입력한 공개 URL을 수집·분석해 의심 문구를 추출하고 증거를 정리하며 신고서 초안을 만듭니다. 실제 신고 제출은 사람이 직접 수행합니다.

## Quick Start for Windows PowerShell

처음 클론한 사람을 위한 최소 실행 절차입니다. (Node.js 18 이상, PowerShell 기준)

```powershell
# 1) 저장소 클론
git clone https://github.com/1976haru/reward.git

# 2) 프로젝트 폴더로 이동
cd reward

# 3) 의존성 설치
npm install

# 4) .env.example을 .env로 복사
Copy-Item .env.example .env

# 5) .env 파일을 열어 PORT=3001 인지 확인 (기본값)
notepad .env

# 6) Playwright 브라우저 설치 (스크린샷/PDF 생성용)
npm run playwright:install

# 7) 타입 체크 및 빌드
npm run build

# 8) 스모크 테스트 실행
npm run test

# 9) 개발 서버 실행 (포트 3001)
npm run dev

# 10) 브라우저로 접속
#     http://localhost:3001
```

macOS/Linux 사용자는 5번을 `cp .env.example .env`, 6번 이하 동일하게 진행하세요.

### Verification

서버가 정상이라면 다음 응답을 받습니다.

```powershell
curl http://localhost:3001/api/health
# → { "ok": true, "service": "reward-agent-mvp", "module": "false_ad",
#     "category": "health_functional_food", "environment": "development",
#     "port": 3001, "mockAi": true, "timestamp": "..." }

curl http://localhost:3001/api/cases
# → []  (처음에는 빈 배열)
```

## 핵심 원칙

- 공개 웹페이지와 사용자가 직접 입력한 URL만 분석합니다.
- 자동 신고 기능은 제공하지 않습니다. 모든 신고는 사람이 검토한 뒤 외부 신고기관에 직접 제출합니다.
- 개인정보, 비공개 자료, 로그인 우회, 약관 위반 크롤링은 수행하지 않습니다.
- 현재 사용 가능 모듈: **건강기능식품 온라인 허위·과대광고 탐지**. 식품·화장품·의료기기 전체를 한 번에 다루지 않으며, 건강기능식품 모듈이 안정화된 뒤 동일 패턴으로 카테고리를 확장합니다.

## MVP Scope

The first MVP module focuses on detecting potentially misleading online advertisements for health functional foods from publicly accessible URLs.
This project currently does not attempt to cover all reporting or bounty categories.
The first module is intentionally limited to health functional food advertising so that the collection, detection, analysis, evidence, and human review workflow can be completed safely before expanding to other modules.

See [`mvp_scope.md`](./mvp_scope.md) for the detailed MVP scope and keyword set.

## Analyzer Agent (LLM 판정)

RuleAgent가 탐지한 의심 표현과 TextExtractor 결과를 LLM이 문맥상 재검토해 **신고 후보 검토 의견**(`AnalysisResult`)을 만듭니다. **법 위반 확정·포상금 보장·신고처 확정은 하지 않습니다.**

- 프롬프트: [`src/modules/false-ad/analysis_prompt.md`](./src/modules/false-ad/analysis_prompt.md)
- 스키마: [`src/modules/false-ad/analysis_schema.json`](./src/modules/false-ad/analysis_schema.json)
- API: `POST /api/analyze/llm` (mock 가능, MOCK_AI=true가 기본)
- `OPENAI_MODEL` / `LLM_TEMPERATURE` env로 모델·온도 조정
- 출력은 항상 `notLegalConclusion:true`, `rewardGuaranteed:false`로 강제 (`validateAnalysisResult`가 금지 표현 sanitize)

자세한 설계·검증 정책은 [`docs/analyzer_agent.md`](./docs/analyzer_agent.md) 참고.

## Rule Agent

`src/modules/false-ad/keywords.json`을 기반으로 건강기능식품 허위·과대광고 의심 문구를 탐지합니다. 결과는 **검토 필요한 후보**이며, **법 위반 여부를 확정하지 않습니다.**

탐지 카테고리:

- 질병 치료·완치·예방 단정 표현 (HIGH × 20)
- 의약품 대체·과장 효능 단정 표현 (MEDIUM × 20)
- 마케팅성 모호 표현 (LOW × 10)
- 질병+치료 조합, 의약품 대체, 즉시 효과 등 combo/regex (4)

API:

- `GET /api/rules/false_ad`
- `POST /api/detect/rules`

OrchestratorAgent는 `TextExtractor`의 `claimCandidates → reviewCandidates → mainText` 순으로 RuleAgent에 입력합니다 — 광고 문구가 우선 분석됩니다.

자세한 설계·점수 정책은 [`docs/rule_agent.md`](./docs/rule_agent.md), 룰셋은 [`src/modules/false-ad/keywords.json`](./src/modules/false-ad/keywords.json) 참고.

## Text Extractor

수집된 HTML에서 광고 문구, 후기, 성분, 섭취방법, 주의사항, 판매자 정보를 분리해 구조화합니다. 본 모듈은 법 위반 여부를 단독으로 판단하지 않으며, RuleAgent·AnalyzerAgent·증거 검토·사람 검토의 입력 자료를 만듭니다.

- 끝점: `POST /api/extract` (`{html, url?, title?, moduleId?}`)
- 동작: cheerio 기반 boilerplate 제거 → claim/review/ingredient/usage/warning/seller 후보 분리 → PII 마스킹
- 분석 파이프라인 연결: `OrchestratorAgent`가 추출 결과를 우선 활용, 실패 시 기존 `doc.text`로 폴백
- 증거 metadata.json에 추출 요약(productName, priceCandidates, 카테고리 카운트, textLength, warnings) 자동 기록

자세한 명세는 [`docs/text_extractor.md`](./docs/text_extractor.md)를 참고하세요.

## Candidate Discovery

사용자가 URL을 직접 찾지 않아도 **모듈 + 탐색 주제**를 고르면 시스템이 공개 자료 기반으로 신고 후보 URL을 발굴합니다. 이후 사용자가 후보를 선택하면 본문 수집·분석·Case 생성이 진행됩니다.

- 흐름: 모듈 → 주제 → `POST /api/discovery/candidates` → 1차 점수화 → `POST /api/discovery/candidates/:id/analyze` → 사람 검토
- 어댑터: `MOCK_DISCOVERY=true`(기본, RFC 6761 예약 도메인 mock) / SearchApiDiscovery placeholder
- 수동 URL: `POST /api/discovery/manual` 또는 기존 `POST /api/cases/analyze` 그대로 사용 가능
- 안전 정책: 대량 크롤링·로그인 우회·CAPTCHA 우회·HTML 스크래핑 금지

자세한 명세는 [`docs/candidate_discovery.md`](./docs/candidate_discovery.md)를 참고하세요.

## Evidence Storage

Evidence files are stored per case under:

`data/evidence/{caseId}/`

Standard files:

- `page.html` — 수집된 원본 HTML
- `page.txt` — 본문 텍스트 추출본
- `screenshot.png` — Playwright 전체 페이지 캡처
- `page.pdf` — Playwright PDF 저장본
- `metadata.json` — Case 연결 정보, 원본 URL, 수집·캡처 시각
- `manifest.json` — 파일 목록 + SHA-256 해시 + 캡처 성공/실패 상태

각 파일은 SHA-256 해시가 manifest에 기록됩니다.
실제 증거 파일은 로컬 산출물이며 **Git에 커밋되지 않습니다** (`.gitkeep`만 추적).

API:

- `GET /api/cases/:id/evidence` — manifest 조회
- `GET /api/cases/:id/evidence/:fileName` — 개별 파일 다운로드 (파일명 allowlist 강제)
- `POST /api/cases/:id/evidence/capture` — 공개 URL을 수집해 evidence 저장 (자동 신고 아님)

자세한 정책·트러블슈팅은 [`docs/evidence_storage.md`](./docs/evidence_storage.md)를 참고하세요.

## Case API

분석 결과를 **사건 Case** 단위로 관리합니다. 자동 신고가 아니라 사람 검토용 흐름입니다.

- 라이프사이클: `DRAFT → REVIEW → APPROVED → SUBMITTED` (`SUBMITTED`는 사용자가 외부 신고기관에 **직접 제출 후 수동 기록**)
- 끝점: `GET/POST /api/cases`, `GET/PATCH /api/cases/:id`, `PATCH /api/cases/:id/status`, `POST /api/cases/:id/reviews`
- 저장소: 파일 기반 `JsonCaseRepository` (기본). `USE_DB=true` 도입은 다음 단계 (현재는 JSON 폴백)

자세한 API 명세·예시·전이 규칙은 [`docs/case_api.md`](./docs/case_api.md)를 참고하세요.

## Module Registry

Modules are registered through a central registry. Runtime dynamic loading is intentionally not supported — modules are added by editing `src/modules/index.ts`.

Current active module:

- `false_ad`: health functional food online false/misleading ad detection

Planned modules (registered but not executable):

- `counterfeit_goods`
- `origin_labeling`
- `subsidy_fraud`
- `bid_collusion`

API:

- `GET /api/modules`
- `GET /api/modules/:moduleId`
- `POST /api/cases/analyze` — gated by registry; planned modules return `MODULE_NOT_READY`

See [`docs/module_registry.md`](./docs/module_registry.md) for details.

## Agency and Reward Basis

The first MVP uses a module-level agency configuration file for reporting guidance.

- Module agency config: [`src/modules/false-ad/agency_config.json`](./src/modules/false-ad/agency_config.json)
- Research note: [`docs/agency_research.md`](./docs/agency_research.md)
- Config schema: [`docs/agency_config_schema.md`](./docs/agency_config_schema.md)

The system only provides candidate agency guidance and evidence organization.
It does not guarantee that a report will be accepted or that a reward will be paid.
Official laws, agency guidance, and reward rules must be reviewed before any external report is submitted.

## Product Scope & Safety Policy

이 도구의 사용 범위, 금지 범위, 사람 검토 원칙, 증거 패키지 기준, AI 한계, 모듈 확장 정책은 [`scope.md`](./scope.md) 문서에 정의되어 있습니다.

핵심 요약:

- **자동 신고 금지**: 외부 신고기관 자동 제출, 자동 민원 제출, 자동 로그인 신고 기능은 만들지 않습니다.
- **공개자료만 수집**: 비공개·로그인 필요·우회 수집 대상은 다루지 않습니다.
- **사람 최종 검토 필수**: AI 분석 결과는 참고자료이며, 최종 신고 여부는 사람이 판단합니다.
- **단정 표현 금지**: 특정 개인·사업자를 위법자로 단정하지 않습니다.
- **책임 사용자**: 신고 여부와 내용에 대한 책임은 본 도구 사용자에게 있습니다.

새 모듈을 추가할 때도 동일한 정책이 적용됩니다. 자세한 내용은 [`scope.md`](./scope.md)를 반드시 확인하세요.

## UI 구성

웹 UI는 다음 영역으로 구성됩니다 (`public/index.html`, `public/styles.css`, `public/app.js`).

1. 히어로 — 제품 정의와 자동 신고 금지·사람 검토 필수 안내
2. 신고 분야 선택 — 모듈 카드 (현재 사용 가능: **건강기능식품 온라인 허위·과대광고 탐지** / 일반 식품·화장품·의료기기·기타 모듈은 준비 중)
3. 선택 모듈 가이드 — 탐지 예시, 신고처, 필요 증거, 포상금 안내, 주의사항
4. 원스톱 프로세스 바 — 자료수집 → 규칙탐지 → AI분석 → 위험평가 → 증거저장 → 신고서초안 → 사람검토
5. 공개 URL 분석 입력 — 입력 전 주의사항 노출
6. 분석 결과 — 위험도/등급, AI 요약, 탐지 문구, 신고기관 후보, 포상금 안내, 다음 행동 추천
7. 증거 패키지 — 원본 URL, 수집일시, 캡처/PDF/텍스트/신고서 초안 보유 여부
8. 최근 케이스 — 모듈명, 위험도, 상태(Draft/Review/Approved/Submitted/Rejected), 신고처, 상세보기

백엔드 API(`/api/cases`, `/api/cases/analyze`, `/api/cases/:id`)는 변경하지 않았습니다.

## Project Structure

```text
src/
  agents/          오케스트레이터·수집·규칙·점수화·AI 분석·정책 에이전트
  modules/
    false-ad/      건강기능식품 허위·과대광고 탐지 룰과 agency_config.json
  services/        CaseRepository, EvidenceService, ReportService (현재 Repository 클래스도 여기 위치)
  scripts/         smoke-test 등 단발성 스크립트
  types/           공통 타입 정의
  utils/           config, fs 헬퍼
public/            단순 정적 웹 UI (index.html, styles.css, app.js)
docs/              운영·정책 문서 (agency_research.md, agency_config_schema.md, setup_checklist.md)
data/              로컬 산출물 — .gitkeep 외에는 커밋되지 않음
  cases/           Case JSON
  evidence/        스크린샷·PDF·HTML·TXT
  reports/         신고서 초안 (Markdown)
  raw/             기타 원자료
dist/              tsc 빌드 산출물 (gitignored)
```

리포지토리 패턴 클래스를 별도 폴더(`src/repositories/`)로 분리할 계획이 있지만, 현재 MVP에서는 단일 `CaseRepository`만 존재해 `services/` 안에 둡니다. 클래스가 늘어나면 분리합니다.

## Scripts

| 명령 | 설명 |
|---|---|
| `npm run dev` | tsx watch로 개발 서버 실행 (포트 3001, .ts 직접 실행, 파일 변경 시 자동 재시작) |
| `npm run build` | TypeScript 컴파일 (`tsc -p tsconfig.json`) → `dist/` 생성 |
| `npm run test` | 스모크 테스트 실행 (룰 탐지·점수 범위·agency_config 검증) |
| `npm run check` | `build` + `test`를 순서대로 실행 (CI/사전 점검용) |
| `npm start` | `node dist/server.js`로 빌드 산출물 실행 (운영 시) |
| `npm run playwright:install` | Playwright 크로미움 브라우저 설치 (스크린샷/PDF 캡처에 필요) |

## Environment Variables

`.env.example`을 `.env`로 복사한 뒤 값을 채워 사용합니다. `.env`는 절대 커밋하지 않습니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3001` | Express 서버 포트 |
| `MOCK_AI` | `true` | `true`면 OpenAI를 호출하지 않고 룰 기반 mock 분석으로 동작 |
| `OPENAI_API_KEY` | (없음) | `MOCK_AI=false`일 때만 사용 |
| `AI_MODEL` | `gpt-4.1-mini` | OpenAI 모델명 (실제 호출 시) |
| `DATA_DIR` | `./data` | 데이터 루트 |
| `EVIDENCE_DIR` | `${DATA_DIR}/evidence` | 증거 패키지 저장 경로 |
| `REPORTS_DIR` | `${DATA_DIR}/reports` | 신고서 초안 저장 경로 |

## Troubleshooting

문제가 생기면 순서대로 확인하세요.

| 증상 | 확인할 것 |
|---|---|
| `npm install` 실패 | Node.js 18 이상인지 (`node -v`), 회사·학교 네트워크 프록시 차단 여부 |
| `npm run dev` 시 포트 사용 중 | `.env`의 `PORT` 변경 또는 `Get-NetTCPConnection -LocalPort 3001`로 점유 프로세스 확인 |
| Playwright 캡처 실패 | `npm run playwright:install` 재실행, Windows Defender·사내 백신이 chromium 실행 차단 여부 |
| `/api/health`가 안 뜸 | 서버 콘솔의 에러, 다른 프로세스가 3001 점유 여부 |
| 분석 결과 AI 요약이 비어 있음 | `MOCK_AI=true` 상태로 동작 중인지 (.env 확인). 실제 모델 호출은 `MOCK_AI=false` + 유효한 `OPENAI_API_KEY` 필요 |
| `data/`에 파일이 안 생김 | 폴더 권한, 디스크 여유 공간 |
| 빌드 시 import 경로 에러 | `tsconfig.json`의 `module: NodeNext` 유지, `.js` 확장자 import 유지 |

## Safety Notes

- 이 도구는 **자동 신고 프로그램이 아닙니다.** 외부 신고기관 자동 제출·자동 로그인·자동 민원 기능을 제공하지 않습니다.
- **포상금 수령을 보장하지 않습니다.** 모든 포상·보상 가능성은 공식 규정 확인이 필요합니다.
- **공개자료만** 분석합니다. 비공개 페이지·로그인 우회·개인정보 수집은 금지됩니다.
- AI 분석은 참고용이며, **최종 신고 여부는 사람이 판단**합니다.
- 자세한 정책은 [`scope.md`](./scope.md), [`mvp_scope.md`](./mvp_scope.md), [`docs/agency_research.md`](./docs/agency_research.md)를 참고하세요.

## Claude Code 작업 방식

1. 이 ZIP을 GitHub에 업로드합니다.
2. 엑셀 체크리스트의 순번대로 Claude Code에게 점검시킵니다.
3. 각 단계가 끝나면 `npm run build`, `npm run test`, 실제 URL 분석으로 검증합니다.
