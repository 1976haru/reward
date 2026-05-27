# v1.0 릴리즈 기준 (RELEASE_CRITERIA)

체크리스트 73 산출물. 공익레이더 v1.0(건강기능식품 1차 MVP + 확장 모듈 + 보조금 프로토타입) 릴리즈
기준과 판정·태그 절차를 정의한다.

> 자동신고 없음 · 자동 로그인 없음 · 공식 양식 자동입력 없음 · 포상금 자동신청 없음.
> 실제 신고는 사용자가 공식 창구에서 직접 제출합니다. 포상금 지급을 보장하지 않습니다.

## 1. v1.0 기준 (모두 충족해야 PASS)

| # | 기준 | 충족 |
| --- | --- | --- |
| 1 | 건강기능식품 1차 MVP가 실제 URL 분석 → 신고서 초안 → 사람 검토 → 수동 신고 안내까지 동작 | ✅ |
| 2 | 일반식품/화장품/의료기기/위조상품/원산지 확장 모듈이 스코프/룰셋/템플릿/샘플 테스트 기준 충족 | ✅ |
| 3 | 보조금 모듈(고급/프로토타입): 실데이터 준비·정규화·룰 5종·위험/보상 점수·사실점검·수동 신고/결과 기록까지 프로토타입 기준 충족 | ✅(prototype) |
| 4 | 운영 대시보드 + 일일 운영 루틴 동작 | ✅ |
| 5 | 자동신고 없음 | ✅ |
| 6 | 자동 로그인 없음 | ✅ |
| 7 | 공식 신고 양식 자동입력 없음 | ✅ |
| 8 | API 키 원문 비노출(`check:api-keys`) | ✅ |
| 9 | `data/` 산출물 Git 제외 | ✅ |
| 10 | build / test / check:policy / check:privacy / check:language 통과 | ✅ |

## 2. 릴리즈 전 필수 검증 명령
```bash
npm run build
npm run test            # smoke (SMOKE_TEST_OK)
npm run check:policy
npm run check:privacy
npm run check:language
```
권장(모듈별):
```bash
npm run test:subsidy-fact-check
npm run test:subsidy-report-draft
npm run test:subsidy-outcome
npm run test:operations
npm run test:citations
npm run test:llm-explanation
npm run validate:citations -- --fixture --strict   # 주의: 의도적으로 근거 누락 fixture 포함 → exit 1 (데모)
```

> `validate:citations -- --fixture --strict`는 strict-fail 처리 시연용으로 **의도적으로 비-통과(exit 1)**입니다.
> 실제 파이프라인(`rule-results → analysis:llm-explain → validate:citations --strict`)은 통과합니다([CITATION_VALIDATION_GUIDE.md](CITATION_VALIDATION_GUIDE.md) 13.6).

## 3. 판정 기준
- **PASS**: 1~10 모두 충족 + 필수 검증 모두 통과 → v1.0.0 태그 생성 가능.
- **PASS_WITH_WARNINGS**: 필수 검증 통과 + by-design 경고(프로토타입 모듈, 데모용 fixture-strict 비통과 등) 존재 → release candidate(`v1.0.0-rc`)로 표시, 정식 태그 보류.
- **NEEDS_FIX**: 일부 기준 미달 또는 보완 필요 → v0.x 유지.
- **BLOCKED**: 필수 검증 실패(build/test/check 실패) 또는 안전 위반 → 릴리즈 중단.

## 4. 현재 판정 (이번 작성 시점)
- 필수 검증(build/test/check:policy/check:privacy/check:language): **모두 통과**.
- 모듈 테스트(fact-check/report-draft/outcome/operations/citations/llm-explanation): **통과**.
- by-design 경고:
  - 보조금 모듈은 의도적으로 **prototype(실전 버튼 잠금/준비중)** 상태 유지.
  - `validate:citations -- --fixture --strict`는 데모 목적상 exit 1(실제 파이프라인은 통과).
- **판정: PASS_WITH_WARNINGS** → `v1.0.0-rc`(릴리즈 후보 준비중). 정식 `v1.0.0` 태그는 보류.

## 5. 태그 절차
모든 기준이 PASS(경고 0건)일 때만 정식 태그를 생성한다.
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```
- 검증 명령이 실패하거나 미완료/보완필요 항목이 있으면 **태그를 생성하지 않는다.**
- 본 시점에는 PASS_WITH_WARNINGS 이므로 **정식 태그를 생성하지 않고** "릴리즈 후보 준비중"으로 표시한다.

## 6. 정식 v1.0.0 전 남은 보완(권장)
- 보조금 모듈 실데이터 기준선 확보 후 prototype 졸업 여부 사람 검토.
- (선택) `validate:citations`에 strict-clean fixture 추가해 `--fixture --strict` 데모와 별도로 통과 케이스 제공.

---
관련 문서: [CHECKLIST_PROGRESS.md](CHECKLIST_PROGRESS.md) · [SUBSIDY_MANUAL_REPORTING_GUIDE.md](SUBSIDY_MANUAL_REPORTING_GUIDE.md) · [DAILY_OPERATIONS_ROUTINE.md](DAILY_OPERATIONS_ROUTINE.md)
