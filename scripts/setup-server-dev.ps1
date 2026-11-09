[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $projectRoot "server"
$envPath = Join-Path $serverRoot ".env"
$credentialsPath = Join-Path $projectRoot "credentials.local.json"

function New-BridgeKey {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20 or newer is required."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required."
}

$aliceKey = New-BridgeKey
$bobKey = New-BridgeKey
$users = [ordered]@{}
$users[$aliceKey] = [ordered]@{ id = "usr_alice"; displayName = "Alice" }
$users[$bobKey] = [ordered]@{ id = "usr_bob"; displayName = "Bob" }
$usersJson = $users | ConvertTo-Json -Compress

$envLines = @(
  "PORT=8787"
  "CONTEXT_BRIDGE_DATA=./data/store.json"
  "CONTEXT_BRIDGE_SERVICE_ID=context-bridge-dev"
  "PUBLIC_BASE_URL=http://localhost:8787"
  "CONTEXT_BRIDGE_LAN_DISCOVERY=1"
  "CONTEXT_BRIDGE_LAN_DISCOVERY_PORT=8788"
  "CONTEXT_BRIDGE_USERS=$usersJson"
)
[System.IO.File]::WriteAllLines($envPath, $envLines, [System.Text.UTF8Encoding]::new($false))

$credentials = [ordered]@{
  warning = "Development credentials. Keep this file private and never commit it."
  profiles = @(
    [ordered]@{ id = "usr_alice"; displayName = "Alice"; apiKey = $aliceKey }
    [ordered]@{ id = "usr_bob"; displayName = "Bob"; apiKey = $bobKey }
  )
}
[System.IO.File]::WriteAllText(
  $credentialsPath,
  ($credentials | ConvertTo-Json -Depth 5),
  [System.Text.UTF8Encoding]::new($false)
)

Push-Location $serverRoot
try {
  npm install
  npm run build
  npm test
  npm run typecheck
} finally {
  Pop-Location
}

Write-Host "Context Bridge development server setup is ready."
Write-Host "Credentials were saved to: $credentialsPath"
Write-Host "Secrets were not printed. Do not commit credentials.local.json or server/.env."
Write-Host "Start with: powershell -ExecutionPolicy Bypass -File .\scripts\start-server-dev.ps1"
