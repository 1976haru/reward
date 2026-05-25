# PRD — 공익레이더 (Public Interest Radar)

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)
> 문서 종류: Product Requirements Document
> 이 문서는 [`scope.md`](../scope.md), [`mvp_scope.md`](../mvp_scope.md), [`docs/OPERATING_POLICY.md`](./OPERATING_POLICY.md) 와 함께 읽어야 한다.

---

## 1. 제품명

- 한글명: **공익레이더**
- 영문명: Public Interest Radar
- 저장소명: `reward-agent-mvp`

## 2. 제품 목적

공익레이더는 공개자료에 존재하는 **공익신고/포상금 제도 대상 의심사례를 탐지·정리하고, 사람이 직접 신고할 수 있도록 보조**하는 도구다.

- 단순 정보검색 서비스가 아니다.
- 의심사례 탐지 → 증거 패키지 구성 → 신고서 초안 생성 → 사람 최종 검토 → 신고 후 결과 추적까지를 **하나의 업무 흐름**으로 제공한다.
- 사용자가 공익신고/포상금 제도를 실제로 활용할 수 있도록, **증거 정리와 신고서 초안 작성의 반복 작업을 자동화**한다.
- 외부 신고기관에 자동으로 신고서를 제출하지 않는다. 최종 신고와 책임은 사람에게 있다.

## 3. 해결하려는 문제

기존에는 다음과 같은 어려움이 있다.

- 일반 시민·소규모 신고자는 어떤 행위가 신고 대상인지, 어느 기관 어느 창구로 신고해야 하는지, 어떤 증거가 필요한지 알기 어렵다.
- 의심사례를 발견해도 페이지가 곧 사라지거나 수정되면 증거를 잃는다.
- 공개자료 양이 많아 사람 혼자 일일이 의심 표현을 찾아내기 어렵다.
- 신고서 양식, 필수 기재항목, 최소 증거 기준이 모듈(분야)마다 다르다.
- 신고 후 처리 결과를 한 곳에서 추적·기록할 수 있는 도구가 부족하다.

공익레이더는 위 단계를 **모듈별 워크플로우**로 묶어 의심사례 탐지, 증거 보존, 신고서 초안 작성, 결과 기록까지 일관되게 처리한다.

## 4. 핵심 사용자

- **공익신고/포상금 제도를 활용하려는 일반 시민**
- 소비자단체 / 시민단체 / 협회의 모니터링 담당자
- 사내 컴플라이언스 담당자, 감사·내부 신고 담당자
- 정부·지자체·공공기관의 부정수급/입찰담합 모니터링 실무자
- 권리자(브랜드사)의 위조상품 모니터링 담당자

모두 공통적으로 **공식 신고 창구에 직접 신고할 권한과 책임이 있는 자연인**이 사용한다.
공익레이더는 이들의 **검토 보조 도구**이며, 사용자를 대신해 신고하지 않는다.

## 5. 제품 범위 (Included Scope)

- 공개 URL / 공개 공공데이터 / 공시자료 기반 의심사례 탐지
- 모듈별 룰 기반 탐지 (RuleAgent)
- LLM 기반 문맥 재검토 (AnalyzerAgent, mock 가능)
- 우선순위 점수화 (ScoringAgent, 0~100)
- 증거 패키지 자동 생성: HTML / 텍스트 / 스크린샷 / PDF / metadata / manifest + SHA-256 해시
- 모듈별 신고서 초안 생성 (Markdown / Text / DOCX, 금지 표현 자동 sanitize)
- 사람 검토 워크플로우: Draft → Review → Hold → Approved → Report Draft → Submitted → Outcome Check → Rejected
- Outcome Tracker: 사람이 외부 공식 창구에 **직접 제출한 뒤** 접수번호·처리상태·결과를 기록
- Feedback DB: 검토자가 승인/보류/오탐/반려 사유를 누적해 룰/프롬프트/점수 개선의 근거로 사용
- Eval Set: 합성 평가셋으로 룰·점수 품질 측정 (실신고 판단을 대체하지 않음)
- 운영 대시보드 / Trace Log / Scheduler / Dedupe / Privacy / Settings 등 운영 보조 기능
- Reward Registry: 모듈별 신고처·지급 기준·공식 URL 제공 (수령을 보장하지 않음)
- 모듈별 Practical Guide: 신고처, 의심 신호, 필요 증거, 신고 전 체크리스트

