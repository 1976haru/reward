# Operating Policy — 공익레이더

> Repository / internal project name: `reward-agent-mvp`
> 문서 종류: Operating Policy (운영 정책)
> 관련 문서: [`PRD.md`](./PRD.md), [`scope.md`](../scope.md), [`approval_gate.md`](./approval_gate.md), [`privacy_policy.md`](./privacy_policy.md)

본 문서는 공익레이더 운영자·검토자·개발자가 반드시 지켜야 할 **운영 원칙**과 **체크리스트**를 정의한다. 본 문서는 법률 자문을 대체하지 않으며, 공식 신고기관의 지침이 본 문서와 충돌하면 공식 지침을 우선한다.

---

## 1. 기본 원칙 (Foundational Principles)

공익레이더의 운영은 항상 다음 5가지 원칙 위에서만 작동한다.

1. **자동 신고 금지** — 외부 신고기관에 대한 자동 제출/자동 로그인/자동 민원을 하지 않는다.
2. **사람 검토 필수** — 모든 의심사례는 사람이 검토한 뒤에만 다음 단계로 넘어간다.
3. **증거 기반 신고 원칙** — 신고서 초안은 추적 가능한 공개 증거와 함께만 작성한다.
4. **개인정보 최소 수집** — 필요 없는 개인정보는 수집·저장·전송하지 않는다.
5. **허위·악의적 신고 방지** — 경쟁사 공격, 보복, 함정 유도 목적의 사용을 금지한다.

---

## 2. 자동 신고 금지 (No Auto-Submission)

본 도구는 어떠한 모듈에서도 외부 신고기관에 신고서를 자동 제출하지 않는다.

### 2.1 시스템이 수행할 수 있는 동작 (Allowed Actions)

[`approval_gate.md`](./approval_gate.md) 에 정의된 5가지뿐이다.

- `copy_report_draft` — 신고서 초안 복사
- `download_report_draft` — Markdown / Text / DOCX 다운로드
- `open_official_reporting_link` — 공식 신고처를 새 탭으로 단순 이동 (자동 입력·자동 로그인 없음)
- `mark_as_submitted_manually` — 사람이 외부 창구에 직접 제출한 사실을 내부 기록으로 표시
- `add_review_note` — 사람 검토 메모 추가

### 2.2 어떤 경우에도 수행하지 않는 동작 (Prohibited Actions)

- `auto_submit_report` — 외부 신고기관 자동 제출
- `auto_login_agency` — 신고기관 자동 로그인
- `agency_form_autofill` — 공식 양식 자동 입력
- `reward_claim_automation` — 포상금 자동 신청
- `bypass_human_review` — 사람 검토를 우회한 상태 변경
- `circumvent_access_control` — 접근권한·캡차·차단 우회

### 2.3 강제 수단

- 코드 수준: `src/policy/approvalGate.ts` 와 상태 전이 코드에서 금지 동작 호출 시 거부
- 워크플로우 수준: `src/policy/approvalWorkflow.ts` 가 `createReviewRequest → approveForManualSubmission → confirmManualSubmission` 단계를 강제하고, `blockAutoSubmission` 이 자동 제출 플래그/금지 상태값을 즉시 throw
- API 수준: `GET /api/policy/approval-gate` 가 항상 위 정책을 그대로 반환
- 정적 검사: `npm run check:policy` 가 금지 동작 키워드 + 금지 상태 리터럴(`ai_submitted`/`auto_submitted`/`submitted_without_review`/`reward_claim_auto_submitted`) 을 src/public 에서 스캔
- 테스트: `npm run test:approval` 이 워크플로우 게이트 시나리오 17건을 통과해야 함
- UI 수준: 자동 제출 / 자동 로그인 / 자동 양식 입력 버튼은 만들지 않는다
- 상태 수준: `SUBMITTED` 전이는 `confirmManualSubmission: true` 와 `reviewerName` 둘 다 요구

### 2.4 워크플로우 게이트 요약 (체크리스트 3)

