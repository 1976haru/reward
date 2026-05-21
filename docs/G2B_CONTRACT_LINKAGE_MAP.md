# 나라장터 연계 데이터 조사 및 계약데이터 매핑표

> Repository / internal project name: `reward-agent-mvp`
> Product display name: 공익레이더 (Public Interest Radar)
> 문서 종류: G2B Contract Linkage Map (조사 문서, 수집기·매칭기 구현 전 단계)
> 관련 문서: [`DATA_SOURCE_MAP_PUBLIC_API.md`](./DATA_SOURCE_MAP_PUBLIC_API.md), [`DATA_SOURCE_MAP_GOSIMS.md`](./DATA_SOURCE_MAP_GOSIMS.md), [`LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md`](./LOCAL_GOV_COLLECTION_TARGETS_GYEONGGI.md), [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`privacy_policy.md`](./privacy_policy.md), [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md), [`../scope.md`](../scope.md)

---

## 1. 문서 목적

- 보조금 AI 에이전트에서 **보조사업 수행업체와 나라장터 공공입찰·계약 정보를 연결할 수 있는지 조사**한다.
- 본 문서는 **실제 수집기·매칭기 구현 전 조사 문서**이다.
- 실제 API 호출, 인증키 발급, 데이터 수집, 자동 매칭은 후속 단계에서 수행한다.
- 본 문서는 "동일 업체 확정" 이 아니라 **"동일성 후보 탐지" 와 "추가 검토 필요"** 를 위한 기준을 정리한다.
- **공개자료 중심 분석 원칙**과 **개인정보 최소수집 원칙**을 따른다 ([`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §5.5, [`privacy_policy.md`](./privacy_policy.md)).
- 본 문서는 법률 자문이나 운영기관의 공식 안내를 대체하지 않는다.

## 2. 연계 분석 목적

- 보조사업 수행업체가 공공입찰·계약에서도 **반복적으로 등장**하는지 확인한다.
- 동일 업체가 특정 지자체·기관·사업유형에 **반복 등장하는 패턴**을 확인한다.
- 보조사업 수급기관과 계약 상대방 간 **명칭·주소·대표자·사업자번호 기반 유사성**을 검토한다.
- 보조금 집행처와 계약 상대방 간 **관계성 후보**를 만들되, **관계를 단정하지 않는다.**
- 입찰·계약 데이터는 **의심 신호 보강자료**이며, 그 자체로 위법 여부를 확정하지 않는다.
- 분석 결과는 항상 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3 의 사람 검토 단계로 넘긴다.

## 3. 나라장터 / 공공데이터포털 후보 데이터소스

> 모든 항목은 본 문서 작성 시점 기준이며 운영기관 정책 변경 / API 명세 변경 가능성을 고려해 **"재확인 필요"** 로 표시한다.

| 번호 | 데이터소스 | 제공기관 | URL | 제공 내용 후보 | API 유형 | 포맷 | 인증/신청 | 우선순위 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 조달청_나라장터 계약정보서비스 | 조달청 | https://www.data.go.kr/data/15129427/openapi.do | 계약정보목록, 계약상세정보, 계약변경이력, 계약삭제이력 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청·인증키 확인 필요 | P0 | 후보 |
| 2 | 조달청_나라장터 계약과정통합공개서비스 | 조달청 | https://www.data.go.kr/data/15129459/openapi.do | 입찰공고, 사전규격, 발주계획, 조달요청, 낙찰, 계약 진행 과정 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청·인증키 확인 필요 | P0 | 후보 |
| 3 | 조달청_나라장터 공공데이터개방표준서비스 | 조달청 | https://www.data.go.kr/data/15058815/openapi.do | 입찰·낙찰·계약정보 개방표준 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청·인증키 확인 필요 | P1 | 후보 |
| 4 | 조달청_나라장터 사용자정보 서비스 | 조달청 | https://www.data.go.kr/data/15129466/openapi.do | 조달업체·수요기관 등 사용자 정보 후보 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청·인증키 확인 필요 | P1 | 후보 |
| 5 | 조달청_나라장터 조달요청서비스 | 조달청 | https://www.data.go.kr/data/15129468/openapi.do | 수요기관, 조달요청, 계약체결형태, 발주기관 정보 | REST/OpenAPI 재확인 필요 | JSON/XML 재확인 필요 | 활용신청·인증키 확인 필요 | P1 | 후보 |

## 4. 보조사업 데이터와 계약데이터 연결 기준

| 연결 기준 | 설명 | 매칭 신뢰도 | 주의사항 |
|---|---|---|---|
| **사업자등록번호** | 보조사업자와 계약상대자의 사업자번호가 같은 경우 | 높음 | 개인사업자 정보는 마스킹·제한 필요 |
| **법인등록번호** | 법인 식별값이 같은 경우 | 높음 | 공개자료 여부 확인 필요 |
| **업체명/기관명** | 보조사업자명과 계약상대자명이 같거나 유사한 경우 | 중간 | 약칭·띄어쓰기·법인표기 차이 정규화 필요 |
| **대표자명** | 대표자가 같은 경우 | 중간 | 개인정보 위험, 단독 매칭 금지 |
| **주소** | 소재지 또는 본점 주소가 유사한 경우 | 중간 | 상세주소는 마스킹, 시군구 수준 우선 |
| **전화번호** | 대표 전화번호가 같은 경우 | 낮음~중간 | 개인 연락처 제외, 마스킹 필요 |
| **기관명** | 수요기관·발주기관과 보조금 교부기관이 같은 경우 | 중간 | 조직개편·부서명 변경 주의 |
| **계약명/사업명** | 계약명과 보조사업명이 유사한 경우 | 낮음~중간 | 키워드 유사도만으로 단정 금지 |
| **계약기간/사업기간** | 계약일자와 사업기간이 겹치는 경우 | 보조 신호 | 시간적 연관성만으로 단정 금지 |
| **계약금액/보조금액** | 계약금액과 보조금액이 유사하거나 관련성이 있는 경우 | 보조 신호 | 금액 단위·부가세·분할계약 확인 필요 |

## 5. 표준 매핑 필드 후보

| 표준 필드명 | 보조사업 쪽 후보 | 나라장터 계약 쪽 후보 | 용도 | 개인정보 위험 | 저장 기준 |
|---|---|---|---|---|---|
| `recipientName` | 보조사업자명, 수급기관명 | 계약상대자명, 업체명 | 명칭 매칭 | 중간 | 공개자료만 |
| `normalizedRecipientName` | 정규화된 수급기관명 | 정규화된 계약상대자명 | 명칭 유사도 | 낮음 | 저장 가능 |
| `businessRegistrationNumberHash` | 사업자등록번호 | 사업자등록번호 | 강한 매칭 | 높음 | **원문 저장 금지, 해시 또는 마스킹** |
| `corporateRegistrationNumberHash` | 법인등록번호 | 법인등록번호 | 강한 매칭 | 높음 | **원문 저장 금지, 해시 또는 마스킹** |
| `representativeNameMasked` | 대표자명 | 대표자명 | 보조 매칭 | 높음 | 마스킹 저장 |
| `addressRegion` | 소재지, 주소 | 계약상대자 주소 | 지역 매칭 | 중간 | 시군구 수준 |
| `phoneNumberMasked` | 전화번호 | 대표전화 | 보조 매칭 | 높음 | 마스킹 저장 |
| `subsidyProjectName` | 보조사업명 | 계약명 | 사업·계약명 유사도 | 낮음 | 저장 가능 |
| `contractTitle` | 해당 없음 | 계약명 | 계약 식별 | 낮음 | 저장 가능 |
| `contractAmount` | 해당 없음 | 계약금액 | 금액 비교 | 낮음 | 저장 가능 |
| `subsidyAmount` | 보조금액 | 해당 없음 | 금액 비교 | 낮음 | 저장 가능 |
| `contractDate` | 해당 없음 | 계약일자 | 기간 비교 | 낮음 | 저장 가능 |
| `projectPeriodStart` | 사업 시작일 | 계약 시작일 | 기간 비교 | 낮음 | 저장 가능 |
| `projectPeriodEnd` | 사업 종료일 | 계약 종료일 | 기간 비교 | 낮음 | 저장 가능 |
| `orderingAgencyName` | 교부기관명 | 수요기관명, 발주기관명 | 기관 매칭 | 낮음 | 저장 가능 |
| `sourceUrl` | 원문 URL | API URL, 공고 URL | 증거 연결 | 낮음 | 필수 |
| `collectedAt` | 수집일시 | 수집일시 | 추적 | 낮음 | 필수 |
| `linkageConfidence` | 산출값 | 산출값 | 매칭 신뢰도 | 낮음 | 저장 가능 |
| `linkageReason` | 산출값 | 산출값 | 연결 근거 설명 | 낮음 | 중립 표현만 |

## 6. 매칭 신뢰도 기준

| 등급 | 조건 | 설명 | 처리 |
|---|---|---|---|
| `high` | 사업자등록번호 또는 법인등록번호 해시 일치 + 명칭 유사 | 동일성 후보 강함 | 사람 검토 필요 |
| `medium` | 업체명 유사 + 주소 시군구 일치 + 기간 겹침 | 추가 확인 필요 | 보조 근거 확인 |
| `low` | 업체명 일부 유사 또는 계약명·사업명 유사 | 약한 후보 | 단독 사용 금지 |
| `excluded` | 개인정보 위험이 높거나 원문 근거 부족 | 분석 제외 | 저장하지 않음 |

매칭 신뢰도는 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3 의 사실관계 점검과 별개이며, 본 신뢰도가 `high` 라도 **사실관계 점검 11개 항목을 통과**해야 신고서 확정 단계로 갈 수 있다 ([`approval_gate.md`](./approval_gate.md) §12).

## 7. 개인정보·식별정보 제한사항

- **사업자등록번호와 법인등록번호 원문은 저장하지 않는다.** 해시 또는 마스킹된 형태로만 저장 (`businessRegistrationNumberHash`, `corporateRegistrationNumberHash`).
- **개인사업자 정보**는 개인정보 위험이 높으므로 원칙적으로 **제외하거나 마스킹**한다.
- **대표자명, 전화번호, 상세주소는 단독 매칭 기준으로 사용하지 않는다.** 보조 신호로만 활용.
- **주민등록번호, 계좌번호, 개인 연락처, 개인 이메일**은 수집·저장하지 않는다 ([`privacy_policy.md`](./privacy_policy.md) §C).
- 공개자료에 포함된 정보라도 저장 전 `sanitizeForStorage` ([`../src/policy/privacyGuard.ts`](../src/policy/privacyGuard.ts)) 또는 기존 `MaskingService` 를 통과시킨다.
- AI 프롬프트에는 **원문 식별번호, 대표자명, 전화번호, 상세주소를 넣지 않는다** (`sanitizeForAI` 통과).
- 연결 결과는 **"동일성 후보", "추가 검토 필요"** 로만 표현한다 ([`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) §3·§4).

