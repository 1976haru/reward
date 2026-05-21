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
- API 수준: `GET /api/policy/approval-gate` 가 항상 위 정책을 그대로 반환
- 정적 검사: `npm run check:policy` 가 금지 동작 키워드를 코드에서 스캔
- UI 수준: 자동 제출 / 자동 로그인 / 자동 양식 입력 버튼은 만들지 않는다
- 상태 수준: `SUBMITTED` 전이는 `confirmManualSubmission: true` 와 `reviewerName` 둘 다 요구

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

- 본 문서, [`scope.md`](../scope.md), [`PRD.md`](./PRD.md), [`approval_gate.md`](./approval_gate.md), [`privacy_policy.md`](./privacy_policy.md) 의 변경은 PR 단위로만 적용한다.
- 자동 신고 허용 / 사람 검토 우회 / 개인정보 수집 확대 방향의 변경은 어떤 PR 에서도 받아들이지 않는다.
- 정책 변경 시 `npm run check:policy` 가 통과해야 머지 가능하다.

---

본 문서는 공익레이더가 "정보검색 서비스"가 아니라 **사람 검토 기반의 신고 보조 시스템**으로 운영되도록 보장하기 위한 운영 정책이다. 본 문서와 모듈별 가이드/도구 동작이 충돌할 경우, 본 문서와 [`scope.md`](../scope.md) 가 우선한다.
