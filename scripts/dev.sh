#!/usr/bin/env bash
# reward-agent-mvp — Linux/macOS dev runner (체크리스트 29)
# Usage:
#   ./scripts/dev.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "[dev] project root: $PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  echo "[dev] node_modules 가 없습니다. npm install 실행..."
  npm install
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "[dev] .env 가 없어 .env.example 복사했습니다. 필요한 값을 채워 주세요."
  else
    echo "[dev] 경고: .env.example 도 없습니다. 환경변수 없이 실행됩니다."
  fi
fi

export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-3001}"

echo "[dev] 실행 — http://localhost:$PORT  (Ctrl+C 로 종료)"
exec npm run dev
