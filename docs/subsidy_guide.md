# Subsidy Practical Guide

## 1. Purpose

보조금 부정수급 의심 후보 탐지 모듈(`subsidy_fraud`)에서 사용자가 실제로 **어떤 공공자료를 수집하고**, **어디에 신고하며**, **어떤 의심 신호를 검토하고**, **보상·포상 기준은 어떤 공식 기준을 확인해야 하는지** 명확히 안내하기 위한 **조회 전용** 실전 가이드입니다.

이 가이드는 다음을 수행하거나 단정하지 않습니다.

- 외부 신고기관(국민권익위원회·국민신문고·보조금 관리기관·지자체)에 자동 제출하지 않습니다.
- 부정수급 여부를 단정하지 않으며, 횡령·사기 등 형사 단정도 하지 않습니다.
- 특정 단체·개인·사업자를 형사적 표현으로 단정하지 않습니다.
- 보상금·포상금 수령을 보장하지 않습니다.

수집 범위 정책: **공공자료만 사용** 합니다. 로그인 또는 권한이 필요한 비공개 자료는 수집하지 않습니다. 표현 정책은 "공개자료 기반 검토 후보 / 검토가 필요합니다 / 공식 기준 확인 필요" 같은 중립 표현을 사용합니다.

## 2. Reporting Channels

| id | 기관 | 공식 URL |
|---|---|---|
| `acrc-public-interest` | 국민권익위원회 / 청렴포털 — 공익신고 보상·포상 | https://www.clean.go.kr/menu.es?mid=a10613010000 |
| `acrc-corruption-report` | 국민권익위원회 / 청렴포털 — 부패행위 신고 보상·포상 | https://www.clean.go.kr/menu.es?mid=a10613000000 |
| `epeople` | 국민신문고 | https://www.epeople.go.kr |
| `subsidy-managing-agency` | 보조금 관리기관 / 관할 지자체 감사부서 | (사업별 공고문에서 확인) |

각 채널에는 `caution` 필드로 "공식 페이지에서 사람이 직접 신고 분류·관할·요건을 재확인해야 함" 안내가 포함됩니다.

## 3. Public Data Sources

`publicDataSources[]` — 공익레이더가 활용하는 공개자료 소스 (총 5종).

| id | 소스 | 공식 URL | 활용 |
|---|---|---|---|
| `bojo-portal` | 보조금통합포털 | https://www.bojo.go.kr/ | 공모사업·보조사업자·보조금 정보 공개 확인 |
| `gosims` | e나라도움 | https://www.gosims.go.kr/ | 국고보조금 사업·집행·정산 관련 공개 정보 |
| `losims` | 지방보조금관리시스템 보탬e | https://www.losims.go.kr/ | 지방보조금 교부·집행·정산 자료 |
| `data-go-kr` | 공공데이터포털 | https://www.data.go.kr/ | 지자체별 지방보조금 파일/API 데이터셋 |
| `local-gov-homepage` | 지자체 홈페이지 | (지자체별 공식 홈페이지 확인) | 공고·보도자료·결과보고서·회의자료·감사자료 |

각 소스는 **공개자료만 사용** 한다는 원칙을 명시하며, API 키가 필요한 경우 키 원문은 응답·화면에 표시하지 않습니다.

## 4. Suspicious Signals

