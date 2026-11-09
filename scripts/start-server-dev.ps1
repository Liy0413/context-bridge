[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $projectRoot "server"
$envPath = Join-Path $serverRoot ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing server/.env. Run scripts/setup-server-dev.ps1 first."
}

Push-Location $serverRoot
try {
  npm run start:local
} finally {
  Pop-Location
}