자세한 상태 정의·승인 로그 필드·운영 원칙은 [`approval_gate.md`](./approval_gate.md) §11 참고.

- 허용 상태(7): `draft_created`, `evidence_packaged`, `human_review_required`, `human_approved`, `manually_submitted`, `rejected`, `needs_more_evidence`
- 금지 상태(4): `ai_submitted`, `auto_submitted`, `submitted_without_review`, `reward_claim_auto_submitted`
- 신고서 초안 / 증거 패키지 생성은 **신고가 아니다.** `human_approved` + `externalReceiptNo` + `submittedByHuman=true` 가 모두 갖춰져야 `manually_submitted` 로 기록 가능
- 승인 로그 필수 필드: `caseId / reviewer / decision / reviewedAt / reason / evidencePackageId / draftReportId`, confirm 단계에서는 추가로 `manualSubmissionConfirmed` 와 `externalReceiptNo`

---

## 3. 사람 검토 필수 (Human Review Required)

### 3.1 검토 시점

- AI가 생성한 신고서 초안은 사람이 검토하기 전까지 항상 "초안"이다.
- 다음 상태 전이는 반드시 사람 행동을 요구한다.
  - `REVIEW → APPROVED`
  - `APPROVED → REPORT_DRAFT`
  - `REPORT_DRAFT → SUBMITTED` (외부에서 사람이 제출 후 내부 기록)
  - `SUBMITTED → OUTCOME_CHECK`
  - 모든 상태 → `REJECTED`

### 3.2 검토자가 확인해야 할 항목 (최소 기준)

- 원본 URL 이 현재도 공개되어 있는가
- 의심 표현이 광고/판매 맥락에서 실제로 사용되었는가
- 단순 후기·개인 의견·인용을 위반으로 오인하고 있지 않은가
- 증거 패키지(HTML / Text / Screenshot / PDF / metadata)가 충분한가
- 신고서 초안에 "위법 확정 / 포상금 보장 / 사기 단정" 표현이 남아있지 않은가
- 신고처 후보가 해당 사례에 맞는 공식 창구인가
- 개인정보·민감정보가 신고서 초안에 노출되지 않았는가

### 3.3 검토 결과 기록

- 승인/보류/반려/오탐 결정은 Feedback DB 에 사유와 함께 기록한다.
- 룰/프롬프트/점수 가중치는 Feedback DB 만으로 자동 변경되지 않는다 — 사람이 별도 체크리스트에서 반영한다.

---

## 4. 허위신고 방지 (False-Report Prevention)

공익레이더는 신고가 쉽게 자동화되어 **허위·악의적 신고**가 양산되지 않도록 설계된다.

- AI 분석 결과는 항상 "검토 후보"이며, 위법 여부를 단정하지 않는다.
- 신고서 초안에서 다음 표현은 자동 sanitize 된다.
  - "위법 확정" / "불법 확정" / "사기" / "범죄" / "포상금 보장" / "지급 확정" / "즉시 신고 가능"
- 동일한 URL/상품을 반복 분석·반복 신고하지 않도록 Dedupe Engine 이 canonical URL / 본문/제목 유사도 기반 중복을 표시한다.
- 사용자는 본 도구의 결과를 그대로 신고하지 않고 직접 검토할 책임을 진다 ([`scope.md`](../scope.md) §10).
- 경쟁사 공격·보복·함정 유도 목적의 사용은 금지되며, 발견 시 운영자는 해당 사용자/사용 사례를 차단할 수 있다.
- 본 도구는 특정 개인·사업자·단체를 위법자로 단정하는 어떠한 표현도 산출물(초안/요약/대시보드)에 포함하지 않는다.

---

## 5. 개인정보 최소 수집 (Minimum Personal Data)

자세한 정책은 [`privacy_policy.md`](./privacy_policy.md). 본 절은 운영자가 매일 지켜야 할 요약 기준이다.

### 5.1 수집 금지