| id | 분류 | reviewLevel | 예시 |
|---|---|---|---|
| `repeated-grant-receipt` | 반복 수급 | HIGH | 동일 단체가 여러 해 유사 사업명으로 보조금 반복 수령 / 동일 목적 사업 매년 반복 |
| `same-address-similar-org` | 동일 주소 / 유사 단체명 | HIGH | 같은 주소에 여러 보조사업자 존재 / 단체명만 조금 다른 유사 조직 |
| `similar-project-name` | 유사 사업명 반복 | MEDIUM | 같은 사업명 또는 유사 문구의 사업을 여러 기관에서 수령 |
| `low-output` | 결과물 부족 | HIGH | 교부금액 대비 행사·보고서·홍보물·결과물이 부족해 보임 |
| `amount-vs-output` | 금액 대비 산출물 부족 | MEDIUM | 큰 금액 대비 공개 결과물이 단순 게시글 몇 개 수준 |
| `settlement-report-missing` | 정산/결과보고 자료 미확인 | MEDIUM | 정산보고서·결과보고서·정보공시 자료 확인 곤란 |
| `special-relationship` | 특수관계 의심 공개 정황 | HIGH | 수급단체와 용역업체의 주소/대표/연락처가 공개자료상 유사 |
| `duplicate-content` | 중복 콘텐츠 / 이미지 | MEDIUM | 다른 사업 결과물과 동일한 사진·문구·보고서 양식 반복 |

모든 항목은 `whyItMatters` 에서 **"공개자료 기반 검토 후보 / 단정하지 않고 검토가 필요합니다"** 중립 표현을 사용합니다.

## 5. Evidence Checklist

`evidenceChecklist[]` — 사람 검토 단계에서 수집·정리할 공공자료 (총 18종).

| id | 항목 | 필수 |
|---|---|---|
| `project-name` | 보조사업명 | ✅ |
| `recipient-name` | 보조사업자명 | ✅ |
| `granting-agency` | 교부기관 | ✅ |
| `fiscal-year` | 회계연도 | ✅ |
| `grant-amount` | 교부금액 | ✅ |
| `notice-url` | 사업 공고 URL | ✅ |
| `selection-result-url` | 교부/선정 결과 URL | ✅ |
| `execution-settlement` | 집행내역 또는 정산자료 | ⬜ |
| `final-report` | 결과보고서 | ⬜ |
| `output-url` | 결과물 URL | ⬜ |
| `recipient-address` | 보조사업자 주소 (공개자료상) | ✅ |
| `repeated-receipt-basis` | 반복 수급 근거 | ✅ |
| `same-address-basis` | 동일 주소/유사 단체 근거 | ⬜ |
| `similar-project-basis` | 유사 사업명 근거 | ⬜ |
| `low-output-evidence` | 결과물 부족 정황 | ⬜ |
| `screenshot-pdf` | 화면 캡처 / PDF | ✅ |
| `collected-at` | 수집일시 | ✅ |
| `official-check-record` | 공식 기준 확인 결과 | ✅ |

## 6. Pre-Report Checklist

`preReportChecklist[]` — 사람이 신고 직전 확인할 항목 (총 10종).

- 수집한 모든 자료가 공개자료인지 확인
- 개인정보/민감정보가 포함되지 않았는지 확인
- 단일 정황만으로 부정수급을 단정하지 않았는지 확인
- 보조사업 공고와 선정 결과를 확보했는지 확인
- 집행/정산/결과자료를 확인했는지 확인
- 반복 수급 또는 동일 주소 정황을 원본자료로 확인했는지 확인
- 보조금 관리기관 또는 지자체 관할을 확인했는지 확인
- 신고서 초안에 부정수급을 단정하는 표현이 들어가 있지 않은지 확인
- 포상금/보상금 수령을 단정하는 표현이 신고서 초안에 들어가 있지 않은지 확인
- 최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)

## 7. Reward Caution

`rewardCaution.notGuaranteed === true`, `rewardCaution.officialCheckRequired === true`.

요약: 보조금 부정수급 또는 부패행위 신고와 관련된 보상금·포상금은 국민권익위원회, 보조금 관리기관, 관할 지자체 등 공식 기준과 처리 결과에 따라 달라질 수 있습니다. **환수, 처분, 공공기관 수입 회복 또는 손실 방지, 공익 증진 여부** 등이 검토될 수 있으며, **공익레이더는 보상금·포상금 수령을 보장하지 않습니다.**

`notes[]`:

- 공익신고 보상금과 포상금은 요건이 다를 수 있습니다.
- 부패행위 신고 보상·포상 기준은 별도 확인이 필요합니다.
- 보조금 환수·처분 결과가 중요할 수 있습니다.
- 지자체별 조례·지급 기준이 다를 수 있습니다.
- 본 화면은 지급 여부와 금액을 확정 표시하지 않습니다.

