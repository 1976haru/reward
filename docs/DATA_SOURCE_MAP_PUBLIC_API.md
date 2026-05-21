# 공공데이터포털 API 후보목록 (보조금·환수·공공재정)

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)
> 문서 종류: Public Data Portal API Candidate Map (조사 문서, 수집기 구현 전 단계)
> 관련 문서: [`DATA_SOURCE_MAP_GOSIMS.md`](./DATA_SOURCE_MAP_GOSIMS.md), [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`privacy_policy.md`](./privacy_policy.md), [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md), [`../scope.md`](../scope.md)

---

## 1. 문서 목적

- 보조금 / 지방보조금 / 기관별 보조사업 / 공공재정 환수 관련 분석에 사용할 수 있는 **공공데이터포털 오픈 API 후보**를 정리한다.
- 본 문서는 **수집기 구현 전 조사 문서**이다.
- API 호출, 인증키 발급, 운영계정 신청, 트래픽 한도 확인은 후속 단계에서 수행한다.
- **공개자료 중심 분석 원칙**과 **개인정보 최소수집 원칙**을 따른다 ([`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §5.5, [`privacy_policy.md`](./privacy_policy.md) §B).
- API 후보는 "사용 가능 확정"이 아니라 **"활용 가능성 검토 대상"**이다. 모든 항목은 별도 확인 없이 운영에 투입하지 않는다.
- 본 문서는 법률 자문이나 운영기관의 공식 안내를 대체하지 않는다.

## 2. 조사 기준

- 보조금 / 국고보조금 / 지방보조금 / 보조사업 / 집행 / 정산 / 환수 / 공공재정 **관련성**
- 공공데이터포털에서 **오픈 API 형태로 제공**되는지 여부
- API 유형이 **REST 또는 OpenAPI** 인지 여부
- **JSON, XML, CSV** 등 데이터 포맷
- **활용신청 / 인증키 / 트래픽 제한** 여부 (개발계정·운영계정 구분 가능성 포함)
- **개인정보 또는 비공개 자료 포함 가능성**
- 보조금 부정수급 의심 신호 분석에 활용 가능한 **필드 존재** 여부 (사업명·기관·금액·기간·정산 등)

## 3. API 후보 요약표

> 모든 항목은 본 문서 작성 시점 기준이며 운영기관 정책 변경, API 명칭 변경, 제공기관 변경 가능성을 고려해 **"재확인 필요"** 로 표시한다. 실제 사용 가능 확정은 후속 단계의 API 명세 재확인과 활용신청을 거친다.

| 번호 | API 후보명 | 제공기관 | 공공데이터포털 URL | 관련성 분류 | API 유형 | 데이터 포맷 | 신청/인증 필요 | 우선순위 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 재정경제부_국고보조금 정보 | 재정경제부 또는 현재 표기 제공기관 (재확인 필요) | https://www.data.go.kr/data/15097584/openapi.do | 국고보조금 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청/인증키 확인 필요 | P0 | 후보 |
| 2 | 재정경제부_국고보조금 집행 및 보조사업 현황 | 재정경제부 또는 현재 표기 제공기관 (재확인 필요) | https://www.data.go.kr/data/15126793/openapi.do | 국고보조금 집행 / 보조사업 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청/인증키 확인 필요 | P0 | 후보 |
| 3 | 행정안전부_지방재정365_지방보조금 | 행정안전부 | https://www.data.go.kr/data/15138713/openapi.do | 지방보조금 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청/인증키 확인 필요 | P0 | 후보 |
| 4 | 행정안전부_지방재정365_지방보조금비율 | 행정안전부 | https://www.data.go.kr/data/15058377/openapi.do | 지방보조금 지표 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청/인증키 확인 필요 | P1 | 후보 |
| 5 | 행정안전부_지방재정365_지방보조사업 정산·환수 (추가 후보) | 행정안전부 또는 지방재정365 (재확인 필요) | https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=지방보조사업+정산 | 지방보조금 정산 / 환수 | 재확인 필요 | 재확인 필요 | 재확인 필요 | P1 | 후보 (키워드 검색 결과 — URL 확정 전) |
| 6 | 감사원_감사결과 공개 (추가 후보) | 감사원 (재확인 필요) | https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=감사결과 | 감사·점검 / 환수 의심근거 | 재확인 필요 | 재확인 필요 | 재확인 필요 | P1 | 후보 (키워드 검색 결과 — 활용 가능 여부 검토) |
| 7 | 국민권익위원회_공익신고 처리현황 (추가 후보) | 국민권익위원회 (재확인 필요) | https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=공익신고 | 공공재정 일반 / 환수 결과 추적 | 재확인 필요 | 재확인 필요 | 재확인 필요 | P2 | 후보 (관련성 약 — 결과 추적 보조용) |

> 후보 5번 이후는 공공데이터포털 키워드 검색을 통해 발견 가능한 후보의 예시이며, URL 은 검색 결과 페이지를 가리킨다. 실제 활용 가능 여부는 해당 데이터셋의 상세 페이지를 직접 확인해야 한다.

## 4. API별 상세 조사표

각 후보별로 동일 양식. 모든 항목은 "재확인 필요"가 기본값이며 후속 단계에서 갱신한다.

### API-001. 재정경제부_국고보조금 정보

- **제공기관:** 재정경제부 (현재 표기 제공기관은 데이터셋 상세 페이지에서 재확인 필요)
- **공공데이터포털 URL:** https://www.data.go.kr/data/15097584/openapi.do
- **관련성 분류:** 국고보조금
- **데이터 설명:** 국고보조금 사업 기준 정보 (사업명·소관·연도 등). 명세 재확인 필요.
- **API 유형:** REST / OpenAPI (재확인 필요)
- **데이터 포맷:** JSON / XML (재확인 필요)
- **활용신청/인증키 필요 여부:** 필요 가능성 — 활용신청 절차 확인 필요
- **트래픽 제한:** 개발계정·운영계정 한도 별도 — 데이터셋 상세 페이지 확인 필요
- **주요 필드 후보:**
  - `fiscalYear`
  - `ministryName`
  - `agencyName`
  - `projectName`
  - `budgetAmount`
  - `subsidyAmount`
  - `sourceUrl`
  - `collectedAt`
- **활용 목적:**
  - 국고보조금 사업 기준 데이터 확보
  - 보조사업별 금액·부처·연도 정규화
  - e나라도움 공개 통계센터 자료와 교차 검증 ([`DATA_SOURCE_MAP_GOSIMS.md`](./DATA_SOURCE_MAP_GOSIMS.md))
- **개인정보 위험:** 낮음 (재확인 필요)
- **제한사항:** 실제 필드명과 응답 구조는 API 명세 재확인 필요. 사업자/수급자 식별 정보가 포함될 가능성이 있으면 마스킹 / 제외.

### API-002. 재정경제부_국고보조금 집행 및 보조사업 현황

- **제공기관:** 재정경제부 (재확인 필요)
- **공공데이터포털 URL:** https://www.data.go.kr/data/15126793/openapi.do
- **관련성 분류:** 국고보조금 집행 / 보조사업 현황
- **데이터 설명:** 국고보조금 집행 금액·진행 상태 및 보조사업 현황. 명세 재확인 필요.
- **API 유형:** REST / OpenAPI (재확인 필요)
- **데이터 포맷:** JSON / XML (재확인 필요)
- **활용신청/인증키 필요 여부:** 필요 가능성 — 활용신청 절차 확인 필요
- **트래픽 제한:** 재확인 필요
- **주요 필드 후보:**
  - `fiscalYear`
  - `projectName`
  - `subProjectName`
  - `subsidyAmount`
  - `executionAmount`
  - `status`
  - `sourceUrl`
  - `collectedAt`
- **활용 목적:**
  - 보조사업 집행률·금액 불일치 신호 검출
  - 동일 사업명·동일 기관 반복 신호 패턴 분석
  - 신고서 초안의 금액 근거 (`amountConfirmed`) 자료
- **개인정보 위험:** 낮음 (재확인 필요)
- **제한사항:** 단위(원/천원/백만원) 재확인 필요. 응답 스키마 변경 가능성.

### API-003. 행정안전부_지방재정365_지방보조금

- **제공기관:** 행정안전부 (지방재정365)
- **공공데이터포털 URL:** https://www.data.go.kr/data/15138713/openapi.do
- **관련성 분류:** 지방보조금
- **데이터 설명:** 지방자치단체 보조금 교부 / 집행 정보. 명세 재확인 필요.
- **API 유형:** REST / OpenAPI (재확인 필요)
- **데이터 포맷:** JSON / XML (재확인 필요)
- **활용신청/인증키 필요 여부:** 필요 가능성
- **트래픽 제한:** 재확인 필요
- **주요 필드 후보:**
  - `fiscalYear`
  - `localGovernmentName`
  - `projectName`
  - `subProjectName`
  - `recipientName`
  - `subsidyAmount`
  - `executionAmount`
  - `sourceUrl`
  - `collectedAt`
- **활용 목적:**
  - 시·군·구 단위 보조사업 기초 데이터
  - 동일 보조사업자가 여러 지자체에서 반복 수급하는 신호 검토
  - 보탬e ([`DATA_SOURCE_MAP_GOSIMS.md`](./DATA_SOURCE_MAP_GOSIMS.md) §3 P1 항목) 와 교차 검증 가능성
- **개인정보 위험:** 중간 — `recipientName` 이 개인일 경우 마스킹 / 제외 필요
- **제한사항:** 지방재정365 API 사양은 변동 가능. 일부 항목은 집계 단위로만 공개될 수 있음.

### API-004. 행정안전부_지방재정365_지방보조금비율

- **제공기관:** 행정안전부 (지방재정365)
- **공공데이터포털 URL:** https://www.data.go.kr/data/15058377/openapi.do
- **관련성 분류:** 지방보조금 지표
- **데이터 설명:** 지방보조금 비율 등 재정 운용 지표.
- **API 유형:** REST / OpenAPI (재확인 필요)
- **데이터 포맷:** JSON / XML (재확인 필요)
- **활용신청/인증키 필요 여부:** 필요 가능성
- **트래픽 제한:** 재확인 필요
- **주요 필드 후보:**
  - `fiscalYear`
  - `localGovernmentName`
  - 비율 관련 수치 (필드명 재확인 필요)
  - `sourceUrl`
  - `collectedAt`
- **활용 목적:**
  - 지자체별 보조금 비중 / 추이 비교
  - 의심사례 우선순위 보조 지표 (메인 의심근거가 아닌 정황)
- **개인정보 위험:** 낮음
- **제한사항:** 본 데이터는 비율·집계 중심 — 개별 부정수급 분석 데이터로는 부적합. 보조 지표로만 활용.

### API-005. 행정안전부_지방재정365_지방보조사업 정산·환수 (추가 후보)

- **제공기관:** 행정안전부 / 지방재정365 (재확인 필요)
- **공공데이터포털 URL:** https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=지방보조사업+정산
- **관련성 분류:** 지방보조금 / 정산 / 환수
- **데이터 설명:** 키워드 검색을 통해 발견 가능한 정산·환수 관련 데이터셋 후보. 실제 데이터셋 ID 와 명세는 재확인 필요.
- **API 유형:** 재확인 필요
- **데이터 포맷:** 재확인 필요
- **활용신청/인증키 필요 여부:** 재확인 필요
- **트래픽 제한:** 재확인 필요
- **주요 필드 후보 (예상):**
  - `fiscalYear`
  - `localGovernmentName`
  - `projectName`
  - `settlementAmount`
  - `returnAmount`
  - `status`
  - `sourceUrl`
  - `collectedAt`
- **활용 목적:**
  - 정산 누락·반납·환수 신호 분석
  - 의심사례 검토 단계에서 환수 가능성 보조 자료
- **개인정보 위험:** 중간 — 환수 사유에 개인 식별 가능성. 마스킹 / 제외 필요.
- **제한사항:** 키워드 검색 결과 페이지를 가리키며, 활용 가능 데이터셋이 실제로 존재하는지 별도 확인 필요.

### API-006. 감사원_감사결과 공개 (추가 후보)

- **제공기관:** 감사원 (재확인 필요)
- **공공데이터포털 URL:** https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=감사결과
- **관련성 분류:** 감사·점검 / 환수 의심근거
- **데이터 설명:** 감사 결과 공개 데이터 후보. 활용 가능 형태(원문 PDF·요약 텍스트·집계 API) 는 별도 확인 필요.
- **API 유형:** 재확인 필요
- **데이터 포맷:** 재확인 필요
- **활용신청/인증키 필요 여부:** 재확인 필요
- **트래픽 제한:** 재확인 필요
- **주요 필드 후보 (예상):**
  - `agencyName`
  - `projectName`
  - `status`
  - `evidenceUrl`
  - `collectedAt`
  - `dataLimitNote`
- **활용 목적:**
  - 의심근거 보강 (`suspicionBasisConfirmed`)
  - 감사 결과를 통한 신호 신뢰도 가중치
- **개인정보 위험:** 중간 — 보고서 원문에 개인정보 / 식별 가능 정보 포함 가능성. 원문 저장 시 마스킹 필요.
- **제한사항:** 진행 중인 감사·소송·민감 사안은 수집 대상에서 제외. 공개 범위 확인 필수.

### API-007. 국민권익위원회_공익신고 처리현황 (추가 후보)

- **제공기관:** 국민권익위원회 (재확인 필요)
- **공공데이터포털 URL:** https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=공익신고
- **관련성 분류:** 공공재정 일반 / 환수 결과 추적
- **데이터 설명:** 공익신고·신고포상금 처리 현황 등 집계 자료 후보.
- **API 유형:** 재확인 필요
- **데이터 포맷:** 재확인 필요
- **활용신청/인증키 필요 여부:** 재확인 필요
- **트래픽 제한:** 재확인 필요
- **주요 필드 후보 (예상):**
  - `fiscalYear`
  - `agencyName`
  - 처리 상태 / 환수 관련 집계 필드 (재확인 필요)
  - `sourceUrl`
  - `collectedAt`
- **활용 목적:**
  - Outcome Tracker 와 연계해 보상·포상 결과 추세 참고 (개별 신고 결과는 사용자 입력으로만 기록)
  - 신고 채널별 처리 현황 일반 통계 — 사용자 안내 보조용
- **개인정보 위험:** 낮음~중간 — 집계 자료 중심이면 낮음. 사례별 자료면 마스킹 필요.
- **제한사항:** 본 API 후보의 자료는 **개별 신고 결과 자동 추적이 아니라 안내 통계** 로만 활용. 본 시스템의 자동 신고 / 보상금 신청 정책 ([`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2) 과 충돌하지 않도록 주의.

## 5. 관련성 분류 기준

| 관련성 분류 | 설명 | 활용 예시 |
|---|---|---|
| **국고보조금** | 중앙정부 재원이 포함된 보조금 정보 | 보조사업 기준 데이터 |
| **지방보조금** | 지방자치단체가 교부하는 보조금 정보 | 지자체별 보조사업 분석 |
| **기관별 보조사업** | 기관·부처·지자체별 보조사업 정보 | 동일 기관 반복 수급 패턴 분석 |
| **집행** | 교부·집행 금액, 집행률 등 | 금액 불일치·집행 이상 신호 |
| **정산** | 정산액, 잔액, 반납 등 | 정산 누락·반납 여부 확인 |
| **환수** | 환수 결정, 환수 금액, 환수 사유 등 | 공공재정 회복 및 결과 추적 |
| **감사·점검** | 감사 결과, 지적사항, 처분 결과 | 의심근거 보강 |
| **공공재정 일반** | 재정사업, 보조·위탁·출연 등 | 보조금 외 확장 후보 |

## 6. 주요 필드 후보

| 표준 필드명 | 설명 | API 후보 | 필수 여부 | 개인정보 위험 |
|---|---|---|---|---|
| `apiName` | API 명 | 모든 후보 | 필수 | 낮음 |
| `providerName` | 제공기관 | 모든 후보 | 필수 | 낮음 |
| `dataGoKrUrl` | 공공데이터포털 URL | 모든 후보 | 필수 | 낮음 |
| `apiType` | REST / OpenAPI 등 | 모든 후보 | 필수 | 낮음 |
| `dataFormat` | JSON / XML / CSV 등 | 모든 후보 | 필수 | 낮음 |
| `authRequired` | 인증키 / 활용신청 필요 여부 | 모든 후보 | 필수 | 낮음 |
| `trafficLimit` | 트래픽 제한 | 모든 후보 | 권장 | 낮음 |
| `fiscalYear` | 회계연도 | 보조금 API | 권장 | 낮음 |
| `ministryName` | 부처명 | 국고보조금 API | 권장 | 낮음 |
| `agencyName` | 기관명 | 보조사업 API | 권장 | 낮음 |
| `localGovernmentName` | 지방자치단체명 | 지방보조금 API | 권장 | 낮음 |
| `projectName` | 보조사업명 | 모든 보조금 API | 필수 | 낮음 |
| `subProjectName` | 세부사업명 | 보조사업 API | 권장 | 낮음 |
| `recipientName` | 보조사업자명 / 수급기관명 | 보조사업자 API | 권장 | 중간 |
| `subsidyAmount` | 보조금액 | 보조금 API | 권장 | 낮음 |
| `executionAmount` | 집행액 | 집행 API | 권장 | 낮음 |
| `settlementAmount` | 정산액 | 정산 API | 선택 | 낮음 |
| `returnAmount` | 환수액 | 환수 API | 선택 | 낮음 |
| `status` | 진행상태 | 모든 후보 | 선택 | 낮음 |
| `evidenceUrl` | 원문 또는 API URL | 모든 후보 | 필수 | 낮음 |
| `collectedAt` | 수집일시 | 수집기 생성 | 필수 | 낮음 |
| `dataLimitNote` | 제한사항 메모 | 모든 후보 | 권장 | 낮음 |

## 7. 접근 방법

- 공공데이터포털에서 **키워드 검색** 후 후보를 선별한다.
- 각 API **상세 페이지**에서 활용신청 가능 여부, 인증키 필요 여부, 데이터 포맷, 요청변수, 응답필드를 확인한다.
- **Swagger / 오픈API 명세**가 제공되면 요청 URL, 파라미터, 응답 스키마를 별도 문서로 정리한다.
- 실제 API 호출은 **후속 수집기 구현 단계**에서 수행한다.
- 운영계정 신청이 필요한 API 는 **개발계정과 운영계정**을 구분한다.
- **트래픽 한도, 이용허락 범위, 제공기관 정책**을 확인한다.
- API 응답에 개인정보가 포함될 가능성이 있으면 저장 전 **`sanitizeForStorage`** ([`../src/policy/privacyGuard.ts`](../src/policy/privacyGuard.ts)) 또는 기존 `MaskingService` 를 통과시킨다.
- **로그인 우회 / 인증 우회 / 무제한 호출 / 약관 위반 수집은 금지**한다 ([`scope.md`](../scope.md) §3, [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2).

## 8. 비공개·제한 데이터 및 개인정보 제한

- **개인정보가 포함된 개인 수급자 상세 데이터**는 원칙적으로 수집하지 않는다.
- **주민등록번호, 계좌번호, 휴대폰번호, 이메일, 상세주소, 민감정보**는 수집·저장하지 않는다 ([`privacy_policy.md`](./privacy_policy.md) §C).
- API 응답에 개인정보가 섞여 있으면 `sanitizeForStorage` 또는 기존 `MaskingService` 를 통과시킨 뒤 저장한다.
- **진행 중인 감사·소송·민감 사안, 안보·통일 관련 비공개 사업** 데이터는 수집 대상에서 제외한다.
- API 가 **이용허락 범위, 재배포 제한, 출처 표기 요구** 등을 명시한 경우 반드시 준수한다.
- 본 시스템은 **외부 신고기관에 자동 제출하지 않으며**, 본 API 들은 사람 검토(`human_review_required`) 단계의 자료원으로만 사용한다 ([`approval_gate.md`](./approval_gate.md)).
- 수집기 구현 직전에 각 API 의 **이용약관 / robots / 재배포 정책 / 트래픽 한도**를 별도 문서로 정리하는 것을 권장한다.

## 9. 수집기 스키마 초안 / 검증·운영 원칙

향후 API 후보 카드를 표현할 TypeScript 인터페이스 초안. 실제 코드는 [`../src/types/publicApiCandidate.ts`](../src/types/publicApiCandidate.ts) 에 정의되며 본 문서와 항상 동기화되어야 한다.

```typescript
export interface PublicApiCandidate {
  apiId: string;
  apiName: string;
  providerName: string;
  dataGoKrUrl: string;
  apiType: "REST" | "OpenAPI" | "SOAP" | "GraphQL" | "unknown";
  dataFormat: Array<"JSON" | "XML" | "CSV" | "Excel" | "unknown">;
  authRequired: "yes" | "no" | "unknown";
  trafficLimit?: string;
  relevance: Array<
    | "국고보조금"
    | "지방보조금"
    | "기관별 보조사업"
    | "집행"
    | "정산"
    | "환수"
    | "감사·점검"
    | "공공재정 일반"
  >;
  keyFields: string[];
  purpose: string[];
  privacyRisk: "low" | "medium" | "high" | "unknown";
  accessStatus: "candidate" | "needs_verification" | "verified" | "excluded";
  priority: "P0" | "P1" | "P2";
  lastCheckedAt?: string;
  notes?: string;
}
```

### 검증 / 운영 원칙

- **본 문서는 조사 문서다.** 실제 수집기는 별도 단계에서 구현되며, 각 API 의 URL · 명세 · 활용신청 절차는 운영기관 정책 변경에 따라 갱신되어야 한다.
- 수집기는 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2 (자동 신고 금지), §5 (개인정보 최소 수집), §11 (표현 통제), §12 (사실관계 점검) 정책을 모두 준수해야 한다.
- 수집된 데이터를 사실관계 점검 단계로 넘길 때는 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3 의 11개 확인 항목 (공개자료 / 원문 URL / 금액 / 기간 / 수급기관 / 사업명 / 의심근거 등) 의 원천 데이터를 채울 수 있어야 한다.
- 본 API 후보의 데이터는 **외부 신고기관에 자동 제출되지 않으며**, 사람 검토(`human_review_required`) 단계로만 넘긴다.
- 정적 검증: `npm run test:public-api-candidates` 가 본 문서에 §1~§9 필수 섹션이 모두 존재하는지, [`../src/types/publicApiCandidate.ts`](../src/types/publicApiCandidate.ts) 에 5개 이상의 후보 상수가 정의되어 있는지, 그리고 각 후보의 필수 필드가 채워져 있는지 확인한다.

---

> 본 문서와 모듈별 가이드 / 수집기 구현이 충돌할 경우, 본 문서와 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`privacy_policy.md`](./privacy_policy.md), [`approval_gate.md`](./approval_gate.md), [`DATA_SOURCE_MAP_GOSIMS.md`](./DATA_SOURCE_MAP_GOSIMS.md) 가 우선한다.
