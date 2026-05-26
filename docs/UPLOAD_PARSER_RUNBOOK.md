# CSV/PDF/엑셀 업로드 수집기 Runbook (체크리스트 12)

## 1. 문서 목적

- 지자체가 공개한 보조금 관련 CSV, XLSX, PDF 파일을 **수동 업로드** 후 **표준 보조금 레코드**로 변환하는 기준을 정의한다.
- 본 모듈은 웹 크롤러가 아니라 **수동 업로드 파일 변환기**이다. 사람이 지자체 홈페이지에서 내려받은 파일을 업로드했다고 가정한다.
- 공개자료 중심 분석 원칙과 개인정보 최소수집 원칙을 따른다.

관련 코드:

- 파서 모듈: [`src/parsers/uploadSubsidyParser.ts`](../src/parsers/uploadSubsidyParser.ts)
- 표준 타입: [`src/types/uploadParser.ts`](../src/types/uploadParser.ts)
- CLI: [`scripts/parse-uploaded-subsidy-files.ts`](../scripts/parse-uploaded-subsidy-files.ts)
- 테스트: [`tests/uploadSubsidyParser.test.ts`](../tests/uploadSubsidyParser.test.ts)
- 정책 검사: [`scripts/check-upload-parser-policy.js`](../scripts/check-upload-parser-policy.js)

## 2. 지원 파일 형식

| 형식 | 확장자 | 지원 범위 | 제한사항 |
|---|---|---|---|
| CSV | .csv | 헤더가 있는 표 형식 파일 | 인코딩 자동 감지 제한 가능 (UTF-8 기준, EUC-KR 깨짐 경고) |
| Excel | .xlsx | 첫 번째 시트 또는 지정 시트의 표 형식 파일 | 병합셀·복잡한 서식 제한 |
| PDF | .pdf | 텍스트 기반 PDF의 표 또는 줄 단위 텍스트 | 스캔 이미지 OCR 제외 |
| 기타 | .hwp, .docx 등 | 이번 범위 제외 | 후속 작업 |

> PDF는 **텍스트 기반 PDF 기본 처리**만 수행한다. content stream 의 텍스트(`Tj`/`TJ`)를 추출하고, FlateDecode 스트림은 해제한다. 스캔 이미지 PDF의 **OCR은 범위에서 제외**한다.

## 3. 표준 보조금 레코드 스키마

| 표준 필드명 | 설명 | 필수 여부 |
|---|---|---|
| sourceFileName | 원본 파일명 | 필수 |
| sourceFileType | csv/xlsx/pdf | 필수 |
| sourceRowNumber | 원본 행 번호 또는 페이지/줄 번호 | 권장 |
| sourceText | 원문 일부 또는 행 텍스트 | 선택, 개인정보 마스킹 후 저장 |
| localGovName | 지자체명 | 권장 |
| fiscalYear | 회계연도 | 권장 |
| projectName | 보조사업명 | 필수 |
| recipientName | 보조사업자명/수급기관명 | 권장 |
| departmentName | 담당부서 | 권장 |
| subsidyAmount | 보조금액 | 권장 |
| executionAmount | 집행액 | 선택 |
| settlementAmount | 정산액 | 선택 |
| returnAmount | 반납/환수액 | 선택 |
| projectPeriodStart | 사업 시작일 | 선택 |
| projectPeriodEnd | 사업 종료일 | 선택 |
| noticeDate | 공고일 또는 게시일 | 선택 |
| documentType | subsidy_notice/selection_result/settlement/inspection/audit_result/recovery_return/budget_settlement/unknown | 필수 |
| evidenceNote | 증거 메모 | 선택 |
| privacyDetectedTypes | 탐지된 개인정보 유형 | 필수 |
| parseStatus | parsed/partial/failed | 필수 |
| parseWarnings | 파싱 경고 | 선택 |

## 4. 필드 매핑 규칙

