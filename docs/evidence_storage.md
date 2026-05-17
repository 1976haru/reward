# Evidence Storage

## 1. Purpose

신고 후보 **Case**의 원본 자료와 증거 파일을 일관된 규칙으로 보존하기 위한 저장소다.
사람이 외부 신고기관에 직접 제출할 때 첨부할 수 있도록 표준 파일명·SHA-256 해시·manifest를 제공한다.

> 본 저장소는 **자동 신고용이 아니다.** 외부 기관 자동 제출, 자동 로그인, 대량 크롤링, 개인정보 수집 기능을 포함하지 않는다.

## 2. Storage Path Policy

```
data/
  evidence/
    {caseId}/
      page.html
      page.txt
      screenshot.png
      page.pdf
      metadata.json
      manifest.json
```

- `caseId`는 `^[A-Za-z0-9_-]{1,80}$` 패턴만 허용한다 (URL/상품명을 직접 파일 경로에 쓰지 않는다).
- 모든 경로 합성은 `path.join`을 거치며, 외부 요청 fileName은 **고정 allowlist**와만 매칭된다 → path traversal 차단.
- 실제 evidence 파일은 Git에 커밋하지 않는다 (`.gitignore`로 `data/evidence/*` 제외, `.gitkeep`만 추적).

## 3. File Naming Rules

| 파일명 | 내용 | MIME |
|---|---|---|
| `page.html` | 수집된 원본 HTML | `text/html` |
| `page.txt` | 본문 텍스트 추출본 | `text/plain` |
| `screenshot.png` | Playwright 전체 페이지 캡처 | `image/png` |
| `page.pdf` | Playwright PDF 저장본 | `application/pdf` |
| `metadata.json` | Case·URL·수집 시각·collector 정보 | `application/json` |
| `manifest.json` | 파일 목록 + 해시 + 캡처 상태 | `application/json` |

이외의 파일명은 **외부 API로 조회되지 않는다**.

## 4. Hash and Timestamp

- 각 evidence 파일은 SHA-256 해시가 manifest에 기록된다 (`createHash("sha256")`).
- `capturedAt`은 ISO-8601 (UTC).
- 동일 입력은 동일 해시를 반환한다 (스모크 테스트에서 회귀 가드).

## 5. Evidence Manifest

`manifest.json` 구조 예시:

```json
{
  "schemaVersion": "1.0.0",
  "caseId": "abc12345",
  "sourceUrl": "https://example.com/product",
  "pageTitle": "Example",
  "fetchedAt": "2026-05-17T03:00:00.000Z",
  "capturedAt": "2026-05-17T03:00:01.000Z",
  "captureStatus": {
    "html": "ok",
    "text": "ok",
    "screenshot": "ok",
    "pdf": "failed",
    "error": "pdf: Protocol error"
  },
  "files": [
    {
      "name": "page.html",
      "path": "C:/.../data/evidence/abc12345/page.html",
      "relativePath": "data/evidence/abc12345/page.html",
      "size": 12345,
      "sha256": "<hex>",
      "mimeType": "text/html; charset=utf-8",
      "capturedAt": "2026-05-17T03:00:01.000Z"
    }
  ],
  "safety": {
    "automaticReportSubmission": false,
    "publicSourceOnly": true,
    "humanReviewRequired": true,
    "note": "본 증거는 사람 검토용 보존 자료이며, 외부 신고 제출은 사용자가 직접 수행합니다."
  }
}
```

## 6. API

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/cases/:id/evidence` | manifest 조회 (manifest 없으면 디렉터리 스캔으로 레거시 대응) |
| `GET` | `/api/cases/:id/evidence/:fileName` | 개별 파일 다운로드. fileName은 allowlist만 (`page.html`/`page.txt`/`screenshot.png`/`page.pdf`/`metadata.json`/`manifest.json`) |
| `POST` | `/api/cases/:id/evidence/capture` | 공개 URL을 수집해 evidence 저장. `{ "url": "https://..." }` |

응답에는 `autoReport: false`, `humanReviewRequired: true`가 포함된다.

에러 코드:

| 코드 | 의미 |
|---|---|
| `VALIDATION_ERROR` | `caseId`/입력 형식 오류 |
| `INVALID_FILE_NAME` | allowlist 외 파일명 요청 |
| `EVIDENCE_NOT_FOUND` | 해당 case의 evidence 디렉터리/manifest 없음 |
| `EVIDENCE_FILE_NOT_FOUND` | 파일이 디스크에 존재하지 않음 |
| `CAPTURE_FAILED` | 수집/캡처 중 예외 |

## 7. Environment Variables

| 변수 | 기본 | 설명 |
|---|---|---|
| `EVIDENCE_DIR` | `./data/evidence` | 증거 저장 루트 |
| `EVIDENCE_CAPTURE_TIMEOUT_MS` | `15000` | Playwright `page.goto` 타임아웃 |
| `EVIDENCE_ENABLE_SCREENSHOT` | `true` | `false` 시 스크린샷 건너뜀 |
| `EVIDENCE_ENABLE_PDF` | `true` | `false` 시 PDF 건너뜀 |

## 8. Safety Rules

- 공개 URL만 저장. http/https 외 프로토콜 거부.
- 로그인 우회·CAPTCHA 우회·차단 회피 코드 없음.
- 개인정보 수집 최소화 — 페이지에 공개된 범위만 저장.
- 자동 신고 기능 없음. evidence 보존은 사람 검토 보조 용도.
- 증거 파일은 Git에 커밋하지 않는다.
- caseId/fileName은 sanitize 후 path.join으로만 합성한다 (path traversal 방지).

## 9. Troubleshooting

| 증상 | 원인/조치 |
|---|---|
| 스크린샷·PDF가 안 생김 | `npm run playwright:install` 재실행, Defender/사내 백신이 chromium 차단 여부 확인 |
| `CAPTURE_FAILED: net::ERR_*` | 대상 사이트가 자동 봇을 차단했을 수 있음 — 우회 금지. HTML/TXT는 별도로 저장될 수 있음 |
| `EVIDENCE_FILE_NOT_FOUND` | 캡처가 실패해 파일이 생성되지 않음. `manifest.json`의 `captureStatus.error` 확인 |
| `INVALID_FILE_NAME` | allowlist 외 파일명을 요청함. 표준 6개 파일명만 허용 |
| Windows 경로 깨짐 | 절대 경로 합성은 `path.join`을 거치며, 한글 caseId는 거부됨 |

## 10. TODO

- (선택) Prisma `EvidenceFile` 모델에 manifest 메타데이터 동기 저장
- (선택) 캡처 작업 비동기 큐 + 진행률 SSE
- (선택) manifest 무결성 재검증 CLI (`npm run verify:evidence`)
