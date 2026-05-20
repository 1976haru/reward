# False Ad Practical Guide

## 1. Purpose

1차 MVP 모듈인 **건강기능식품 온라인 허위·과대광고 탐지 (`false_ad`)** 에서 사용자가 실제로 무엇을 수집하고, 어디에 신고하며, 어떤 공식 기준을 확인해야 하는지 명확히 안내하기 위한 **조회 전용** 실전 가이드입니다.

이 가이드는 다음을 수행하거나 단정하지 않습니다.

- 외부 신고기관에 자동 제출하지 않습니다.
- 법 위반을 확정하지 않습니다.
- 포상금/보상금 수령을 보장하지 않습니다.

표현 정책: 위법 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않으며, **"검토가 필요합니다"**, **"공식 기준 확인 필요"**, **"처리 결과에 따라 달라질 수 있습니다"** 같은 중립 표현을 사용합니다.

## 2. Reporting Channels

| id | 기관 | 공식 URL |
|---|---|---|
| `mfds` | 식품의약품안전처 | https://www.mfds.go.kr/wpge/m_660/de010410l001.do |
| `epeople` | 국민신문고 | https://www.epeople.go.kr |
| `local-health-center` | 관할 보건소 / 지자체 | (관할 지자체 공식 홈페이지에서 확인) |

각 채널에는 `caution` 필드로 "공식 페이지에서 사람이 직접 최신 경로·제출 방법을 재확인해야 함" 안내가 포함됩니다. 식약처 경로는 사이트 구조 변경에 따라 `m_660` / `m_661` 등으로 달라질 수 있으므로 사람이 공식 페이지에서 확인해야 합니다.

## 3. Prohibited or Review-Worthy Claims

| id | 분류 | reviewLevel | 예시 |
|---|---|---|---|
| `disease-treatment` | 질병 치료 표현 | HIGH | 당뇨 치료 / 고혈압 치료 / 관절염 치료 / 비염 치료 |
| `disease-cure` | 질병 완치 표현 | HIGH | 당뇨 완치 / 암 완치 / 불면증 완치 |
| `disease-prevention` | 질병 예방 표현 | HIGH | 암 예방 / 코로나 예방 / 치매 예방 |
| `drug-substitute` | 의약품 오인 표현 | HIGH | 약 대신 / 혈압약 대체 / 병원 갈 필요 없음 / 부작용 없는 치료 |
| `exaggerated-efficacy` | 과장 효능 표현 | MEDIUM | 하루 만에 효과 / 기적의 효과 / 100% 효과 / 먹기만 하면 해결 |
| `body-function-detox` | 신체 기능 과장 · 해독 표현 | MEDIUM | 혈관 청소 / 독소 배출 / 간 해독 / 지방 분해 |

`whyItMatters` 필드는 항상 "건강기능식품을 질병 치료제·의약품처럼 오인하게 할 수 있어 **검토가 필요합니다**" 같은 중립 표현으로 작성합니다.

## 4. Evidence Checklist

`evidenceChecklist[]` 는 사람 검토 단계에서 수집·점검할 자료입니다.

| id | 항목 | 필수 |
|---|---|---|
| `source-url` | 원본 URL | ✅ |
| `collected-at` | 수집일시 | ✅ |
| `product-name` | 상품명 또는 광고 제목 | ✅ |
| `ad-text` | 광고 문구 원문 | ✅ |
| `claim-location` | 의심 문구 위치 | ✅ |
| `screenshot` | 화면 캡처 | ✅ |
| `pdf` | PDF 저장본 | ✅ |
| `text-extract` | 텍스트 추출본 | ✅ |
| `seller-public-info` | 판매자 공개 정보 | ⬜ |
| `official-check-record` | 신고처 공식 기준 확인 결과 | ✅ |

## 5. Pre-Report Checklist

`preReportChecklist[]` — 사람이 신고 직전 확인할 항목입니다.

- 공개 URL인지 확인
- 로그인 없이 접근 가능한지 확인
- 의심 문구가 실제 페이지에 표시되는지 확인
- 캡처와 PDF가 정상적으로 열리는지 확인
- 개인정보가 불필요하게 포함되지 않았는지 확인
- 식약처 공식 신고 페이지를 재확인했는지 확인
- 포상금 수령을 보장하는 표현이 신고서 초안에 들어가 있지 않은지 확인
- 최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)

