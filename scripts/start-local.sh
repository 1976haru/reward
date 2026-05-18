#!/usr/bin/env bash
# reward-agent-mvp — Linux/macOS production runner (체크리스트 29)
# Usage:
#   ./scripts/start-local.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "[start-local] project root: $PROJECT_ROOT"

if [ ! -d "node_modules" ]; then
  npm install
fi
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "[start-local] .env 복사 완료. 필요한 값을 채워 주세요."
fi

npm run build
export NODE_ENV=production
export PORT="${PORT:-3001}"

echo "[start-local] http://localhost:$PORT/api/health"
exec npm run start
