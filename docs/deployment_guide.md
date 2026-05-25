# Deployment Guide (체크리스트 29)

초보자도 reward-agent-mvp 를 로컬 또는 서버에서 실행할 수 있도록 정리한 가이드입니다.

**중요:**

- 본 도구는 **자동 신고 기능이 없습니다.** 최종 신고는 사람이 공식 창구에서 직접 진행해야 합니다.
- `.env`, `data/` 산출물(증거/리포트/trace/feedback/eval 결과 등)은 **GitHub 에 올리지 않습니다.**
- 외부 공개 배포 전에는 보안 점검(인증/HTTPS/reverse proxy)이 필요합니다. 현재 MVP 는 로컬/내부망 실행 기준입니다.

## 1. Prerequisites

| 항목 | 권장 버전 |
|------|-----------|
| Node.js | 18 이상 (22.x LTS 권장) |
| npm | 10.x 이상 |
| Git | 최신 |
| Docker (선택) | 24.x 이상 + Docker Compose v2 |

확인:

```bash
node -v
npm -v
git --version
docker --version       # 선택
docker compose version # 선택
```

## 2. Local Run — Without Docker

### 2.1 처음 설치

```bash
git clone https://github.com/1976haru/reward.git
cd reward
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
# .env에서 PORT=3001, MOCK_AI=true 확인
npm run build
npm run test
npm run dev
# 브라우저: http://localhost:3001
```

### 2.2 개발 모드 (재실행 시)

```bash
npm run dev
# 또는 Windows:  .\scripts\dev.ps1
# 또는 Linux/macOS:  ./scripts/dev.sh
```

### 2.3 빌드 + 프로덕션 실행

```bash
npm run build
npm run start
# 또는 Windows:  .\scripts\start-local.ps1
# 또는 Linux/macOS:  ./scripts/start-local.sh
```

### 2.4 헬스 체크

```bash
curl http://localhost:3001/api/health
npm run health    # PORT env 자동 읽음
```