## 6. Reward Caution

`rewardCaution.notGuaranteed === true`, `rewardCaution.officialCheckRequired === true`.

요약: 건강기능식품 관련 신고포상금 지급 여부와 금액은 관련 법령·고시, 위반 확인, 행정처분·고발 등 처리 결과, 지급 제외 사유에 따라 달라질 수 있습니다. **공익레이더는 포상금 수령을 보장하지 않습니다.**

`notes[]`:

- 공식 법령과 고시를 사람이 직접 확인해야 합니다.
- 지급 대상과 지급 제외 사유가 있을 수 있습니다.
- 기관별 지급 한도와 절차가 있을 수 있습니다.
- 신고 내용이 위반행위로 확인되어야 지급 검토 대상이 될 수 있습니다.
- 본 화면은 금액을 확정 표시하지 않습니다.

## 7. Examples

`examples[]` 는 `category` 로 구분됩니다.

- `suspicious` — 검토 후보 (의심): 예) "당뇨 완치에 도움", "혈압약 대신 먹는 영양제", "암 예방 효과", "하루 만에 관절염 통증 해결", "독소를 완전히 배출"
- `normal` — 허용 범위 예시 (참고): 예) "건강 유지에 도움을 줄 수 있음", "균형 잡힌 식생활과 함께 섭취하세요", "질환자는 전문가와 상담 후 섭취하세요"
- `needs_review` — 맥락 확인 필요: 예) "혈당 관리에 도움", "면역력 관리", "피로 개선"

각 예시에는 `explanation` 으로 "맥락과 기능성 인정 범위 확인 필요" 같은 중립 안내를 포함합니다.

## 8. Official Links

| id | label | url |
|---|---|---|
| `mfds-online-illegal-trade` | 식품의약품안전처 — 온라인 불법유통 신고 | https://www.mfds.go.kr/wpge/m_660/de010410l001.do |
| `mfds-online-illegal-trade-alt` | 식품의약품안전처 — 온라인 불법유통 신고 (대체 경로 후보) | https://www.mfds.go.kr/wpge/m_661/de010410l001.do |
| `health-functional-food-law` | 건강기능식품에 관한 법률 (국가법령정보센터) | https://www.law.go.kr |
| `reward-rule-reference` | 부정·불량 식품 및 건강기능식품 등의 신고포상금 지급 관련 규정 (참고) | https://www.law.go.kr |
| `food-safety-korea` | 식품안전나라 / 식약처 허위·과대광고 안내 | https://www.foodsafetykorea.go.kr |

## 9. Safety Rules

- 외부 신고기관 자동 제출 기능을 추가하지 않습니다.
- 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 흐름은 제공하지 않습니다.
- 법 위반 / 포상금 지급을 단정하는 긍정 표현은 사용하지 않습니다.
- API 키 원문은 응답·화면에 표시하지 않습니다.
- 본 가이드는 사용자가 "어떤 자료를 모으는가" 를 이해할 수 있도록 돕는 **조회 전용** 안내이며, 사용자가 외부 공식 창구에서 직접 신고해야 합니다.

## API

```
GET /api/modules/false-ad/guide
```

응답 구조 (요약):

```json
{
  "ok": true,
  "guide": {
    "schemaVersion": "1.0.0",
    "moduleId": "false_ad",
    "displayName": "건강기능식품 온라인 허위·과대광고 신고·포상 가이드",
    "reportingChannels": [ /* 3+ */ ],
    "prohibitedClaimTypes": [ /* 6+ */ ],
    "evidenceChecklist": [ /* 10 */ ],
    "preReportChecklist": [ /* 8 */ ],
    "rewardCaution": { "notGuaranteed": true, "officialCheckRequired": true, "notes": [ /* 5 */ ] },
    "examples": [ /* 11 */ ],
    "officialLinks": [ /* 5 */ ],
    "safetyNotice": "..."
  },
  "safetyNotice": "이 가이드는 신고지원용이며, 법 위반 또는 포상금 지급을 확정하지 않습니다.",
  "autoReport": false,
  "humanReviewRequired": true
}
```

`Cache-Control: no-store` (공통 `/api` 미들웨어 적용).
