# reward-agent-mvp — Windows PowerShell production runner (체크리스트 29)
# Usage:
#   .\scripts\start-local.ps1
#
# - npm install + npm run build + npm run start

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "[start-local] project root: $ProjectRoot"

if (-not (Test-Path "node_modules")) {
  npm install
}
if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "[start-local] .env 복사 완료. 필요한 값을 채워 주세요."
}

npm run build
$env:NODE_ENV = "production"
if (-not $env:PORT) { $env:PORT = "3001" }

Write-Host "[start-local] http://localhost:$($env:PORT)/api/health"
npm run start
