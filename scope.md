# Product Scope

> 제품명: **공익레이더** (Public Interest Radar)
> Repository / internal project name: `reward-agent-mvp`

## 1. Product Definition

공익레이더는 공개적으로 접근 가능한 자료를 바탕으로 신고 후보를 탐지하고, 증거를 정리하며, 신고서 초안을 생성하는 보조 도구다.
공익레이더는 포상금 수령을 보장하지 않으며, 법 위반 여부를 최종 판단하지 않는다.

공익레이더는 "포상금 자동화 프로그램"이 아니라 "공개자료 기반 신고 후보 탐지·증거정리·신고서 초안 생성 도구"다.
사람의 최종 검토와 사람의 직접 신고를 전제로 설계되었으며, 어떠한 형태의 자동 신고 기능도 포함하지 않는다.

현재 1차 실전 MVP는 **건강기능식품 온라인 허위·과대광고 탐지**로 고정한다. 개발 순서는 **건강기능식품 → 일반식품 → 화장품 → 의료기기 → 위조상품 → 원산지 → 보조금 → 입찰담합**이며, 보조금·입찰담합은 기존 기능을 삭제하지 않고 후순위 고급 모듈/프로토타입으로 유지한다. 모든 모듈의 11단계 완성 정의는 [`docs/roadmap_easy_first.md`](./docs/roadmap_easy_first.md)를 따른다.

## 2. Allowed Use

- 공개 웹페이지, 공개 공공데이터, 공개 공시자료, 공개 상품 페이지 분석
- 허위·과대광고 의심 문구 탐지
- 증거 URL, 수집일시, 화면 캡처, PDF, 텍스트 추출본 저장
- 신고서 초안 작성 보조
- 사람이 최종 검토할 수 있는 Case 관리
- 사용자가 직접 입력한 공개 URL의 본문 분석
- 분석 결과를 사람이 검토한 뒤 외부 신고기관에 직접 제출하기 위한 자료 정리

## 3. Prohibited Use

- 비공개 자료 수집
- 로그인 우회, 접근권한 우회, 차단 회피
- 개인정보 대량 수집 또는 민감정보 수집
- 특정 개인이나 사업자를 범죄자로 단정하는 표현
- 자동 신고 제출
- 신고기관 자동 로그인
- 공식 신고 양식 자동입력
- 포상금 자동신청
- 사람 검토 없는 신고 상태 전환
- 허위·악의적 신고
- 경쟁업체 공격 목적 사용
- 함정 유도 또는 위반행위 조장
- 외부 신고기관 자동 제출, 자동 민원 제출, 자동 로그인 신고
- 대규모 자동 크롤링, robots.txt 무시, 사이트 약관 위반 행위

## 4. Data Collection Policy

공개자료만 수집한다.
수집 대상 사이트의 이용약관, robots.txt, 요청 빈도 제한을 존중한다.
불필요한 개인정보는 저장하지 않는다.

### 4.1 개인정보 최소화 (체크리스트 28)

- 비공개자료 수집 금지 (로그인 페이지 / 비공개 채팅방 / 비공개 SNS 게시글 / 회원 전용 자료)
- 개인정보 수집 최소화 — 필요 없는 개인정보는 저장하지 않는다
- 로그/피드백/리포트/Case 메모 등 사람이 입력한 텍스트는 **저장 전 마스킹 우선** (`MaskingService`)
- 증거 원본(`data/evidence/`)에 개인정보가 포함될 가능성이 있으면 `POST /api/privacy/scan` 으로 스캔 후 삭제/마스킹 검토
- 마스킹 토큰: `[masked-email]`, `[masked-phone]`, `[masked-id]`, `[masked-secret]`, `[masked-auth]`, `[masked-cookie]`, `[masked-account]`, `[masked-ip]`, `[masked-address]`
- 삭제 기능은 **dry-run 기본**이며 `dryRun: false` + `confirmDelete: true` 가 둘 다 필요
- `src/`, `public/`, `docs/`, `.env`, `.gitkeep`, `node_modules/`, `dist/` 는 본 도구의 삭제 API 로 절대 삭제되지 않는다
- 자동 영구 삭제 기능은 제공하지 않는다 — 운영자 명시적 요청만으로 작동
- 본 정책은 개인정보보호 법령에 대한 **법률 자문을 대체하지 않는다**

자세한 정책: [`docs/privacy_policy.md`](./docs/privacy_policy.md)

수집 가능한 자료 기준
- 누구나 로그인 없이 접근 가능한 공개 웹페이지
- 정부·지자체·공공기관이 공개한 공시·공공데이터
- 공개된 상품 상세 페이지 및 광고 페이지
- 사용자가 직접 입력한 단일 URL의 본문, 메타데이터, 스크린샷, PDF 저장본

