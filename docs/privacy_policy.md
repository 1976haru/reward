# Privacy Policy and Data Minimization (체크리스트 28)

## 1. Purpose

본 프로젝트는 **신고 후보 탐지·증거정리·신고서 초안 생성 도구**다. 개인정보를 적극적으로 수집하지 않으며, 필요하지 않은 개인정보는 저장하지 않는다. 저장된 개인정보성 문자열은 마스킹 또는 삭제 가능해야 한다.

**중요:**

- 본 문서는 **개인정보보호 법령에 대한 법률 자문을 대체하지 않는다.**
- 본 도구의 탐지기는 보수적 정규식 기반으로 오탐 가능성이 있다. **삭제 전 반드시 사람 검토가 필요하다.**
- 외부 신고기관 자동 제출 / 자동 로그인 / 비공개자료 수집 기능은 없다.

## 2. Data Minimization Principles

- 공개자료만 분석 — 비공개 자료(로그인 페이지 / 비공개 채팅방 / 비공개 SNS 게시글)는 수집하지 않는다.
- 개인정보 저장 최소화 — 사람이 직접 입력한 메모/리포트/로그/피드백은 **저장 전 마스킹 우선**.
- 증거 원본은 분리 보관(`data/evidence/`)하고, scan + warning 으로 개인정보 가능성 표시.
- API 키 / 토큰 / 쿠키 / 주민번호 형태는 원문 저장 회피, 발견 즉시 마스킹.
- 자동 영구 삭제 없음 — 운영자가 명시적으로 `dryRun: false` + `confirmDelete: true` 를 보내야 실제 삭제 수행.

## 3. Sensitive Data Types

`SENSITIVE_DATA_TYPES` (`src/types/privacy.ts`):

| 유형 | 패턴 | confidence |
|------|------|-----------|
| `EMAIL` | RFC 일반 이메일 | HIGH |
| `PHONE` | 한국 휴대폰/유선 (010-/02-/...) | HIGH |
| `KOREAN_RRN` | `\d{6}-\d{7}` (검증 X — 형태만) | HIGH |
| `ACCOUNT_NUMBER` | 10~16자리 숫자 후보 | MEDIUM (사업자번호·상품번호 오탐 가능) |
| `API_KEY` | `sk-`, `sk_live/test_`, `AIza`, `ghp_`, `xox[apbs]-` 등 | HIGH |
| `TOKEN` | JWT (`eyJ...`) | HIGH |
| `AUTH_HEADER` | `Bearer <token>` | HIGH |
| `COOKIE` | JSON 키 `cookie`/`set_cookie`/`session_id` | HIGH (key 기반) |
| `IP_ADDRESS` | IPv4 | LOW (공개 IP/사설 구분 필요) |
| `ADDRESS_LIKE` | 시·도 + 시/군/구 + 도로명/동 + 번지/호 | MEDIUM |

JSON 직렬화 텍스트의 키 이름(`api_key`, `secret`, `token`, `password`, `cookie`, `authorization`, `auth_header`, `session_id`, `access_token`, `refresh_token`, `client_secret`, `jwt`)은 값과 함께 마스킹된다.

## 4. Masking Policy

`MASK_TOKENS` (`src/types/privacy.ts`):

```
EMAIL          → [masked-email]
PHONE          → [masked-phone]
KOREAN_RRN     → [masked-id]
ACCOUNT_NUMBER → [masked-account]
API_KEY        → [masked-secret]
TOKEN          → [masked-secret]
AUTH_HEADER    → [masked-auth]
COOKIE         → [masked-cookie]
IP_ADDRESS     → [masked-ip]
ADDRESS_LIKE   → [masked-address]
```

`MaskingService.maskText(text)` 가 모든 매치를 위치 역순으로 치환하고 `findings`, `byType`, `safetyNotice` 를 함께 반환한다.

## 5. Retention Policy

`config.privacy.retentionDays` 기본값 (`.env` 로 override 가능):

