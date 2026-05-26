# 공익레이더

**공개자료 기반 신고 후보 탐지·증거정리·신고서 초안 생성 도구.**

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)

공익레이더는 "포상금 자동화 프로그램"이 아닙니다. 사용자가 입력한 공개 URL을 수집·분석해 의심 문구를 추출하고 증거를 정리하며, 사람이 검토할 수 있는 신고서 초안을 생성합니다. 자동 신고는 수행하지 않으며, 실제 신고 제출은 사람이 공식 창구에서 직접 수행합니다. 포상금 수령을 보장하지 않습니다.

> **현재 1차 실전 MVP:** 건강기능식품 온라인 허위·과대광고 탐지
>
> **개발 순서:** 건강기능식품 → 일반식품 → 화장품 → 의료기기 → 위조상품 → 원산지 → 보조금 → 입찰담합
>
> 보조금·입찰담합은 삭제하지 않고 **후순위 고급 모듈/프로토타입**으로 유지하며, 실데이터 준비 후 진행합니다.

## 제품 목표 (Product Goal)

공익레이더는 **신고 보상형 의심사례 탐지 보조 시스템**입니다.
**정보검색 서비스가 아닙니다.** 단순히 URL이나 키워드를 검색해 결과를 보여주는 도구가 아니라, 공개자료를 바탕으로 **의심사례를 탐지하고, 증거 패키지를 구성하며, 신고서 초안을 만들고, 사람 검토를 거쳐, 신고 후 결과까지 추적**하도록 설계된 업무 도구입니다.

핵심 업무 흐름은 다음과 같습니다.

1. **AI가 의심사례 탐지** — 공개 URL/공개 공공데이터에서 위반 의심 후보를 추출
2. **증거 패키지 구성** — 원본 HTML / 텍스트 / 스크린샷 / PDF / 메타데이터 / SHA-256 해시 manifest 저장
3. **신고서 초안 생성** — 모듈별 템플릿으로 중립적 표현의 초안 자동 작성 (단정 표현 자동 sanitize)
4. **사람이 최종 검토** — Review Queue에서 승인/보류/반려/메모 가능, 사람 검토 없이는 다음 단계로 진행 불가
5. **신고 후 결과 추적** — 사람이 공식 창구에 직접 제출한 뒤 접수번호·처리상태·결과를 Outcome Tracker에 기록

설계 원칙(자세한 정책은 [`docs/OPERATING_POLICY.md`](./docs/OPERATING_POLICY.md), [`docs/PRD.md`](./docs/PRD.md), [`docs/LEGAL_REVIEW.md`](./docs/LEGAL_REVIEW.md), [`docs/approval_gate.md`](./docs/approval_gate.md), [`docs/REPORT_LANGUAGE_GUIDE.md`](./docs/REPORT_LANGUAGE_GUIDE.md), [`scope.md`](./scope.md) 참고):

