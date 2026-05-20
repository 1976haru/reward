# Bid Collusion Practical Guide

## 1. Purpose

입찰담합 의심 패턴 분석 모듈(`bid_collusion`)에서 사용자가 실제로 **어떤 입찰 정형 데이터를 수집하고**, **어떤 패턴을 검토하며**, **어디에 신고하고**, **신고포상금은 어떤 공식 기준을 확인해야 하는지** 명확히 안내하기 위한 **조회 전용** 실전 가이드입니다.

이 가이드는 다음을 수행하거나 단정하지 않습니다.

- 외부 신고기관(공정거래위원회 / 국민신문고)에 자동 제출하지 않습니다.
- 담합 여부를 단정하지 않습니다.
- 특정 업체를 형사적 표현으로 단정하지 않습니다.
- 포상금/보상금 수령을 보장하지 않습니다.

표현 정책: 담합 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않으며, **"담합 의심 패턴 검토 후보"**, **"검토가 필요합니다"**, **"공식 기준 확인 필요"**, **"법 위반 인정 및 공정위 조치 결과 필요"** 같은 중립 표현을 사용합니다.

## 2. Reporting Channels

| id | 기관 | 공식 URL |
|---|---|---|
| `ftc-reward-guide` | 공정거래위원회 — 신고포상금 안내 | https://www.ftc.go.kr/www/contents.do?key=402 |
| `ftc-cartel-report` | 공정거래위원회 — 담합 신고 안내 | https://www.ftc.go.kr/www/contents.do?key=368 |
| `ftc-report-method-epeople` | 공정거래위원회 / 국민신문고 — 신고방법 안내 | https://www.ftc.go.kr/www/contents.do?key=320 |

각 채널에는 `caution` 필드로 "공식 페이지에서 사람이 직접 최신 신고서 양식·접수 경로·신고분류를 확인해야 함" 안내가 포함됩니다.

## 3. Suspicious Patterns

| id | 분류 | reviewLevel | 예시 |
|---|---|---|---|
| `repeated-bidder-group` | 동일 업체군 반복 참여 | HIGH | 같은 업체 3~5개 반복 / 특정 지역·품목에서 동일 업체군 경쟁 |
| `rotating-winners` | 순환 낙찰 패턴 | HIGH | A/B/C 순서대로 낙찰 / 낙찰자 돌아가며 바뀜 |
| `cover-bidding` | 들러리 의심 투찰 | HIGH | 낙찰자보다 조금 높은 금액 반복 / 낙찰권 밖 비슷한 순위 |
| `narrow-bid-spread` | 비정상적으로 좁은 투찰 간격 | MEDIUM | 투찰금액 차이 매우 작음 / 투찰률 특정 범위 몰림 |
| `award-rate-clustering` | 낙찰률 특정 구간 집중 | MEDIUM | 낙찰률 87.7~88.3% 근처 집중 / 정상 분포와 다른 군집 |
| `single-winner-dominance` | 특정 업체 반복 낙찰 | HIGH | 한 업체가 과도하게 반복 낙찰 / 경쟁업체는 반복 참여 |
| `repeated-low-competition` | 낮은 경쟁 반복 | MEDIUM | 참여업체 수가 적음 / 같은 업체 두세 곳만 계속 참여 |
| `post-bid-contract-pattern` | 입찰 전후 계약 패턴 의심 | MEDIUM | 낙찰 후 특정 하도급 반복 / 계약 변경 반복 |

모든 항목은 `whyItMatters` 에서 **"담합 단정이 아니라 담합 의심 패턴 검토 후보로 분류합니다 / 검토가 필요합니다"** 같은 중립 표현을 사용합니다.

## 4. Evidence Checklist

`evidenceChecklist[]` — 사람 검토 단계에서 수집·정리할 정형 데이터 (총 19종).

| id | 항목 | 필수 |
|---|---|---|
| `bid-notice-number` | 입찰공고번호 | ✅ |
| `bid-notice-name` | 공고명 | ✅ |
| `ordering-agency` | 발주기관 | ✅ |
| `notice-date` | 공고일자 | ✅ |
| `opening-date` | 개찰일자 | ✅ |
| `base-price` | 기초금액 또는 예정가격 | ✅ |
| `award-price` | 낙찰금액 | ✅ |
| `award-rate` | 낙찰률 | ✅ |
| `winner` | 낙찰자 | ✅ |
| `participants` | 참여업체 목록 | ✅ |
| `bid-prices` | 업체별 투찰금액 | ✅ |
| `bid-rates` | 업체별 투찰률 | ✅ |
| `bid-ranks` | 업체별 개찰순위 | ✅ |
| `repeated-bidder-evidence` | 반복 참여 업체군 근거 | ✅ |
| `rotation-cover-analysis` | 순환 낙찰 또는 들러리 패턴 분석표 | ⬜ |
| `source-url` | 원본 공개자료 URL | ✅ |
| `collected-at` | 수집일시 | ✅ |
| `analysis-report` | 분석 리포트 | ✅ |
| `screenshot-pdf` | 화면 캡처 / PDF (가능할 경우) | ⬜ |

## 5. Pre-Report Checklist

`preReportChecklist[]` — 사람이 신고 직전 확인할 항목 (총 9종).

