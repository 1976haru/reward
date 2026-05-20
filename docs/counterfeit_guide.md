# Counterfeit Practical Guide

## 1. Purpose

2차 모듈인 **위조상품 온라인 판매 의심 탐지 (`counterfeit_goods`)** 에서 사용자가 실제로 무엇을 수집하고, 어디에 신고하며, 어떤 공식 기준을 확인해야 하는지 명확히 안내하기 위한 **조회 전용** 실전 가이드입니다.

이 가이드는 다음을 수행하거나 단정하지 않습니다.

- 외부 신고기관(특허청 / 지식재산침해 원스톱 신고상담센터)에 자동 제출하지 않습니다.
- 위조 여부를 확정하지 않습니다.
- 특정 판매자를 형사적 표현으로 단정하지 않습니다.
- 포상금/보상금 수령을 보장하지 않습니다.

표현 정책: 위조 단정 / 지급 단정 / 보장 단정 류의 긍정 표현은 사용하지 않으며, **"위조상품 의심 후보"**, **"검토가 필요합니다"**, **"공식 기준 확인 필요"**, **"권리자/관계기관 판단 필요"** 같은 중립 표현을 사용합니다.

## 2. Reporting Channels

| id | 기관 | 공식 URL |
|---|---|---|
| `kipo-counterfeit-reward` | 특허청 (위조상품 신고포상금제도) | https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346 |
| `koipa-ippolice` | 한국지식재산보호원 / 지식재산침해 원스톱 신고상담센터 | https://www.koipa.re.kr/ippolice/ |
| `koipa-trademark-infringement-report` | 상표(위조상품) 침해신고 | https://www.koipa.re.kr/ippolice/indusPropReport/infringementReport.do |

각 채널에는 `caution` 필드로 "공식 페이지에서 사람이 직접 신청기한·구비서류·접수 가능 유형을 재확인해야 함" 안내가 포함됩니다.

## 3. Suspicious Signals

| id | 분류 | reviewLevel | 예시 |
|---|---|---|---|
| `replica-grade-claim` | 레플리카 / 미러급 / 등급 표현 | HIGH | 레플리카 / 미러급 / SA급 / S급 |
| `authentic-grade-1to1` | 정품급 / 1:1 제작 / 공장판 표현 | HIGH | 정품급 / 1:1 제작 / 공장판 / 동일 퀄리티 |
| `logo-trademark-replication` | 브랜드 · 상표 표시 복제 의심 | HIGH | 로고 구현 / 각인 구현 / 풀박스 구현 / 보증서 포함 |
| `secret-channel-contact` | 비공개 문의 · 은밀한 판매 유도 | MEDIUM | 카톡 문의 / 텔레 문의 / 비밀배송 / 정품 문의 금지 |
| `abnormal-price` | 가격 비정상 신호 | MEDIUM | 정가 대비 초저가 / 최저가 정품급 / 풀구성 초특가 |
| `same-seller-multi-channel` | 동일 판매자 다채널 판매 신호 | HIGH | 동일 연락처/프로필/이미지 반복 / 2개 이상 채널에서 판매 정황 |
| `image-logo-evidence` | 상품 이미지 / 로고·상표 표시 증거 | MEDIUM | 상품 사진에 상표 로고 노출 / 정품 이미지와 유사 / 구성품·쇼핑백·보증서 이미지 |

모든 항목은 `whyItMatters` 에서 **"위조 단정이 아니라 위조상품 의심 후보로 분류합니다 / 검토가 필요합니다"** 같은 중립 표현을 사용합니다.

## 4. Evidence Checklist

`evidenceChecklist[]` — 사람 검토 단계에서 수집·점검할 자료 (총 15종).

| id | 항목 | 필수 |
|---|---|---|
| `listing-url` | 판매게시글 URL | ✅ |
| `collected-at` | 수집일시 | ✅ |
| `product-name` | 상품명 | ✅ |
| `brand-trademark` | 브랜드/상표 표시 | ✅ |
| `product-image` | 상품 이미지 | ✅ |
| `logo-trademark-capture` | 로고/상표 표시 캡처 | ✅ |
| `price` | 가격 | ✅ |
| `seller-public-info` | 판매자 공개 정보 | ⬜ |
| `same-seller-evidence` | 동일 판매자 추정 증거 | ⬜ |
| `multi-channel-evidence` | 2개 이상 채널 판매 증거 | ✅ |
| `screenshot` | 화면 캡처 | ✅ |
| `pdf` | PDF 저장본 | ✅ |
| `text-extract` | 텍스트 추출본 | ✅ |
| `claim-location` | 위조상품 의심 표현 위치 | ✅ |
| `official-check-record` | 공식 신고 기준 확인 결과 | ✅ |

## 5. Pre-Report Checklist

`preReportChecklist[]` — 사람이 신고 직전 확인할 항목 (총 10종).