브라우저로 [http://localhost:3001](http://localhost:3001) 접속.

### 2.5 테스트 / 빌드 검증

```bash
npm run build
npm run test
npm run check          # build + test
```

## 3. Docker Run

### 3.1 docker compose 권장 (가장 쉬움)

```bash
# .env 가 없다면 먼저 복사
cp .env.example .env

docker compose up --build       # 빌드 + 실행
docker compose logs -f app      # 로그 보기 (Ctrl+C)
docker compose down             # 중지 + 컨테이너 제거 (./data 는 유지됨)
```

기본 포트는 호스트 `3001 → 컨테이너 3001`. 변경하려면 `docker-compose.yml` 의 `ports` 매핑 수정.

### 3.2 docker build 단독 사용

```bash
docker build -t reward-agent-mvp .
docker run --rm -p 3001:3001 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  reward-agent-mvp
```

### 3.3 헬스 체크 (Docker)

이미지 자체에 `HEALTHCHECK` 가 포함되어 있습니다. 30초 간격으로 `/api/health` 호출.

```bash
docker ps                          # STATUS 컬럼에 healthy 표시
docker inspect --format='{{json .State.Health}}' reward-agent-mvp
```

## 4. Environment Variables (`.env`)

`.env.example` 을 복사한 뒤 필요한 값만 채웁니다.

핵심 항목:

| 키 | 기본값 | 설명 |
|----|--------|------|
| `PORT` | `3001` | HTTP 포트 |
| `MOCK_AI` | `true` | AI 호출 없이 mock 분석 (OPENAI_API_KEY 없어도 시연 가능) |
| `OPENAI_API_KEY` | — | `MOCK_AI=false` 일 때만 필요 |
| `DATA_DIR` | `./data` | 산출물 저장 루트 |
| `EVIDENCE_ENABLE_SCREENSHOT` | `false` | 기본 실행은 캡처 비활성. Playwright 확인 뒤 필요 시 `true` |
| `EVIDENCE_ENABLE_PDF` | `false` | 기본 실행은 PDF 캡처 비활성. Playwright 확인 뒤 필요 시 `true` |
| `TRACE_ENABLED` | `true` | 감사 로그 |
| `PRIVACY_MASKING_ENABLED` | `true` | 메모/리포트 저장 전 마스킹 |
| `PRIVACY_DRY_RUN` | `true` | 삭제 API 기본 dry-run |

자세한 항목은 [`.env.example`](../.env.example) 참고.

⚠ **API 키는 절대 GitHub 에 커밋하지 마세요.** `.env` 는 `.gitignore` / `.dockerignore` 양쪽 모두 처리되어 있습니다.

## 5. Data Storage

| 경로 | 용도 | 보존기간 (기본) | gitignored |
|------|------|----------------|----------|
| `./data/cases` | Case JSON | 180일 | O |
| `./data/evidence` | 원본 캡처/PDF/HTML | 90일 | O |
| `./data/reports` | 신고서 초안 | 90일 | O |
| `./data/raw` | 수집 원본 | 30일 | O |
| `./data/candidates` | Scout 후보 | 90일 | O |
| `./data/scheduler` | 스케줄러 실행 기록 | 90일 | O |
| `./data/feedback` | 검토 피드백 DB | 180일 | O |
| `./data/eval/runs` | 평가 실행 결과 | 운영자 관리 | O |
| `./data/traces` | 감사 로그 JSONL | 30일 | O |
| `./data/dedupe` | 중복 제거 보고 | 90일 | O |

각 디렉터리의 `.gitkeep` 만 git 에 추적됩니다. Docker compose 는 `./data` 를 컨테이너 `/app/data` 에 바인드 마운트해서 컨테이너 재시작에도 데이터를 유지합니다.

## 6. Health Check

- HTTP: `GET /api/health` → `{ ok: true, service: "reward-agent-mvp", port: 3001, ... }`
- npm 스크립트: `npm run health` (PORT env 자동 인식, HEALTH_HOST/HEALTH_URL/HEALTH_TIMEOUT_MS 로 override 가능)
- Docker: `HEALTHCHECK` 내장 (30s interval, 5s timeout, 3 retries)

## 7. Common Problems

| 증상 | 원인 / 해결 |
|------|-------------|
| `Error: listen EADDRINUSE: address already in use :::3001` | 포트 3001 사용 중. `PORT=3002 npm run dev` 로 변경하거나 기존 프로세스 종료 |
| Node.js 버전 문제 | Node.js 18 이상 필요. `node -v` 확인 후 필요하면 LTS 설치 |
| `npm install` 실패 | Node.js 18 이상 여부와 네트워크/프록시 차단을 먼저 확인 |
| `playwright install` 미수행 | 최소 실행은 캡처 옵션을 `false`로 유지. 캡처 확인 단계에서 `npm run playwright:install` 실행 |
| Docker 빌드 실패 | Docker Desktop 실행 확인. WSL2 / virtualization 활성화 |
| `.env not found` | `.env.example` 복사 (`cp .env.example .env` 또는 `Copy-Item .env.example .env`) |
| `EACCES /app/data` (Docker) | `./data` 호스트 디렉터리 권한 확인 (`chmod -R 755 data`) |
| Windows path 길이 오류 | 짧은 경로로 옮기거나 `git config --system core.longpaths true` |
| `data folder not created` | 서버 시작 시 자동 생성됨. 수동: `mkdir -p data/{cases,evidence,reports,...}` |

## 8. Server Deployment Notes

- **권장 방식**: Docker Compose 단일 호스트 (Ubuntu 22.04+ / VPS / 사내 서버).
- **reverse proxy / HTTPS**: 현재 MVP 는 미포함. nginx / Caddy / Traefik 등을 앞단에 배치 권장.
- **인증/로그인**: 미구현 — **외부 공개 배포 전 반드시 보안 검토**.
- **방화벽**: 3001 포트를 외부에 노출하기 전에 access control 적용.
- **시스템 서비스화**: systemd unit (`reward-agent.service`) 또는 Docker 의 `restart: unless-stopped` 활용.
- **백업**: `./data` 디렉터리를 주기적으로 백업 (단, 개인정보 발견 시 마스킹/삭제 후 백업).
- **로그 회전**: 운영 시 `data/traces/*.jsonl` 크기 모니터링 — 보존기간 정책 (`POST /api/privacy/retention/apply`) 활용.

## 9. Playwright / Docker Policy

- **로컬 최소 실행 기본값**: `EVIDENCE_ENABLE_SCREENSHOT=false` / `EVIDENCE_ENABLE_PDF=false` — Playwright 없이 서버·빌드·기본 테스트 확인.
- **캡처 확인 단계**: `npm run playwright:install` 실행 후 필요할 때만 두 옵션을 `true`로 바꾸어 확인한다. 이번 체크리스트 범위에는 포함하지 않는다.
- **Docker 기본**: 두 옵션 모두 `false` 로 강제 (Dockerfile + docker-compose 환경변수). HTML / TEXT / Report 중심 동작.
- **Docker 에서 캡처가 필요하면**: Playwright 공식 이미지(`mcr.microsoft.com/playwright`) 베이스의 별도 Dockerfile 작성 — 본 MVP 범위 밖. 추후 체크리스트로 분리.

## 10. Safety Notes

- 본 도구는 **자동 신고 기능이 없습니다.** "제출" 은 사람이 외부 공식 창구에서 직접 수행한 뒤 내부 상태만 변경합니다.
- API 키는 `.env` 에만 저장합니다. **이미지/저장소에 절대 포함되지 않습니다** (`.dockerignore` 처리).
- 산출물(`data/*`)은 GitHub 에 올리지 않습니다.
- 운영 전 [`docs/privacy_policy.md`](./privacy_policy.md) 의 개인정보 스캔(`POST /api/privacy/scan`) 권장.
- 본 가이드는 운영/보안에 대한 **모범 사례 일부**일 뿐이며 모든 보안 요구사항을 충족시키지 않습니다.

## 11. Quick Reference

```bash
# 개발
npm run dev

# 빌드 + 프로덕션
npm run build && npm run start

# 검증
npm run check                  # build + test
npm run health                 # /api/health 호출

# Docker
docker compose up --build
docker compose logs -f app
docker compose down

# 검증 (Docker 빌드 전)
docker compose config
docker build -t reward-agent-mvp .

# 평가셋 / 헬스
npm run eval:generate
npm run health
```