- 로그인 페이지 / 회원 전용 / 비공개 SNS / 비공개 채팅방 / 결제 후 접근 가능한 자료
- 약관·robots.txt 가 수집을 금지한 자료
- 차단 우회 / 캡차 우회 / 토큰·쿠키 탈취를 통해야 얻는 자료
- 주민등록번호·민감정보·연락처 대량 목록

### 5.2 입력·저장 시 마스킹

- 검토자가 남긴 메모/노트, Case summary, Feedback memo 는 저장 전에 `MaskingService` 로 자동 마스킹된다.
- 마스킹 토큰: `[masked-email]`, `[masked-phone]`, `[masked-id]`, `[masked-secret]`, `[masked-auth]`, `[masked-cookie]`, `[masked-account]`, `[masked-ip]`, `[masked-address]`
- Trace Log 는 API 키 / 토큰 / 개인정보 / 전체 LLM prompt 본문을 기본 저장하지 않는다.

### 5.3 삭제 정책

- 삭제 API 는 **dry-run 기본 (`PRIVACY_DRY_RUN=true`)**.
- 실제 삭제는 `dryRun: false` + `confirmDelete: true` 둘 다 필요.
- `data/` 하위 화이트리스트 디렉터리만 삭제 가능. `src/`, `public/`, `docs/`, `.env`, `.gitkeep`, `node_modules/`, `dist/` 는 절대 삭제 불가.
- 자동 영구 삭제 기능은 제공하지 않는다. 운영자의 명시적 요청으로만 작동한다.

### 5.4 보존기간 (기본값, `.env` 로 조정)

- Trace: 30일
- Evidence / Report: 90일
- Feedback / Case: 180일

### 5.5 공개자료 중심 분석 / 개인정보 최소수집 정책 (체크리스트 5)

본 절은 [`privacy_policy.md`](./privacy_policy.md) 의 "개인정보 처리 기준" §A~§J 의 운영 요약이다. 구체 표·금지 필드·마스킹 예시는 해당 문서를 참조한다.

- **공개자료 중심 분석** — 공시·공공데이터·공개 사업 공고·공개 정산자료 만 입력으로 받는다. 비공개 자료/로그인 우회/약관 위반 수집은 [`scope.md`](../scope.md) §3 와 §4 에 의해 금지된다.
- **저장 금지 정보** — 주민등록번호 / 외국인등록번호 / 여권번호 / 운전면허번호 / 계좌번호 / 카드번호 / 휴대폰번호 / 개인 이메일 / 상세주소 / 생년월일 / 건강정보 / 범죄경력 / 정치적 견해 / 종교 / 노동조합 가입 / 성생활 / 미성년자 개인정보 / 신고자 신원정보의 불필요한 노출 — **시스템에 저장하지 않는다.**
- **저장 전 마스킹** — 사람이 입력한 메모/노트/Case summary 는 저장 전 `MaskingService` (기존) + `sanitizeForStorage` (신규 `src/policy/privacyGuard.ts`) 둘 다 통과한다.
- **AI 프롬프트 전 정제** — AI 호출 직전에 `sanitizeForAI` 를 통과시켜 개인정보를 마스킹하고 민감정보 키워드를 `[민감정보 제거]` 로 대체한다. 민감정보 포함 문서는 AI 에 전달하지 않는다.
- **로그 원문 개인정보 금지** — Trace Log 는 기존 `maskSensitive` + privacyGuard 의 정책 가드를 통해 원문 PII 를 저장하지 않는다 (`TRACE_STORE_FULL_PROMPT=false` 기본).
- **신고자 정보 분리 저장** — 신고자 신원정보(이름/연락처/소속) 는 증거 패키지(`data/evidence/{caseId}/`) 와 분리 저장한다.
- **검증 수단** — `npm run check:privacy` (정적 검사: 사용자 노출 텍스트에 원문 RRN/휴대폰/이메일/계좌 패턴 검출), `npm run test:privacy` (마스킹/검출/sanitize 시나리오 28건), `npm run check:policy` (approval-gate + language + privacy 통합 실행).

