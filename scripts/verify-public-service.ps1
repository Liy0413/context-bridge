[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceUrl,

  [switch]$AllowHttp,

  [switch]$AllowReportedUrlMismatch
)

$ErrorActionPreference = "Stop"
$serviceBase = $ServiceUrl.TrimEnd("/")

if (-not $AllowHttp -and $serviceBase -notmatch "^https://") {
  throw "ServiceUrl must use HTTPS. Use -AllowHttp only for a local development check."
}

$health = Invoke-RestMethod -Uri "$serviceBase/health" -TimeoutSec 15
if (-not $health.ok -or $health.service -ne "context-bridge") {
  throw "The health endpoint did not identify a healthy Context Bridge service."
}

$info = Invoke-RestMethod -Uri "$serviceBase/info" -TimeoutSec 15
$expectedMcpUrl = "$serviceBase/mcp"
if ($info.mcpEndpoint -ne $expectedMcpUrl) {
  if ($AllowReportedUrlMismatch) {
    Write-Warning "The service reports '$($info.mcpEndpoint)' instead of '$expectedMcpUrl'. This is expected only for a temporary tunnel."
  } else {
    throw "The service reports '$($info.mcpEndpoint)' instead of '$expectedMcpUrl'. Check PUBLIC_BASE_URL."
  }
}

$unauthorized = $false
try {
  Invoke-RestMethod `
    -Uri $expectedMcpUrl `
    -Method Post `
    -ContentType "application/json" `
    -Body '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' `
    -TimeoutSec 15 | Out-Null
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  if ($statusCode -eq 401) {
    $unauthorized = $true
  } else {
    throw
  }
}

if (-not $unauthorized) {
  throw "The MCP endpoint accepted a request without authentication."
}

Write-Host "Public service verification passed."
Write-Host "Health: $serviceBase/health"
Write-Host "MCP:    $expectedMcpUrl"
Write-Host "Auth:   unauthenticated requests are rejected"
