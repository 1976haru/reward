# Report Draft

## 1. Purpose

사람이 공식 신고 창구에 **복사·수정해 직접 제출**할 수 있는 **신고서 초안**을 생성한다.
본 모듈은 외부 신고기관에 **자동 제출하지 않는다.** AI 분석 결과·점수·증거 패키지는 모두 사람 검토 보조 자료다.

## 2. Output Formats

| 형식 | 파일명 | 용도 |
|---|---|---|
| Markdown | `report.md` | 가독·복사·GitHub 등에서 보기 좋음 |
| Plain Text | `report.txt` | 메일·신고 폼 직접 붙여넣기 |
| DOCX | `report.docx` | MS Word/한컴오피스에서 열어 수정·인쇄 |
| Metadata | `report_metadata.json` | 파일 목록 + SHA-256 + 생성 시각 |

DOCX 생성은 `docx` 패키지 기반. 실패 시 Markdown/Text는 정상 저장되고 `warnings`에 사유 기록.

## 3. Report Structure

템플릿: [`src/modules/false-ad/report-template.md`](../src/modules/false-ad/report-template.md)

생성되는 본문 섹션 (12개):

1. 제목
2. 신고 후보 요약 (URL, 수집일시, 상품명, 신고처 후보, 우선순위 점수, 상태, 자동 신고 아님 주의)
3. 육하원칙 정리 (누가/언제/어디서/무엇을/어떻게/왜 검토 필요)
4. 위반 의심 문구 표 (RuleAgent matches 상위 30건: 문구, 위험도, 위치, 사유)
5. AI 문맥 검토 요약 (AnalyzerAgent: summary, violationLikelihood, missingEvidence, safetyWarnings)
6. 증거 자료 목록 표 (Evidence package files: 파일명, MIME/크기, SHA-256 앞 16자)
7. 첨부 가능 자료 목록 (HTML/TXT/PNG/PDF/manifest/metadata)
8. 신고처 후보 ("후보"로만 표기, 식약처/국민신문고/관할 지자체)
9. 신고 전 사람 검토 체크리스트 (8개)
10. 신고 후보 우선순위 점수 (ScoringAgent components + recommendedNextActions)
11. 중립 신고 문구 예시
12. 피해야 할 표현

## 4. Safety Rules

- **자동 신고 금지**: ReportService는 외부 신고기관에 어떤 요청도 보내지 않는다.
- **법 위반 확정 표현 금지**: `sanitizeReportText`가 본문 내 모든 사용자/AI 출력 문자열에서 금지 표현을 중립 표현으로 치환한다.
- **포상금 보장 금지**: "포상금 보장"/"무조건 지급" 등 표현은 모두 sanitize.
- **사람 검토 필수**: 응답에 `notSubmittedAutomatically:true`, `humanReviewRequired:true`, `safetyNotice` 명시.

금지 표현 sanitize 매핑 (예시):

| 입력 패턴 | 치환 |
|---|---|
| `불법 확정` / `위반 확정` | `위반 의심 (검토 필요)` |
| `포상금 지급 확정` / `포상금 보장` / `무조건 지급` | `포상금 지급 여부 확인 필요` 등 |
| `무조건 처벌` | `관계 기관 검토 요청` |
| `범죄자` / `사기꾼` / `사기` | `관련 사업자(검토 필요)` 등 |
| `고의로 속였습니다` / `허위 사실 단정` | 중립 표현으로 치환 |

치환이 발생하면 `warnings` 배열에 사유가 기록되고 응답에 노출.

## 5. API

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/cases/:id/report/draft` | 신고서 초안 생성 (md/txt/docx/metadata). Case가 보유한 ruleDetection/llmAnalysis/scoring/evidence를 모두 통합 |
| `GET` | `/api/cases/:id/report` | 파일 목록 + 해시 + generatedAt 요약 |
| `GET` | `/api/cases/:id/report/:fileName` | 개별 파일 다운로드/보기 (allowlist만: report.md / report.txt / report.docx / report_metadata.json) |
| `GET` | `/api/cases/:id` (보강) | 응답에 `reportSummary` 자동 포함 |

에러 코드:

| 코드 | HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 (caseId/입력 형식 오류) |
| `INVALID_FILE_NAME` | 400 (allowlist 외 fileName) |
| `CASE_NOT_FOUND` | 404 |
| `REPORT_FILE_NOT_FOUND` | 404 |
| `REPORT_DRAFT_FAILED` | 500 |

응답에는 `safetyNotice` / `autoReport:false` / `humanReviewRequired:true` 포함.

## 6. Storage Policy

```
data/reports/{caseId}/
  report.md
  report.txt
  report.docx
  report_metadata.json
```

- `caseId`는 `^[A-Za-z0-9_-]{1,80}$` 패턴만 허용 (sanitize 강제)
- 외부 fileName은 4개 allowlist만 허용 → path traversal 차단
- 절대 경로 합성은 `path.join` 사용
- 실제 report 파일은 `.gitignore`로 제외 (`data/reports/*`, `.gitkeep`만 추적)

## 7. DOCX Generation

`docx` 패키지(`Document` + `Paragraph` + `Table` + `Packer.toBuffer`) 사용.

Markdown을 그대로 파싱하지 않고, 라인 단위로 단순 변환:

- `#`/`##`/`###` → HEADING_1/2/3
- `> ...` → italic paragraph
- `| col | col |` 다음 라인이 separator면 표 시작 → `Table`/`TableRow`/`TableCell`
- 그 외 → 일반 Paragraph

DOCX 생성 실패 시:
- Markdown/Text는 정상 저장
- `warnings`에 `"DOCX 생성 실패. Markdown/Text는 정상 생성되었습니다."` 기록
- 응답의 `report.files.docxPath`는 `undefined`

복잡한 서식보다 **안정적인 문서 생성**이 우선.

## 8. Human Review Checklist (제출 전)

- 원본 URL이 공개 페이지인지 확인
- 캡처와 PDF가 정상 열리는지 확인
- 위반 의심 문구가 실제 광고 페이지에 표시되는지 확인
- 상품명과 판매자 표시 정보가 정확한지 확인
- 개인정보가 불필요하게 포함되지 않았는지 확인
- 신고처 공식 안내를 확인 (식약처/국민신문고/지자체)
- 포상금 보장 표현이 없는지 확인
- 최종 제출 문구를 사람이 직접 검토

## 9. Non-Goals

- 외부 신고기관 자동 제출 ❌
- 신고 폼 자동 입력 / 자동 로그인 ❌
- 포상금 계산 / 지급 보장 표시 ❌
- 법률 자문 형태 단정 표현 ❌
- 처벌 요구 / 범죄자 단정 ❌

## 10. Future Improvements

- agency_config.json 기반 신고처별 문구 변주
- 한글 폰트 임베드 docx (특수 기관 양식에 한해)
- 인쇄용 PDF 변환 (docx → pdf, 사용자 컴퓨터의 LibreOffice 등 외부 도구 필요)
- 본문 길이 제한·요약 옵션 (`POST /report/draft` body로 토글)