- 원본 입찰공고와 개찰결과가 공개자료인지 확인
- 참여업체와 투찰금액이 정확히 정리됐는지 확인
- 최소 여러 건의 반복 패턴이 있는지 확인
- 단일 입찰 결과만으로 담합을 단정하지 않았는지 확인
- 담합을 단정하는 표현이 신고서 초안에 들어가 있지 않은지 확인
- 공정위 신고서 양식과 최신 신고경로를 공식 페이지에서 확인했는지 확인
- 증빙자료가 표나 CSV 형태로 정리됐는지 확인
- 특정 업체명 표시 시 단정 표현을 피했는지 확인
- 최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)

## 6. Reward Caution

`rewardCaution.notGuaranteed === true`, `rewardCaution.officialCheckRequired === true`.

요약: 공정거래위원회 신고포상금 안내에 따르면 담합 등 부당한 공동행위 신고는 공식 기준에 따라 포상금 지급 대상이 될 수 있으며, **담합 신고포상금은 공식 안내상 최대 30억 원** 으로 안내됩니다. 다만 **실제 지급 여부와 금액은 법 위반 인정, 조치 결과, 과징금 또는 시정명령, 제출 증거 수준, 지급 제외 사유 등에 따라 달라집니다.** 공익레이더는 포상금 수령을 보장하지 않습니다.

`notes[]`:

- 공식 신고포상금 산정 기준은 사람이 직접 확인이 필요합니다.
- 담합 신고포상금은 공식 안내상 최대 30억 원 상한선이 있으나, 지급 자체를 보장하는 것은 아닙니다.
- 단순 의심만으로는 부족하며 증빙자료의 수준이 중요합니다.
- 법 위반 인정 및 공정위 조치 결과가 필요할 수 있습니다.
- 본 화면은 금액을 확정 표시하지 않습니다.

## 7. Examples

`examples[]` 는 `category` 로 구분됩니다.

- `suspicious` — 담합 의심 패턴 후보: 예) "동일 업체군 A/B/C가 12건 입찰에 반복 참여하고 낙찰자가 순환됨", "낙찰자 외 업체들이 낙찰금액보다 0.2~0.5% 높은 금액으로 반복 투찰", "특정 품목에서 한 업체가 20건 중 17건 낙찰", "낙찰률이 특정 구간에 과도하게 집중"
- `normal` — 참고 예시: 예) "단일 입찰에서 우연히 비슷한 투찰금액 발생", "업체 수가 적은 지역의 정상적 경쟁", "한 업체가 기술력/가격경쟁력으로 반복 낙찰"
- `needs_review` — 맥락 확인 필요: 예) "낙찰률이 비슷하지만 데이터 기간이 짧음", "업체군이 반복되지만 품목·지역이 제한적", "하도급 반복 여부가 추가 확인 필요"

각 예시에는 `explanation` 으로 중립 안내가 포함됩니다.

## 8. Official Links

| id | label | url |
|---|---|---|
| `ftc-reward-guide` | 공정거래위원회 — 신고포상금 안내 | https://www.ftc.go.kr/www/contents.do?key=402 |
| `ftc-cartel-report` | 공정거래위원회 — 담합 신고 안내 | https://www.ftc.go.kr/www/contents.do?key=368 |
| `ftc-report-method-epeople` | 공정거래위원회 — 신고방법 안내 / 국민신문고 연계 | https://www.ftc.go.kr/www/contents.do?key=320 |
| `ftc-unfair-trade-report` | 공정거래위원회 — 불공정거래 신고 안내 (참고) | https://www.ftc.go.kr/www/cmsTmpl.do?cmsCode=newReport |

## 9. Safety Rules

- 외부 신고기관 자동 제출 기능을 추가하지 않습니다.
- 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 흐름은 제공하지 않습니다.
- 담합 여부 / 포상금 지급을 단정하는 긍정 표현은 사용하지 않습니다.
- 특정 업체를 형사적 표현으로 단정하지 않습니다.
- API 키 원문은 응답·화면에 표시하지 않습니다.
- 본 가이드는 사용자가 "입찰담합 모듈에서 어떤 정형 데이터를 모으는가" 를 이해할 수 있도록 돕는 **조회 전용** 안내이며, 사용자가 외부 공식 창구에서 직접 신고해야 합니다.

## API

```
GET /api/modules/bid-collusion/guide
```

응답 구조 (요약):

```json
{
  "ok": true,
  "guide": {
    "schemaVersion": "1.0.0",
    "moduleId": "bid_collusion",
    "displayName": "입찰담합 의심 패턴 분석 — 공정위 담합 신고·포상 가이드",
    "reportingChannels": [ /* 3 */ ],
    "suspiciousPatterns": [ /* 8 */ ],
    "evidenceChecklist": [ /* 19 */ ],
    "preReportChecklist": [ /* 9 */ ],
    "rewardCaution": { "notGuaranteed": true, "officialCheckRequired": true, "notes": [ /* 5 */ ] },
    "examples": [ /* 10 */ ],
    "officialLinks": [ /* 4 */ ],
    "safetyNotice": "..."
  },
  "safetyNotice": "이 가이드는 신고지원용이며, 담합 여부 또는 포상금 지급을 확정하지 않습니다.",
  "autoReport": false,
  "humanReviewRequired": true
}
```

`Cache-Control: no-store` (공통 `/api` 미들웨어 적용).