## 8. 수집·접근 제한사항

- 실제 API 호출 전 **활용신청, 인증키, 요청변수, 응답필드, 트래픽 한도**를 확인한다.
- **로그인 우회, 인증 우회, 무제한 호출, 약관 위반 수집**을 금지한다 ([`scope.md`](../scope.md) §3, [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2).
- 나라장터 또는 공공데이터포털의 **이용조건과 저작권·재배포 제한**을 확인한다.
- API 응답 필드는 운영기관 정책에 따라 변경될 수 있으므로 **수집기 구현 직전 재확인**한다.
- **계약정보와 보조금 정보를 결합해 위법 여부를 단정하지 않는다.** 본 분석은 보조 신호 / 동일성 후보만 만든다.
- 본 분석 결과는 **외부 신고기관에 자동 제출되지 않으며**, 사람 검토(`human_review_required`) 단계로만 넘긴다 ([`approval_gate.md`](./approval_gate.md) §11~§12).

## 9. 계약데이터 매핑 스키마 초안

향후 매칭기가 만들 후보 카드의 TypeScript 인터페이스 초안. 실제 코드는 [`../src/types/g2bContractLinkage.ts`](../src/types/g2bContractLinkage.ts) 에 정의되며 본 문서와 항상 동기화되어야 한다.

```typescript
export interface G2bContractLinkageCandidate {
  id: string;
  subsidyRecordId: string;
  contractRecordId?: string;
  sourceName: "g2b" | "data.go.kr" | "manual" | string;
  sourceUrl: string;
  collectedAt: string;
  recipientName?: string;
  normalizedRecipientName?: string;
  businessRegistrationNumberHash?: string;
  corporateRegistrationNumberHash?: string;
  representativeNameMasked?: string;
  addressRegion?: string;
  phoneNumberMasked?: string;
  subsidyProjectName?: string;
  contractTitle?: string;
  contractAmount?: number;
  subsidyAmount?: number;
  contractDate?: string;
  projectPeriodStart?: string;
  projectPeriodEnd?: string;
  orderingAgencyName?: string;
  matchingSignals: Array<
    | "business_number_hash_match"
    | "corporate_number_hash_match"
    | "name_similarity"
    | "address_region_match"
    | "phone_masked_match"
    | "agency_match"
    | "title_similarity"
    | "period_overlap"
    | "amount_similarity"
  >;
  linkageConfidence: "high" | "medium" | "low" | "excluded";
  linkageReason: string;
  privacyRisk: "low" | "medium" | "high" | "unknown";
  reviewRequired: true;
  status: "candidate" | "needs_verification" | "reviewed" | "excluded";
}
```

### 검증 / 운영 원칙

- **본 문서는 조사 문서다.** 실제 매칭기는 별도 단계에서 구현되며, 나라장터 API 명세 / 활용신청 절차 / 인증키 / 트래픽 한도는 운영기관 정책 변경에 따라 갱신되어야 한다.
- 매칭기는 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §2 (자동 신고 금지), §5 (개인정보 최소 수집), §11 (표현 통제), §12 (사실관계 점검) 정책을 모두 준수해야 한다.
- 매칭 결과를 사실관계 점검 단계로 넘길 때는 [`PRE_SUBMISSION_FACT_CHECKLIST.md`](./PRE_SUBMISSION_FACT_CHECKLIST.md) §3 의 11개 확인 항목의 원천 데이터로 사용한다.
- `reviewRequired: true` 가 모든 후보에 강제된다 — 매칭 신뢰도가 `high` 라도 사람 검토 없이 다음 단계로 진행할 수 없다.
- 정적 검증: `npm run test:g2b-linkage` 가 본 문서에 §1~§9 필수 섹션이 모두 존재하는지, [`../src/types/g2bContractLinkage.ts`](../src/types/g2bContractLinkage.ts) 에 5개 데이터소스가 정의되어 있는지, 매칭 신호·신뢰도·필드 enum 이 노출되는지 확인한다.

---

> 본 문서와 모듈별 가이드 / 수집기·매칭기 구현이 충돌할 경우, 본 문서와 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md), [`privacy_policy.md`](./privacy_policy.md), [`approval_gate.md`](./approval_gate.md), [`REPORT_LANGUAGE_GUIDE.md`](./REPORT_LANGUAGE_GUIDE.md) 가 우선한다.