수집하면 안 되는 자료 기준
- 로그인이 필요한 비공개 페이지
- 회원 전용·구독 전용·결제 후 접근 가능한 자료
- 개인 식별이 가능한 민감정보(주민등록번호, 연락처 대량 목록 등)
- 약관·robots.txt가 수집을 명시적으로 금지한 자료
- 차단 우회·캡차 우회를 통해야만 수집 가능한 자료

## 5. Human Review Requirement

AI 분석 결과는 참고자료일 뿐이며, 최종 신고 여부는 사람이 판단한다.
모든 Case는 Draft, Review, Approved, Submitted, Rejected 상태를 거쳐 관리한다.
Submitted 상태는 사람이 외부 신고기관에 직접 제출한 뒤 수동으로 변경한다.

사람 검토 원칙
- AI가 생성한 모든 신고서 초안은 사람이 검토하기 전까지는 "초안" 상태다.
- 사람이 검토하지 않은 결과를 외부에 전송·게시·신고하는 기능은 만들지 않는다.
- 사람 검토 단계에서 수정·반려·보강이 가능해야 한다.

## 6. Evidence Package Standard

각 Case는 가능한 경우 다음 자료를 포함해야 한다.

- 원본 URL
- 수집일시
- 페이지 제목
- 추출 텍스트
- 위반 의심 문구
- 스크린샷
- PDF 저장본
- AI 분석 요약
- 관련 신고기관 후보
- 신고서 초안

증거 패키지는 사람이 외부 신고기관에 직접 제출할 때 그대로 첨부·참고할 수 있는 형태로 정리한다.

## 7. AI Limitation

AI는 오탐과 누락이 있을 수 있다.
AI 분석 결과는 법률 자문이 아니며, 행정기관·수사기관·법원의 판단을 대체하지 않는다.

AI 판단 한계
- AI 점수(score)는 가능성 추정치이며, 위법 여부를 확정하지 않는다.
- AI 요약은 원문 일부를 누락하거나 잘못 해석할 수 있다.
- 동일한 문구라도 맥락·업종·인허가 여부에 따라 합법일 수 있다.
- 최종 판단과 책임은 사용자에게 있다.

## 8. Module Expansion Policy

새 모듈을 추가할 때도 동일한 원칙을 적용한다.
각 모듈은 sources, keywords, detection rules, scoring rules, report template, agency config를 분리해 관리한다.

모듈 확장 시 지켜야 할 공통 정책
- 자동 신고 기능은 어떠한 모듈에서도 추가하지 않는다.
- 외부 신고기관 자동 제출, 자동 민원 제출, 자동 로그인 신고는 추가하지 않는다.
- 대규모 크롤링·우회 수집 기능은 추가하지 않는다.
- 새 모듈도 사람 검토 흐름(Draft → Review → Approved → Submitted/Rejected)을 따른다.
- 새 모듈은 본 scope.md의 Allowed Use와 Prohibited Use를 동일하게 준수한다.

## 9. Approval Gate (자동 제출 차단)

시스템은 외부 신고기관에 신고를 **자동 제출하지 않는다.** 시스템이 제공하는 동작은 다음 5가지뿐이다.

- 신고서 초안 복사 (`copy_report_draft`)
- 신고서 초안 다운로드 (`download_report_draft`, Markdown/Text/DOCX)
- 공식 신고처 링크 열기 (`open_official_reporting_link`, 단순 외부 링크)
- 사용자가 외부 창구에 직접 제출한 사실을 내부 기록으로 표시 (`mark_as_submitted_manually`)
- 사람 검토 메모 추가 (`add_review_note`)

다음 동작은 어떤 경우에도 수행하지 않는다.

- 외부 신고기관 자동 제출 (`auto_submit_report`)
- 신고기관 자동 로그인 (`auto_login_agency`)
- 공식 양식 자동 입력 (`agency_form_autofill`)
- 포상금 자동 신청 (`reward_claim_automation`)
- 사람 검토를 우회한 상태 변경 (`bypass_human_review`)
- 접근권한 우회 (`circumvent_access_control`)

`SUBMITTED` 상태는 시스템이 외부에 보낸 행위가 아니라, **사용자가 외부 공식 창구에 직접 제출한 사실을 내부 기록으로 표시**하는 상태다. 이 상태로의 전이는 `confirmManualSubmission=true`와 `reviewerName` 기록을 요구한다.

자세한 정책은 [`docs/approval_gate.md`](./docs/approval_gate.md), 정책 데이터는 `src/policy/approvalGate.ts` 및 `GET /api/policy/approval-gate`에서 확인할 수 있다.

## 10. Responsible Use

이 도구를 사용하는 사람은 다음을 약속한다.

- 공익적·합법적 목적으로만 사용한다.
- 악의적·보복적·경쟁사 공격 목적으로 사용하지 않는다.
- AI 결과를 그대로 신고하지 않고 직접 검토한다.
- 신고 여부와 신고 내용에 대한 책임은 사용자 본인에게 있음을 인지한다.
- 본 도구의 결과를 근거로 특정인을 비방·공개적으로 단정·낙인찍지 않는다.
