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

---

# 개인정보 처리 기준 (체크리스트 5)

본 절은 [`OPERATING_POLICY.md`](./OPERATING_POLICY.md) §5 (개인정보 최소 수집) 및 [`LEGAL_REVIEW.md`](./LEGAL_REVIEW.md) §6 (신고자 보호) 와 함께 운영되며, 코드 차원 강제는 [`../src/policy/privacyGuard.ts`](../src/policy/privacyGuard.ts) (`sanitizeForStorage` / `sanitizeForAI` / `assertNoForbiddenPersonalData`) 와 [`../scripts/check-privacy-policy.js`](../scripts/check-privacy-policy.js) 로 보장한다.

## A. 문서 목적

- 공익레이더 / 보조금 신고 보상형 AI 에이전트의 **개인정보 최소수집 원칙**을 정의한다.
- 본 시스템은 **공개자료 중심 분석**을 원칙으로 한다.
- 신고자, 피신고자, 제3자의 **불필요한 개인정보 수집·저장을 금지**한다.
- 본 절은 **법률 자문을 대체하지 않는다.** 구체 사안은 [개인정보보호위원회](https://www.pipc.go.kr) 및 변호사·법무팀의 검토가 필요하다.

## B. 기본 원칙

- 필요한 **최소 정보만** 처리한다.
- 공개자료 중심으로 분석한다 (공시·공공데이터·공개 사업 공고 등).
- **주민번호 / 계좌번호 / 민감정보는 수집하지 않는다.**
- 입력 자료에 개인정보가 포함된 경우 **저장 전 마스킹**하거나 차단한다 (`sanitizeForStorage`).
- 신고자 신원정보는 증거 패키지와 **분리 저장**한다.
- AI 프롬프트에는 불필요한 개인정보를 넣지 않는다 (`sanitizeForAI`).
- 로그에는 원문 개인정보를 남기지 않는다.

## C. 저장 금지 정보

| 구분 | 예시 | 처리 기준 |
|---|---|---|
| 고유식별정보 | 주민등록번호, 외국인등록번호, 여권번호, 운전면허번호 | **저장 금지**, 발견 시 차단(`assertNoForbiddenPersonalData`) 또는 마스킹(`maskResidentRegistrationNumber`) |
| 금융정보 | 계좌번호, 카드번호 | **저장 금지**, 발견 시 차단 또는 마스킹(`maskBankAccount`) |
| 연락처 | 휴대폰번호, 개인 이메일 | 원칙적 저장 금지, 필요 시 마스킹(`maskPhoneNumber` / `maskEmail`) |
| 상세주소 | 동·호수 포함 주소, 개인 주거지 주소 | 저장 금지 또는 시·군·구 수준으로 축약(`maskDetailedAddress`) |
| 민감정보 | 건강정보, 정치적 견해, 종교, 범죄경력, 노동조합 가입, 성생활 등 | **저장 금지** — `sensitive_keyword` 로 탐지되며 AI 프롬프트에서는 `[민감정보 제거]` 로 대체 |
| 미성년자 정보 | 아동 이름, 학교, 연락처 등 | **저장 금지** |
| 신고자 신원정보 | 이름, 소속, 연락처 | **최소 수집**, 분리 저장, 외부 노출 금지 |

## D. 허용 정보

| 구분 | 예시 | 처리 기준 |
|---|---|---|
| 공개 사업정보 | 사업명, 공고 URL, 지원 금액, 사업 기간 | 수집 가능 |
| 공개 기관정보 | 기관명, 부서명, 대표 연락처 | 수집 가능 |
| 공개 단체정보 | 법인명, 단체명, 공개 주소 | 수집 가능, 개인 주거지 주소는 마스킹 |
| 공개 감사자료 | 감사 결과, 환수 결정, 처분 결과 | 수집 가능 |
| 공개 공시자료 | 보조금 교부·정산·성과 자료 | 수집 가능 |

## E. 마스킹 기준

| 정보 유형 | 원문 예시 | 마스킹 예시 | 구현 함수 |
|---|---|---|---|
| 주민등록번호 | `900101-1234567` | `900101-*******` | `maskResidentRegistrationNumber` |
| 휴대폰번호 | `010-1234-5678` | `010-****-5678` | `maskPhoneNumber` |
| 이메일 | `user@example.com` | `u***@example.com` | `maskEmail` |
| 계좌번호 | `계좌 123-456-789012` | `계좌 123-***-******` | `maskBankAccount` |
| 상세주소 | `서울시 OO구 OO로 10, 101동 202호` | `서울시 OO구` | `maskDetailedAddress` |
| 이름 | `신고자: 홍길동` | `신고자: 홍*동` | `maskName` |
| 통합 적용 | (위 모두) | (위 모두) | `maskSensitiveText` |

> 본 표의 원문 예시값은 정책 문서·테스트 픽스처 외에는 사용자 노출 영역에 사용되지 않는다. 정적 검사(`check-privacy-policy.js`) 가 본 문서를 화이트리스트에 등록한다.

## F. AI 프롬프트 개인정보 원칙

- AI 분석 요청에는 원칙적으로 개인정보를 포함하지 않는다.
- 분석에 필요하지 않은 **이름, 연락처, 계좌, 상세주소**는 호출 전 제거한다 (`sanitizeForAI`).
- **민감정보가 포함된 문서는 AI 에 전달하지 않는다.** 민감정보 키워드는 호출 전 `[민감정보 제거]` 로 대체된다.
- AI 결과물에도 개인정보가 재노출되지 않도록 검사한다 (기존 `validateAnalysisResult` + 본 모듈).

## G. 로그·증거 패키지 원칙

- 로그에는 원문 개인정보를 저장하지 않는다 (기존 Trace Log `maskSensitive` + `sanitizeForStorage` 보강).
- 증거 패키지에는 공개자료 URL 과 공개문서 중심으로 저장한다.
- 신고자 신원정보는 별도 저장하고 증거 패키지와 분리한다.
- 다운로드한 문서에 개인정보가 포함된 경우 마스킹본과 원본 보관 정책을 분리한다.
- 원본 보관이 꼭 필요한 경우 접근권한을 제한하고 감사로그(Trace) 를 남긴다.

## H. 삭제·보관 원칙

- 분석에 필요 없는 개인정보는 즉시 삭제한다 (POST `/api/privacy/delete`, dry-run 기본).
- 신고 부적합 또는 폐기 케이스의 개인정보는 보관하지 않는다.
- 보관 기간은 최소화한다 (§5 Retention Policy 표 참고).
- 사용자가 삭제를 요청하면 관련 데이터를 삭제하거나 비식별화한다.

## I. 제품 반영 요구사항

| ID | 요구사항 | 우선순위 | 반영 위치 | 완료 기준 |
|---|---|---|---|---|
| PRIVACY-001 | 저장 금지 필드 정의 | P0 | `docs/privacy_policy.md` §C, `src/policy/privacyGuard.ts` (`FORBIDDEN_PERSONAL_DATA_TYPES`) | 금지 필드 목록 존재 |
| PRIVACY-002 | 개인정보 마스킹 함수 | P0 | `src/policy/privacyGuard.ts` (`maskResidentRegistrationNumber` 등 6종) | 주민번호/계좌/연락처/주소/이름 마스킹 |
| PRIVACY-003 | 저장 전 검사 | P0 | `src/policy/privacyGuard.ts` (`sanitizeForStorage`, `assertNoForbiddenPersonalData`) | 금지 정보 발견 시 차단 또는 마스킹 |
| PRIVACY-004 | AI 프롬프트 전 정제 | P0 | `src/policy/privacyGuard.ts` (`sanitizeForAI`) | 개인정보 제거/마스킹 후 호출 |
| PRIVACY-005 | 로그 원문 개인정보 금지 | P0 | 기존 `TraceLogger.maskSensitive` + 본 가드 | 원문 개인정보 로그 금지 |
| PRIVACY-006 | 테스트 | P0 | `tests/privacyGuard.test.ts` | `npm run test:privacy` 통과 |
| PRIVACY-007 | 공개자료 중심 원칙 | P0 | `README.md`, `docs/OPERATING_POLICY.md` §5 | 공개자료 중심 명시 |

## J. 강제 수단 요약

- 정적 검사: `npm run check:privacy` (`scripts/check-privacy-policy.js`) — 사용자 노출 텍스트에 원문 RRN / 휴대폰 / 이메일 / 계좌 패턴 / 민감 키워드가 남아있는지 README · docs · src · public · tests · scripts 에서 스캔. 정책 문서 / 테스트 픽스처 / 마스킹 정의 코드는 화이트리스트.
- 통합 정책 검사: `npm run check:policy` — approval-gate / language-policy / privacy-policy 세 검사를 한 번에 실행.
- 테스트: `npm run test:privacy` — 마스킹 함수·검출·sanitize 시나리오 검증.
- 런타임 정책: `sanitizeForStorage`, `sanitizeForAI`, `assertNoForbiddenPersonalData` 를 저장/AI 호출 직전에 호출.
