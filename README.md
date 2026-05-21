# 공익레이더

**공개자료 기반 신고 후보 탐지·증거정리·신고서 초안 생성 도구.**

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)

공익레이더는 "포상금 자동화 프로그램"이 아닙니다. 사용자가 입력한 공개 URL을 수집·분석해 의심 문구를 추출하고 증거를 정리하며, 사람이 검토할 수 있는 신고서 초안을 생성합니다. 자동 신고는 수행하지 않으며, 실제 신고 제출은 사람이 공식 창구에서 직접 수행합니다. 포상금 수령을 보장하지 않습니다.

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

- **자동 신고 금지** — 외부 신고기관에 어떤 형태로도 자동 제출/자동 로그인하지 않습니다. 코드/UI/문서/정적 검사 4중 차단([`docs/approval_gate.md`](./docs/approval_gate.md)).
- **사람 검토·승인 필수** — AI 결과는 참고자료이며, 신고서 초안은 사람 검토를 거치고 사람이 명시적으로 승인(`human_approved`)해야 다음 단계로 갑니다.
- **신고서 초안 ≠ 실제 신고 제출** — 초안 생성·증거 패키지 생성은 신고가 아닙니다. 사람이 외부 공식 창구에 직접 제출한 뒤 **접수번호(`externalReceiptNo`)를 입력**해야 `manually_submitted` 로 기록됩니다.
- **승인 로그 필수** — 모든 검토 결정은 `caseId / reviewer / decision / reason / evidencePackageId / draftReportId / reviewedAt` 가 포함된 승인 로그를 남깁니다.
- **증거 기반 신고 원칙** — 의심사례는 항상 원본 URL, 수집일시, 캡처/PDF, 추출 텍스트, 해시 manifest 등 추적 가능한 증거와 함께 정리됩니다.
- **단정·비방 표현 금지 / 중립 표현 사용** — 본 시스템은 **위법 여부를 확정하지 않습니다.** 단정·낙인 표현 대신 "의심 신호 / 검토 필요 후보 / 위험 신호 / 추정 / 가능성" 같은 중립 표현만 사용합니다. 금지/권장 표현표는 [`docs/REPORT_LANGUAGE_GUIDE.md`](./docs/REPORT_LANGUAGE_GUIDE.md) 참고, 강제 수단은 `npm run check:language` / `npm run test:language`.
- **법률 자문 대체 아님** — 본 프로젝트는 **법률 자문을 대체하지 않으며, 보상금·포상금 지급을 보장하지 않습니다.** 공식 기준은 [국가법령정보센터](https://www.law.go.kr) 와 각 신고기관 공식 페이지에서 직접 확인해야 합니다. 내부 운영 기준 상세는 [`docs/LEGAL_REVIEW.md`](./docs/LEGAL_REVIEW.md) 참고.

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

## Deployment Guide

상세 가이드: [`docs/deployment_guide.md`](./docs/deployment_guide.md) — Local / Docker / Health / Data / Troubleshooting / Server Notes / Safety.

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

1차 모듈 `false_ad` 구조를 복사해 추가한 2차 분야 모듈입니다. 공개 판매게시글에서 **위조상품 의심 후보**를 탐지하며, **위조 여부를 확정하지 않습니다.** 권리자 감정과 관계기관 판단을 대체하지 않으며, 자동 신고/자동 로그인/비공개 채팅방 수집/판매자 개인정보 추적은 수행하지 않습니다.

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

- **좌측 사이드바**: 신고 분야 목록 (5종) — 건강기능식품 허위·과대광고 / 위조상품 온라인 판매 / 보조금 부정수급 / 입찰담합 / 원산지 표시 위반(준비 중)
- **중앙 워크스페이스**: 선택한 분야의 9단계 워크플로우 — 제도 확인 → 후보 찾기 → 수집/추출 → 룰 탐지 → AI 분석/점수화 → 증거 패키지 → 신고서 초안 → 사람 검토 → 결과 기록
- **우측 컨텍스트 패널**: 선택한 분야의 신고처 · 수집해야 할 자료 · 주의사항 · 현재 단계에서 해야 할 일

각 단계 패널의 "화면 열기" 버튼은 기존 보조 뷰(후보 찾기/분석/검토/신고서/결과 기록)로 이동합니다.

상단 보조 메뉴는 다음 5개입니다.

1. 분야 (`field`) — 신고분야 선택 메인 화면
2. 대시보드 (`home`) — 오늘 상태와 다음 행동 추천
3. 가이드 (`guide`) — Q&A · Reward Registry · 모듈별 Practical Guide
4. 운영/품질 (`ops`) — 대시보드 상세 · Eval · Feedback · Trace · Scheduler · 프로토타입 분석
5. 설정 (`settings`) — Settings · Privacy

상단 헤더는 제품명·실행 모드 배지·API 연결 상태·자동신고 없음 배지·오늘 날짜를 표시합니다.
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
- 자세한 정책은 [`scope.md`](./scope.md), [`mvp_scope.md`](./mvp_scope.md), [`docs/PRD.md`](./docs/PRD.md), [`docs/OPERATING_POLICY.md`](./docs/OPERATING_POLICY.md), [`docs/LEGAL_REVIEW.md`](./docs/LEGAL_REVIEW.md), [`docs/REPORT_LANGUAGE_GUIDE.md`](./docs/REPORT_LANGUAGE_GUIDE.md), [`docs/approval_gate.md`](./docs/approval_gate.md), [`docs/agency_research.md`](./docs/agency_research.md)를 참고하세요.

## Claude Code 작업 방식

1. 이 ZIP을 GitHub에 업로드합니다.
2. 엑셀 체크리스트의 순번대로 Claude Code에게 점검시킵니다.
3. 각 단계가 끝나면 `npm run build`, `npm run test`, 실제 URL 분석으로 검증합니다.