- 원본 헤더명이 지자체마다 다를 수 있으므로 **별칭 매핑**(`UPLOAD_FIELD_ALIASES`)을 사용한다.
- 예: `사업명`, `보조사업명`, `지원사업명`, `세부사업명` → `projectName`
- 예: `보조사업자`, `단체명`, `수급기관`, `수행기관` → `recipientName`
- 예: `보조금액`, `지원금액`, `교부액` → `subsidyAmount`
- 예: `정산액`/`집행액`/`반납액`/`환수액` → `settlementAmount`/`executionAmount`/`returnAmount`
- 금액은 **원/천원/백만원/만원/억** 단위를 식별해 숫자(원화)로 변환하되, 단위가 불명확하면 `parseWarnings`에 경고를 남긴다.
- 날짜는 `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY년 MM월 DD일`을 인식해 `YYYY-MM-DD`로 정규화한다.

## 5. 개인정보 처리

- 업로드 파일에 개인정보가 포함될 수 있으므로 저장 전 **`sanitizeForStorage`**(privacyGuard)를 통과한다.
- 주민번호, 계좌번호, 휴대폰번호, 이메일, 상세주소, 민감정보는 **원문 저장하지 않는다.**
- `sourceText`는 **반드시 마스킹 후 저장**한다.
- 탐지된 개인정보 유형은 `privacyDetectedTypes`에 기록한다.
- 개인정보가 과도하게 포함된 파일은 `parseStatus=failed` 또는 `partial`로 처리할 수 있다.
- 실제 신고 검토 전에는 사람의 `privacyChecked` 확인이 필요하다.

## 6. 변환 결과 저장

- 변환 결과는 **JSONL** 로 저장한다.
- 실행 단위 `runId`를 부여한다.
- `records.jsonl`, `parse-log.json`, `error-log.json`을 생성한다.
- **원본 파일은 기본적으로 git에 커밋하지 않는다.**
- 기본 출력 경로: `data/upload-parser/runs/{runId}/` (`UPLOAD_PARSER_OUTPUT_DIR`로 변경 가능)

## 7. 오류 처리

- **지원하지 않는 확장자**는 오류 로그(`error-log.json`)로 남긴다 (phase=detect).
- 필수 필드 `projectName`이 없으면 `partial` 또는 `failed`로 처리한다.
- 파싱 중 예외 발생 시 **파일명, 사유, 단계(phase), 시간**만 저장한다.
- **개인정보 원문이 오류 로그에 남지 않도록** 사유 메시지를 일반화한다.
- 오류가 있어도 가능한 파일은 계속 처리한다 (기존 파일은 삭제하지 않는다).

## 8. 테스트 기준

- CSV 샘플 4개 이상
- XLSX 샘플 4개 이상
- PDF 샘플 2개 이상
- 총 **10개 이상** 파일 변환 테스트
- 개인정보 마스킹 테스트 (휴대폰/이메일/주민번호/계좌번호 원문 미저장)
- 금액 파싱 테스트 (원/천원/백만원)
- 오류 로그 테스트 (unsupported 확장자, projectName 누락)

실행:

```bash
npm run test:upload-parser    # 변환/마스킹/오류 로그 검증 (가짜 fixture 자동 생성)
npm run check:upload-parser   # 문서/코드 존재 + 정책 정적 검사
npm run parse:uploads -- <파일또는폴더>   # 실제 업로드 파일 변환
```

## 9. 주의사항

- **OCR 제외**: 스캔 이미지 PDF의 OCR은 이번 범위에서 제외한다 (텍스트 기반 PDF만 처리).
- 실제 개인정보가 포함된 파일을 테스트에 사용하지 않는다. 테스트 fixture는 모두 가짜 데이터다.
- 원본 파일은 기본적으로 저장하지 않는다.
- **단정 표현을 사용하지 않는다.** 변환 결과는 의심 신호 분석의 입력 후보일 뿐, **위법 여부 또는 부정수급을 확정하지 않으며, 보상금 지급을 보장하지 않는다.**

## 10. 실제 사용 절차 (초보자용 단계별)

