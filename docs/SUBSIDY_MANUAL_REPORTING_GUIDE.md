# 보조금 수동 실제 신고 연결 가이드 (SUBSIDY_MANUAL_REPORTING_GUIDE)

체크리스트 67 산출물. 보조금 신고서 초안이 생성된 후보에 대해 **공식 신고처 링크**를 안내하고,
사용자가 **외부 공식 창구에서 직접** 신고하도록 돕는 수동 신고 흐름 가이드다.

> 공식 신고처 링크만 제공합니다. 실제 신고는 사용자가 공식 창구에서 직접 제출해야 합니다.
> 공익레이더는 자동 제출·자동 로그인·자동 양식입력을 하지 않습니다.
> 신고서 초안은 사용자가 검토·수정한 뒤 참고자료로 사용할 수 있습니다. 포상금 지급을 보장하지 않습니다.

---

## 1. 수동 신고 절차
1. 신고 전 사실점검 11항목 통과(`canGenerateReportDraft=true`) → 신고서 초안 생성.
2. `GET /api/subsidy/reporting-links` 로 공식 신고처 **외부 링크**를 확인.
3. 사용자가 링크를 눌러 **공식 창구**에 접속하고, 신고서 초안을 **검토·수정**한 참고자료로 직접 제출.
4. 제출 후 접수번호 등을 [결과·보상 기록](SUBSIDY_OUTCOME_TRACKING_GUIDE.md)에 수동 입력.

사실점검 미통과 후보는 보강 필요 사유를 표시하고 신고처 안내를 제한/경고한다(초안 자체가 생성되지 않음).

## 2. 공식 신고처 링크 사용 방법
- `reporting-links` 는 단순 외부 링크 목록이며, 각 항목은 `agencyId` · `agencyName` · `category: "subsidy"` ·
  `officialUrl` · `description` · `requiredEvidence` · `cautions` · `manualSubmissionOnly: true` ·
  `autoSubmitAvailable: false` · `sourceCheckedAt` 를 포함한다.
- 신고처 후보(예): 국민신문고 · 청렴포털(국민권익위원회) · e나라도움/보조금통합포털 · 보조금 관리기관 · 관할 지자체 감사부서.
- **URL 에 신고서 내용·개인정보·API 키·caseId·candidateId 를 query parameter 로 붙이지 않는다.** 외부로 어떤 데이터도 자동 전송하지 않는다.

## 3. 신고서 초안 복사/다운로드 방법
- 신고서 초안(`report.md`/`report.txt`/`report.docx`)은 `data/reports/subsidy/{candidateId}/` 에 저장된다.
- 사용자는 파일을 **복사하거나 다운로드**해 참고자료로 사용한다. 외부 신고 양식에 **자동 입력하지 않는다.**

## 4. 자동신고를 하지 않는 이유
- 공식 신고는 신고자 요건·증빙·보호 절차가 기관마다 다르고, 잘못된 자동 제출은 되돌릴 수 없다.
- 개인정보·근거의 외부 자동 전송은 유출·오남용 위험이 있다.
- 따라서 공익레이더는 **링크 안내 + 초안 참고자료**까지만 돕고, 제출은 사람이 직접 한다(자동 신고/로그인/양식입력/포상금 자동신청 없음).

## 5. 개인정보 마스킹 원칙
- 신고처 링크 안내·초안·결과 기록 어디에도 대표자명·전화번호·주민번호·계좌번호·상세주소 원문을 저장하지 않는다.
- 결과 기록 입력값은 저장 전 마스킹한다([결과·보상 기록 가이드](SUBSIDY_OUTCOME_TRACKING_GUIDE.md) 참고).

## 6. API
- `GET /api/subsidy/reporting-links` — 공식 신고처 단순 링크 + 안내 문구(`manualSubmissionOnly:true`, `autoSubmitAvailable:false`, `rewardGuaranteed:false`).
- 응답에 "공식 신고처 링크만 제공 / 직접 제출 / 자동 제출·로그인·양식입력 없음 / 초안은 참고자료" 안내가 포함된다.

## 7. 다음 단계
사용자가 직접 제출한 뒤 접수번호·처리상태·결과·보상을 [결과·보상 기록](SUBSIDY_OUTCOME_TRACKING_GUIDE.md)에 수동으로 남긴다.

---
관련 문서: [SUBSIDY_REPORT_DRAFT_GUIDE.md](SUBSIDY_REPORT_DRAFT_GUIDE.md) · [SUBSIDY_OUTCOME_TRACKING_GUIDE.md](SUBSIDY_OUTCOME_TRACKING_GUIDE.md) · [SUBSIDY_PRE_REPORT_FACT_CHECK.md](SUBSIDY_PRE_REPORT_FACT_CHECK.md)
