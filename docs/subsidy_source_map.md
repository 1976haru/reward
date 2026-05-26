# 보조금 공개자료 소스맵 (체크리스트 54)

이 문서는 보조금 부정수급 의심 분석(후순위 고급 모듈 `subsidy_fraud`)에 사용할 **공개자료 소스맵**입니다.

> ## 안전 원칙
>
> - **공개자료만** 사용합니다. 로그인 필요 자료·회원 전용·비공개·내부자료·약관 위반 수집은 **제외**합니다.
> - 공개자료라도 개인정보(대표자명·주민번호·계좌·전화·상세주소 등)가 포함될 수 있으므로 **저장 전 마스킹·최소수집** 원칙을 따릅니다.
> - 본 소스맵은 **신고 근거 확보용**이며, **부정수급을 확정하는 판단이 아닙니다.** 결과는 "검토 후보 / 공개자료 기준 / 사람 확인 필요"로만 표시합니다.
> - 자동 신고·자동 로그인·공식 양식 자동입력은 수행하지 않습니다. 보조금 모듈은 현재 후순위 고급 프로토타입 단계입니다.

## 소스 목록

각 소스는 다음 항목으로 정리합니다: `sourceName / sourceType(api|upload|public_page|pdf|xlsx|csv) / expectedFields / updateFrequency / accessRule / loginRequired / collectionAllowed / cautionNotes / evidenceUse`.

### 1. 보조금통합포털(보조금24)
- **sourceName**: 보조금통합포털(보조금24)
- **sourceType**: public_page
- **expectedFields**: 사업명, 지원대상, 소관기관, 지원규모, 신청기간, 공고 URL
- **updateFrequency**: 수시(공고 단위)
- **accessRule**: 공개 페이지 열람
- **loginRequired**: false (열람), 신청은 별도(수집 대상 아님)
- **collectionAllowed**: true (공개 공고 본문·URL만)
- **cautionNotes**: 신청·개인 마이페이지 영역은 비공개 → 제외. 공개 공고만.
- **evidenceUse**: 사업 개요·소관기관·공고 URL 근거

### 2. e나라도움 / 보탬e (국고보조금 통합관리)
- **sourceName**: e나라도움 / 보탬e
- **sourceType**: public_page / api(일부)
- **expectedFields**: 보조사업명, 보조사업자(공시 영역), 교부기관, 회계연도, 교부/집행 금액, 정산 공개 항목
- **updateFrequency**: 분기/연 단위 공시
- **accessRule**: 공개 공시 영역만
- **loginRequired**: true(사업관리 기능) — **관리 기능은 수집 제외**, 공개 공시만
- **collectionAllowed**: true (공개 공시 한정)
- **cautionNotes**: 로그인 후 사업관리·정산 상세는 비공개 → 제외. 공개 공시 범위 확인 필요.
- **evidenceUse**: 교부기관·교부금액·집행/정산 공개 항목 근거

### 3. 정보공개/공시자료 (보조사업자 정보공시 등)
- **sourceName**: 보조사업자 정보공시 / 정보공개포털
- **sourceType**: public_page / pdf
- **expectedFields**: 단체명, 사업명, 교부금액, 집행내역, 결과보고, 공시일자
- **updateFrequency**: 연 단위(법정 공시)
- **accessRule**: 공개 공시
- **loginRequired**: false
- **collectionAllowed**: true
- **cautionNotes**: 공시 문서 내 개인정보(대표자명 등) 마스킹 필요.
- **evidenceUse**: 집행내역·결과보고 공개자료 근거

### 4. 지자체 공고/고시
- **sourceName**: 지자체 누리집 공고·고시
- **sourceType**: public_page / pdf / xlsx
- **expectedFields**: 공고명, 사업명, 선정/교부 내역, 담당부서, 공고일
- **updateFrequency**: 수시
- **accessRule**: 공개 공고
- **loginRequired**: false
- **collectionAllowed**: true (공개 공고/첨부만)
- **cautionNotes**: 첨부 파일은 사람이 직접 내려받아 업로드 파서로 변환(자동 크롤링 아님).
- **evidenceUse**: 공고·선정 내역 근거

### 5. 보조사업 선정 결과
- **sourceName**: 보조사업 선정 결과 공개
- **sourceType**: public_page / xlsx / csv
- **expectedFields**: 사업명, 선정 단체/사업자(공시 영역), 선정 금액, 연도
- **updateFrequency**: 사업 회차 단위
- **accessRule**: 공개 결과
- **loginRequired**: false
- **collectionAllowed**: true
- **cautionNotes**: 동일 단체·유사 사업명 반복 여부는 "검토 후보"로만 표시.
- **evidenceUse**: 반복 수급·유사 사업명 검토 후보 근거