---

## 6. 증거 기반 신고 원칙 (Evidence-Based Reporting)

본 도구는 **공개자료 기반의 추적 가능한 증거 없이 신고서 초안을 만들지 않는다.**

### 6.1 모든 신고서 초안에 포함되어야 하는 최소 증거

- 원본 URL
- 수집일시 (UTC)
- 페이지 제목
- 본문 텍스트 추출본
- 의심 표현 목록 (RuleAgent 결과)
- AI 문맥 검토 요약 (AnalyzerAgent, mock 가능)
- 우선순위 점수 (ScoringAgent, 0~100)
- 증거 파일 목록 + SHA-256 해시 (manifest)
- 가능한 경우: Screenshot, PDF

### 6.2 증거 완성도 점수

증거 패키지의 충실도는 0~100 점으로 표시된다 (HTML 15 + TEXT 15 + Screenshot 25 + PDF 25 + Metadata 10 + Manifest 10).
이 점수는 **법 위반 점수가 아니라 증거 패키지의 충실도** 표시이며, 사람 검토 시 보강 여부 판단에만 사용한다.

### 6.3 출처가 사라질 가능성에 대한 대비

- 페이지가 수정·삭제될 수 있으므로 수집 시점의 HTML / Text / Screenshot / PDF 를 함께 저장한다.
- 모든 파일의 SHA-256 해시를 manifest 에 기록해 사후 위변조 여부를 검증할 수 있게 한다.
- 증거 파일은 로컬 산출물이며 Git 에 커밋되지 않는다 (`.gitkeep` 만 추적).

---

## 7. 신고 전 최종 확인 체크리스트 (Pre-Report Checklist)

사람 검토자는 외부 신고 전에 아래 항목을 모두 확인하고 통과해야 한다.

### 7.1 사실 관계

- [ ] 원본 URL 이 현재도 공개되어 있다 (또는 캡처/PDF 로 보존됨).
- [ ] 의심 표현이 실제 광고·판매·공시 맥락에서 사용되었다.
- [ ] 단순 후기·개인 의견·인용을 위반으로 오인하지 않았다.
- [ ] 동일 사례에 대한 중복 신고 가능성을 Dedupe 결과로 확인했다.

### 7.2 증거 패키지

- [ ] 원본 URL, 수집일시, 페이지 제목, 본문 텍스트가 모두 저장되어 있다.
- [ ] Screenshot 또는 PDF 가 1개 이상 저장되어 있다 (가능한 경우).
- [ ] manifest.json 의 SHA-256 해시가 모든 파일에 대해 기록되어 있다.
- [ ] 증거 파일에 개인정보가 노출되어 있지 않거나, 마스킹/제거되었다.

### 7.3 신고서 초안

- [ ] "위법 확정 / 사기 / 범죄 / 포상금 보장" 등 단정 표현이 남아있지 않다.
- [ ] 특정 개인·사업자를 위법자로 단정하는 표현이 없다.
- [ ] 신고처 후보가 해당 사례에 맞는 공식 창구이며, 공식 URL 이 최신이다.
- [ ] 모듈별 신고서 양식의 필수 항목이 모두 채워져 있다.

### 7.4 신고처·포상금 기준

- [ ] 신고처의 공식 페이지에서 지급 기준·접수 방법을 다시 확인했다 (Reward Registry 는 참고용).
- [ ] 포상금 수령을 보장한다고 사용자에게 안내하지 않았다.
- [ ] 신고는 외부 공식 창구에서 사람이 직접 제출한다.

### 7.5 책임 확인

- [ ] 본 신고의 책임이 사용자 본인에게 있음을 인지했다.
- [ ] 본 신고가 경쟁사 공격·보복·함정 유도 목적이 아님을 확인했다.

체크리스트 일부가 통과되지 못한 Case 는 `HOLD` 또는 `REJECTED` 로 표시하고 사유를 Feedback DB 에 남긴다.

