# Evidence Package

## 1. Purpose

원본 페이지가 삭제되거나 수정되어도 사람이 신고 후보를 검토할 수 있도록 **증거 파일을 일관된 규칙으로 보관**하는 패키지 단위 저장소.
RuleAgent·AnalyzerAgent·ScoringAgent 산출물(JSON)을 같은 폴더에 함께 보존해 후속 검토가 자급자족 가능하도록 한다.

> 증거 패키지는 **자동 신고가 아니다.** 외부 신고기관 자동 제출, 자동 로그인, 대량 크롤링, 개인정보 수집을 일절 수행하지 않는다.

## 2. Storage Structure

```
data/
  evidence/
    {caseId}/
      page.html          ← 수집된 원본 HTML
      page.txt           ← 본문 텍스트 추출본
      screenshot.png     ← Playwright 전체 페이지 캡처
      page.pdf           ← Playwright PDF 저장본
      metadata.json      ← URL/제목/수집시각/collector/extraction summary
      manifest.json      ← 파일 목록 + SHA-256 + 캡처 상태
      extraction.json    ← (선택) TextExtractor 산출물 사본
      rules.json         ← (선택) RuleAgent 산출물 사본
      analysis.json      ← (선택) AnalyzerAgent 산출물 사본
      scoring.json       ← (선택) ScoringAgent 산출물 사본
```

- `caseId` 패턴: `^[A-Za-z0-9_-]{1,80}$`
- 외부 fileName은 위 10개 표준 파일명 allowlist만 허용 → path traversal 차단
- 실제 파일은 `.gitignore`로 제외 (`.gitkeep`만 추적)

## 3. Standard Files

| 파일 | 내용 | MIME |
|---|---|---|
| `page.html` | 수집된 원본 HTML | `text/html` |
| `page.txt` | 본문 텍스트 추출본 | `text/plain` |
| `screenshot.png` | Playwright 전체 캡처 | `image/png` |
| `page.pdf` | Playwright PDF | `application/pdf` |
| `metadata.json` | Case/URL/시각/안전 안내 | `application/json` |
| `manifest.json` | 파일 목록 + 해시 + 캡처 상태 | `application/json` |
| `extraction.json` | TextExtractor 산출물 사본 | `application/json` |
| `rules.json` | RuleAgent 결과 사본 | `application/json` |
| `analysis.json` | AnalyzerAgent 결과 사본 | `application/json` |
| `scoring.json` | ScoringAgent 결과 사본 | `application/json` |

## 4. Hash and Timestamp

- 각 파일은 SHA-256 해시를 manifest에 기록 (`node:crypto.createHash('sha256')`, 스트림 기반)
- `capturedAt`은 ISO-8601 (UTC)

## 5. Evidence Manifest

```json
{
  "schemaVersion": "1.0.0",
  "caseId": "...",
  "sourceUrl": "...",
  "pageTitle": "...",
  "fetchedAt": "...",
  "capturedAt": "...",
  "captureStatus": { "html": "ok", "text": "ok", "screenshot": "ok", "pdf": "ok" },
  "files": [
    { "name": "page.html", "path": "...", "relativePath": "data/evidence/.../page.html",
      "size": 12345, "sha256": "<hex>", "mimeType": "text/html; charset=utf-8", "capturedAt": "..." }
  ],
  "safety": { "automaticReportSubmission": false, "publicSourceOnly": true, "humanReviewRequired": true }
}
```

## 6. Package Summary & Completeness Score

`EvidenceService.summarizePackage(caseId)`가 반환하는 패키지 요약:

```ts
interface EvidencePackageSummary {
  caseId: string;
  exists: boolean;
  hasHtml/hasText/hasScreenshot/hasPdf/hasMetadata/hasManifest: boolean;
  hasExtraction/hasRules/hasAnalysis/hasScoring: boolean;
  capturedAt: string | null;
  fileCount: number;
  totalBytes: number;
  completenessScore: number;  // 0..100 (패키지 완성도, 법 위반 점수가 아님)
  files: [{ name, size, sha256, mimeType, capturedAt }];
  safetyNotice: string;
  autoReport: false;
  humanReviewRequired: true;
}
```