### 6. 정산/결과보고서 공개자료
- **sourceName**: 정산·결과보고 공개자료
- **sourceType**: pdf / public_page
- **expectedFields**: 사업명, 집행/정산 금액, 결과물 요약, 반납/환수(공개 시)
- **updateFrequency**: 사업 종료 후
- **accessRule**: 공개 범위만
- **loginRequired**: false
- **collectionAllowed**: true (공개 한정)
- **cautionNotes**: 결과물 증빙 부족·중복은 검토 후보. 비공개 정산서는 제외.
- **evidenceUse**: 결과물/정산 이상 검토 후보 근거

### 7. 나라장터/G2B 계약 연계 가능 자료
- **sourceName**: 나라장터(G2B) 계약/낙찰 공개자료
- **sourceType**: api / public_page
- **expectedFields**: 계약건명, 수요기관, 계약금액, 계약업체(공개), 계약일
- **updateFrequency**: 수시
- **accessRule**: 공개 계약정보
- **loginRequired**: false
- **collectionAllowed**: true (공개 계약정보)
- **cautionNotes**: 보조사업 용역 특수관계 정황 비교용 보조 자료. 단정 금지.
- **evidenceUse**: 특수관계(용역업체) 정황 검토 후보 근거(보조)

### 8. 공공데이터포털 API (data.go.kr)
- **sourceName**: 공공데이터포털 오픈 API
- **sourceType**: api
- **expectedFields**: 데이터셋별 상이(사업명/기관/금액/연도 등) — 매핑 필요
- **updateFrequency**: 데이터셋별 상이
- **accessRule**: 활용신청 + 서비스키
- **loginRequired**: false(키 기반 호출)
- **collectionAllowed**: true (이용약관·호출 제한 준수)
- **cautionNotes**: 서비스키는 `.env`로만 관리·로그 마스킹. endpoint는 상세페이지가 아닌 호출용. 설정·실행은 [`API_COLLECTOR_RUNBOOK.md`](./API_COLLECTOR_RUNBOOK.md).
- **evidenceUse**: 표준 보조금 레코드 기준선 입력(다음 단계)

### 9. 지자체 PDF/엑셀/CSV 공개자료 (수동 업로드)
- **sourceName**: 지자체 공개 PDF/XLSX/CSV
- **sourceType**: pdf / xlsx / csv (upload)
- **expectedFields**: 사업명, 보조사업자, 교부금액, 회계연도, 담당부서, 정산/결과
- **updateFrequency**: 수시
- **accessRule**: 공개 파일을 사람이 직접 내려받아 업로드
- **loginRequired**: false
- **collectionAllowed**: true (사람이 수동 업로드, 웹 크롤러 아님)
- **cautionNotes**: 스캔 이미지 PDF는 OCR 제외(수동 확인). 저장 전 개인정보 마스킹. 변환은 [`UPLOAD_PARSER_RUNBOOK.md`](./UPLOAD_PARSER_RUNBOOK.md).
- **evidenceUse**: 표준 보조금 레코드 변환 입력

## 제외 대상 (수집 금지)

- 로그인/권한 필요 자료, 회원 전용, 비공개·내부자료, 결제 후 접근 자료
- 약관 위반 수집, 대량 크롤링, 검색엔진 HTML 스크래핑, CAPTCHA 우회
- 개인정보(주민번호·계좌·전화·상세주소 등) 원문 저장 — 저장 전 마스킹

## 다음 단계 연결

- 공공데이터 API 실제 수집: [`API_COLLECTOR_RUNBOOK.md`](./API_COLLECTOR_RUNBOOK.md) → `npm run collect:public-api`
- 업로드 파일 변환: [`UPLOAD_PARSER_RUNBOOK.md`](./UPLOAD_PARSER_RUNBOOK.md) → `npm run parse:uploads -- <파일또는폴더>`
- 표준 기준선 빌드: `npm run build:baseline -- --input <records.jsonl> --sourceType api|upload --sourceName ...`

> 본 소스맵은 공개자료 기준 신고 근거 확보용입니다. 부정수급/위법을 확정하지 않으며, 모든 결과는 사람 검토 후보입니다.
