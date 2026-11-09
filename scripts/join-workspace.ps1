[CmdletBinding()]
param(
  [string]$ServiceUrl,
  [string]$DisplayName
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$connectionPath = Join-Path $projectRoot "connection.local.json"

if (-not $ServiceUrl) {
  $mcpConfig = Get-Content -Raw (Join-Path $projectRoot "mcp.json") | ConvertFrom-Json
  $ServiceUrl = [string]$mcpConfig.mcpServers.context_bridge.url
  $ServiceUrl = $ServiceUrl -replace "/mcp$", ""
}

if ($ServiceUrl -match "example\.com" -or $ServiceUrl -notmatch "^https://") {
  throw "The repository has not been configured with a production HTTPS service URL."
}

if (-not $DisplayName) {
  $DisplayName = Read-Host "Name this device or profile"
}
$inviteCode = Read-Host "Enter the one-time workspace invite code" -MaskInput

$body = @{
  inviteCode = $inviteCode
  displayName = $DisplayName
} | ConvertTo-Json

$joined = Invoke-RestMethod `
  -Uri "$($ServiceUrl.TrimEnd('/'))/onboarding/join" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body

$connection = [ordered]@{
  serviceUrl = $ServiceUrl.TrimEnd("/")
  mcpUrl = "$($ServiceUrl.TrimEnd('/'))/mcp"
  profile = $joined.profile
  workspace = [ordered]@{
    id = $joined.workspace.id
    name = $joined.workspace.name
  }
  apiKey = $joined.apiKey
}
[System.IO.File]::WriteAllText(
  $connectionPath,
  ($connection | ConvertTo-Json -Depth 6),
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Joined workspace '$($joined.workspace.name)' as '$($joined.profile.displayName)'."
Write-Host "The personal connection credential was saved to: $connectionPath"
Write-Host "Do not commit or share this file. Use its apiKey when the plugin asks for authentication."