처음 사용하는 사람을 위한 순서입니다. **본 모듈은 웹 크롤러가 아니라 사람이 직접 내려받아 업로드한 파일을 변환**합니다. 로그인 필요 자료·비공개 자료·대량 크롤링은 하지 않습니다.

1. **파일 준비**
   - 지자체·공공기관이 **공개**한 보조금 관련 자료(공고/선정/정산/감사/환수/결산 등)를 직접 내려받습니다.
   - 지원 형식: **`.csv` / `.xlsx` / 텍스트 기반 `.pdf`** 만. 그 외 확장자는 자동으로 건너뜁니다(오류 로그 기록).
   - **스캔 이미지 PDF는 OCR이 필요**하여 이번 범위에서 제외됩니다 → "텍스트 추출 실패 / OCR 필요 / 수동 확인 필요"로 error-log 에 기록됩니다.
2. **변환 실행**
   ```bash
   # 단일 파일
   npm run parse:uploads -- ./내려받은파일.csv
   # 폴더 전체 (csv/xlsx/pdf 만 처리, 그 외 확장자는 건너뜀)
   npm run parse:uploads -- ./업로드폴더
   ```
   - 성공 시 콘솔에 `UPLOAD_PARSER_RUN_OK` 가 출력됩니다.
3. **결과 파일 위치**
   - `data/upload-parser/runs/{runId}/records.jsonl` (표준 보조금 레코드, 개인정보 마스킹 후)
   - `data/upload-parser/runs/{runId}/parse-log.json` (실행 로그: 파일별 parsed/partial/failed, 마스킹 건수)
   - `data/upload-parser/runs/{runId}/error-log.json` (오류 로그: 미지원 확장자·OCR 필요·필수필드 누락 등)
4. **오류 로그 보는 방법**
   - `error-log.json` 의 `errors[].reason` 에서 사유를 확인합니다(개인정보 원문은 일반화되어 남지 않음).
   - `parse-log.json` 의 `files[].warnings` 에서 파일별 경고(금액 단위 불명확, 시트 다수, 인코딩 등)를 확인합니다.
   - 변환 실패(`failed`)·부분 변환(`partial`)은 실패가 아니라 "수동 확인 필요" 신호입니다.
5. **개인정보가 포함된 경우 주의**
   - 이메일·전화번호·주민등록번호·계좌번호·상세주소·키/토큰은 저장 전 자동 마스킹됩니다(`[masked-email]`, `[masked-phone]`, `[masked-id]`, `[masked-account]`, `[masked-address]`, `[masked-secret]`).
   - 대표자명·전화·주민번호·계좌·상세주소 **원문은 분석 근거에 그대로 넣지 않습니다.** 마스킹 결과만 `privacyDetectedTypes`·`parse-log` 에 기록됩니다.

## 11. GitHub 에 올리면 안 되는 파일

- 원본 업로드 파일(내려받은 csv/xlsx/pdf)과 `data/upload-parser/**` (records.jsonl / parse-log.json / error-log.json) — `.gitignore` 로 차단됨(`.gitkeep` 만 추적)
- `.env`, `data/collector/**`, `data/baseline/**`, `data/evidence/**`, `data/reports/**`, `data/cases/**`, `data/outcomes/**` 등 산출물 전반
- GitHub 에는 **코드·문서·테스트만** 올립니다. 커밋 전 `git status --ignored` 로 산출물이 ignored 상태인지 확인하세요.

## 12. 다음 단계: baseline build 연결

변환된 `records.jsonl` 은 다음 단계의 표준 기준선(baseline) 빌드 입력으로 사용합니다. (이번 단계에서 baseline 전체 실행은 필수가 아닙니다.)

```bash
npm run build:baseline -- --input data/upload-parser/runs/{runId}/records.jsonl --sourceType upload --sourceName local-upload
```

> 본 단계는 "업로드 파일 → 표준 보조금 레코드 변환"까지입니다. 기관명 정규화·주소 정규화·사업명 유사도·위험점수 산출·신고서 초안 생성은 다음 단계에서 진행하며, 자동 신고는 수행하지 않습니다.
