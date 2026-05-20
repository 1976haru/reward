# Reward Registry

## 1. Purpose

공익레이더에서 사용자가 **어떤 신고포상금·보상금 제도를 참고해야 하는지**, **어느 기관에 신고하는지**, **어떤 자료를 모아야 하는지**, **지급 기준·한도·제외사유는 어디서 공식 확인해야 하는지** 한눈에 보여주기 위한 **조회 전용 안내 DB** 입니다.

이 화면은 **포상금 수령을 보장하지 않습니다.** 금액과 한도는 "확정"으로 표시하지 않으며, 공식 기관의 처리 결과·조사 결과·지급 제외 사유에 따라 달라진다고 안내합니다.

## 2. Programs

기본 등록 제도 5종 (모두 `data/` 가 아닌 `src/services/reward/rewardPrograms.ts` 정적 데이터로 관리).

| id | module | agency | 제도 |
|---|---|---|---|
| `mfds_false_ad` | `false_ad` | 식품의약품안전처 | 식품·건강기능식품 온라인 허위·과대광고 신고 |
| `kipo_counterfeit` | `counterfeit_goods` | 특허청 | 위조상품 신고포상금제도 |
| `ftc_bid_collusion` | `bid_collusion` | 공정거래위원회 | 담합 등 공정거래법 위반 신고포상금 |
| `acrc_public_interest` | `public_interest` | 국민권익위원회 / 청렴포털 | 공익신고 보상금·포상금 제도 |
| `acrc_corruption_subsidy` | `subsidy_fraud` | 국민권익위원회 / 청렴포털 | 부패행위 신고 보상·포상 및 보조금 부정수급 참고 |

각 program 은 다음 필드를 포함합니다.

- `whatToCollect[]` — 수집할 자료 목록
- `evidenceChecklist[]` — 사람이 점검할 증거 체크리스트
- `rewardBasisSummary` — 지급 기준 요약 (공식 기준 확인 필요)
- `amountGuide` — 금액/한도 안내 (금액 확정 표시 금지, 항상 "공식 기준 확인 필요" 포함)
- `exclusionNotes[]` — 제외사유 / 주의사항
- `cautionRules[]` — 화면 하단에 공통 노출되는 안전 안내 (수령 보장 없음 / 자동 제출 미수행 등)
- `officialUrl` — 공식 신고기관 URL
- `lastReviewedAt` — 사람이 마지막으로 점검한 날짜

## 3. Evidence Checklist

각 program 의 `evidenceChecklist[]` 는 사용자가 사람 검토 단계에서 직접 확인할 항목입니다. 예:

- 광고/판매게시글 페이지가 **공개 URL** 인지 확인
- **위반 의심 문구** 가 실제 페이지에 표시되는지 확인
- **캡처와 PDF** 를 저장했는지 확인
- **개인정보가 불필요하게 포함되지 않았는지** 확인
- 해당 기관 **공식 신고 안내를 재확인**

## 4. Reward/Compensation Caution

- 본 안내는 참고용이며, **포상금/보상금 수령을 보장하지 않습니다.**
- 지급 여부·금액·기준은 **공식 기관의 처리 결과와 지급 제외 사유** 에 따라 달라질 수 있습니다.
- **공익레이더는 외부 신고기관에 자동으로 제출하지 않습니다.**
- "포상금 확정", "수익 확정", "신고하면 지급", "무조건 지급", "포상금 보장합니다" 등의 긍정 표현은 화면에 사용하지 않습니다.

## 5. Official Links

| 기관 | URL |
|---|---|
| 식품의약품안전처 — 온라인 불법유통 신고 | https://www.mfds.go.kr/wpge/m_660/de010410l001.do |
| 특허청 — 위조상품 신고포상금제도 | https://www.kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0200346 |
| 공정거래위원회 — 신고포상금 안내 | https://www.ftc.go.kr/www/contents.do?key=402 |
| 국민권익위원회 — 청렴포털 공익신고 보상·포상 | https://www.clean.go.kr/menu.es?mid=a10613010000 |
| 국민권익위원회 — 부패행위 신고 보상·포상 | https://www.clean.go.kr/menu.es?mid=a10613000000 |

공식 기준은 기관별로 변경될 수 있으므로 **실전 신고 전 사람이 직접 공식 페이지에서 재확인** 해야 합니다.

## 6. API

```
GET /api/reward-programs
GET /api/reward-programs/:id
GET /api/reward-programs/module/:moduleId
```

응답 구조 (목록):

```json
{
  "ok": true,
  "programs": [ /* RewardProgram[] */ ],
  "summary": {
    "total": 5,
    "lastReviewedAt": "2026-05-20",
    "officialCheckRequired": true,
    "moduleIds": ["bid_collusion", "counterfeit_goods", "false_ad", "public_interest", "subsidy_fraud"]
  },
  "officialLinks": [ /* { programId, agencyName, url, moduleId } */ ],
  "safetyNotice": "신고포상금·보상금은 공식 기준과 처리 결과에 따라 달라지며, 공익레이더는 수령을 보장하지 않습니다. 실전 신고 전 반드시 공식 URL에서 최신 기준을 확인하세요.",
  "autoReport": false,
  "humanReviewRequired": true
}
```

`Cache-Control: no-store` (공통 `/api` 미들웨어 적용).

## 7. Safety Rules

- 외부 신고기관 자동 제출 기능을 추가하지 않습니다.
- 자동 로그인 / 자동 민원 / 포상금 신청을 자동화하는 흐름은 제공하지 않습니다.
- API 키 원문은 응답·화면에 표시하지 않습니다.
- 금액·기준은 항상 "공식 기준 확인 필요" 안내와 함께 표시합니다.
- 본 화면은 **조회 전용** 이며, 사용자가 외부 신고기관에 직접 제출해야 합니다.

`sanitizeRewardText()` 가 다음 금지 표현을 자동 중립화합니다.

- "포상금 확정" → "포상금 지급 여부는 공식 기준 확인 필요"
- "수익 확정" → "수익 여부는 공식 기준 확인 필요"
- "신고하면 지급" → "신고 후 공식 기관 처리 결과에 따라 달라질 수 있음"
- "무조건 지급" → "지급 여부는 공식 기준에 따라 달라질 수 있음"
- "포상금 보장합니다" → "포상금 수령을 보장하지 않습니다"

## 8. Future Improvements

- 모듈 레지스트리 (`src/modules/index.ts`) 와 연결해 신규 모듈 등록 시 자동 매핑.
- 공식 기준이 변경되는 기관의 경우 `lastReviewedAt` 을 주기적으로 사람이 갱신.
- 다국어 안내 (영문 요약) 옵션 — 단 안전 안내 문구는 한국어 원문을 유지.
- Per-program "신고 전 사람 점검 체크리스트" 인쇄용 (Markdown) 출력.