증거 완성도 점수 가중치 (총 100점):

| 항목 | 점수 |
|---|---|
| HTML | 15 |
| TEXT | 15 |
| Screenshot | 25 |
| PDF | 25 |
| Metadata | 10 |
| Manifest | 10 |

이 점수는 **증거 파일 구성의 완성도**이지 위반 가능성·포상금 가능성을 의미하지 않는다.

## 7. API

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/cases/:id/evidence/package` | 패키지 요약(파일 플래그 + 완성도 점수 + 파일 메타) |
| `POST` | `/api/cases/:id/evidence/package` | URL 수집 + 선택 산출물(extraction/rules/analysis/scoring) 첨부 |
| `GET` | `/api/cases/:id/evidence` | 기존 manifest 조회 |
| `GET` | `/api/cases/:id/evidence/:fileName` | 개별 파일 다운로드 (allowlist만) |
| `POST` | `/api/cases/:id/evidence/capture` | 공개 URL 수집 → HTML/TXT/PNG/PDF/metadata/manifest 저장 |
| `GET` | `/api/cases/:id` | Case 상세 + `evidencePackage` 요약 동봉 |

응답에는 `safetyNotice`/`autoReport:false`/`humanReviewRequired:true` 포함.

에러:

| 코드 | 의미 |
|---|---|
| `VALIDATION_ERROR` | caseId/입력 형식 오류 |
| `INVALID_FILE_NAME` | allowlist 외 파일명 |
| `EVIDENCE_NOT_FOUND` | 디렉터리·manifest 없음 |
| `EVIDENCE_FILE_NOT_FOUND` | 파일 미존재 |
| `PACKAGE_FAILED` | 패키지 생성 중 예외 |
| `CAPTURE_FAILED` | 수집/캡처 단계 예외 |

## 8. Environment Variables

| 변수 | 기본 | 설명 |
|---|---|---|
| `EVIDENCE_DIR` | `./data/evidence` | 저장 루트 |
| `EVIDENCE_CAPTURE_TIMEOUT_MS` | `15000` | Playwright `page.goto` 타임아웃 |
| `EVIDENCE_ENABLE_SCREENSHOT` | `true` | false면 스크린샷 건너뜀 |
| `EVIDENCE_ENABLE_PDF` | `true` | false면 PDF 건너뜀 |

## 9. Safety Rules

- 공개 URL만 저장 (http/https). 로그인 우회·CAPTCHA 우회·차단 회피 코드 없음.
- 개인정보 마스킹은 TextExtractor가 사전 처리 (`[email-masked]`, `[phone-masked]`, `[rrn-masked]`).
- 자동 신고 없음 — 패키지는 사람 검토를 위한 로컬 보존.
- 증거 파일은 Git에 커밋되지 않는다.
- caseId는 sanitize되며 fileName은 고정 allowlist만 허용 (path traversal 차단).
- Playwright `browser.close()`는 `finally`에서 호출되며 실패해도 HTML/TXT는 보존.

## 10. Troubleshooting

| 증상 | 원인/조치 |
|---|---|
| 스크린샷/PDF 없음 | `npm run playwright:install` 재실행, AV/방화벽이 chromium 차단 여부 확인 |
| `captureStatus.error: net::ERR_*` | 대상 사이트의 봇 차단 — 우회 금지 |
| `EVIDENCE_FILE_NOT_FOUND` | 캡처 실패. `manifest.captureStatus`의 error 확인 |
| `INVALID_FILE_NAME` | allowlist 외 fileName. 표준 10개만 허용 |
| Windows 한글 경로 | `path.join` 사용, 응답은 manual streaming (sendFile 우회) |