---

## 8. 결과 추적 원칙 (Outcome Tracking)

### 8.1 기본 원칙

- 시스템은 외부 신고기관에 자동 제출하지 않는다.
- `SUBMITTED` 는 사람이 외부 공식 창구에 직접 제출한 사실을 내부에 기록한 상태일 뿐이다.
- 신고 후 결과(접수번호 / 처리상태 / 결과 / 환수·처분 여부 / 보상·포상 관련 여부)는 사람이 공식 창구에서 확인한 뒤 Outcome Tracker 에 수동 입력한다.
- `rewardAmount` 는 "사용자 입력 지급 확인 금액"이며, **예측치가 아니다.** 본 도구는 포상금 수령을 보장하지 않는다.

### 8.2 기록 항목

- 제출일시, 접수번호 preview (전체는 저장 시 마스킹 가능)
- 처리상태 (13개 enum)
- 처리결정 (7개 enum)
- 결과 메모 / 반려 사유 / 보완 요청 본문 — **저장 전 자동 마스킹**
- 보상·포상 관련 결과 (6개 enum, 지급 확정/지급 보류/지급 없음/조회중 등)

### 8.3 결과를 다음 사이클로 환류

- `REJECTED / CLOSED` Outcome 은 `recommendedFeedback` 으로 Feedback DB 연결을 유도한다.
- Feedback 사유를 누적해 룰/프롬프트/점수 가중치 개선의 근거로 사용한다 — **자동 변경은 하지 않는다.**
- Dashboard 에 KPI 로 자동 집계되며, Trace Log 에 `state_change` + `human_action` 이벤트로 남는다.

---

## 9. 정책 변경 절차

- 본 문서, [`scope.md`](../scope.md), [`PRD.md`](./PRD.md), [`approval_gate.md`](./approval_gate.md), [`privacy_policy.md`](./privacy_policy.md), [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) 의 변경은 PR 단위로만 적용한다.
- 자동 신고 허용 / 사람 검토 우회 / 개인정보 수집 확대 방향의 변경은 어떤 PR 에서도 받아들이지 않는다.
- 정책 변경 시 `npm run check:policy` 가 통과해야 머지 가능하다.

---

## 10. 법률 검토 반영 원칙

본 절은 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) 의 내부 운영 기준을 운영정책으로 끌어와 매일 지켜야 할 형태로 정리한 것이다. 본 절은 **법률 자문을 대체하지 않으며**, 최신 조문·기관 지침 확인은 반드시 [국가법령정보센터(law.go.kr)](https://www.law.go.kr) 와 각 신고기관 공식 페이지에서 한다.

### 10.1 검토 대상 법령 (운영자 인지 범위)

- 공공재정 부정청구 금지 및 부정이익 환수 등에 관한 법률
- 부패방지 및 국민권익위원회의 설치와 운영에 관한 법률
- 공익신고자 보호법
- 개인정보 보호법
- 보조금 관리에 관한 법률 / 지방자치단체 보조금 관리에 관한 법률
- 형법(무고·명예훼손·업무방해 등) 관련 허위신고 위험

세부 검토표는 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) §3 참고.

### 10.2 신고대상 판단 기준 (운영 요약)

- 본 도구는 신고대상 여부를 **확정하지 않는다.** 항상 "검토 필요 후보" 또는 "의심 패턴" 으로만 표시한다.
- 신고대상 후보의 최소 요건: **공공재정이 포함된 사안** + **거짓 신청/허위 증빙/목적 외 사용/중복 수급/정산 누락** 등 검증 가능한 신호.
- 다음은 후보에서 제외하거나 보류한다: 단순 정책 불만, 추측성 제보, 비공개 자료 기반 제보, 경쟁사·보복 목적이 명백한 제보, 단순 명예훼손성 글.
- 검토자는 위 기준을 Feedback DB 에 사유와 함께 남긴다 (§3.3, §7).

### 10.3 보상금/포상금 비보장 원칙 (운영 요약)