## 6. 제외 범위 (Excluded Scope)

본 도구는 다음을 **제공하지 않는다.**

- 외부 신고기관에 대한 자동 신고 제출
- 신고기관 자동 로그인 / 공식 양식 자동 입력
- 포상금 자동 신청 / 포상금 수령 보장
- 사람 검토 없이 상태를 변경하거나 다음 단계로 자동 진행하는 기능
- 비공개 페이지 / 로그인 페이지 / 회원 전용 자료 / 비공개 SNS / 비공개 채팅방 수집
- 차단 우회 / 캡차 우회 / robots.txt 무시 / 약관 위반 크롤링
- 개인정보 대량 수집 / 민감정보 수집
- 특정 개인·사업자를 위법자로 단정하는 표현
- 법률 자문 / 행정·수사·사법 판단 대체
- 경쟁사 공격, 함정 유도, 위반행위 조장을 위한 사용

## 7. 핵심 기능 (Core Features)

| # | 기능 | 설명 | 관련 문서 |
|---|---|---|---|
| 1 | Search Collector / Scout Agent | 공식 API / 허용 RSS / Manual Seed / Mock 으로 후보 URL 발굴 (검색엔진 HTML 스크래핑 금지) | [`search_collector.md`](./search_collector.md) |
| 2 | Candidate Discovery | 모듈 + 탐색 주제 선택 → 후보 URL 추천 | [`candidate_discovery.md`](./candidate_discovery.md) |
| 3 | Text Extractor | HTML → 광고문구/후기/성분/주의사항/판매자 정보 분리, PII 마스킹 | [`text_extractor.md`](./text_extractor.md) |
| 4 | RuleAgent | 모듈별 keywords.json 기반 의심 표현 탐지 (위반 확정 아님) | [`rule_agent.md`](./rule_agent.md) |
| 5 | AnalyzerAgent | LLM 문맥 재검토. `notLegalConclusion:true`, `rewardGuaranteed:false` 강제 | [`analyzer_agent.md`](./analyzer_agent.md) |
| 6 | ScoringAgent | 0~100 우선순위 점수 (포상금 가능성 아님) | [`scoring_agent.md`](./scoring_agent.md) |
| 7 | Evidence Package | HTML/Text/Screenshot/PDF/metadata/manifest + SHA-256 해시 | [`evidence_package.md`](./evidence_package.md) |
| 8 | Dedupe Engine | URL canonicalize + 본문/제목 유사도 중복 제거 | [`dedupe_engine.md`](./dedupe_engine.md) |
| 9 | Report Draft | 모듈별 신고서 초안. 금지 표현 자동 sanitize | [`report_draft.md`](./report_draft.md) |
| 10 | Human Review Queue | Draft/Review/Hold/Approved/ReportDraft/Submitted/OutcomeCheck/Rejected | [`human_review_queue.md`](./human_review_queue.md) |
| 11 | Approval Gate | 시스템이 할 수 있는 동작 5개 / 금지 동작 6개를 코드/UI/정책에서 강제 | [`approval_gate.md`](./approval_gate.md) |
| 12 | Outcome Tracker | 사람이 직접 제출한 뒤 접수번호·처리상태·결과 수동 기록 | [`outcome_tracker.md`](./outcome_tracker.md) |
| 13 | Feedback DB | 검토 사유 누적 → 룰/프롬프트/점수 개선 근거 (자동 변경 아님) | [`feedback_db.md`](./feedback_db.md) |
| 14 | Eval Set | 합성 평가셋(VIOLATION 100 / NORMAL 100) Precision/Recall/F1 | [`eval_set.md`](./eval_set.md) |
| 15 | Trace Log | Agent 실행·판단·사람 수정 감사로그 (PII/키 자동 마스킹) | [`trace_log.md`](./trace_log.md) |
| 16 | Scheduler | 정기 후보 수집 (자동 신고 아님, opt-in) | [`scheduler.md`](./scheduler.md) |
| 17 | Privacy / Masking / Retention | 마스킹·보존기간·삭제 정책 (dry-run 기본) | [`privacy_policy.md`](./privacy_policy.md) |
| 18 | Dashboard / Settings / Reward Registry | 운영 상태 조회, 모듈별 신고·포상 안내 | [`dashboard.md`](./dashboard.md), [`settings.md`](./settings.md), [`reward_registry.md`](./reward_registry.md) |
| 19 | Module Registry | 모듈 등록·상태(active/ready/prototype/planned) 관리 | [`module_registry.md`](./module_registry.md) |
| 20 | Practical Guides | 모듈별 신고처/증거/체크리스트/공식 링크 | [`false_ad_guide.md`](./false_ad_guide.md) 외 |