- **자동 신고 금지** — 외부 신고기관 자동 제출, 신고기관 자동 로그인, 공식 신고 양식 자동입력, 포상금 자동신청, 사람 검토 없는 신고 상태 전환을 금지합니다. 코드/UI/문서/정적 검사 4중 차단([`docs/approval_gate.md`](./docs/approval_gate.md)).
- **사람 검토·승인 필수** — AI 결과는 참고자료이며, 신고서 초안은 사람 검토를 거치고 사람이 명시적으로 승인(`human_approved`)해야 다음 단계로 갑니다.
- **신고 전 사실관계 점검 필수** — `human_approved` 전이에는 **공개자료 여부 / 원문 URL / 금액 / 기간 / 수급기관 / 사업명 / 의심근거 / 반대 가능성 / 개인정보 점검 / 단정 표현 점검 / 증거 패키지** 11개 항목을 사람이 확인해야 합니다. 점검표 항목과 데이터 구조는 [`docs/PRE_SUBMISSION_FACT_CHECKLIST.md`](./docs/PRE_SUBMISSION_FACT_CHECKLIST.md), 게이트 강제는 [`src/policy/factCheckGate.ts`](./src/policy/factCheckGate.ts) (`requireFactCheckBeforeApproval`), 테스트는 `npm run test:fact-check` 입니다. 검토자 승인 없이는 신고서 확정 불가.
- **신고서 초안 ≠ 실제 신고 제출** — 초안 생성·증거 패키지 생성은 신고가 아닙니다. 사람이 외부 공식 창구에 직접 제출한 뒤 **접수번호(`externalReceiptNo`)를 입력**해야 `manually_submitted` 로 기록됩니다.
- **승인 로그 필수** — 모든 검토 결정은 `caseId / reviewer / decision / reason / evidencePackageId / draftReportId / reviewedAt` 가 포함된 승인 로그를 남깁니다.
- **증거 기반 신고 원칙** — 의심사례는 항상 원본 URL, 수집일시, 캡처/PDF, 추출 텍스트, 해시 manifest 등 추적 가능한 증거와 함께 정리됩니다.
- **단정·비방 표현 금지 / 중립 표현 사용** — 본 시스템은 **위법 여부를 확정하지 않습니다.** 단정·낙인 표현 대신 "의심 신호 / 검토 필요 후보 / 위험 신호 / 추정 / 가능성" 같은 중립 표현만 사용합니다. 금지/권장 표현표는 [`docs/REPORT_LANGUAGE_GUIDE.md`](./docs/REPORT_LANGUAGE_GUIDE.md) 참고, 강제 수단은 `npm run check:language` / `npm run test:language`.
- **공개자료 중심 분석 / 개인정보 최소수집** — 본 시스템은 공개자료(공시 / 공공데이터 / 공개 사업 공고) 중심으로 분석하며, 주민번호 / 계좌번호 / 휴대폰 / 이메일 / 상세주소 / 민감정보 등 **불필요한 개인정보는 수집·저장하지 않습니다.** 입력에 포함된 경우 저장 전 마스킹되거나 차단됩니다 (`src/policy/privacyGuard.ts` 의 `sanitizeForStorage` / `sanitizeForAI` / `assertNoForbiddenPersonalData`). 처리 기준은 [`docs/privacy_policy.md`](./docs/privacy_policy.md), 강제 수단은 `npm run check:privacy` / `npm run test:privacy`.
- **법률 자문 대체 아님** — 본 프로젝트는 **법률 자문을 대체하지 않으며, 보상금·포상금 지급을 보장하지 않습니다.** 공식 기준은 [국가법령정보센터](https://www.law.go.kr) 와 각 신고기관 공식 페이지에서 직접 확인해야 합니다. 내부 운영 기준 상세는 [`docs/LEGAL_REVIEW.md`](./docs/LEGAL_REVIEW.md) 참고.

## Quick Start for Windows PowerShell

처음 클론한 사람을 위한 최소 실행 절차입니다. **Node.js 18 이상**이 필요하며, 처음 실행은 `MOCK_AI=true` 기본값으로 실제 API 키 없이 진행합니다.

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
# PORT=3001, MOCK_AI=true 확인

# 6) 타입 체크 및 빌드
npm run build

# 7) 스모크 테스트 실행
npm run test

# 8) 개발 서버 실행 (포트 3001)
npm run dev

# 9) 브라우저로 접속
#     http://localhost:3001
```

macOS/Linux 사용자는 4번을 `cp .env.example .env`로 실행하고 나머지는 동일하게 진행하세요.

기본 `.env.example`은 `EVIDENCE_ENABLE_SCREENSHOT=false`, `EVIDENCE_ENABLE_PDF=false`로 제공됩니다. 따라서 Playwright 설치 전에도 최소 실행 절차를 확인할 수 있습니다. 스크린샷/PDF 증거 저장을 사용할 PC에서는 처음 한 번 `npm run playwright:install`을 실행하고, 실제 수동 캡처 테스트 중에만 두 값을 `true`로 변경합니다.

상세한 처음 실행 안내와 오류 해결은 [`docs/local_setup.md`](./docs/local_setup.md)를 참고하세요.

## Quick Start (Local — 한 줄 요약)

```bash
git clone https://github.com/1976haru/reward.git && cd reward
npm install
cp .env.example .env           # Windows: Copy-Item .env.example .env
npm run dev                    # → http://localhost:3001
```

또는 OS별 원클릭 스크립트:

```bash
# Windows PowerShell
.\scripts\dev.ps1              # 개발 모드 (자동 재시작)
.\scripts\start-local.ps1      # 빌드 + 프로덕션

# Linux / macOS
./scripts/dev.sh
./scripts/start-local.sh
```

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose up --build      # 빌드 + 실행 (포트 3001)
docker compose logs -f app     # 로그 확인 (Ctrl+C)
docker compose down            # 중지 — ./data 는 유지됨
```

Docker 이미지는 `.env` 와 `data/` 산출물을 포함하지 않습니다. `./data` 는 호스트와 볼륨 마운트되어 컨테이너 재시작에도 데이터가 유지됩니다. Playwright 캡처(스크린샷/PDF)는 Docker 기본 비활성 — HTML/TEXT/Report 중심으로 동작합니다.

## Health Check

```bash
curl http://localhost:3001/api/health
# → { "ok": true, "service": "reward-agent-mvp", "port": 3001, ... }

npm run health                 # PORT env 자동 인식, 종료 코드 0/1
```

## Data Directory

`./data/` 하위 모든 산출물(cases / evidence / reports / raw / candidates / scheduler / dedupe / feedback / eval/runs / traces)은 **GitHub 에 올라가지 않습니다.** `.gitkeep` 만 추적됩니다. Docker compose 는 `./data` 를 컨테이너 `/app/data` 에 바인드 마운트합니다.

분석 결과, 증거 파일, 신고서 초안, 접수번호·처리결과 기록은 민감한 내용을 포함할 수 있는 로컬 산출물입니다. `.env`에는 API 키가 들어갈 수 있으므로 절대 커밋하지 않습니다. 실행 후 `git status --ignored`로 제외 상태를 확인하고, staged 목록에 산출물이 보이면 커밋 전에 반드시 제거합니다. 자세한 확인 명령은 [`docs/data_policy.md`](./docs/data_policy.md)를 참고하세요.

## Playwright 증거 캡처 준비

- Playwright는 스크린샷과 PDF 증거를 `data/evidence/{caseId}/`에 저장하기 위해 필요합니다.
- 캡처를 사용할 PC에서는 처음 한 번 `npm run playwright:install`을 실행해 Chromium을 설치합니다.
- 안전한 기본값은 `EVIDENCE_ENABLE_SCREENSHOT=false`, `EVIDENCE_ENABLE_PDF=false`입니다.
- 실제 캡처 확인 시에만 `.env`에서 두 값을 `true`로 변경합니다.
- 로그인 없는 공개 테스트 URL 1개로만 수동 확인하며, 대량 캡처나 자동 수집은 하지 않습니다.
- 생성된 `data/evidence/{caseId}/` 산출물은 로컬 확인용이며 GitHub에 올리지 않습니다.

수동 캡처 확인 순서는 [`docs/local_setup.md`](./docs/local_setup.md#playwright-캡처-준비-확인)를 참고하세요.

## Deployment Guide

상세 가이드: [`docs/deployment_guide.md`](./docs/deployment_guide.md) — Local / Docker / Health / Data / Troubleshooting / Server Notes / Safety.

## GitHub 저장소 기준

- 현재 기준 원격 저장소: `https://github.com/1976haru/reward`
- 현재 기준 브랜치: `master`
- `1976haru/public`은 GitHub 저장소 정보상 빈 저장소로 보이지만, 이번 단계에서는 원격 변경이나 이전 push를 수행하지 않습니다.
- 안전한 확인·동기화·향후 public 배포 검토 절차: [`docs/github_sync_plan.md`](./docs/github_sync_plan.md)

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
- 현재 사용 가능 모듈: **건강기능식품 온라인 허위·과대광고 탐지**(1차 MVP). 식품·화장품·의료기기 전체를 한 번에 다루지 않으며, 건강기능식품 모듈이 안정화된 뒤 동일 패턴으로 카테고리를 확장합니다.
- 2차 쉬운 확장: **일반식품 온라인 허위·과대광고 탐지**(`general_food_false_ad`) — 스코프 문서 [`docs/general_food_false_ad_scope.md`](./docs/general_food_false_ad_scope.md), 키워드 룰셋, 신고서 템플릿이 준비되었습니다. 건강기능식품 1차 MVP를 대체하지 않습니다.
- 3차 쉬운 확장: **화장품 온라인 허위·과대광고 탐지**(`cosmetic_false_ad`) — 스코프 문서 [`docs/cosmetic_false_ad_scope.md`](./docs/cosmetic_false_ad_scope.md), 키워드 룰셋, 신고서 템플릿이 준비되었습니다. 건강기능식품·일반식품 모듈을 대체하지 않습니다.
- 후속 쉬운 확장: **의료기기 온라인 허위·과대광고 탐지**(`medical_device_false_ad`) — 스코프 문서 [`docs/medical_device_false_ad_scope.md`](./docs/medical_device_false_ad_scope.md), 키워드 룰셋, 신고서 템플릿이 준비되었습니다. 건강기능식품·일반식품·화장품 모듈을 대체하지 않습니다.
- 후속 쉬운 확장: **위조상품 온라인 판매 의심 탐지**(`counterfeit_goods`) — 스코프 문서 [`docs/counterfeit_goods_online_sale_scope.md`](./docs/counterfeit_goods_online_sale_scope.md), 키워드 룰셋, 신고서 템플릿이 준비되었습니다. 위조 여부를 확정하지 않고 공개 판매글의 의심 신호를 검토 후보로 탐지하며, 앞선 모듈을 대체하지 않습니다.
- 후속 쉬운 확장: **원산지 표시 위반 의심 탐지**(`origin_labeling`) — 스코프 문서 [`docs/origin_labeling_violation_scope.md`](./docs/origin_labeling_violation_scope.md)와 키워드 룰셋이 준비되었습니다. 원산지 표시 위반을 확정하지 않고 공개 판매글의 표시 불일치·누락 의심 신호를 검토 후보로 탐지하며, 앞선 모듈을 대체하지 않습니다. 신고서 템플릿·agency_config·샘플 E2E 테스트는 다음 단계입니다.
- 모든 모듈의 완료 기준: 공개자료 입력부터 사용자 직접 제출 및 접수번호·처리결과 수동 기록까지의 공통 흐름은 [`docs/roadmap_easy_first.md`](./docs/roadmap_easy_first.md)를 따릅니다.

## MVP Scope

The first MVP module focuses on detecting potentially misleading online advertisements for health functional foods from publicly accessible URLs.
This project currently does not attempt to cover all reporting or bounty categories.
The first module is intentionally limited to health functional food advertising so that the collection, detection, analysis, evidence, and human review workflow can be completed safely before expanding to other modules.

See [`mvp_scope.md`](./mvp_scope.md) for the detailed MVP scope and keyword set.
See [`docs/roadmap_easy_first.md`](./docs/roadmap_easy_first.md) for the easy-first roadmap and the completion definition shared by every module.

## Scoring Agent (신고 후보 우선순위)

RuleAgent · AnalyzerAgent · TextExtractor · Evidence · Discovery 결과를 종합해 **신고 후보 우선순위 점수**(0~100)를 계산합니다.

> **이 점수는 법 위반 확정이나 포상금 지급 가능성을 의미하지 않습니다. 사람이 먼저 검토할 후보의 우선순위를 정하기 위한 참고 점수입니다.**

구성요소(총 100점):

- 금지표현/의심표현 강도 (40) · AI 문맥 판단 (20) · 증거 완성도 (15) · 판매 활성도/상업성 (10) · 반복성/패턴성 (10) · 수집·추출 품질 (5)

등급: 0~29 낮음 · 30~59 검토 필요 · 60~79 우선 검토 · 80~100 최우선 검토

API: `POST /api/score` (단독 호출), `RewardCase.scoringResult` (기존 `/api/cases/analyze` 응답에 자동 포함)

자세한 설계는 [`docs/scoring_agent.md`](./docs/scoring_agent.md) 참고.

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

## Dedupe Engine

같은 URL/상품을 반복 분석하지 않도록 중복을 제거합니다.

- URL canonicalize + 트래킹 파라미터 제거 (`utm_*`, `fbclid`, `gclid` 등)
- canonical URL SHA-256 hash
- 한국어 친화 Jaccard+Dice 제목 유사도 (외부 라이브러리 없음)
- 본문 SHA-256 hash
- Scout discover 시 자동 dedupe 후 저장 + `data/dedupe/latest-report.json` 기록
- Case 생성 시 같은 canonical URL의 기존 Case가 있으면 응답 `warnings[]`에 안내 (생성은 막지 않음)

API:

- `GET /api/dedupe/canonicalize?url=`
- `POST /api/dedupe/check`
- `POST /api/dedupe/batch`
- `GET /api/dedupe/report`

> 중복 제거는 분석 효율을 위한 보조 기능이며, 애매한 유사 후보는 사람이 확인해야 합니다. 기존 Case를 자동 삭제하지 않습니다.

자세한 명세는 [`docs/dedupe_engine.md`](./docs/dedupe_engine.md).

## Scheduler

`node-cron` 기반 정기 후보 수집 스케줄러입니다. 후보 발굴만 수행하며 **외부 신고기관에 자동 제출하지 않습니다.**

- `SCHEDULER_ENABLED=true`일 때만 cron 등록 (기본 false, 안전한 opt-in)
- 테스트 환경(`NODE_ENV=test`)에서는 자동 시작하지 않음
- 재시도 + 중복 실행 방지 + 수동 트리거 (`POST /api/scheduler/run-once`)
- 실행 기록은 `data/scheduler/runs.json` (gitignored)
- 향후 BullMQ/Redis 전환은 옵션 — 현재 MVP는 단일 서버 in-process

API:

- `GET /api/scheduler/status`
- `GET /api/scheduler/runs?limit=N`
- `POST /api/scheduler/run-once`

자세한 명세는 [`docs/scheduler.md`](./docs/scheduler.md).

## Feedback DB (검토 피드백)

검토자가 AI 후보를 **승인/보류/폐기/오탐**으로 분류한 사유를 누적해 룰/프롬프트/점수 개선의 근거로 쓰는 내부 저장소입니다. **자동으로 룰/프롬프트/점수를 변경하지 않으며**, 모든 변경은 사람이 별도 체크리스트에서 반영합니다.

- 결정 코드: `APPROVE / HOLD / REJECT / NEEDS_MORE_EVIDENCE / DUPLICATE / NOT_RELEVANT / FALSE_POSITIVE`
- 사유 카테고리: `NO_PROHIBITED_CLAIM`, `RULE_FALSE_POSITIVE`, `LLM_OVERSTATED`, `SCORE_TOO_HIGH`, `EVIDENCE_INSUFFICIENT` 등 15종
- 저장소: `data/feedback/feedback.json` (gitignored). `FEEDBACK_USE_DB=true` 여도 Prisma 미연결 시 JSON 폴백
- 메모/노트에 포함된 이메일/전화번호/주민번호 형태는 저장 전 자동 마스킹

API:

- `POST /api/cases/:caseId/feedback`
- `GET /api/cases/:caseId/feedback`
- `GET /api/feedback`, `GET /api/feedback/stats`, `GET /api/feedback/improvements`
- `GET /api/feedback/meta`

자세한 명세는 [`docs/feedback_db.md`](./docs/feedback_db.md).

## Eval Set (품질 평가)

합성 평가셋(VIOLATION 100 / NORMAL 100, 총 200건)으로 **RuleAgent + ScoringAgent**의 Precision/Recall/F1/Accuracy를 측정하는 내부 품질 평가 도구입니다. **실제 신고 판단을 대체하지 않으며**, 평가 결과로 룰/프롬프트/점수를 자동 변경하지 않습니다.

- 기본 평가셋: `health_false_ad_synthetic_v1` (모든 상품명/문구는 가상)
- LLM 호출 기본 비활성 (`EVAL_USE_LLM=false`) — `npm test` 에서 외부 네트워크 호출 없음
- 평가 실행 결과(`data/eval/runs/*.json`)는 gitignored. 평가셋 JSON 자체는 코드 성격이므로 커밋
- FP/FN 은 `feedbackCandidates[]` 로 응답되며, 사람이 검토 후 Feedback DB 에 반영

생성/실행:

```bash
npm run eval:generate
curl -X POST http://localhost:3001/api/eval/run -H 'content-type: application/json' \
  -d '{"evalSetId":"health_false_ad_synthetic_v1","threshold":60,"useLlm":false}'
```

API:

- `GET /api/eval/sets`, `GET /api/eval/sets/:id`
- `POST /api/eval/run`, `GET /api/eval/runs`, `GET /api/eval/runs/:id`, `GET /api/eval/latest`
- `GET /api/eval/runs/:id/feedback-candidates`

자세한 명세는 [`docs/eval_set.md`](./docs/eval_set.md).

## Dashboard (운영 대시보드)

오늘 수집·검토 현황, Review Queue 상태, 후보 TOP10, 모듈별 성과, Eval 품질 지표(Precision/Recall/F1/Accuracy), Scheduler·Dedupe·Feedback 요약을 한 화면에서 확인하는 **조회 전용** 운영 대시보드입니다.

- "제출 기록" 은 사람이 외부 공식 창구에서 직접 제출한 뒤 내부에 표시한 상태입니다. **자동 제출/자동 신고 기능 없음.**
- 포상금 예측/수익 예측 카드는 추가하지 않습니다.
- 모바일 반응형: 1024 / 768 / 480px breakpoint.

API:

- `GET /api/dashboard/summary`
- `GET /api/dashboard/top-candidates?limit=N`
- `GET /api/dashboard/module-performance`
- `GET /api/dashboard/quality`

자세한 명세는 [`docs/dashboard.md`](./docs/dashboard.md).

## Counterfeit Goods Module (위조상품 의심 모듈)

1차 모듈 `false_ad` 구조를 복사해 보존한 확장 분야 모듈입니다. 쉬운 모듈 우선 로드맵에서는 일반식품·화장품·의료기기 다음 순서입니다. 공개 판매게시글에서 **위조상품 의심 후보**를 탐지하며, **위조 여부를 확정하지 않습니다.** 권리자 감정과 관계기관 판단을 대체하지 않으며, 자동 신고/자동 로그인/비공개 채팅방 수집/판매자 개인정보 추적은 수행하지 않습니다.

- `moduleId`: `counterfeit_goods` (slug: `counterfeit-goods`, status: `ready`)
- 룰셋 54+ (HIGH 20 / MEDIUM 20 / LOW 10 / combo 4) — `src/modules/counterfeit-goods/keywords.json`
- 점수 (총 100): counterfeitExpression 35 / brand 15 / commerce 15 / evidence 20 / sellerPattern 10 / extraction 5
- 신고처 후보: 특허청 위조상품 신고포상금 안내, 지식재산침해 원스톱 신고상담센터
- 포상금 수령을 보장하지 않으며, 공식 기준은 각 기관 공식 페이지에서 직접 확인해야 합니다.

API:

- `GET /api/rules/counterfeit_goods`
- `POST /api/detect/rules { "moduleId": "counterfeit_goods", ... }`
- `GET /api/discovery/topics?moduleId=counterfeit_goods`
- `POST /api/scout/discover { "moduleId": "counterfeit_goods", ... }`
- Report draft 생성 시 `moduleId=counterfeit_goods` 가 들어가면 위조상품 템플릿이 사용됩니다.

자세한 명세는 [`docs/counterfeit_module.md`](./docs/counterfeit_module.md).

## Subsidy Fraud Prototype Module (보조금 부정수급 의심 — 프로토타입)

이 기능은 삭제하지 않지만, 현재 1차 실전 MVP가 아닙니다. 쉬운 모듈 우선 로드맵에서 **후순위 고급 모듈/프로토타입**으로 두며 실데이터 준비 후 진행합니다.

The `subsidy_fraud` module is a **prototype** for identifying public-subsidy review candidates using public data. It analyzes:

- subsidy project records (sample-data.json)
- recipient names / addresses (공시 영역만)
- repeated recipient patterns / same-address signals / similar project titles
- result evidence presence / amount vs output imbalance / related vendor patterns
- execution pattern anomalies / disclosure gaps / duplicate content

**This module does not confirm fraud.** It only produces "검토 후보" based on public data. 자동 신고 제출 / 특정 단체 단정 / 개인정보 수집 / 인증키 커밋은 절대 수행하지 않습니다.

- Pilot region: 충청남도 당진시 (sample). 모든 단체명/주소/대표자는 가상 합성 데이터입니다.
- Status: `prototype` (Module Registry)
- 9 risk signals, 7 score components (총 100점)

API:

- `GET /api/subsidy/sources` / `risk-signals` / `agency-config` / `sample`
- `POST /api/subsidy/analyze` (sample 기반만 허용)
- `POST|GET /api/subsidy/candidates/:recordId/report`

자세한 명세는 [`docs/subsidy_module.md`](./docs/subsidy_module.md).

## Bid Collusion Prototype Module (입찰담합 의심 패턴 — 프로토타입)

이 기능은 삭제하지 않지만, 현재 1차 실전 MVP가 아닙니다. 쉬운 모듈 우선 로드맵에서 **후순위 고급 모듈/프로토타입**으로 두며 실데이터 준비 후 진행합니다.

The `bid_collusion` module analyzes structured public procurement data for **review-worthy collusion patterns**. It checks:

- repeated bidder groups (동일 업체군 반복 참여)
- rotating winners (순환 낙찰)
- narrow bid spreads (좁은 투찰 간격)
- cover-bid pattern candidates (들러리 후보)
- single-winner dominance (단일 낙찰자 지배)
- award-rate clustering (낙찰률 군집)
- repeated low competition / formal participation patterns

**This module does not determine collusion.** It only generates candidates for human review. 자동 신고 / 자동 민원 / 인증키 커밋 / 특정 업체 단정 모두 금지.

- Status: `prototype` (Module Registry)
- Sample dataset: 합성 입찰 31건 / 업체 8개 (`샘플업체A`~`샘플업체H`) / 발주기관 3개 (`예시발주기관 1/2/3`) — **실제 업체/기관 사용 금지**
- 9 risk signals, 8 score components (총 100점)

API:

- `GET /api/bids/sources` / `risk-signals` / `agency-config` / `sample`
- `POST /api/bids/analyze` (sample 기반만 허용)
- `POST|GET /api/bids/groups/:groupId/report`

자세한 명세는 [`docs/bid_collusion_module.md`](./docs/bid_collusion_module.md).

## Trace Log (Agent 실행 추적 / 감사로그)

Agent 실행, 판단, tool/service call, 사람 수정 내역을 **내부 감사·디버깅·품질 개선** 목적으로 일자별 JSONL (`data/traces/{yyyy-mm-dd}.jsonl`) 에 기록합니다. Trace 는 판단 과정 기록이지 **법적 판단 확정 근거가 아닙니다.**

- API 키 / 토큰 / 개인정보 / 전체 HTML / 증거파일 내용 / 외부 신고기관 로그인 정보 — **절대 저장 금지**
- 전체 LLM prompt 본문 저장은 기본 비활성 (`TRACE_STORE_FULL_PROMPT=false`)
- 마스킹: API 키 패턴 / 이메일·전화·주민번호 / `secret`·`token`·`password`·`authorization` 등 키 이름 — 자동 마스킹
- 자동 삭제 API 없음 (운영자가 파일 단위 관리)

API:

- `GET /api/traces?agentName=&severity=&eventType=&caseId=&limit=`
- `GET /api/traces/summary`
- `GET /api/cases/:caseId/traces`

UI: "Agent 실행 추적 / 감사로그" 카드 + Agent/Severity/EventType/CaseId 필터.

자세한 명세는 [`docs/trace_log.md`](./docs/trace_log.md).

## Privacy and Data Minimization

본 프로젝트는 개인정보를 적극적으로 수집하지 않으며, 저장된 개인정보성 문자열은 마스킹/삭제 가능합니다. **본 도구는 개인정보보호 법령 검토를 대체하지 않습니다.**

- 탐지 유형: EMAIL / PHONE / KOREAN_RRN / ACCOUNT_NUMBER / API_KEY / TOKEN / AUTH_HEADER / COOKIE / IP_ADDRESS / ADDRESS_LIKE
- 마스킹: `[masked-email]`, `[masked-phone]`, `[masked-id]`, `[masked-secret]`, `[masked-auth]`, ...
- 보존기간: trace 30일 / evidence·report 90일 / feedback·case 180일 (`.env` 로 조정)
- 삭제: **기본 `PRIVACY_DRY_RUN=true`**. 실제 삭제는 `dryRun: false` + `confirmDelete: true` 둘 다 필요. `data/` 하위 화이트리스트 디렉터리만 허용. `src/`, `public/`, `docs/`, `.env`, `.gitkeep` 삭제 절대 불가
- CaseRepository.create 가 memo/summary 를 저장 전 자동 마스킹

API:

- `GET /api/privacy/policy`
- `POST /api/privacy/mask`
- `POST /api/privacy/scan`
- `POST /api/privacy/delete`
- `POST /api/privacy/retention/apply`

자세한 명세는 [`docs/privacy_policy.md`](./docs/privacy_policy.md).

## Outcome Tracker (실제 신고 결과 기록)

사람이 외부 공식 신고 창구에 직접 제출한 이후, 제출일·접수번호·처리상태·처리결과·포상금/보상금 관련 여부를 **내부 기록**으로 저장하는 기능입니다.

- 시스템은 **외부 신고기관에 자동 제출하지 않습니다** — 사용자가 공식 창구에서 직접 확인한 결과를 수동으로 입력
- 접수번호 / 메모 / 반려 사유 / 보완 요청 등 본문 텍스트는 **저장 전 자동 마스킹** (이메일·전화·주민번호·API 키·토큰)
- `rewardAmount` 는 "사용자 입력 지급 확인 금액" — **예측이 아닙니다.** 포상금 수령을 보장하지 않습니다
- 13개 상태 / 7개 결정 / 6개 포상 결과
- Dashboard 에 KPI 자동 집계, Trace Log 에 `state_change` + `human_action` 기록 (referenceNumber 는 preview 만)
- Outcome 이 REJECTED/CLOSED 면 응답에 `recommendedFeedback` 가 포함되어 Feedback DB 연결 유도

API:

- `POST /api/cases/:caseId/outcome` (upsert)
- `GET /api/cases/:caseId/outcome`
- `GET /api/outcomes`, `/meta`, `/stats`, `/patterns`, `/follow-up`
- `GET|PATCH /api/outcomes/:outcomeId`

자세한 명세는 [`docs/outcome_tracker.md`](./docs/outcome_tracker.md).

## Search Collector / Scout Agent

The Scout Agent discovers candidate URLs from approved sources (Mock / Naver Search API / OpenAI Web Search placeholder / RSS placeholder / Manual Seed) and queues them into the Review pipeline.

- Search engine HTML scraping is **forbidden**. Only official APIs, allowed RSS, manual seeds, and Mock are used.
- Daily target: **50 candidates/day** (`SCOUT_DAILY_LIMIT`). Actual yield depends on API keys, source limits, and ToS.
- Mock Scout uses RFC 6761 reserved domains (`.test/.example/.invalid`) — no real network hits.
- Naver Search adapter activates only when `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` are both set.

API:

- `GET /api/scout/topics`, `GET /api/scout/sources`
- `POST /api/scout/discover` (topics + mode + sourceTypes)
- `GET /api/scout/candidates`
- `POST /api/scout/candidates/:id/queue` (creates DRAFT Case → Review Queue)
- `POST /api/scout/candidates/:id/reject`

See [`docs/search_collector.md`](./docs/search_collector.md).

## 공공데이터 API 수집기 (Public Data API Collector)

공공데이터포털(data.go.kr) 류 오픈 API에서 공개자료를 안전하게 수집하는 수집기입니다. 인증키 환경변수 관리, 요청 제한, 재시도, 타임아웃, 오류 로그, 저장 전 개인정보 마스킹을 포함합니다. 자동 신고/로그인 우회/인증 우회/무제한 호출/약관 위반 수집은 수행하지 않습니다.

- 수집기 모듈: [`src/collectors/publicDataApiCollector.ts`](./src/collectors/publicDataApiCollector.ts)
- 실행 스크립트: [`scripts/collect-public-data-api.ts`](./scripts/collect-public-data-api.ts)
- 운영 Runbook: [`docs/API_COLLECTOR_RUNBOOK.md`](./docs/API_COLLECTOR_RUNBOOK.md)
- 로그 샘플 정책: [`docs/COLLECTOR_SAMPLE_LOG.md`](./docs/COLLECTOR_SAMPLE_LOG.md)

### 환경변수 설정

`.env.example`의 수집기 항목을 `.env`로 복사해 채웁니다. **인증키는 코드에 하드코딩하지 않고 `.env`로만 관리하며, `.env`는 커밋하지 않습니다.**

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` / `PUBLIC_DATA_SERVICE_KEY` | (없음) | 공공데이터포털 인증키 (둘 중 하나) |
| `COLLECTOR_API_BASE_URL` | (없음) | **실제 호출 가능한** API endpoint (상세 페이지 URL 아님) |
| `COLLECTOR_OUTPUT_DIR` | `data/collector` | 수집 결과 저장 폴더 |
| `COLLECTOR_PAGE_SIZE` | `100` | 페이지당 요청 건수 |
| `COLLECTOR_MAX_RECORDS` | `1000` | 최대 수집 건수 |
| `COLLECTOR_RATE_LIMIT_MS` | `1000` | 요청 간격(ms) |
| `COLLECTOR_TIMEOUT_MS` | `15000` | 요청 타임아웃(ms) |
| `COLLECTOR_MAX_RETRIES` | `3` | 최대 재시도 횟수 |

### 실행

```bash
npm run test:collector      # mock fetch 로 수집기 핵심 기능 검증 (API 키 불필요)
npm run check:collector     # 키 하드코딩/로그 마스킹 정적 검사
npm run collect:public-api  # 실제 수집 — 인증키 + COLLECTOR_API_BASE_URL 필요
```

`collect:public-api`는 인증키가 없으면 `COLLECTOR_API_KEY_REQUIRED`, 실제 endpoint가 없으면 `COLLECTOR_ENDPOINT_REQUIRED`를 출력하고 종료합니다(exit 2). 1,000건 이상 수집 성공 시 `COLLECTOR_REAL_RUN_OK`, 미달 시 `COLLECTOR_REAL_RUN_INCOMPLETE`를 출력합니다.

> **실제 1,000건 수집은 공공데이터포털 인증키와 실제 호출 가능한 endpoint가 필요합니다.** 실제 수집 결과(`records.jsonl`) 원본은 git에 커밋하지 않습니다.

## CSV/PDF/엑셀 업로드 수집기 (Upload Parser)

지자체가 PDF·엑셀·CSV로 공개한 보조금 자료를 **사람이 수동 업로드**한 뒤 표준 보조금 레코드로 변환하는 변환기입니다. 웹 크롤러가 아니며, 저장 전 개인정보를 마스킹하고 변환/오류 로그를 남깁니다. 스캔 이미지 PDF의 OCR은 범위에서 제외합니다(텍스트 기반 PDF 기본 처리).

- 파서 모듈: [`src/parsers/uploadSubsidyParser.ts`](./src/parsers/uploadSubsidyParser.ts)
- 표준 타입: [`src/types/uploadParser.ts`](./src/types/uploadParser.ts)
- CLI: [`scripts/parse-uploaded-subsidy-files.ts`](./scripts/parse-uploaded-subsidy-files.ts)
- 운영 Runbook: [`docs/UPLOAD_PARSER_RUNBOOK.md`](./docs/UPLOAD_PARSER_RUNBOOK.md)

지원 형식: `.csv` / `.xlsx` / `.pdf`. 결과는 `data/upload-parser/runs/{runId}/`에 `records.jsonl`, `parse-log.json`, `error-log.json`으로 저장됩니다(원본/결과는 git 미커밋).

### 실행

```bash
npm run test:upload-parser              # 가짜 fixture 10개 생성 → 변환/마스킹/오류 로그 검증
npm run check:upload-parser             # 문서/코드 존재 + 정책 정적 검사
npm run parse:uploads -- <파일또는폴더>   # 실제 업로드 파일 변환 (폴더면 csv/xlsx/pdf만)
```

## 기관명·단체명 정규화 (Entity Name Normalizer)

주식회사/(주)/㈜/사단법인/재단법인/사회복지법인/협동조합/영농조합법인 등 법인·단체 표기와 띄어쓰기·특수문자·괄호·전각/반각·대소문자 차이를 통합해 **"동일 기관 후보"**를 만드는 정규화·병합 보조 모듈입니다. **동일 기관을 확정하지 않으며**(자동 확정 병합 없음), 모든 병합 후보는 사람 검토 대상(`reviewRequired=true`)입니다. 대표자명·전화번호·상세주소는 단독 병합 기준으로 사용하지 않습니다.

- 정규화 모듈: [`src/normalizers/entityNameNormalizer.ts`](./src/normalizers/entityNameNormalizer.ts)
- 표준 타입: [`src/types/entityNormalization.ts`](./src/types/entityNormalization.ts)
- 운영 가이드: [`docs/ENTITY_NORMALIZATION_GUIDE.md`](./docs/ENTITY_NORMALIZATION_GUIDE.md)

판정: `strong_match`(정규화명 완전 일치) / `likely_match` / `possible_match` / `no_match` / `ambiguous`(너무 짧거나 일반명사·지역명만 남음). 업로드 parser 결과의 `recipientName`이 있으면 `normalizedRecipientName`(compactName)이 채워집니다.

```bash
npm run test:entity-normalizer    # 정규화/병합 후보 정확도 검증 (가짜 기관명)
npm run check:entity-normalizer   # 문서/코드 존재 + 정책 정적 검사
```

## 주소 정규화 (Address Normalizer)

도로명/지번/층호수/약칭/괄호/특수문자/전각·반각/공백 차이를 통합해 **"동일 주소 후보"**를 만들고, 같은 주소 반복수급을 검토할 수 있게 하는 정규화·매칭 보조 모듈입니다. **동일 주소를 확정하지 않으며**(자동 확정 병합 없음), 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

- 정규화 모듈: [`src/normalizers/addressNormalizer.ts`](./src/normalizers/addressNormalizer.ts)
- 표준 타입: [`src/types/addressNormalization.ts`](./src/types/addressNormalization.ts)
- 운영 가이드: [`docs/ADDRESS_NORMALIZATION_GUIDE.md`](./docs/ADDRESS_NORMALIZATION_GUIDE.md)

**상세주소(동·호수·층) 원문은 저장하지 않습니다.** 상세주소는 `removedDetailTokens`로 분리되어 키에서 제외되고, 반복수급 분석은 시도·시군구·읍면동·도로명/지번 수준의 `addressRegionKey`를 우선 사용합니다. 같은 주소 반복은 부정수급으로 단정하지 않으며 **검토 필요 신호**로만 봅니다. 판정: `strong_match`(normalizedAddressKey 일치) / `likely_match` / `possible_match` / `no_match` / `ambiguous`(시군구만/너무 짧음).

```bash
npm run test:address-normalizer    # 주소 정규화/매칭 정확도 검증 (가짜 주소)
npm run check:address-normalizer   # 문서/코드 존재 + 정책 정적 검사
```

## 사업명 유사도 계산 (Project Name Similarity)

유사 사업명 반복 신청을 검토하기 위해 사업명 표기 차이(연도/차수/괄호/특수문자/띄어쓰기/대소문자/공모·지원·사업 같은 일반 표현)를 정규화하고 유사도를 계산하는 모듈입니다. **형태소 분석기 없이** 문자열 정규화 + 토큰 Dice + 문자 n-gram + 편집거리로 동작합니다.

- 유사도 모듈: [`src/normalizers/projectNameSimilarity.ts`](./src/normalizers/projectNameSimilarity.ts)
- 표준 타입: [`src/types/projectNameSimilarity.ts`](./src/types/projectNameSimilarity.ts)
- 운영 가이드: [`docs/PROJECT_NAME_SIMILARITY_GUIDE.md`](./docs/PROJECT_NAME_SIMILARITY_GUIDE.md)

판정: `strong_similar`(0.90↑) / `similar_candidate`(0.85↑) / `possible_candidate`(0.70↑) / `no_match` / `ambiguous`(일반 토큰만/너무 짧음). **유사도 0.85 이상도 확정이 아니라 "유사 사업명 후보 / 반복 신청 검토 후보"이며**, 사업명 유사도만으로 반복 신청이나 부정수급을 단정하지 않습니다. 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

```bash
npm run test:project-similarity    # 유사도/후보 목록 정확도 검증 (가짜 사업명)
npm run check:project-similarity   # 문서/코드 존재 + 정책 정적 검사
```

## 실데이터 1차 기준선 / 데이터 품질검증 (Data Baseline Quality)

최근 2~3년 보조사업 데이터를 표준 저장소(경량 JSONL)에 적재하고 수집건수·중복률·결측률·출처별/연도별 커버리지 등 품질 리포트를 생성하는 파이프라인입니다. 저장 전 개인정보를 마스킹하며, **fixture 1,000건은 적재 경로/품질 리포트 검증용일 뿐 실데이터 기준선 완료가 아닙니다.**

- 품질검증 모듈: [`src/quality/dataBaselineQuality.ts`](./src/quality/dataBaselineQuality.ts)
- 표준 타입: [`src/types/dataQualityBaseline.ts`](./src/types/dataQualityBaseline.ts)
- CLI: [`scripts/build-data-baseline.ts`](./scripts/build-data-baseline.ts)
- 운영 Runbook: [`docs/DATA_BASELINE_QUALITY_RUNBOOK.md`](./docs/DATA_BASELINE_QUALITY_RUNBOOK.md)

상태 구분: `real_baseline_ok`(api/upload/manual 1,000건 이상) / `fixture_pending`(fixture 1,000건 — 실데이터 기준선 보류) / `incomplete`(1,000건 미만). 중복률·결측률은 데이터 품질 지표이며 부정수급 판단 근거가 아닙니다.

```bash
npm run test:data-baseline                  # fixture 1,000건 적재 경로 + 품질 리포트 검증
npm run build:baseline -- --fixture 1000    # fixture 1,000건 적재 (실데이터 아님)
npm run build:baseline -- --input <records.jsonl> --sourceType upload --sourceName local-upload
npm run check:data-baseline                 # 문서/코드 존재 + 정책 정적 검사
```

> 결과는 `data/baseline/runs/{runId}/`에 `records.jsonl`, `quality-report.json`, `quality-report.md`, `error-log.json`으로 저장됩니다(원본/결과는 git 미커밋). 실제 1,000건 실데이터 기준선은 API 실제 수집(체크리스트 11) 또는 실제 업로드 자료가 준비되면 구축합니다.

## 반복 수급 탐지 룰 (Repeat Subsidy Risk Rule)

기준선 데이터에서 동일/유사 기관명·주소·사업명·연도·금액 신호를 결합해 **"반복 수급 후보 / 검토 필요 후보" TOP 50**을 점수화·산출하는 룰 모듈입니다. 결과는 확정 판단이 아니며, 위법 여부를 단정하지 않습니다. 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

- 룰 모듈: [`src/rules/repeatSubsidyRiskRule.ts`](./src/rules/repeatSubsidyRiskRule.ts)
- 표준 타입: [`src/types/repeatSubsidyRisk.ts`](./src/types/repeatSubsidyRisk.ts)
- CLI: [`scripts/run-repeat-risk-rule.ts`](./scripts/run-repeat-risk-rule.ts)
- 운영 가이드: [`docs/REPEAT_SUBSIDY_RISK_RULE.md`](./docs/REPEAT_SUBSIDY_RISK_RULE.md)

각 후보는 `riskScore`(0~100) / `riskLevel`(high/medium/low/minimal) / `groupKey` / `matchedSignals` / `evidence` / `reason` / `reviewRequired`를 포함합니다. **대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않고**(보조 신호만, 원문 미사용), groupKey·reason·evidence에 개인정보 원문을 넣지 않습니다. 같은 주소 반복은 공유오피스·공공시설일 수 있어 검토 신호로만 봅니다.

```bash
npm run test:risk-repeat                # fixture 1,000건 TOP 50 산출 + 점수 검증
npm run risk:repeat -- --fixture 1000   # fixture 기반 검증(실제 탐지 완료 아님)
npm run risk:repeat -- --input data/baseline/runs/xxx/records.jsonl
npm run check:risk-repeat               # 문서/코드 존재 + 정책 정적 검사
```

> fixture 실행은 산출 경로/점수 검증용입니다. 실제 반복 수급 탐지는 실데이터 기준선이 준비된 후 적용합니다.

## 동일 주소 다수 단체 탐지 룰 (Address Cluster Risk Rule)

기준선 데이터를 `normalizedAddressKey` 또는 `addressRegionKey`로 그룹화해 **같은 주소 후보에 여러 단체(normalizedRecipientName)가 등장하는 "동일 주소 다수 단체 후보표"**를 점수화·산출하는 룰 모듈입니다. 결과는 확정 판단이 아니며, 위법 여부를 단정하지 않습니다. 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

- 룰 모듈: [`src/rules/addressClusterRiskRule.ts`](./src/rules/addressClusterRiskRule.ts)
- 표준 타입: [`src/types/addressClusterRisk.ts`](./src/types/addressClusterRisk.ts)
- CLI: [`scripts/run-address-cluster-risk-rule.ts`](./scripts/run-address-cluster-risk-rule.ts)
- 운영 가이드: [`docs/ADDRESS_CLUSTER_RISK_RULE.md`](./docs/ADDRESS_CLUSTER_RISK_RULE.md)

각 후보는 `riskScore`(0~100) / `riskLevel`(high/medium/low/minimal) / `addressGroupKey` / `distinctRecipientCount` / `matchedSignals` / `evidence` / `reason` / `cautionNotes` / `reviewRequired`를 포함합니다. **같은 주소에 여러 단체가 있어도 공유오피스·복지관·회관·공공시설일 수 있어** 합리적 사유 가능성을 `cautionNotes`에 중립적으로 반영합니다. **대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않고**, groupKey·reason·evidence에 상세주소·개인정보 원문을 넣지 않습니다.

```bash
npm run test:risk-address-cluster                # fixture 1,000건 후보표 산출 + 점수 검증
npm run risk:address-cluster -- --fixture 1000   # fixture 기반 검증(실제 탐지 완료 아님)
npm run risk:address-cluster -- --input data/baseline/runs/xxx/records.jsonl
npm run check:risk-address-cluster               # 문서/코드 존재 + 정책 정적 검사
```

> fixture 실행은 산출 경로/점수 검증용입니다. 실제 탐지는 실데이터 기준선이 준비된 후 적용합니다.

## 결과물 부족/정산 확인 필요 탐지 룰 (Output & Settlement Risk Rule)

기준선 데이터에서 **성과보고서·정산서·결과보고서·결과물 URL·증빙 URL·첨부파일** 등 공개 근거가 부족한 레코드를 누락 신호로 점수화해 **"결과물 누락 후보 / 정산 확인 필요 후보 / 증빙 보완 필요 후보" TOP 50**을 산출하는 룰 모듈입니다. **공개자료에 없다는 것은 "확인 필요"일 뿐 실제 미제출 확정이 아니며**, 위법 여부를 단정하지 않습니다. 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

- 룰 모듈: [`src/rules/outputSettlementRiskRule.ts`](./src/rules/outputSettlementRiskRule.ts)
- 표준 타입: [`src/types/outputSettlementRisk.ts`](./src/types/outputSettlementRisk.ts)
- CLI: [`scripts/run-output-settlement-risk-rule.ts`](./scripts/run-output-settlement-risk-rule.ts)
- 운영 가이드: [`docs/OUTPUT_SETTLEMENT_RISK_RULE.md`](./docs/OUTPUT_SETTLEMENT_RISK_RULE.md)

각 후보는 `riskScore`(0~100) / `riskLevel`(high/medium/low/minimal) / `missingSignals` / `evidence` / `reason` / `reviewRequired`를 포함합니다. **로그인 필요 자료·비공개 자료·내부자료는 탐지 근거로 사용하지 않고**, evidence·reason에 개인정보 원문을 넣지 않습니다.

```bash
npm run test:risk-output-settlement                # fixture 1,000건 후보 산출 + 점수 검증
npm run risk:output-settlement -- --fixture 1000   # fixture 기반 검증(실제 탐지 완료 아님)
npm run risk:output-settlement -- --input data/baseline/runs/xxx/records.jsonl
npm run check:risk-output-settlement               # 문서/코드 존재 + 정책 정적 검사
```

> fixture 실행은 산출 경로/점수 검증용입니다. 실제 탐지는 실데이터 기준선이 준비된 후 적용합니다.

## 예산 집행 이상 패턴 탐지 룰 (Spending Anomaly Risk Rule)

기준선 데이터에서 **인건비·홍보비·용역비·장비구입비** 등 특정 집행 항목의 과다 비중, 동일 항목 반복 지출, 유사 금액 반복, 특정 지급처 반복을 점수화해 **"예산 집행 이상 패턴 후보 / 정산 확인 필요 후보" TOP 50**을 산출하는 룰 모듈입니다. **특정 항목 비중이 높거나 반복된다는 사실만으로 문제라고 단정하지 않으며**(사업 유형상 정상일 수 있음), 위법 여부를 단정하지 않습니다. 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

- 룰 모듈: [`src/rules/spendingAnomalyRiskRule.ts`](./src/rules/spendingAnomalyRiskRule.ts)
- 표준 타입: [`src/types/spendingAnomalyRisk.ts`](./src/types/spendingAnomalyRisk.ts)
- CLI: [`scripts/run-spending-anomaly-risk-rule.ts`](./scripts/run-spending-anomaly-risk-rule.ts)
- 운영 가이드(항목별 이상치 기준표 포함): [`docs/SPENDING_ANOMALY_RISK_RULE.md`](./docs/SPENDING_ANOMALY_RISK_RULE.md)

각 후보는 `riskScore`(0~100) / `riskLevel`(high/medium/low/minimal) / `spendingSignals` / `spendingBreakdownSummary` / `evidence` / `reason` / `cautionNotes` / `reviewRequired`를 포함합니다. **지급처명은 마스킹 값(vendorNameMasked)만 사용**하고, 계좌번호·연락처·상세주소 등 개인정보 원문과 로그인 필요/비공개 자료는 탐지 근거·evidence·reason에 넣지 않습니다.

```bash
npm run test:risk-spending                # fixture 1,000건 후보 산출 + 점수 검증
npm run risk:spending -- --fixture 1000   # fixture 기반 검증(실제 탐지 완료 아님)
npm run risk:spending -- --input data/baseline/runs/xxx/records.jsonl
npm run check:risk-spending               # 문서/코드 존재 + 정책 정적 검사
```

> fixture 실행은 산출 경로/점수 검증용입니다. 실제 탐지는 실데이터 기준선이 준비된 후 적용합니다.

## 계약업체 연관성 탐지 룰 (Contractor Network Risk Rule)

기준선 데이터와 나라장터/G2B 계약연계 데이터에서 수급단체와 계약업체/용역업체의 반복 연결 후보를 점수화해 **"계약업체 연관성 후보 / 반복 연결 검토 후보" TOP 50**을 산출하는 룰 모듈입니다. 반복 연결만으로 문제라고 단정하지 않으며, 장기계약·전문용역·유지보수·지역 공급망 등 합리적 사유 가능성을 함께 검토합니다. 모든 후보는 사람 검토 대상(`reviewRequired=true`)입니다.

- 룰 모듈: [`src/rules/contractorNetworkRiskRule.ts`](./src/rules/contractorNetworkRiskRule.ts)
- 표준 타입: [`src/types/contractorNetworkRisk.ts`](./src/types/contractorNetworkRisk.ts)
- 운영 가이드: [`docs/CONTRACTOR_NETWORK_RISK_RULE.md`](./docs/CONTRACTOR_NETWORK_RISK_RULE.md)
- CLI: [`scripts/run-contractor-network-risk-rule.ts`](./scripts/run-contractor-network-risk-rule.ts)

각 후보는 `riskScore` / `riskLevel` / `networkSignals` / `evidence` / `reason` / `reviewRequired`를 포함합니다. 보조사업자명, 계약상대자명, 용역업체명, 계약명, 사업명, 계약금액, 계약일자, 기관명, 주소 키를 기준으로 연관성 후보를 만들되, 사업자등록번호·법인등록번호 원문은 저장하지 않고 해시만 사용할 수 있습니다. 대표자명·전화번호·상세주소는 단독 기준으로 사용하지 않으며, 개인정보 원문·비공개자료·로그인 필요 자료는 탐지 근거에 넣지 않습니다.

```bash
npm run test:risk-contractor-network
npm run risk:contractor-network -- --fixture 1000
npm run risk:contractor-network -- --input data/g2b-linkage/runs/xxx/edges.jsonl
npm run check:risk-contractor-network
```

## 보조금 룰 5종 통합 실행 (Subsidy Risk Rules) · 체크리스트 60

정규화된 보조금 레코드에 **보조금 의심 신호 룰 5종**(A 반복수급 · B 동일주소 다단체 · C 결과물·정산 증빙 누락 · D 예산집행 이상치 · E 사업명 유사 반복 ≥0.85)을 한 번에 실행하고, 룰 결과를 합쳐 **검토 후보 TOP 50**을 산출합니다. 결과는 모두 **사람 검토가 필요한 후보**이며 부정수급/위법 확정이 아닙니다. 정렬 점수는 룰 기반 보조 점수이며 **100점 위험점수가 아닙니다.** 자동 신고/자동 제출 기능은 없습니다.

- 룰 엔진: [`src/rules/subsidyRiskRules.ts`](./src/rules/subsidyRiskRules.ts)
- 표준 타입: [`src/types/subsidyRisk.ts`](./src/types/subsidyRisk.ts)
- CLI: [`scripts/run-subsidy-risk-rules.ts`](./scripts/run-subsidy-risk-rules.ts)
- 운영 가이드(5종 룰 의미/한계·입력형식·해석법): [`docs/SUBSIDY_RISK_RULES_GUIDE.md`](./docs/SUBSIDY_RISK_RULES_GUIDE.md)

각 룰 결과는 `ruleId` / `ruleName` / `severity` / `candidateId` / `involvedRecordIds` / `evidenceRefs` / `reason` / `caution` / `reviewRequired:true` / `notLegalConclusion:true` / `suggestedNextCheck`를 포함합니다. 산출물은 **gitignore 처리된** `data/risk/runs/{runId}/`에 `rule-results.json` · `top50-candidates.json` · `rule-summary.md` · `metadata.json` 4종으로 저장합니다. 대표자명·전화번호·주민번호·계좌번호·상세주소 원문은 근거로 저장하지 않고 정규화 키만 사용합니다.

```bash
npm run test:subsidy-risk-rules            # 5종 룰 적중 + 구조 + TOP 50 + 산출물 + CLI 검증
npm run risk:rules -- --fixture 12         # fixture 기반 검증(실제 탐지 완료 아님)
npm run risk:rules -- --input data/upload-parser/runs/xxx/records.jsonl
npm run check:subsidy-risk-rules           # 문서/코드 존재 + 정책 정적 검사
```

선택 API: `POST /api/subsidy/risk/rules/run`(records 미지정 시 합성 데모로 실행) · `GET /api/subsidy/risk/runs/latest`(최근 실행 TOP 50 요약 + "사람 검토 필요" 안내). 두 엔드포인트 모두 외부 API 호출·자동 신고가 없습니다.

> 다음 단계에서 이 룰 결과(`rule-results.json`)를 입력으로 100점 위험점수·보상가능성 점수·LLM 설명형 분석·신고서 초안을 진행합니다(이번 범위 밖).

## 100점 위험점수 모델 (Risk Score Model)

반복 수급, 동일 주소 다수 단체, 결과물 부족/정산 미흡, 예산 집행 이상, 계약업체 연관성 룰 결과를 통합해 **0~100 `riskScore`와 A/B/C 검토 등급**을 산출합니다. 결과는 **위험 후보 / 우선 검토 후보 / 추가 확인 필요 후보**를 정렬하기 위한 보조 점수이며 확정 판단이 아닙니다. A등급도 사람의 사실관계 확인이 필요한 우선 검토 후보입니다.

- 스코어링 모듈: [`src/scoring/riskScoreModel.ts`](./src/scoring/riskScoreModel.ts)
- 표준 타입: [`src/types/riskScoreModel.ts`](./src/types/riskScoreModel.ts)
- 운영 가이드: [`docs/RISK_SCORE_MODEL.md`](./docs/RISK_SCORE_MODEL.md)
- CLI: [`scripts/run-risk-score-model.ts`](./scripts/run-risk-score-model.ts)

각 결과는 `finalRiskScore`, `riskGrade`, `scoreBreakdown`, `contributingSignals`, `evidenceSummary`, `reason`, `reviewRequired`를 포함합니다. scoreBreakdown은 반복성, 금액, 증가감, 결과물 부족, 주소 유사성, 정산 이상, 계약업체 연관성, evidence 보정 항목을 분리해 보여줍니다. 개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 evidence/reason/report에 넣지 않습니다.

```bash
npm run test:risk-score
npm run risk:score -- --fixture 1000
npm run risk:score -- --input data/risk/repeat/runs/xxx/repeat-risk-report.json --input data/risk/address-cluster/runs/xxx/address-cluster-risk-report.json
npm run risk:score -- --input data/risk/runs/xxx/rule-results.json   # 체크리스트 60 룰 5종 결과 입력
npm run check:risk-score
```

> 체크리스트 61: 룰 5종 결과(`rule-results.json`)를 입력으로 받아 `candidateId`·`cautionNotes`·`notLegalConclusion`을 포함한 결과를 `data/risk/score/runs/{runId}/`에 `risk-score-report.json`·`risk-score-summary.md`·`metadata.json`으로 저장합니다. 선택 API: `POST /api/subsidy/risk/score/run`, `GET /api/subsidy/risk/score/latest`(응답에 "부정수급으로 단정하지 않음 / 포상금 지급을 보장하지 않음 / 사람 검토 필요" 안내 포함).

## 보상가능성 점수 모델 (Reward Possibility Score Model)

위험점수와 별도로 환수 가능성, 공공기관 손실방지 가능성, 증거 명확성을 분리 계산해 **보상/포상 가능성 검토 우선순위 High/Medium/Low**를 산출합니다. 결과는 보상/포상 가능성 검토 후보와 추가 확인 필요 후보를 정렬하기 위한 참고 점수이며, 지급 여부 판단이나 기관 심사 결과를 대체하지 않습니다.

- 스코어링 모듈: [`src/scoring/rewardPossibilityScore.ts`](./src/scoring/rewardPossibilityScore.ts)
- 표준 타입: [`src/types/rewardPossibilityScore.ts`](./src/types/rewardPossibilityScore.ts)
- 운영 가이드: [`docs/REWARD_POSSIBILITY_SCORE_MODEL.md`](./docs/REWARD_POSSIBILITY_SCORE_MODEL.md)
- CLI: [`scripts/run-reward-possibility-score.ts`](./scripts/run-reward-possibility-score.ts)

각 결과는 `rewardPossibilityScore`, `rewardPossibilityLevel`, `scoreBreakdown`, `contributingSignals`, `evidenceSummary`, `reason`, `disclaimers`, `reviewRequired`를 포함합니다. `scoreBreakdown`은 환수 가능성, 공공기관 손실방지 가능성, 증거 명확성, 공식 기준 확인 신호를 분리해 보여줍니다. 개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 evidence/reason/report에 넣지 않습니다.

```bash
npm run test:reward-score
npm run reward:score -- --fixture 1000
npm run reward:score -- --input data/risk/score/runs/xxx/risk-score-report.json
npm run reward:score -- --input data/risk/runs/xxx/rule-results.json   # 체크리스트 60 룰 5종 결과 입력
npm run check:reward-score
```

> 체크리스트 62: 결과에 `candidateId`·`rewardPossibilityScore`·`rewardPossibilityLevel`·`rewardGuaranteed=false`·`notLegalConclusion`·`nextChecks`를 포함합니다(포상금 지급을 보장하지 않음). 선택 API: `POST /api/subsidy/reward-score/run`, `GET /api/subsidy/reward-score/latest`.

## LLM 설명형 분석 모듈 (Deterministic Fallback)

위험점수, 보상가능성 점수, 룰 기반 탐지 결과를 입력으로 받아 **왜 검토 후보인지, 어떤 공개자료 근거가 있는지, 추가 확인사항이 무엇인지**를 사람이 읽기 쉬운 설명으로 정리합니다. 이번 단계에서는 실제 LLM API를 호출하지 않고 deterministic fallback 분석기로 검증하며, API 키를 코드에 추가하지 않습니다.

- 분석 모듈: [`src/analysis/llmExplanationAnalysis.ts`](./src/analysis/llmExplanationAnalysis.ts)
- 표준 타입: [`src/types/llmExplanationAnalysis.ts`](./src/types/llmExplanationAnalysis.ts)
- 운영 가이드: [`docs/LLM_EXPLANATION_ANALYSIS_GUIDE.md`](./docs/LLM_EXPLANATION_ANALYSIS_GUIDE.md)
- CLI: [`scripts/run-llm-explanation-analysis.ts`](./scripts/run-llm-explanation-analysis.ts)

결과는 `summary`, `whyFlagged`, `keyEvidence`, `riskSignals`, `rewardPossibilityNote`, `additionalChecks`, `limitations`, `safetyDisclaimers`, `reviewRequired`를 포함합니다. 설명은 공개자료 기준의 검토 보조이며 확정 판단이 아닙니다. 개인정보 원문, 계좌번호, 주민번호, 전화번호, 상세주소, 대표자명은 prompt/explanation/report에 넣지 않습니다.

```bash
npm run test:llm-explanation
npm run analysis:llm-explain -- --fixture 100
npm run analysis:llm-explain -- --input data/risk/score/runs/xxx/risk-score-report.json
npm run analysis:llm-explain -- --input data/risk/runs/xxx/rule-results.json   # 체크리스트 60 룰 5종 결과 입력
npm run check:llm-explanation
```

> 체크리스트 63: 결과에 `candidateId`·`notLegalConclusion:true`·`rewardGuaranteed:false`를 포함하고 산출물은 `data/analysis/llm-explanation/runs/{runId}/`에 `llm-explanation-report.json`·`llm-explanation-summary.md`·`metadata.json`(`llmApiCalled:false`)로 저장합니다. 선택 API: `POST /api/subsidy/analysis/explain/run`, `GET /api/subsidy/analysis/explain/latest`.

## Citation Validation / 근거 검증 모듈 (Hallucination Guard)

AI 리포트의 모든 핵심 주장에 **원문 URL / 파일명+행번호 / recordId / evidenceId** 같은 공개자료 근거를 연결해 AI 환각을 줄이고 사람이 원문을 따라 사실관계를 확인할 수 있게 합니다. 위험점수, 보상가능성 점수, LLM 설명형 분석 결과에 citation/evidence 검증을 연결하며, 리포트 생성 전 근거 검증을 통과해야 합니다.

- 검증 모듈: [`src/analysis/citationValidator.ts`](./src/analysis/citationValidator.ts)
- 표준 타입: [`src/types/citationValidation.ts`](./src/types/citationValidation.ts)
- 운영 가이드: [`docs/CITATION_VALIDATION_GUIDE.md`](./docs/CITATION_VALIDATION_GUIDE.md)
- CLI: [`scripts/validate-report-citations.ts`](./scripts/validate-report-citations.ts)

- 핵심 주장(core claim)에는 sourceUrl / evidenceUrl / sourceFileName+sourceRowNumber / attachmentUrl / evidenceId 같은 공개자료 근거가 필요합니다. recordId와 computed_model은 보조 근거입니다.
- 근거 없는 핵심 주장은 warning 모드에서 warning, strict 모드에서 fail로 처리되며 "근거 보강 필요"로 표시됩니다.
- 로그인 필요·비공개·내부자료 URL은 근거로 인정하지 않으며, 개인정보 원문이 포함된 citation은 차단(fail)됩니다.
- 점수 계산 결과와 내부 판단은 모델 계산 결과(검토 신호, computed_model)로 표시하고 외부 사실처럼 쓰지 않습니다.

```bash
npm run test:citations
npm run validate:citations -- --fixture
npm run validate:citations -- --fixture --strict
npm run validate:citations -- --input data/analysis/llm-explanation/runs/xxx/llm-explanation-report.json
npm run validate:citations -- --input data/risk/runs/xxx/rule-results.json --strict   # 체크리스트 60 룰 5종 결과
npm run check:citations
```

> 체크리스트 64: 검증 결과에 `totalClaims`·`supportedClaims`·`unsupportedClaims`·`warningClaims`·`failedClaims`·`strictPassed`·`suggestedFixes`·`privacyBlockedCitations`를 포함합니다. `rule-results.json`(룰 5종)을 직접 입력으로 받아 핵심 주장 근거를 검증합니다. `--fixture --strict`는 근거 누락 사례를 일부러 포함한 데모이며, `rule-results → analysis:llm-explain → validate:citations --strict` 실제 파이프라인으로 strict 통과를 확인할 수 있습니다. 선택 API: `POST /api/citations/validate`, `GET /api/citations/latest`.

## 신고 전 사실점검 11항목 (Pre-Report Fact Check) · 체크리스트 65

보조금 후보 Case가 **신고서 초안 생성**으로 넘어가기 전에 반드시 거쳐야 하는 **신고 전 사실점검 11항목** 안전 게이트입니다. 공개자료 여부·원본 출처·수집일시·식별 가능 여부·금액/연도/기관·위험룰 근거·위험점수/보상가능성 점수·LLM 설명형 분석·근거검증 strict·개인정보/API 키 스캔·사람 검토 승인을 점검합니다. **부정수급으로 단정하는 판단이 아닙니다.**

- 게이트 모듈: [`src/policy/subsidyPreReportChecklist.ts`](./src/policy/subsidyPreReportChecklist.ts)
- 표준 타입: [`src/types/subsidyFactCheck.ts`](./src/types/subsidyFactCheck.ts)
- CLI: [`scripts/run-subsidy-fact-check.ts`](./scripts/run-subsidy-fact-check.ts)
- 운영 가이드: [`docs/SUBSIDY_PRE_REPORT_FACT_CHECK.md`](./docs/SUBSIDY_PRE_REPORT_FACT_CHECK.md)

각 항목은 `PASS`/`WARNING`/`FAIL`/`NOT_APPLICABLE`로 표시되고, **FAIL이 하나라도 있으면 `canGenerateReportDraft=false`** 입니다. 근거검증 strict 미통과·개인정보 스캔 미통과·사람 검토 승인 없음은 기본 차단(`BLOCKED`) 사유입니다. 결과에는 `overallStatus`·`canGenerateReportDraft`·`reviewRequired:true`·`notLegalConclusion:true`·`autoSubmitAvailable:false`·`rewardGuaranteed:false`가 포함됩니다.

```bash
npm run test:subsidy-fact-check
npm run subsidy:fact-check -- --fixture
npm run check:subsidy-fact-check
```

산출물(gitignore): `data/fact-check/runs/{runId}/` 에 `fact-check-report.json`·`fact-check-summary.md`·`metadata.json`. 선택 API: `POST /api/subsidy/fact-check/run`, `GET /api/subsidy/fact-check/latest`, `GET /api/subsidy/candidates/:id/fact-check`.

> 다음 단계에서 사실점검을 통과(`canGenerateReportDraft=true`)한 Case에만 보조금 신고서 초안 생성·실제 신고처 연결·결과/보상 기록을 진행합니다(이번 범위 밖). 자동 신고·자동 제출은 없습니다.

## 브라우저에서 보조금 엔진 결과 확인 (UI 연결)

체크리스트 11~25에서 구현한 보조금 탐지 엔진(수집기·파서·정규화·품질검증·룰 탐지·위험점수·보상가능성 점수·LLM 설명형 분석·근거 검증)을 브라우저 화면에서 직접 확인할 수 있습니다.

1. `npm run dev` 실행 후 브라우저에서 **http://localhost:3001** 접속
2. **보조금 부정수급** 모듈/카드로 이동
3. "보조금 의심 후보 (프로토타입)" 카드 하단의 **"보조금 엔진 샘플 실행"** 버튼 클릭 (현황만 보려면 "엔진 현황만 보기")
4. 화면에 표시되는 내용:
   - 보조금 탐지 엔진 현황(수집/룰/스코어링/AI 분석)
   - 데이터 기준선(fixture 1,000건, 중복률/결측률)
   - 룰 탐지 결과 5종(반복 수급·동일 주소·결과물/정산·예산 집행 이상·계약업체 연관성) 후보 수와 예시 카드
   - 100점 위험점수(A/B/C)와 scoreBreakdown
   - 보상가능성 점수(High/Medium/Low)
   - LLM 설명형 분석(왜 검토 후보인지/어떤 근거/추가 확인사항)
   - 근거 검증(citation validation) 상태와 차단 건수
   - 각 엔진의 JSON/Markdown 리포트 생성 CLI 경로

> **현재 화면은 fixture 기반 검증 결과를 보여줍니다.** 실제 신고 또는 보상금 수령을 보장하지 않습니다. 실제 LLM API·외부 API는 호출하지 않으며, 자동 신고 기능은 제공하지 않습니다. 실제 공공데이터 API/실데이터 연결과 실제 LLM 연동은 후속 작업입니다.

- 서버 API: `GET /api/subsidy/demo-status` (엔진 현황), `GET /api/subsidy/run-demo` (fixture 통합 결과)
- 데모 집계 모듈: [`src/services/subsidyEngineDemo.ts`](./src/services/subsidyEngineDemo.ts)
- 검증: `npm run test:subsidy-ui-demo`, `npm run check:subsidy-ui-demo`

## Approval Gate

This project does **not** submit reports automatically. The system's allowed actions are strictly limited to:

- copy report draft
- download report draft (Markdown / Plain Text / DOCX)
- open official reporting links (simple external links, no autofill / no auto-login)
- manually mark a Case as `SUBMITTED` after the user has submitted outside the system
- add review notes

Not allowed (blocked by code, UI, and policy):

- automatic submission to external agencies
- automatic login / form autofill
- reward claim automation
- bypassing human review

`SUBMITTED` is **only an internal record** of manual external submission by the user. Transition requires `confirmManualSubmission: true` and `reviewerName`.

API: `GET /api/policy/approval-gate` exposes the policy + official reporting links. Static safety check: `npm run check:policy`.

See [`docs/approval_gate.md`](./docs/approval_gate.md) and [`scope.md` §9](./scope.md) for the full policy.

## Human Review Queue

AI가 찾은 신고 후보 Case를 사람이 검토·승인·보류·신고초안·제출(내부 기록)·결과확인·폐기 단계로 관리하는 대기열입니다.

Statuses:

- `DRAFT` 신규 / `REVIEW` 검토중 / `HOLD` 보류 / `APPROVED` 승인
- `REPORT_DRAFT` 신고초안 / `SUBMITTED` 제출(내부 기록) / `OUTCOME_CHECK` 결과확인 / `REJECTED` 폐기

> `SUBMITTED`는 사용자가 외부 공식 창구에 **직접 제출한 사실을 내부 기록**으로 표시할 뿐입니다. **시스템은 외부 신고기관에 자동 제출하지 않습니다.**

API:

- `GET /api/review/queue` (필터/카운트/정렬/페이지)
- `GET /api/review/queue/:caseId` (상세 + evidence + report 요약 + 로그)
- `PATCH /api/review/queue/:caseId/status` (상태 변경 — SUBMITTED는 `confirmManualSubmission` 필수)
- `POST /api/review/queue/:caseId/note` (검토 메모)
- `GET /api/review/queue/:caseId/logs` (상태/메모 통합 로그)

자세한 명세는 [`docs/human_review_queue.md`](./docs/human_review_queue.md) 참고.

## Report Draft

사람이 검토·수정해 공식 신고 창구에 직접 제출할 수 있는 **신고서 초안**을 생성합니다. **자동 신고는 수행하지 않습니다.**

- 저장 위치: `data/reports/{caseId}/`
- 표준 파일: `report.md`, `report.txt`, `report.docx`, `report_metadata.json`
- 포함 내용: 신고 후보 요약, 육하원칙, 위반 의심 문구 표(RuleAgent), AI 문맥 검토 요약(AnalyzerAgent), 우선순위 점수(ScoringAgent), 증거 자료 목록(Evidence Package), 신고처 후보(agency_config), 사람 검토 체크리스트, 중립 신고 문구 예시, 피해야 할 표현
- 금지 표현 자동 sanitize ("불법 확정"/"포상금 보장"/"사기" 등 → 중립 표현)
- API: `POST /api/cases/:id/report/draft`, `GET /api/cases/:id/report`, `GET /api/cases/:id/report/:fileName`
- `GET /api/cases/:id` 응답에 `reportSummary` 자동 포함

신고서 파일은 **로컬 산출물이며 Git에 커밋되지 않습니다.** 사용자가 검토·수정 후 외부 신고기관에 **직접 제출**해야 합니다.

자세한 명세는 [`docs/report_draft.md`](./docs/report_draft.md) 참고.

## Evidence Package

분석된 신고 후보 Case에 대해 원본 페이지가 삭제·수정되더라도 사람이 검토할 수 있도록 **증거 패키지**를 저장합니다.

- 저장 위치: `data/evidence/{caseId}/`
- 표준 파일: `page.html`, `page.txt`, `screenshot.png`, `page.pdf`, `metadata.json`, `manifest.json`
- 선택 산출물: `extraction.json`, `rules.json`, `analysis.json`, `scoring.json`
- 모든 파일에 SHA-256 해시 + manifest 기록
- **증거 완성도 점수** (0~100): HTML(15) + TEXT(15) + Screenshot(25) + PDF(25) + Metadata(10) + Manifest(10) — 법 위반 점수가 아닌 패키지 충실도 표시
- API: `GET /api/cases/:id/evidence/package`, `POST /api/cases/:id/evidence/package`, 그 외 기존 evidence 라우트
- `GET /api/cases/:id` 응답에 `evidencePackage` 요약 자동 포함

증거 파일은 **로컬 산출물이며 Git에 커밋되지 않습니다.** 자동 신고는 수행하지 않으며, 사람이 외부 신고기관에 직접 제출할 때 참고·첨부할 수 있도록 보존됩니다.

자세한 명세는 [`docs/evidence_package.md`](./docs/evidence_package.md) 참고.

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

> 🔑 **OpenAI / Naver Search API 발급·연결을 처음 한다면** 초보자용 단계별 가이드 [`docs/API_SETUP.md`](./docs/API_SETUP.md)를 먼저 보세요. 기본값은 `MOCK_AI=true`·`MOCK_SCOUT=true`(비용·외부호출 없음)이며, 실제 호출은 본인이 직접 키를 설정한 경우에만 동작합니다. Naver Search API는 `NAVER_CLIENT_ID`+`NAVER_CLIENT_SECRET`이 둘 다 있을 때만 활성화되고, 없으면 mock 후보 발굴로 안전하게 동작합니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3001` | Express 서버 포트 |
| `MOCK_AI` | `true` | `true`면 OpenAI를 호출하지 않고 룰 기반 mock 분석으로 동작 |
| `OPENAI_API_KEY` | (없음) | `MOCK_AI=false`일 때만 사용 |
| `AI_MODEL` | `gpt-4.1-mini` | OpenAI 모델명 (실제 호출 시) |
| `DATA_DIR` | `./data` | 데이터 루트 |
| `EVIDENCE_DIR` | `${DATA_DIR}/evidence` | 증거 패키지 저장 경로 |
| `REPORTS_DIR` | `${DATA_DIR}/reports` | 신고서 초안 저장 경로 |
| `EVIDENCE_ENABLE_SCREENSHOT` | `false` | Playwright 확인 전 최소 실행에서는 캡처 비활성 |
| `EVIDENCE_ENABLE_PDF` | `false` | Playwright 확인 전 최소 실행에서는 PDF 캡처 비활성 |

## Troubleshooting

문제가 생기면 순서대로 확인하세요.

| 증상 | 확인할 것 |
|---|---|
| Node.js 버전 오류 | `node -v`가 `v18` 이상인지 확인하고, 낮으면 Node.js LTS 설치 후 터미널을 다시 엽니다. |
| `npm install` 실패 | Node.js 18 이상인지 (`node -v`), 회사·학교 네트워크 프록시 차단 여부 |
| `.env` 파일이 없음 | `Copy-Item .env.example .env`(Windows) 또는 `cp .env.example .env`(macOS/Linux)를 실행합니다. |
| `npm run dev` 시 포트 사용 중 | `.env`의 `PORT` 변경 또는 `Get-NetTCPConnection -LocalPort 3001`로 점유 프로세스 확인 |
| Playwright가 설치되지 않음 | 최소 실행은 캡처 옵션을 `false`로 유지합니다. 캡처가 필요하면 `npm run playwright:install` 후 공개 URL 1개로 수동 확인합니다. |
| `/api/health`가 안 뜸 | 서버 콘솔의 에러, 다른 프로세스가 3001 점유 여부 |
| 분석 결과 AI 요약이 비어 있음 | `MOCK_AI=true` 상태로 동작 중인지 (.env 확인). 실제 모델 호출은 `MOCK_AI=false` + 유효한 `OPENAI_API_KEY` 필요 |
| `data/`에 파일이 안 생김 | 폴더 권한, 디스크 여유 공간 |
| 빌드 시 import 경로 에러 | `tsconfig.json`의 `module: NodeNext` 유지, `.js` 확장자 import 유지 |

## Home Notice and Runtime Status

대시보드 상단의 **Home / Notice** 카드(`#homeNoticeCard`)는 현재 프로그램의 상태를 한눈에 보여줍니다.

- 오늘 날짜 (UTC 기준), 앱 이름·버전, `NODE_ENV` 환경
- 현재 실행 모드: `MOCK` / `MIXED` / `REAL_READY` (Mock 검증 단계 / 일부 실제 / 실전 키 설정 완료)
- API 연결 여부: OpenAI · Naver (**API 키 값은 표시하지 않으며 `configured` 플래그만 노출**)
- Scheduler 활성/비활성, Scout 모드(mock/real), DB 사용 여부
- **실전 가능 단계** (`readiness.stage` enum): `SETUP_REQUIRED` / `MOCK_VALIDATION` / `MANUAL_URL_TEST` / `API_KEY_REQUIRED` / `REAL_DATA_TEST` / `HUMAN_REVIEW_READY` / `OPERATION_READY`
- 안전 공지 박스 — 자동 신고 미수행, 사람 검토 필수, 포상금 보장 없음
- 빠른 가이드 anchor 링크 (운영 대시보드, Eval, Review Queue, 개인정보 등)

이 카드는 `GET /api/dashboard/summary` 응답의 `app`, `mode`, `apiConnections`, `readiness`, `guideLinks`, `homeNotices`, `todayDate`, `safetyNotice` 필드를 사용합니다.

**중요 안전 원칙:**

- `readiness.canAutoSubmit`은 항상 `false`이며, `humanReviewRequired`는 항상 `true`입니다.
- `runtimeMode`가 `REAL_READY`라도 **자동 실전 신고가 가능하다는 의미가 아닙니다.** 사람 검토를 거친 뒤 사람이 공식 창구에서 직접 제출해야 합니다.
- 응답에는 `OPENAI_API_KEY`, `NAVER_CLIENT_SECRET` 등 실제 키 값이 절대 포함되지 않습니다.
- 표시 문구는 "검토/신고지원", "실전 검증 단계", "사람 검토 필요" 표현을 사용하며 "포상금 가능"과 같은 표현은 사용하지 않습니다.

## Notice and Practical Guidance

The dashboard shows notice cards for:

- official reward-policy recheck (`official-rule-check`) — 신고포상금 지급 기준·신고처는 기관별 변경 가능하므로 실전 신고 전 공식 페이지 재확인 필요
- API key requirements (`api-key-required`) — Mock 모드에서 실데이터 수집으로 전환 시 필요한 키 설정 안내
- automatic submission prohibition (`approval-gate`) — 자동 신고 금지, 사람이 공식 창구에서 직접 제출
- real-data validation status (`real-data-status`) — Mock/Mixed/Real_Ready 단계 안내
- human review (`human-review-required`), privacy minimization (`privacy-minimization`), current readiness stage (`current-readiness-stage`)

각 카드는 `level` 4종으로 구분됩니다.

| level | 의미 |
|---|---|
| `info` | 일반 안내 |
| `warning` | 실전 전 확인 필요 |
| `danger` | 안전상 반드시 지켜야 할 금지사항 |
| `success` | 통과 또는 준비 완료 상태 |

These notices are practical guidance only. They do not guarantee reward payment or report acceptance. 공식 기준 확인은 사람이 수행하며, 본 도구는 신고지원 / 검토 후보 도구입니다.

## UI Workflow (Field-first Redesign)

공익레이더 UI는 **신고 분야 선택 → 분야별 단계 워크플로우 진행** 흐름으로 구성됩니다.

기본 화면(`#field`) 구조:

- **좌측 사이드바**: 개발 우선순위를 따른 신고 분야 목록 — 건강기능식품 / 일반식품 / 화장품 / 의료기기 / 위조상품 / 원산지 / 보조금(후순위 프로토타입) / 입찰담합(후순위 프로토타입)
- **중앙 워크스페이스**: 선택한 분야의 9단계 워크플로우 — 제도 확인 → 후보 찾기 → 수집/추출 → 룰 탐지 → AI 분석/점수화 → 증거 패키지 → 신고서 초안 → 사람 검토 → 결과 기록
- **우측 컨텍스트 패널**: 선택한 분야의 신고처 · 수집해야 할 자료 · 주의사항 · 현재 단계에서 해야 할 일

각 단계 패널의 "화면 열기" 버튼은 기존 보조 뷰(후보 찾기/분석/검토/신고서/결과 기록)로 이동합니다.

상단 보조 메뉴는 다음 5개입니다.

1. 분야 (`field`) — 신고분야 선택 메인 화면
2. 대시보드 (`home`) — 오늘 상태와 다음 행동 추천
3. 가이드 (`guide`) — Q&A · Reward Registry · 모듈별 Practical Guide
4. 운영/품질 (`ops`) — 대시보드 상세 · Eval · Feedback · Trace · Scheduler · 프로토타입 분석
5. 설정 (`settings`) — Settings · Privacy

상단 헤더는 제품명·실행 모드 배지·API 연결 상태·`자동신고 없음 · 사람 검토 필수 · 수동 제출 기록만 가능` 안전 배지·오늘 날짜를 표시합니다.
이전 워크플로우 사이드바(홈/후보찾기/분석/검토/신고서/결과/가이드/운영/설정 9버튼)는 제거되었고, 해당 뷰들은 보조 메뉴 또는 분야 워크스페이스의 단계 액션에서 진입할 수 있습니다.

자세한 내용은 [`docs/ui_workflow.md`](./docs/ui_workflow.md) 참고.

## Subsidy Practical Guide

보조금 부정수급 의심 후보 탐지 모듈의 실전 기준을 제공합니다.

포함 정보:

- 국민권익위원회 / 청렴포털 보상·포상 안내
- 국민신문고 / 보조금 관리기관 / 관할 지자체 신고처
- 보조금통합포털 / e나라도움 / 보탬e / 공공데이터포털 등 공개자료 소스
- 수집할 보조금 자료 (공고·교부·집행·정산·결과보고서)
- 부정수급 의심 신호 (반복 수급, 동일 주소, 유사 사업명, 결과물 부족 등)
- 신고 전 체크리스트
- 보상·포상 주의사항
- 공식 링크

이 가이드는 공공자료 기반 신고지원 도구 안내이며, 부정수급 여부 또는 보상·포상 지급을 단정하지 않습니다.
특정 단체·개인·사업자를 형사적 표현으로 단정하지 않으며, 보상·포상 여부 확정은 국민권익위원회·보조금 관리기관·관할 지자체 등 관계기관의 공식 기준과 처리 결과(환수·처분·공공기관 수입 회복 등)에 따라 달라집니다.
공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 보상금·포상금 수령을 보장하지 않습니다.

API:

- `GET /api/modules/subsidy-fraud/guide`

자세한 명세는 [`docs/subsidy_guide.md`](./docs/subsidy_guide.md) 참고.

## Bid Collusion Practical Guide

입찰담합 의심 패턴 분석 모듈의 실전 기준을 제공합니다.

포함 정보:

- 공정거래위원회 신고처 (담합 신고 / 신고포상금 안내 / 국민신문고 연계)
- 입찰담합 의심 패턴 (반복 업체군, 순환 낙찰, 들러리, 낙찰률 군집 등)
- 수집할 입찰자료 (정형 데이터: 공고/개찰/투찰금액·률/순위 등)
- 신고 전 체크리스트
- 신고포상금 주의사항 (공식 안내상 최대 30억 원 — 단 수령 보장 아님, 공식 기준 확인 필요)
- 공식 링크

이 가이드는 신고지원 도구 안내이며, 담합 여부 또는 포상금 지급을 단정하지 않습니다.
특정 업체를 형사적 표현으로 단정하지 않으며, 담합 여부 확정은 공정거래위원회 등 관계기관의 공식 조사·조치 결과에 따라 달라집니다.
공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다.

API:

- `GET /api/modules/bid-collusion/guide`

자세한 명세는 [`docs/bid_collusion_guide.md`](./docs/bid_collusion_guide.md) 참고.

## Counterfeit Practical Guide

위조상품 온라인 판매 의심 탐지 모듈의 실전 기준을 제공합니다.

포함 정보:

- 특허청 신고포상금 제도
- 지식재산침해 원스톱 신고상담센터
- 위조상품 의심 신호
- 필요 증거
- 신고 전 체크리스트
- 신고포상금 주의사항
- 공식 링크

이 가이드는 신고지원 도구 안내이며, 위조 여부 또는 포상금 지급을 확정하지 않습니다.
특정 판매자를 형사적 표현으로 단정하지 않으며, 위조 여부 확정은 권리자/관계기관 판단이 필요합니다.
공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다.

API:

- `GET /api/modules/counterfeit-goods/guide`

자세한 명세는 [`docs/counterfeit_guide.md`](./docs/counterfeit_guide.md) 참고.

## False Ad Practical Guide

건강기능식품 온라인 허위·과대광고 모듈의 실전 기준을 제공합니다.

포함 정보:

- 식약처 신고처
- 금지/검토 표현 유형
- 필요 증거
- 신고 전 체크리스트
- 신고포상금 주의사항
- 공식 링크

이 가이드는 신고지원 도구 안내이며, 법 위반 또는 포상금 지급을 확정하지 않습니다.
공익레이더는 외부 신고기관에 자동으로 제출하지 않으며, 포상금 수령을 보장하지 않습니다.

API:

- `GET /api/modules/false-ad/guide`

자세한 명세는 [`docs/false_ad_guide.md`](./docs/false_ad_guide.md) 참고.

## Reward Registry

공익레이더는 모듈별 신고포상금·보상금 제도 안내를 제공합니다.

포함 정보:

- 신고처
- 수집할 자료
- 필요 증거
- 공식 기준 URL
- 지급 기준 요약
- 제외사유와 주의사항

이 정보는 참고용이며 포상금 수령을 보장하지 않습니다.
실전 신고 전 반드시 공식 URL에서 최신 기준을 확인해야 합니다.

API:

- `GET /api/reward-programs`
- `GET /api/reward-programs/:id`
- `GET /api/reward-programs/module/:moduleId`

자세한 명세는 [`docs/reward_registry.md`](./docs/reward_registry.md) 참고.

## Settings

공익레이더는 설정 화면에서 다음 상태를 확인할 수 있습니다.

- Mock/Real 모드
- OpenAI/Naver API 연결 여부
- Scheduler 상태
- Privacy dry-run 상태
- 저장소 경로
- Approval Gate 상태
- Readiness stage

API 키 원문은 표시하지 않습니다.
설정 화면은 조회 전용이며, 외부 신고기관 자동 제출 기능을 제공하지 않습니다.

API:

- `GET /api/settings`

자세한 명세는 [`docs/settings.md`](./docs/settings.md) 참고.

## Guide and Q&A

공익레이더는 사용자 가이드와 Q&A를 제공해 다음을 안내합니다.

- 무엇을 수집하는지 (공개 URL · 광고 문구 · 캡처 · PDF 등 공개자료 기반 증거)
- 어디에 신고하는지 (식약처, 특허청, 공정위, 국민권익위 등 공식 창구)
- 어떤 증거가 필요한지 (모듈별 증거 체크리스트)
- 포상금/보상금 기준은 어디서 확인하는지 (각 기관 공식 페이지 — **공익레이더는 수령을 보장하지 않습니다.**)
- 자동신고가 아니라는 점 (자동 제출·자동 로그인 기능 없음, 사람이 공식 창구에서 직접 제출)
- 개인정보 처리 원칙 (불필요한 개인정보는 저장하지 않음, 마스킹·삭제 기능 제공)

API:

- `GET /api/guide/qa` — 첫 실행 순서, 모듈 가이드, FAQ, 공식 링크, 안전 원칙을 반환합니다.

대시보드 상단 `#guideQaSection` 카드에서 같은 데이터가 시각적으로 표시됩니다. 공식 기준은 변경될 수 있으므로 실전 신고 전 반드시 사람이 직접 재확인하세요.

## Safety Notes

- 이 도구는 **자동 신고 프로그램이 아닙니다.** 외부 신고기관 자동 제출·자동 로그인·자동 민원 기능을 제공하지 않습니다.
- **포상금 수령을 보장하지 않습니다.** 모든 포상·보상 가능성은 공식 규정 확인이 필요합니다.
- **공개자료만** 분석합니다. 비공개 페이지·로그인 우회·개인정보 수집은 금지됩니다.
- AI 분석은 참고용이며, **최종 신고 여부는 사람이 판단**합니다.
- **법률 자문을 대체하지 않습니다.** 공직자 사용자는 직무상 비공개 정보 업로드 금지 등 추가 주의가 필요합니다.
- 자세한 정책은 [`scope.md`](./scope.md), [`mvp_scope.md`](./mvp_scope.md), [`docs/PRD.md`](./docs/PRD.md), [`docs/OPERATING_POLICY.md`](./docs/OPERATING_POLICY.md), [`docs/LEGAL_REVIEW.md`](./docs/LEGAL_REVIEW.md), [`docs/REPORT_LANGUAGE_GUIDE.md`](./docs/REPORT_LANGUAGE_GUIDE.md), [`docs/approval_gate.md`](./docs/approval_gate.md), [`docs/PRE_SUBMISSION_FACT_CHECKLIST.md`](./docs/PRE_SUBMISSION_FACT_CHECKLIST.md), [`docs/privacy_policy.md`](./docs/privacy_policy.md), [`docs/DATA_SOURCE_MAP_GOSIMS.md`](./docs/DATA_SOURCE_MAP_GOSIMS.md), [`docs/DATA_SOURCE_MAP_PUBLIC_API.md`](./docs/DATA_SOURCE_MAP_PUBLIC_API.md), [`docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md`](./docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md), [`docs/G2B_CONTRACT_LINKAGE_MAP.md`](./docs/G2B_CONTRACT_LINKAGE_MAP.md), [`docs/agency_research.md`](./docs/agency_research.md)를 참고하세요.

## Data Source Maps

향후 수집기가 사용할 공개자료의 출처·필드·접근 방법·공개 범위·제한사항을 정리한 조사 문서입니다. 수집기는 별도 단계에서 구현됩니다.

- **국고보조금 (e나라도움 / 공개 통계센터):** [`docs/DATA_SOURCE_MAP_GOSIMS.md`](./docs/DATA_SOURCE_MAP_GOSIMS.md) — 보조사업·내역사업·보조사업자·집행/정산 공개 범위 분류, 22개 필드 후보, CSV/엑셀/TXT/API 접근 방법, 비공개·개인정보 제한사항, 수집기 스키마 초안([`src/types/gosimsDataSource.ts`](./src/types/gosimsDataSource.ts)).
- **공공데이터포털 오픈 API 후보 (보조금·환수·공공재정):** [`docs/DATA_SOURCE_MAP_PUBLIC_API.md`](./docs/DATA_SOURCE_MAP_PUBLIC_API.md) — 국고보조금/지방보조금/집행/정산/환수/감사·점검 관련 오픈 API 후보 7건, 22개 표준 필드, 활용신청·인증키·트래픽 제한 안내, 개인정보 제한사항, 후보 카드 스키마([`src/types/publicApiCandidate.ts`](./src/types/publicApiCandidate.ts)). 모든 후보는 "활용 가능성 검토 대상" — 실제 사용 가능 여부는 수집기 구현 직전에 재확인 필요.
- **경기도 지자체 공시자료 수집 파일럿 대상:** [`docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md`](./docs/LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md) — 경기도(광역) + 31개 시군 총 32개 대상, 8개 자료 유형(보조금 공고/선정/정산/검사·점검/감사결과/환수/예산결산/조례), 7개 키워드 그룹, 최근 2~3년 수집 범위, 수집 제외 기준(로그인/비공개/개인정보 포함 자료), 수집 대상 스키마([`src/types/localGovCollectionTarget.ts`](./src/types/localGovCollectionTarget.ts)). 모든 대상은 "수집 대상 선정 / 후보 / 재확인 필요" 상태 — 게시판 URL 은 지자체 홈페이지 개편으로 변경될 수 있어 수집기 구현 직전에 재확인 필요.
- **나라장터 계약데이터 연계 (보조사업↔공공계약 동일성 후보):** [`docs/G2B_CONTRACT_LINKAGE_MAP.md`](./docs/G2B_CONTRACT_LINKAGE_MAP.md) — 조달청 나라장터 5개 API 후보, 10개 연결 기준, 19개 표준 매핑 필드, 9종 매칭 신호, 4등급 매칭 신뢰도(high/medium/low/excluded), 사업자등록번호/법인등록번호 해시·마스킹 저장 정책, 매핑 후보 스키마([`src/types/g2bContractLinkage.ts`](./src/types/g2bContractLinkage.ts)). 모든 후보는 "동일성 후보 / 추가 검토 필요" — 동일 업체 / 관계 / 담합 / 부정수급 단정 금지, `reviewRequired: true` 강제.
- 검증: `npm run test:datasource-map` / `npm run test:public-api-candidates` / `npm run test:local-gov-targets` / `npm run test:g2b-linkage` — 필수 섹션·URL·정책 키워드·후보 수·스키마 export 정적 검증.

## Claude Code 작업 방식

1. 이 ZIP을 GitHub에 업로드합니다.
2. 엑셀 체크리스트의 순번대로 Claude Code에게 점검시킵니다.
3. 각 단계가 끝나면 `npm run build`, `npm run test`, 실제 URL 분석으로 검증합니다.
