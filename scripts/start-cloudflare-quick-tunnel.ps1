[CmdletBinding()]
param(
  [string]$CloudflaredPath = "cloudflared"
)

$ErrorActionPreference = "Stop"

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 5
} catch {
  throw "Context Bridge is not responding on http://127.0.0.1:8787. Start the server first."
}

if (-not $health.ok) {
  throw "Context Bridge returned an unhealthy response."
}

Write-Warning "Quick Tunnel URLs change when the process restarts. Use this only for temporary testing."
Write-Warning "Anyone with the URL can reach the onboarding endpoint; keep invite codes secret."
& $CloudflaredPath tunnel --url "http://127.0.0.1:8787" --no-autoupdate