- 보상금·포상금 수령 가능성은 **별도 필드**로만 관리한다. 어디에서도 "지급 확정" 으로 표시하지 않는다.
- 사용자 노출 산출물(README / Reward Registry / Practical Guide / Settings / 신고서 초안 / 응답 메시지)은 다음 표현을 사용한다.
  - "보상금 받을 수 있음" 금지 → **"보상금 가능성 검토"**
  - "예상 포상금 N원" 단정 금지 → **"공식 기준은 각 기관 공식 페이지에서 직접 확인"**
- Outcome Tracker 의 `rewardAmount` 는 "사용자 입력 지급 확인 금액" 이며 예측치가 아니다.
- 자세한 표준 문구는 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) §9 표준 문구 참고.

### 10.4 공직자 사용 제한 주의

- 공직자가 **직무상 취득한 비공개 정보**를 본 도구에 업로드·분석하는 행위는 별도 검토 대상이다.
- 공직자 사용자는 사용 전에 다음을 확인해야 한다.
  - 입력 자료가 공개자료인지 확인
  - 직무상 비밀·내부자료·개인정보를 업로드하지 않을 것
  - 이해충돌(자신·직계친족·소속 부서 관련 사업) 여부 확인
  - 소속 기관의 내부신고/외부신고 우선순위 규정 확인
- UI 차원에서는 공직자 사용자 경고문 또는 사용 전 확인 체크박스를 추가한다(LEGAL-003, UI TODO).
- 표준 경고 문구: [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) §9.4.

### 10.5 개인정보 최소수집 원칙 (요약 / §5 와 연결)

- 신고자 이름·연락처·소속·직무상 취득 여부는 **최소한**으로만 관리한다.
- 신고자 신원정보는 증거 패키지(`data/evidence/`)와 **분리 저장**을 원칙으로 한다.
- 메모/노트/리포트 본문은 저장 전 `MaskingService` 자동 마스킹.
- 주민등록번호 등 민감정보는 저장하지 않는다 — 발견 즉시 마스킹/삭제 검토.

### 10.6 허위신고 방지 원칙 (요약 / §4 와 연결)

- 신고서 초안에서 "위법 확정 / 사기 / 범죄 / 포상금 보장 / 지급 확정" 등 단정 표현은 자동 sanitize 된다.
- AI 산출물은 "의심 / 검토 필요 / 후보" 등 **중립 표현**만 사용한다.
- 무고·명예훼손·업무방해 위험을 줄이기 위해 검토자는 신고 전 §7 체크리스트를 통과해야 한다.

### 10.7 자동신고 금지 원칙 (요약 / §2 와 연결)

- 본 도구는 외부 신고기관에 자동 제출/자동 로그인/자동 양식 입력을 어떤 모듈에서도 수행하지 않는다.
- 사람 검토 후 사용자가 외부 공식 창구에서 **직접 제출**한 사실만 `SUBMITTED` 로 기록한다.
- 코드/API/UI/정책 4중 차단 — [`approval_gate.md`](./approval_gate.md) 와 `npm run check:policy` 로 강제.

### 10.8 비대체·내부기준 선언

- 본 문서 §10 및 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) 전체는 **법률 자문을 대체하지 않는** 내부 운영 기준이다.
- 구체 사안의 법령 적용 여부는 변호사·법무팀·관계기관의 공식 검토가 필요하다.
- 본 절과 모듈별 가이드/도구 동작이 충돌할 경우 본 절과 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) 가 우선한다.

---

## 11. 표현 통제 원칙 (Neutral Language Policy)

본 절은 [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) 의 핵심 원칙을 운영정책으로 끌어와 매일 지켜야 할 형태로 정리한 것이다. 상세 금지/권장 표현표와 표준 면책 문구는 [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) 참고.

### 11.1 단정 표현 금지

