# reward-agent-mvp — Windows PowerShell dev runner (체크리스트 29)
# Usage:
#   .\scripts\dev.ps1
#
# - .env 파일이 없으면 .env.example 에서 복사한다.
# - npm install -> npm run dev 순서.
# - 종료는 Ctrl+C.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "[dev] project root: $ProjectRoot"

if (-not (Test-Path "node_modules")) {
  Write-Host "[dev] node_modules 가 없습니다. npm install 실행..."
  npm install
}

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "[dev] .env 가 없어 .env.example 복사했습니다. 필요한 값을 채워 주세요."
  } else {
    Write-Host "[dev] 경고: .env.example 도 없습니다. 환경변수 없이 실행됩니다."
  }
}

$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "development" }
if (-not $env:PORT) { $env:PORT = "3001" }

Write-Host "[dev] 실행 — http://localhost:$($env:PORT)  (Ctrl+C 로 종료)"
npm run dev
