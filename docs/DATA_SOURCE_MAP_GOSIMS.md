# e나라도움 / 국고보조금 데이터소스맵

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)
> 문서 종류: Data Source Map (조사 문서, 수집기 구현 전 단계)
> 관련 문서: [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md), [`privacy_policy.md`](./privacy_policy.md), [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md), [`../scope.md`](../scope.md)

---

## 1. 문서 목적

- 보조금 AI 에이전트가 사용할 수 있는 **국고보조금 공개 데이터의 출처, 공개 범위, 수집 가능 필드, 접근 방법**을 정리한다.
- 본 문서는 **수집기 구현 전 조사 문서**이며, 실제 수집기는 별도 단계에서 구현한다.
- **공개자료 중심 분석 원칙**([`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §5.5) 을 따른다.
- **비공개 자료, 개인정보, 로그인 필요 자료는 수집 대상에서 제외한다.**
- 본 문서는 법률 자문이나 운영기관의 공식 안내를 대체하지 않는다. 이용약관·robots 정책·저작권 관련 사항은 수집기 구현 직전에 별도 확인이 필요하다.

## 2. 데이터소스 개요

- **e나라도움**은 국고보조금통합관리시스템이다.
- 국고보조금의 **교부, 집행, 정산, 사후관리** 등 보조금 처리 과정을 통합 관리한다.
- **공개 통계센터** 에서는 보조사업, 내역사업, 보조사업자 관련 공개 현황을 조회할 수 있다.
- 지방보조금은 **보탬e / 지방보조금관리시스템** 과 연계 가능성이 있으나, 본 문서의 1차 범위는 **국고보조금 공개자료**로 제한한다 (지방보조금은 별도 데이터소스맵 문서로 후속 정리).
- 본 시스템은 의심 사례를 **검토 후보**로만 분류하며, 부정수급 여부를 확정하지 않는다.

## 3. 1차 조사 대상 URL

| 구분 | URL | 내용 | 접근 방식 | 우선순위 |
|---|---|---|---|---|
| e나라도움 메인 | https://www.gosims.go.kr | 국고보조금 통합관리시스템 (제도 안내·로그인 영역 분리) | 웹 접근 (로그인 영역은 수집 제외) | P0 |
| 공개 통계센터 | https://eduopn.gosims.go.kr | 공개 통계 조회 진입점 | 웹 접근 | P0 |
| 보조사업별 현황 | https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001001QView.do | 보조사업 현황, 다운로드 가능 여부 확인 | 웹 / CSV / 엑셀 / TXT 확인 | P0 |
| 내역사업별 현황 | https://eduopn.gosims.go.kr/opn/ih/ih001/getIH001002QView.do | 내역사업 단위 현황 | 웹 / CSV / 엑셀 / TXT 확인 | P0 |
| 보조사업자별 현황 | https://eduopn.gosims.go.kr/opn/ih/ih002/getIH002002QView.do | 보조사업자 기준 현황 | 웹 / CSV / 엑셀 / TXT 확인 | P0 |
| 보조사업별 보조사업자 현황 | https://eduopn.gosims.go.kr/opn/ih/ih002/getIH002001QView.do | 사업별 보조사업자 정보 | 웹 / CSV / 엑셀 / TXT 확인 | P0 |
| 보탬e 참고 | https://www.losims.go.kr | 지방보조금 참고 자료 (별도 데이터소스맵 후속 정리) | 웹 접근, 추후 별도 조사 | P1 |

> 위 URL 은 공개 통계센터의 조회 화면이다. 본 문서가 작성된 시점 기준이며, 운영기관의 정책 변경으로 경로가 바뀔 수 있다. 실제 수집기 구현 직전에 URL 유효성을 재확인해야 한다.

## 4. 공개 범위 분류

| 분류 | 설명 | 수집 가능성 | 주의사항 |
|---|---|---|---|
| **국고보조금 사업** | 중앙부처·기관의 보조사업 정보 (사업명·소관·예산 등) | 높음 | 공개 범위 내에서만 수집 |
| **내역사업** | 보조사업 아래의 세부 내역사업 단위 정보 | 높음 | 명칭 변경·조직개편 가능성 주의 |
| **보조사업자** | 보조금을 수행하는 기관·단체·법인·사업자 정보 | 중간~높음 | 개인 수급자 정보는 제외 또는 마스킹 |
| **수급자(개인)** | 개인 또는 단체 수급 상세 정보 | 제한적 | 개인정보 포함 가능성 높음 — 공개자료에 한정 |
| **집행 현황** | 교부·집행 금액 등 공개 집계 정보 | 중간 | 원문 기준·단위(원/천원/백만원) 확인 필요 |
| **정산·사후관리** | 정산, 환수, 점검, 감사 결과 | 제한적~중간 | 감사원·소관 부처 공개자료와 교차 필요 |
| **비공개 사업** | 안보·통일·외교 등 공개 제한 사업 | **수집 제외** | 표시되지 않거나 마스킹되어 노출될 수 있음 |

## 5. 수집 가능 필드 후보

| 필드명 | 설명 | 출처 후보 | 필수 여부 | 개인정보 위험 |
|---|---|---|---|---|
| `sourceName` | 데이터 출처명 | e나라도움 / 공개 통계센터 | 필수 | 낮음 |
| `sourceUrl` | 원문 URL | 각 조회 페이지 / 다운로드 파일 | 필수 | 낮음 |
| `collectedAt` | 수집일시 (ISO 8601) | 수집기 생성 | 필수 | 낮음 |
| `fiscalYear` | 회계연도 | 보조사업 현황 | 필수 | 낮음 |
| `ministryName` | 소관 부처명 | 보조사업 현황 | 권장 | 낮음 |
| `agencyName` | 소관 기관명 | 보조사업 현황 | 권장 | 낮음 |
| `projectName` | 보조사업명 | 보조사업 현황 | 필수 | 낮음 |
| `subProjectName` | 내역사업명 | 내역사업별 현황 | 권장 | 낮음 |
| `recipientName` | 보조사업자명 / 수급기관명 | 보조사업자 현황 | 필수 | 중간 (개인일 경우 제외/마스킹) |
| `recipientType` | 기관 / 단체 / 법인 / 개인 구분 | 보조사업자 현황 | 권장 | 중간 |
| `region` | 지역 (시·도, 시·군·구) | 보조사업자 / 사업 현황 | 권장 | 낮음~중간 |
| `budgetAmount` | 예산액 | 보조사업 현황 | 권장 | 낮음 |
| `subsidyAmount` | 교부 또는 지원 금액 | 보조사업 / 보조사업자 현황 | 필수 | 낮음 |
| `executionAmount` | 집행 금액 | 집행 현황 | 권장 | 낮음 |
| `settlementAmount` | 정산 금액 | 정산 자료 | 선택 | 낮음 |
| `returnAmount` | 환수 금액 | 감사 / 정산 자료 | 선택 | 낮음 |
| `projectPeriodStart` | 사업 시작일 | 공고 / 사업 자료 | 권장 | 낮음 |
| `projectPeriodEnd` | 사업 종료일 | 공고 / 사업 자료 | 권장 | 낮음 |
| `status` | 진행 / 집행 / 정산 등 상태 | 사업 현황 | 선택 | 낮음 |
| `downloadFormat` | CSV / 엑셀 / TXT / HTML / API / 미상 | 공개 페이지 | 권장 | 낮음 |
| `evidenceUrl` | 증거 원문 URL | 원문 자료 (다운로드 파일 또는 페이지) | 필수 | 낮음 |
| `dataLimitNote` | 공개 제한·비공개 사유 메모 | 수집기 / 운영자 | 권장 | 낮음 |

## 6. 접근 방법

- 1차 접근은 **공개 웹 페이지 조회** 와 **공개 다운로드 파일 확인** 이다.
- CSV / 엑셀 / TXT 다운로드 버튼이 있는 경우 **수집기 후보**로 기록한다.
- API 가 확인되는 경우 별도 문서(예: `DATA_SOURCE_MAP_GOSIMS_API.md` 후속) 에 API 방식, 파라미터, 응답 스키마를 정리한다.
- 브라우저 개발자도구로 네트워크 요청을 확인할 수 있으나, **서비스 약관과 robots 정책을 준수**해야 한다 (수집기 구현 직전 별도 확인).
- **로그인 / 인증 / 우회 / 자동 대량 요청 / CAPTCHA 우회 / 약관 위반 크롤링은 금지** ([`scope.md`](../scope.md) §3, [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2 와 일관).
- 수집 전 **요청 간격, 캐시, 재시도 제한, 사용자 에이전트 명시** 등 안전 수집 정책을 별도 정의한다(기존 Scout / Scheduler 패턴 참고: [`scheduler.md`](./scheduler.md), [`search_collector.md`](./search_collector.md)).

## 7. 비공개·제한 데이터

- **통일·안보 등 비공개 내역사업**은 표시되지 않을 수 있다 — 수집 결과에 포함되지 않는 것이 정상이다.
- **개인정보가 포함된 개인 수급자 상세자료는 수집 대상에서 제외**한다 ([`privacy_policy.md`](./privacy_policy.md) §C, [`../src/policy/privacyGuard.ts`](../src/policy/privacyGuard.ts) 의 `FORBIDDEN_PERSONAL_DATA_TYPES`).
- **로그인 또는 권한이 필요한 내부 화면 / 운영자 화면 / 관계자 보고서**는 수집 대상이 아니다.
- 감사·정산 결과 중 비공개 처리된 항목, 진행 중인 사건·감사·소송 관련 정보, 개인 식별 가능성이 있는 정보는 수집에서 제외하거나 마스킹한다.
- 수집 도중 발견된 개인정보·민감정보는 즉시 `sanitizeForStorage` / `sanitizeForAI` 를 통과시키고, 원문이 저장되지 않도록 한다.
- 데이터에 공개 제한 사유가 명시된 경우 `dataLimitNote` 필드에 기록한다.

## 8. 수집기 스키마 초안

향후 수집기가 만들 레코드의 TypeScript 인터페이스 초안. 실제 코드는 [`../src/types/gosimsDataSource.ts`](../src/types/gosimsDataSource.ts) 에 정의되며 본 문서와 항상 동기화해야 한다.

```typescript
export type GosimsRecipientType =
  | "institution"   // 공공기관 / 정부기관
  | "organization"  // 단체 / 협회 / 비영리
  | "corporation"   // 법인 / 회사
  | "individual"    // 개인 (수집 시 마스킹 / 제외 검토)
  | "unknown";

export type GosimsDownloadFormat =
  | "csv"
  | "excel"
  | "txt"
  | "html"
  | "api"
  | "unknown";

export type GosimsRecordCategory =
  | "subsidy_project"        // 보조사업
  | "sub_project"            // 내역사업
  | "subsidy_recipient"      // 보조사업자
  | "project_recipient_link" // 보조사업별 보조사업자
  | "execution_status"       // 집행 현황
  | "settlement"             // 정산·사후관리
  | "unknown";

export interface GosimsDataRecord {
  // --- 출처 ---
  sourceName: string;
  sourceUrl: string;
  collectedAt: string;          // ISO 8601
  category: GosimsRecordCategory;

  // --- 사업/기관 ---
  fiscalYear?: number;
  ministryName?: string;
  agencyName?: string;
  projectName: string;
  subProjectName?: string;

  // --- 수급자 / 보조사업자 ---
  recipientName?: string;
  recipientType?: GosimsRecipientType;
  region?: string;

  // --- 금액 ---
  budgetAmount?: number;        // 원화 기본, 단위 확인 필수
  subsidyAmount?: number;
  executionAmount?: number;
  settlementAmount?: number;
  returnAmount?: number;

  // --- 기간 / 상태 ---
  projectPeriodStart?: string;  // YYYY-MM-DD
  projectPeriodEnd?: string;    // YYYY-MM-DD
  status?: string;

  // --- 증거 / 출처 / 제한 ---
  downloadFormat?: GosimsDownloadFormat;
  evidenceUrl?: string;
  dataLimitNote?: string;
}
```

## 9. 검증 / 운영 원칙

- **본 문서는 수집기 구현 전 조사 문서다.** 실제 수집기는 별도 단계에서 구현되며, 본 문서의 URL · 필드 · 공개 범위는 운영기관 정책 변경에 따라 갱신되어야 한다.
- 수집기는 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2 (자동 신고 금지), §5 (개인정보 최소 수집), §11 (표현 통제), §12 (사실관계 점검) 정책을 모두 준수해야 한다.
- 수집된 데이터를 사실관계 점검 단계로 넘길 때는 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3 의 11개 확인 항목 (공개자료 / 원문 URL / 금액 / 기간 / 수급기관 / 사업명 / 의심근거 등) 의 원천 데이터를 채울 수 있어야 한다.
- 수집기는 **외부 신고기관에 자동 제출하지 않으며**, 수집한 데이터는 사람 검토(`human_review_required`) 단계로만 넘긴다 ([`approval_gate.md`](./approval_gate.md) §11~§12).
- 정적 검증: `npm run test:datasource-map` 가 본 문서에 §1~§9 필수 섹션이 모두 존재하는지, 그리고 [`../src/types/gosimsDataSource.ts`](../src/types/gosimsDataSource.ts) 에 필수 타입이 export 되어 있는지 확인한다.

---

> 본 문서와 모듈별 가이드 / 수집기 구현이 충돌할 경우, 본 문서와 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`privacy_policy.md`](./privacy_policy.md), [`approval_gate.md`](./approval_gate.md) 가 우선한다.