- 사용자 노출 산출물(AI 리포트 / 신고서 초안 / 대시보드 / API 응답 메시지 / UI 카드 / 응답 문구 본문)에서 "확정 / 범죄 / 불법 / 사기 / 유죄 / 고의 범행 / 반드시 신고 / 무조건 신고 / 처벌 대상 확정 / 환수 대상 확정 / 보상금 지급 확정" 같은 단정 표현은 사용하지 않는다.
- 단정 표현이 산출물에 남으면 sanitize 단계(`sanitizeReportText`) 또는 정적 검사(`npm run check:language`) 가 차단한다.

### 11.2 비방·낙인 표현 금지

- 특정 개인·사업자·단체를 "부정수급자 / 범죄자 / 사기꾼 / 허위 수급자 / 위법 행위자" 등으로 부르는 산출물은 만들지 않는다.
- 대체 표현: "관련 사업자(검토 필요)", "의심 사례 관련 대상", "검토 후보".

### 11.3 중립 표현 사용

- 의심·검토·후보 중심으로 표현한다: **의심 신호 / 검토 필요 / 추가 확인 필요 / 위험 신호 / 이상 패턴 / 신고 후보 / 제보 후보 / 검토 후보 / 가능성 / 추정 / 정황 / 자료상 불일치 / 반복 수급 패턴 / 중복 가능성 / 목적 외 사용 의심 / 정산 확인 필요 / 기관 검토 필요 / 사람이 최종 판단 필요**.
- 표 형식 매핑은 [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) §3 (금지→대체) 및 §4 (상황→권장) 참고.

### 11.4 AI 리포트 문구 검수

- AnalyzerAgent / ScoringAgent / ReportService 산출물은 [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) §5 의 규칙을 따른다.
- 위험도는 "위험 점수" / "검토 우선순위" 로만 표현하고, 등급은 ScoringAgent 의 4단계(최우선 검토 / 우선 검토 / 검토 필요 / 낮음) 라벨을 그대로 쓴다.
- AnalyzerAgent 응답에는 항상 `notLegalConclusion: true` / `rewardGuaranteed: false` 가 설정되어야 하며, sanitize 가 금지 표현을 자동 치환한다.

### 11.5 신고서 초안 문구 검수

- 신고서 초안 머리말은 "신고합니다" 가 아니라 **"신고 검토 초안"** / **"제보 검토 초안"** 으로 표시한다.
- 본문에 "본 문서는 자동 제출되지 않았으며, 사람이 검토 후 수동 제출해야 합니다." 문구를 포함한다.
- ReportService 의 sanitize 치환 테이블이 단정 표현을 중립 표현으로 강제 치환한다.
- 자세한 형식은 [`report_draft.md`](./report_draft.md), 언어 규칙은 [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) §6 참고.

### 11.6 대시보드 문구 검수

- "부정수급자 목록" 금지 → "의심 사례 후보 목록" 권장.
- "신고 완료" 는 접수번호(`externalReceiptNo`) 가 있는 수동 제출 이후에만 표시.
- "AI 판정" 대신 "AI 분석 결과" / "AI 검토 보조 결과" 사용.
- 자세한 규칙은 [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) §7.

### 11.7 강제 수단

- 정적 검사: `npm run check:language` — README / docs / src / public / tests / scripts 에서 금지 표현 검출. 부정 컨텍스트(아닙니다 / 단정하지 / 표현 없이 / 금지 / sanitize 등) 윈도우와 정의/테스트/가이드 파일 화이트리스트는 예외.
- 통합 정책 검사: `npm run check:policy` 는 `check-approval-gate.js` 와 `check-language-policy.js` 를 모두 실행한다.
- 테스트: `npm run test:language` 가 금지/허용/예외 시나리오를 검증한다.
- 런타임 치환: `sanitizeReportText` (ReportService) / AnalyzerAgent `validateAnalysisResult` 가 금지 표현을 중립 표현으로 자동 치환한다.

---

## 12. 신고 전 사실관계 점검 원칙 (체크리스트 6)