- 공개 URL인지 확인
- 로그인 없이 접근 가능한지 확인
- 상품 이미지와 상표/로고 표시가 확인되는지 확인
- 판매게시글 URL을 저장했는지 확인
- 동일 판매자 2개 이상 채널 증거가 있는지 확인
- 캡처와 PDF가 정상적으로 열리는지 확인
- 개인정보가 불필요하게 포함되지 않았는지 확인
- 특허청 / 원스톱센터 공식 신고 기준을 재확인했는지 확인
- 위조 여부를 단정하는 표현이 신고서 초안에 들어가 있지 않은지 확인
- 최종 제출은 사람이 직접 수행하는지 확인 (자동 제출 미수행)

## 6. Reward Caution

`rewardCaution.notGuaranteed === true`, `rewardCaution.officialCheckRequired === true`.

요약: 위조상품 신고포상금은 특허청 또는 관련 공식 기준에 따라 신청기한, 구비서류, 처리결과, 기소의견 송치 여부, 지급 제외 사유 등을 확인해야 합니다. **공익레이더는 포상금 수령을 보장하지 않습니다.**

`notes[]`:

- 특허청 공식 기준에 따르면 신청기한과 구비서류 확인이 필요합니다.
- 신고사건의 처리 결과와 지급 요건에 따라 달라질 수 있습니다.
- 동일인이 2개 이상의 채널에서 위조상품을 판매한다는 증거가 중요할 수 있습니다.
- 위조 여부 확정은 관계기관 또는 권리자 판단이 필요합니다.
- 본 화면은 금액을 확정 표시하지 않습니다.

## 7. Examples

`examples[]` 는 `category` 로 구분됩니다.

- `suspicious` — 위조상품 의심 후보: 예) "미러급 시계 1:1 제작", "정품급 가방 풀박스 구성", "레플리카 운동화 SA급", "로고 각인 완벽 구현", "카톡 문의만 가능, 정품 문의 금지"
- `normal` — 참고 예시: 예) "정품 보증서 포함, 공식 판매처 안내", "브랜드 정식 라이선스 상품", "중고 정품 구매 영수증 보유"
- `needs_review` — 맥락 확인 필요: 예) "정품급 퀄리티", "풀박스 구성", "동일 디자인"

각 예시에는 `explanation` 으로 "맥락과 실제 상품정보, 권리자/기관 판단 확인 필요" 같은 중립 안내를 포함합니다.

## 8. Official Links

| id | label | url |
|---|---|---|
| `kipo-counterfeit-reward` | 특허청 — 위조상품 신고포상금제도 | https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346 |
| `koipa-ippolice-home` | 지식재산침해 원스톱 신고상담센터 | https://www.koipa.re.kr/ippolice/ |
| `kipo-counterfeit-reward-guide` | 위조상품 신고포상금 제도 안내 페이지 (특허청) | https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346 |
| `koipa-trademark-infringement-report` | 상표(위조상품) 침해신고 페이지 | https://www.koipa.re.kr/ippolice/indusPropReport/infringementReport.do |
| `policy-briefing-counterfeit-online` | 정책브리핑 — 위조상품 판매게시물 신고 안내 (참고) | https://www.korea.kr |

## 9. Safety Rules

- 외부 신고기관 자동 제출 기능을 추가하지 않습니다.
- 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 흐름은 제공하지 않습니다.
- 위조 여부 / 포상금 지급을 단정하는 긍정 표현은 사용하지 않습니다.
- 특정 판매자를 형사적 표현으로 단정하지 않습니다.
- API 키 원문은 응답·화면에 표시하지 않습니다.
- 본 가이드는 사용자가 "위조상품 모듈에서 어떤 자료를 모으는가" 를 이해할 수 있도록 돕는 **조회 전용** 안내이며, 사용자가 외부 공식 창구에서 직접 신고해야 합니다.

## API

```
GET /api/modules/counterfeit-goods/guide
```

응답 구조 (요약):

```json
{
  "ok": true,
  "guide": {
    "schemaVersion": "1.0.0",
    "moduleId": "counterfeit_goods",
    "displayName": "위조상품 온라인 판매 의심 신고·포상 가이드",
    "reportingChannels": [ /* 3 */ ],
    "suspiciousSignals": [ /* 7 */ ],
    "evidenceChecklist": [ /* 15 */ ],
    "preReportChecklist": [ /* 10 */ ],
    "rewardCaution": { "notGuaranteed": true, "officialCheckRequired": true, "notes": [ /* 5 */ ] },
    "examples": [ /* 11 */ ],
    "officialLinks": [ /* 5 */ ],
    "safetyNotice": "..."
  },
  "safetyNotice": "이 가이드는 신고지원용이며, 위조 여부 또는 포상금 지급을 확정하지 않습니다.",
  "autoReport": false,
  "humanReviewRequired": true
}
```

`Cache-Control: no-store` (공통 `/api` 미들웨어 적용).
