[CmdletBinding()]
param(
  [string]$ServiceUrl,
  [string]$DisplayName,
  [switch]$AllowPrivateHttp,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$connectionPath = Join-Path $projectRoot "connection.local.json"

if ((Test-Path -LiteralPath $connectionPath) -and -not $Force) {
  throw "A connection already exists at '$connectionPath'. Use -Force only if replacing this device identity is intended."
}

if (-not $ServiceUrl) {
  $mcpConfig = Get-Content -Raw -Encoding UTF8 (Join-Path $projectRoot "mcp.json") | ConvertFrom-Json
  $ServiceUrl = [string]$mcpConfig.mcpServers.context_bridge.url
  $ServiceUrl = $ServiceUrl -replace "/mcp$", ""
}

function Test-PrivateIPv4([string]$HostName) {
  $address = $null
  if (-not [System.Net.IPAddress]::TryParse($HostName, [ref]$address)) {
    return $false
  }
  if ($address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    return $false
  }
  $bytes = $address.GetAddressBytes()
  return (
    $bytes[0] -eq 10 -or
    ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
    ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or
    ($bytes[0] -eq 169 -and $bytes[1] -eq 254) -or
    $bytes[0] -eq 127
  )
}

$serviceUri = [System.Uri]$ServiceUrl
$isPrivateHttp = (
  $AllowPrivateHttp -and
  $serviceUri.Scheme -eq "http" -and
  (Test-PrivateIPv4 $serviceUri.Host)
)
if ($ServiceUrl -match "example\.com" -or ($serviceUri.Scheme -ne "https" -and -not $isPrivateHttp)) {
  throw "Use a configured HTTPS service URL, or the LAN helper for a trusted private network."
}

if (-not $DisplayName) {
  $DisplayName = Read-Host "Name this device or profile"
}
$secureInvite = Read-Host "Enter the one-time workspace invite code" -AsSecureString
$invitePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInvite)
try {
  $inviteCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($invitePointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($invitePointer)
}

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