본 절은 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) (필수 확인 항목 15개 + 데이터 구조) 와 [`approval_gate.md`](./approval_gate.md) §12 (Pre-Submission Fact Check Gate) 의 운영 요약이다. 무고 / 허위신고 / 명예훼손 / 과잉신고 위험을 줄이기 위한 내부 운영 기준이다.

### 12.1 신고 전 사실관계 점검표 필수

- 신고서 초안이 만들어진 모든 Case 는 **수동 제출 검토 대상으로 전환되기 전에** 사실관계 점검표를 통과해야 한다.
- 점검표는 사람 검토자가 작성하며, 코드로는 `createFactCheckResult(input)` 가 결과 객체를 만든다.
- 데이터 구조와 항목 정의는 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3·§8.

### 12.2 필수 확인 항목

- 공개자료 여부 (`publicSourceConfirmed`)
- 원문 URL (`originalUrlConfirmed`)
- 금액 (`amountConfirmed`)
- 기간 (`periodConfirmed`)
- 수급기관 (`recipientConfirmed`)
- 사업명 (`projectNameConfirmed`)
- 의심근거 (`suspicionBasisConfirmed`)
- 반대 가능성 (`counterExplanationReviewed`)
- 개인정보 제거 (`privacyChecked`)
- 단정 표현 제거 (`neutralLanguageChecked`)
- 증거 패키지 (`evidencePackageConfirmed`)

11개 플래그가 모두 `true` 이어야 `status === "completed"` 가 된다.

### 12.3 검토자 승인 없이는 신고서 확정 불가

- `human_approved` 로 전이하려면 사실관계 점검표 `status === "completed"` + `decision === "approved"` 가 필요하다 (`requireFactCheckBeforeApproval`).
- `approveForManualSubmission(reviewData)` 는 `reviewData.factCheckResult` 가 첨부되면 자동으로 게이트를 강제한다 — 미첨부 시 라우터/호출자가 직접 게이트를 호출해야 한다.
- `manually_submitted` 는 추가로 `externalReceiptNo` + `submittedByHuman === true` 가 필요하다 ([`approval_gate.md`](./approval_gate.md) §11.4).

### 12.4 신고서 초안과 확정 구분

- **초안 (draft)**: AI 가 자료를 정리해 만든 검토용 문서 — 외부 제출 대상 아님.
- **확정 (`human_approved`)**: 사람이 점검표 + 증거 + 신고처 후보를 확인하고 수동 제출 가능으로 승인한 상태.
- **실제 제출 (`manually_submitted`)**: 사람이 외부 공식 창구에 직접 제출 후 접수번호를 기록한 상태.

### 12.5 점검 항목 누락 시 차단

- 11개 플래그 중 하나라도 누락 → `status === "incomplete"` → `requireFactCheckBeforeApproval` 가 `INCOMPLETE_FACT_CHECK` throw.
- `decision !== "approved"` → `FACT_CHECK_NOT_APPROVED` throw.
- `factCheckResult.caseId` 가 Case 와 불일치 → `FACT_CHECK_CASE_MISMATCH` throw.
- 누락 항목은 `missingFields` 배열로 제공되며, `summarizeFactCheck` 가 중립 표현으로 한 줄 요약을 만들어 UI/로그에 표시한다.

### 12.6 강제 수단

- 테스트: `npm run test:fact-check` — 점검표 생성·게이트·요약·승인 차단 12개 시나리오.
- 통합: `approveForManualSubmission` 가 점검표를 받으면 게이트를 자동 강제, 승인 로그에 `factCheckId` / `factCheckSummary` 함께 기록.
- 정책 문서: [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md), [`approval_gate.md`](./approval_gate.md) §12.

---

본 문서는 공익레이더가 "정보검색 서비스"가 아니라 **사람 검토 기반의 신고 보조 시스템**으로 운영되도록 보장하기 위한 운영 정책이다. 본 문서와 모듈별 가이드/도구 동작이 충돌할 경우, 본 문서와 [`scope.md`](../scope.md), [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md), [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md), [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) 가 우선한다.