| 카테고리 | 일수 | 디렉터리 | 설명 |
|----------|------|----------|------|
| trace | 30 | data/traces | 감사 로그 — 짧게 유지 |
| evidence | 90 | data/evidence | 원본 캡처/PDF/HTML |
| report | 90 | data/reports | 신고서 초안 |
| feedback | 180 | data/feedback | 룰 개선 근거 — 비교적 길게 |
| case | 180 | data/cases | Case 메타데이터 |
| raw | 30 | data/raw | 수집 원본 — 짧게 |
| scheduler | 90 | data/scheduler | 스케줄러 실행 기록 |
| scout | 90 | data/candidates | Scout 후보 |

`POST /api/privacy/retention/apply`:

- 기본 `dryRun=true` — 만료 파일 목록만 반환
- `dryRun=false` + `maxDeletions` (default 200) 일 때만 실제 삭제
- `.gitkeep`, `latest.json` 등 시스템 파일은 제외

## 6. Delete Policy

`POST /api/privacy/delete` 안전장치:

1. `filePath` 는 절대 경로 또는 상대 경로 모두 `path.resolve` 로 정규화 후 검사
2. **data/ 하위만 허용** — `src/`, `public/`, `docs/`, `node_modules/`, `dist/`, `.git/`, `scripts/` 는 403 `DELETE_BLOCKED`
3. **.env, .gitkeep 절대 삭제 불가**
4. data/ 하위 중에서도 화이트리스트된 서브디렉터리만 허용: `traces / evidence / reports / cases / feedback / eval / raw / scheduler / candidates / dedupe`
5. 기본 `dryRun=true`
6. 실제 삭제는 `dryRun: false` + `confirmDelete: true` 둘 다 필요
7. `reason` 기록 권장

## 7. Evidence Originality vs Privacy

증거 원본은 **분리 보관** 하고 개인정보 발견 시 warning 으로 표시한다.

- `data/evidence/{caseId}/page.html` 등 원본 자체는 **자동 마스킹하지 않음** (증거성 보존). 대신 `POST /api/privacy/scan` 으로 발견 가능.
- `metadata.json` 의 seller/contact 정보처럼 사람이 가공한 텍스트는 저장 전 마스킹 권장.
- `data/reports/*.md` 의 신고서 초안 본문은 `ReportService.sanitizeReportText` 의 금지표현 치환 + 사람이 추가로 검토해야 함.

## 8. APIs

- `GET /api/privacy/policy` — 정책 + 보존기간 조회
- `POST /api/privacy/mask` — 텍스트 마스킹 테스트 (저장 없음)
- `POST /api/privacy/scan` — `data/` 하위 텍스트 파일 스캔
- `POST /api/privacy/delete` — 안전 삭제 (기본 dryRun)
- `POST /api/privacy/retention/apply` — 보존기간 초과 파일 처리 (기본 dryRun)

## 9. Wired Sanitization

- **CaseRepository.create** — `memo` / `summary` 입력값을 `MaskingService.maskText` 로 저장 전 마스킹
- **FeedbackRepository** — 기존 `piiMask` 유지 (체크리스트 21). 본 모듈의 detector 는 추가 패턴을 잡으므로 운영 시 `POST /api/privacy/scan` 으로 보완
- **TraceLogger** — `maskSensitive` (체크리스트 27) 사용. Privacy detector 는 운영 스캔 단계에서 보완

## 10. Safety Rules

- **API 키 / 토큰 / 전체 prompt / 전체 HTML / 증거파일 내용** 저장 금지
- **개인정보 원문 저장 최소화** — 마스킹 우선
- **자동 신고 / 자동 민원 / 자동 로그인 / 자동 영구 삭제** — 모두 없음
- **삭제 전 dryRun + confirmDelete** 둘 다 요구
- 본 도구는 **법률 자문이 아닙니다.** 개인정보보호법 / GDPR 등 법령 적용은 별도 검토가 필요합니다.

## 11. Future Improvements

- 파일 암호화 (at-rest encryption)
- 사용자 인증 / 권한 분리 (감사 작업 권한)
- 보존기간 만료 자동 알림 (이메일/슬랙)
- 더 정교한 PII detector (NER 기반)
- 감사로그 보존 정책 별도화 (감사로그 자체의 삭제도 별도 권한)
- 데이터 export 기능 (GDPR 본인 정보 열람·내려받기 대응 시)
