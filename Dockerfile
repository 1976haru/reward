# syntax=docker/dockerfile:1.6
# reward-agent-mvp — production Dockerfile (체크리스트 29)
#
# Multi-stage build:
#   1) deps    — install production deps only (reused at runtime)
#   2) builder — install all deps + tsc build
#   3) runner  — minimal final image (node 22 alpine, non-root)
#
# 주의:
# - .env 와 data/ 산출물은 이미지에 포함되지 않는다 (.dockerignore 참고).
# - Playwright (스크린샷/PDF) 는 기본 비활성. 로컬에서 필요 시 별도 설치.
# - 본 도구는 외부 신고기관 자동 제출 기능을 포함하지 않는다.

# ---------- 1) deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
ENV NPM_CONFIG_PROGRESS=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
COPY package.json package-lock.json* ./
# 프로덕션 의존성만 설치 (runner 에서 사용)
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# ---------- 2) builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NPM_CONFIG_PROGRESS=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN npm run build

# ---------- 3) runner ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/data \
    EVIDENCE_ENABLE_SCREENSHOT=false \
    EVIDENCE_ENABLE_PDF=false

# 시그널 처리 / 좀비 프로세스 방지
RUN apk add --no-cache tini

# 비루트 사용자로 실행
# node:alpine 이 제공하는 기본 `node` 사용자(uid 1000) 활용
USER node

# 프로덕션 dependencies (deps stage)
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
# 컴파일된 결과 (dist) — builder stage
COPY --chown=node:node --from=builder /app/dist ./dist
# 정적 자원
COPY --chown=node:node --from=builder /app/public ./public
# 런타임에 직접 읽는 module assets (keywords.json / agency_config.json / report-template.md /
# sample-data.json / sample-bids.json / risk_signals.json / sources.json /
# analysis_prompt.md / analysis_schema.json / eval/*.json 등)
COPY --chown=node:node --from=builder /app/src ./src
# package.json (npm start 가 참조)
COPY --chown=node:node package.json ./
# 헬스체크 스크립트 (devDependencies 없이 동작 — node 내장 모듈만 사용)
COPY --chown=node:node --from=builder /app/scripts/health-check.js ./scripts/health-check.js

# 산출물 디렉터리 (마운트 권장 — docker-compose 에서 ./data 바인드 마운트)
RUN mkdir -p /app/data/cases /app/data/evidence /app/data/reports /app/data/raw \
              /app/data/candidates /app/data/scheduler /app/data/dedupe \
              /app/data/feedback /app/data/eval/runs /app/data/traces

EXPOSE 3001

# Docker 내장 healthcheck — 외부 도구 없이 node 로 자기 자신 호출
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node scripts/health-check.js || exit 1

# tini 로 PID 1 처리
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
