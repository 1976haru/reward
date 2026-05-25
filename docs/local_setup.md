# 처음 실행하는 PC용 로컬 설정

> 기준 환경: Node.js 18 이상, npm, Git, Windows PowerShell 또는 macOS/Linux 터미널

이 단계는 로컬에서 프로그램을 켜고 기본 검증을 통과시키는 절차만 다룬다. 실제 API 연동, 건강기능식품 분석 기능 확장, 보조금 실데이터 연결은 포함하지 않는다.

## 최소 실행 순서

Windows PowerShell 기준:

```powershell
# 1) 저장소 받기
git clone https://github.com/1976haru/reward.git

# 2) 프로젝트 폴더 이동
cd reward

# 3) 패키지 설치
npm install

# 4) 환경 파일 만들기
Copy-Item .env.example .env

# 5) 최소 실행값 확인
notepad .env
# PORT=3001
# MOCK_AI=true
# EVIDENCE_ENABLE_SCREENSHOT=false
# EVIDENCE_ENABLE_PDF=false

# 6) 빌드
npm run build

# 7) 기본 테스트
npm run test

# 8) 개발 서버 실행
npm run dev

# 9) 브라우저 접속
# http://localhost:3001
```

macOS/Linux에서는 4단계만 `cp .env.example .env`로 바꾸면 된다.

## 최소 실행값

| 환경 변수 | 기본값 | 의미 |
|---|---:|---|
| `PORT` | `3001` | 로컬 웹 주소의 포트 |
| `MOCK_AI` | `true` | 실제 OpenAI API 키 없이 mock 흐름으로 실행 |
| `OPENAI_API_KEY` | 빈 값 | 이번 실행 단계에서는 입력하지 않음 |
| `MOCK_DISCOVERY` | `true` | 외부 검색 API 없이 예시 후보로 동작 |
| `MOCK_SCOUT` | `true` | 외부 수집 API 없이 예시 흐름으로 동작 |
| `EVIDENCE_ENABLE_SCREENSHOT` | `false` | Playwright 확인 전에는 캡처를 실행하지 않음 |
| `EVIDENCE_ENABLE_PDF` | `false` | Playwright 확인 전에는 PDF 캡처를 실행하지 않음 |

`.env`는 로컬 전용 파일이며 GitHub에 올리지 않는다. 실제 API 키가 필요한 작업은 별도 단계에서만 진행한다.

## npm 명령 기준

| 명령 | 용도 |
|---|---|
| `npm install` | `package.json`/lockfile 기준 의존성 설치 |
| `npm run build` | TypeScript 빌드 확인 |
| `npm run test` | 기본 스모크 테스트 실행 |
| `npm run dev` | 로컬 개발 서버 시작 |
| `npm run check:policy` | 자동신고 금지 등 정책 정적 검사 |
| `npm run playwright:install` | 스크린샷/PDF 증거 저장을 사용할 PC에서 최초 1회 Chromium 설치 |

## 자주 생기는 오류

| 증상 | 확인 및 해결 |
|---|---|
| Node.js 버전 문제 | `node -v`가 `v18` 이상인지 확인한다. 낮으면 Node.js LTS를 설치한 뒤 터미널을 다시 연다. |
| `npm install` 실패 | 네트워크·프록시·백신 차단 여부를 확인하고, Node.js 버전을 먼저 확인한다. 오류 메시지 없이 반복 설치하지 않는다. |
| `npm.ps1` 실행 정책 오류(Windows) | PowerShell에서만 차단되면 같은 명령을 `npm.cmd run build`처럼 `npm.cmd`로 실행할 수 있다. |
| `PORT=3001` 충돌 | `.env`의 `PORT`를 빈 포트로 바꾸거나 기존 3001 사용 프로세스를 종료한다. |
| `.env` 누락 | `Copy-Item .env.example .env` 또는 `cp .env.example .env`를 다시 실행한다. |
| Playwright 미설치 | 기본 실행은 캡처를 `false`로 두고 진행한다. 캡처 확인 단계에서 `npm run playwright:install` 후 두 캡처 옵션을 `true`로 변경한다. |

## Playwright 캡처 준비 확인

Playwright는 증거 패키지에 스크린샷과 PDF를 저장할 때 필요하다. 이 PC에서는 `npm run playwright:install`이 정상 종료되면 Chromium 설치 준비가 된 것이다. 기본 실행값은 계속 `false`로 두며, 실제 캡처를 사람이 확인하는 동안에만 `true`로 바꾼다.

```powershell
npm run playwright:install
```

공개 테스트 URL 1개를 이용한 수동 확인 절차:

1. 로그인 없이 열리는 공개 테스트 URL 1개만 준비한다. 예: `https://example.com/`
2. `.env`의 `EVIDENCE_ENABLE_SCREENSHOT=true`, `EVIDENCE_ENABLE_PDF=true`를 확인 시간 동안만 설정한다.
3. 로컬 UI에서 공개 URL을 한 번 입력하여 증거 생성을 수행한다. 대량 URL 입력이나 자동 수집은 하지 않는다.
4. `data/evidence/{caseId}/`에 스크린샷/PDF가 생성되는지 확인한다.
5. 확인 후 `git status --ignored`로 산출물이 ignored 상태인지 확인한다.
6. 평소 최소 실행으로 돌아갈 때는 두 캡처 옵션을 다시 `false`로 둔다.

증거 캡처 산출물은 GitHub에 올리지 않는다. 자세한 제외 규칙은 [`data_policy.md`](./data_policy.md)를 참고한다.
