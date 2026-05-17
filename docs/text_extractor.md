# Text Extractor

## 1. Purpose

수집된 HTML에서 **건강기능식품 허위·과대광고 판단**에 필요한 광고 문구를 구조화하여 추출한다.
RuleAgent·AnalyzerAgent·EvidenceService·사람 검토자의 입력 자료를 만드는 것이 목적이며, **법 위반 여부를 본 모듈이 단독으로 판단하지 않는다.**

> 자동 신고 기능 없음. 외부 신고기관 자동 제출·자동 로그인·CAPTCHA 우회·대량 크롤링·OCR·이미지 분석 모두 미포함.

## 2. Extraction Flow

```
HTML 입력
  → cheerio.load
  → boilerplate 태그 제거 (script/style/nav/header/footer/iframe/form 등)
  → class/id 힌트 기반 제거 (nav/footer/menu/banner/cookie ... — 단, 본문 길이 임계 이상이면 보존)
  → 제목 후보 (h1 / og:title / <title>)
  → 상품명 후보 (h1 / product-class / og:title)
  → 가격 후보 (regex)
  → 본문 텍스트(mainText) 정규화 + 길이 제한
  → 개인정보 마스킹 (email/phone/주민번호)
  → 문장 분리
  → 카테고리별 후보 추출 (claim/review/ingredient/usage/warning/seller)
  → 중복 제거 + 카테고리당 상한 (30)
  → ExtractionResult 반환
```

## 3. Boilerplate Strip Rules

무조건 제거되는 태그:
`script`, `style`, `noscript`, `svg`, `canvas`, `iframe`, `nav`, `header`, `footer`, `aside`, `form`, `button`, `input`, `select`, `textarea`

class/id에 다음 힌트가 있으면 boilerplate 후보:
`nav`, `footer`, `header`, `menu`, `sidebar`, `banner`, `popup`, `modal`, `cookie`, `cart`, `login`, `search`, `pagination`, `recommend`, `related`, `recent`, `delivery`, `refund`, `exchange`

단, 해당 요소 안 텍스트가 600자 이상이면 콘텐츠일 가능성을 고려해 **보존**하고, `removedBoilerplateHints`에 `preserved:<hint>(len=N)` 로만 기록한다 (정보 손실 방지).

## 4. Extraction Fields

```ts
interface ExtractionResult {
  title?: string;                     // 페이지 타이틀
  productName?: string;               // 상품명 (h1 우선, 사이트명 분리 후 최대 120자)
  priceCandidates: string[];          // ₩39,800 / 39,800원 / 39800 KRW 등
  claimCandidates: string[];          // 의심 광고 문구 (질병+치료 등 ±1 문장 컨텍스트)
  reviewCandidates: string[];         // 후기/리뷰성 문장
  ingredientCandidates: string[];     // 성분/원료
  usageCandidates: string[];          // 섭취 방법
  warningCandidates: string[];        // 주의사항/부작용
  sellerCandidates: string[];         // 사업자/판매자 공개 정보
  mainText: string;                   // 정규화된 본문 (12,000자 캡)
  sections: { name; text }[];         // 카테고리별 상위 5개 요약 (UI/디버깅)
  textLength: number;
  removedBoilerplateHints: string[];
  extractionWarnings: string[];
}
```

## 5. claimCandidates 추출 기준

다음 키워드가 포함된 문장 + 앞뒤 1문장(컨텍스트) 모두 후보로 수집.

- **질병/증상 키워드**: 암·당뇨·혈당·고혈압·콜레스테롤·관절염·치매·우울증·불면증·아토피·비염·간염·위염·역류성 식도염·면역·코로나·종양·갱년기·전립선·통풍 등 27개
- **위험 표현**: 치료·완치·예방·개선·억제·약 대신·병원 갈 필요·처방 없이·부작용 없·근본 치료·재발 방지·하루 만에·즉시 효과·기적·독소 배출·혈관 청소·지방 분해·100% 효과·보장 등 22개

키워드 매칭만으로 위반을 단정하지 않는다 — 사람 검토 필수.

## 6. PII Masking

본문 마스킹 (저장 직전 적용):

| 패턴 | 마스킹 |
|---|---|
| email | `[email-masked]` |
| 전화 (010-1234-5678 / 02-123-4567 / 010 1234 5678) | `[phone-masked]` |
| 주민등록번호 형태 (xxxxxx-xxxxxxx) | `[rrn-masked]` |

판매자/사업자 공개 표시 정보는 페이지에 공개된 범위 내에서만 수집한다.

## 7. API

`POST /api/extract`

Request:

```json
{
  "html": "<html>...</html>",
  "url": "https://example.com/product",
  "title": "혈당 관리 건강기능식품",
  "moduleId": "false_ad"
}
```

Response (요약):

```json
{
  "ok": true,
  "moduleId": "false_ad",
  "result": {
    "title": "...",
    "productName": "...",
    "priceCandidates": ["39,800원"],
    "claimCandidates": ["..."],
    "reviewCandidates": ["..."],
    "ingredientCandidates": ["..."],
    "usageCandidates": ["..."],
    "warningCandidates": ["..."],
    "sellerCandidates": ["..."],
    "mainText": "...",
    "sections": [...],
    "textLength": 1234,
    "removedBoilerplateHints": [...],
    "extractionWarnings": [...]
  },
  "safetyNotice": "추출 결과는 신고 후보 검토용이며, 법 위반 판단을 확정하지 않습니다.",
  "autoReport": false
}
```

에러 코드:

| 코드 | 의미 |
|---|---|
| `VALIDATION_ERROR` | html 누락/형식 오류 |
| `PAYLOAD_TOO_LARGE` | html 크기가 2MB 한도 초과 |
| `EXTRACT_FAILED` | 파서 실패 등 예외 |

## 8. Integration with Existing Pipeline

`OrchestratorAgent.analyze(request)`는 다음 순서로 동작한다.

```
CollectorAgent.collectUrl(url)
  → TextExtractor.extract(html)
  → analysisText = claimCandidates + reviewCandidates + mainText(8000자 캡)
  → RuleAgent.detect(moduleId, analysisText)   ← 추출 실패 시 doc.text로 폴백
  → ScoringAgent.score(...)
  → AnalyzerAgent.analyze(...)
  → EvidenceService.buildEvidence(caseId, doc, { extractionSummary })   ← metadata.json에 요약 기록
  → ReportService.createReport(...)
  → repository.save(...)
```

추출이 실패하더라도 기존 분석은 doc.text로 폴백되어 깨지지 않는다.

## 9. Limits & Tuning

| 항목 | 값 |
|---|---|
| `maxHtmlBytes` | 2,000,000 (2 MB) |
| `maxMainTextChars` | 12,000 |
| `maxCandidatesPerCategory` | 30 |
| `maxPriceCandidates` | 20 |
| `productNameMaxLen` | 120 |
| boilerplate preserve threshold | 600 chars |
| analysisText tail (orchestrator) | 8,000 chars |

## 10. Non-Goals

- OCR 도입 없음 (이미지 안 문구 분석 없음)
- 쇼핑몰 사이트별 무리한 어댑터 없음
- 로그인 우회·CAPTCHA 우회·HTML 스크래핑 우회 없음
- 자동 신고 / 외부 기관 자동 제출 없음
- 가격 정보를 위반 판단에 직접 사용하지 않음 (참고용 priceCandidates만)