## 8. Examples

`examples[]` 는 `category` 로 구분됩니다.

- `suspicious` — 공개자료 기반 검토 후보: 예) "동일 단체가 3년 연속 유사 사업명으로 보조금을 수령했고 공개 결과물이 부족함", "같은 주소에 여러 보조사업자가 등록되어 있고 유사 사업을 반복", "교부금액은 크지만 결과보고서와 행사 기록이 확인되지 않음"
- `normal` — 참고 예시: 예) "동일 단체가 반복 수급했지만 매년 다른 사업 결과보고서·정산자료가 충분히 공개됨", "주소가 같지만 공공시설 입주단체로 확인됨", "결과물이 별도 공식 홈페이지에 공개되어 있음"
- `needs_review` — 맥락 확인 필요: 예) "결과물이 적어 보이나 정산자료 확인 전", "단체명이 유사하나 법인/대표/주소 확인 필요", "동일 주소이나 공유오피스 가능성 있음"

## 9. Official Links

| id | label | url |
|---|---|---|
| `clean-public-interest-reward` | 청렴포털 — 공익신고 보상금·포상금 안내 | https://www.clean.go.kr/menu.es?mid=a10613010000 |
| `clean-corruption-reward` | 청렴포털 — 부패행위 신고 보상·포상 안내 | https://www.clean.go.kr/menu.es?mid=a10613000000 |
| `epeople` | 국민신문고 | https://www.epeople.go.kr |
| `bojo-portal` | 보조금통합포털 | https://www.bojo.go.kr/ |
| `gosims` | e나라도움 | https://www.gosims.go.kr/ |
| `losims` | 지방보조금관리시스템 보탬e | https://www.losims.go.kr/ |
| `data-go-kr` | 공공데이터포털 | https://www.data.go.kr/ |

## 10. Safety Rules

- 외부 신고기관 자동 제출 기능을 추가하지 않습니다.
- 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 흐름은 제공하지 않습니다.
- 부정수급 여부 / 횡령 / 사기 / 형사 책임 / 보상·포상 지급을 단정하는 긍정 표현은 사용하지 않습니다.
- 특정 단체·개인·사업자를 형사적 표현으로 단정하지 않습니다.
- 공공자료만 사용하며, 로그인/권한 필요 자료는 다루지 않습니다.
- API 키 원문은 응답·화면에 표시하지 않습니다.
- 본 가이드는 사용자가 "보조금 모듈에서 어떤 공공자료를 모으는가" 를 이해할 수 있도록 돕는 **조회 전용** 안내이며, 사용자가 외부 공식 창구에서 직접 신고해야 합니다.

## API

```
GET /api/modules/subsidy-fraud/guide
```

응답 구조 (요약):

```json
{
  "ok": true,
  "guide": {
    "schemaVersion": "1.0.0",
    "moduleId": "subsidy_fraud",
    "displayName": "보조금 부정수급 의심 후보 탐지 — 보조금/공익신고 보상·포상 가이드",
    "reportingChannels": [ /* 4 */ ],
    "publicDataSources": [ /* 5 */ ],
    "suspiciousSignals": [ /* 8 */ ],
    "evidenceChecklist": [ /* 18 */ ],
    "preReportChecklist": [ /* 10 */ ],
    "rewardCaution": { "notGuaranteed": true, "officialCheckRequired": true, "notes": [ /* 5 */ ] },
    "examples": [ /* 9 */ ],
    "officialLinks": [ /* 7 */ ],
    "safetyNotice": "..."
  },
  "safetyNotice": "이 가이드는 신고지원용이며, 부정수급 여부 또는 보상·포상 지급을 확정하지 않습니다.",
  "autoReport": false,
  "humanReviewRequired": true
}
```

`Cache-Control: no-store` (공통 `/api` 미들웨어 적용).