현재 활성 모듈: `false_ad` (건강기능식품 허위·과대광고).
Ready 모듈: `counterfeit_goods`.
Prototype 모듈: `subsidy_fraud`, `bid_collusion`.
Planned 모듈: `origin_labeling`.

개발 표시 우선순위는 **건강기능식품 → 일반식품 → 화장품 → 의료기기 → 위조상품 → 원산지 → 보조금 → 입찰담합**이다. `false_ad`가 현재 1차 실전 MVP이며, `subsidy_fraud`와 `bid_collusion`은 기존 기능을 유지하는 후순위 프로토타입으로 실데이터 준비 후 진행한다. 모든 모듈의 완성 정의는 [`roadmap_easy_first.md`](./roadmap_easy_first.md)를 따른다.

## 8. 신고 보상형 업무 흐름 (Reward-Reporting Workflow)

공익레이더의 핵심 흐름은 다음 5단계다. **모든 단계 사이에는 사람 검토가 끼어들 수 있고, 마지막 신고 제출은 반드시 사람이 외부 창구에서 직접 수행한다.**

```
[1] AI가 의심사례 탐지
      ↓
[2] 증거 패키지 구성 (HTML / TEXT / Screenshot / PDF / metadata + SHA-256)
      ↓
[3] 신고서 초안 생성 (모듈별 템플릿, 금지 표현 자동 sanitize)
      ↓
[4] 사람이 최종 검토 (Review Queue, 승인/보류/반려/메모/수정)
      ↓
[5] 사람이 공식 창구에서 직접 신고 → 결과 수동 기록 (Outcome Tracker)
```

각 단계의 책임 분담:

| 단계 | 책임 주체 | 자동/수동 |
|---|---|---|
| 1. 의심사례 탐지 | RuleAgent / AnalyzerAgent / ScoringAgent | 자동 |
| 2. 증거 패키지 | EvidenceService / Playwright | 자동 (사람이 보강 가능) |
| 3. 신고서 초안 | ReportService | 자동 (사람 검토 전 "초안" 상태) |
| 4. 사람 검토 | Human Review Queue | **수동 (필수)** |
| 5. 신고 제출 + 결과 기록 | 사람 + Outcome Tracker | **수동 (시스템 자동 제출 없음)** |

## 9. 사람 검토 단계 (Human Review Step)

사람 검토는 본 제품의 **법적·윤리적 안전장치**다. 자세한 정책은 [`docs/OPERATING_POLICY.md`](./OPERATING_POLICY.md).

- 사람 검토 없이 외부에 전송·게시·신고하는 기능은 만들지 않는다.
- 신고서 초안은 사람이 검토하기 전까지 항상 "초안" 상태이며 외부 제출 대상이 아니다.
- 사람 검토 단계에서 수정·반려·보강·메모가 가능해야 한다.
- `SUBMITTED` 상태는 시스템이 외부에 보낸 것이 아니라, **사람이 외부 공식 창구에 직접 제출한 사실을 내부 기록**으로 표시하는 상태다.
- `SUBMITTED` 전이는 `confirmManualSubmission: true` 와 `reviewerName` 을 요구한다.
- 검토자는 승인/보류/반려/오탐 사유를 Feedback DB 에 남겨 룰/프롬프트 개선의 근거로 사용한다.

## 10. 성공 기준 (Success Criteria)

본 제품의 성공은 단순 트래픽이나 분석 건수가 아니라, **사람 검토를 거친 신고가 실제로 처리되었는지**로 측정한다.

### 10.1 제품 수준 성공 기준

- 사용자가 의심사례 발견 → 증거 정리 → 신고서 초안 → 사람 검토 → 외부 신고 → 결과 기록까지 **한 도구 내에서 일관되게 처리**할 수 있다.
- 모든 신고서 초안에서 "법 위반 확정 / 포상금 보장 / 자동 신고 약속" 표현이 sanitize 단계에서 제거된다.
- 자동 신고가 코드·UI·정책 어느 층에서도 발생하지 않는다 (`npm run check:policy` 통과).
- 개인정보 마스킹/삭제 정책이 dry-run 기본으로 동작한다.

### 10.2 모듈 수준 성공 기준 (모듈마다 측정)

- 합성 평가셋 Precision / Recall / F1 / Accuracy 가 목표 임계치 이상
- Review Queue 의 의심사례 중 사람 검토 비율이 100%
- 신고서 초안에 필수 필드(원본 URL, 수집일시, 의심 문구, 신고처 후보, 증거 목록, 사람 검토 체크리스트)가 모두 채워짐
- Outcome Tracker 에 접수번호·처리상태·결과가 기록되는 케이스 수

### 10.3 안전 성공 기준 (Non-negotiable)

다음 중 하나라도 위반되면 출시·운영이 중단되어야 한다.

- 외부 신고기관에 자동 제출이 발생함
- 사람 검토 없이 `SUBMITTED` 로 전이 가능함
- 신고서 초안에 "위법 확정" / "포상금 보장" 표현이 살아남음
- 로그·trace·report 에 마스킹되지 않은 개인정보 / API 키가 저장됨
- `src/`, `public/`, `docs/`, `.env`, `.gitkeep` 등 보호 경로가 본 도구의 삭제 API 로 삭제됨

## 11. 법률·정책 제약 (Legal / Policy Constraints)

본 제품은 신고 보상형 의심사례 탐지를 보조하므로, 다음 법령·정책 영역의 제약 위에서만 설계·운영된다. 상세 검토표와 표준 문구는 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md), 운영 요약은 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §10 참고.

- **검토 대상 법령**: 공공재정환수법 / 부패방지권익위법 / 공익신고자 보호법 / 개인정보 보호법 / 보조금 관리법 / 지방자치단체 보조금 관리법 / 형법(무고·명예훼손·업무방해)
- **신고대상 확정 금지**: 본 도구는 신고대상 여부를 확정하지 않고 "검토 필요 후보" / "의심 패턴" 으로만 표시한다.
- **보상금·포상금 비보장**: 어떤 산출물/UI 도 "지급 확정" 으로 표시하지 않는다. "보상금 가능성 검토" 표현으로 통일하며, 공식 기준은 [국가법령정보센터](https://www.law.go.kr) 와 각 신고기관 공식 페이지에서 직접 확인해야 함을 명시한다.
- **신고자 보호**: 신고자 신원정보는 최소 수집하고 증거 패키지와 분리 저장한다.
- **공직자 제한**: 공직자가 직무상 취득한 비공개 정보를 업로드·분석하는 행위는 별도 검토 대상이며, UI 차원에서 경고문 또는 사용 전 확인 체크박스를 추가한다(LEGAL-003).
- **허위신고 방지**: 신고서 초안에서 "위법 확정 / 사기 / 범죄 / 포상금 보장" 단정 표현은 자동 sanitize 되며, AI 산출물은 "의심 / 검토 필요 / 후보" 등 중립 표현만 사용한다.
- **자동신고 금지**: §8 / §9 와 [`approval_gate.md`](./approval_gate.md) 의 정책을 위반하는 어떤 모듈도 추가하지 않는다.
- **법률 자문 비대체**: 본 PRD, [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md), [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) 는 법률 자문을 대체하지 않으며, 구체 사안의 법령 적용 여부는 변호사·법무팀·관계기관의 공식 검토가 필요하다.

---

이 PRD 는 [`scope.md`](../scope.md)(제품 범위/금지 사용/사람 검토 원칙)와 [`docs/OPERATING_POLICY.md`](./OPERATING_POLICY.md)(운영 원칙·체크리스트·결과 추적), [`docs/LEGAL_REVIEW.md`](./LEGAL_REVIEW.md)(법률 검토표·표준 문구)의 상위 요약이며, 구체 정책 충돌 시 세 문서를 우선한다.
