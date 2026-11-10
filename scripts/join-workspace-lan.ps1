[CmdletBinding()]
param(
  [string]$DisplayName,
  [string]$ServiceId,
  [ValidateRange(1, 65535)]
  [int]$DiscoveryPort = 8788,
  [ValidateRange(1, 30)]
  [int]$TimeoutSeconds = 4,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$requestText = "CONTEXT_BRIDGE_DISCOVER_V1"
$protocol = "context-bridge-lan-v1"
$client = [System.Net.Sockets.UdpClient]::new()
$client.EnableBroadcast = $true
$client.Client.ReceiveTimeout = 500

try {
  $request = [System.Text.Encoding]::UTF8.GetBytes($requestText)
  $destination = [System.Net.IPEndPoint]::new(
    [System.Net.IPAddress]::Broadcast,
    $DiscoveryPort
  )
  [void]$client.Send($request, $request.Length, $destination)

  $found = @{}
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    try {
      $remote = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
      $bytes = $client.Receive([ref]$remote)
      $advertisement = [System.Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
      if ($advertisement.protocol -ne $protocol -or $advertisement.service -ne "context-bridge") {
        continue
      }
      if ($ServiceId -and $advertisement.serviceId -ne $ServiceId) {
        continue
      }
      $httpPort = [int]$advertisement.httpPort
      if ($httpPort -lt 1 -or $httpPort -gt 65535) {
        continue
      }
      $key = "$($remote.Address):$httpPort"
      $found[$key] = [pscustomobject]@{
        serviceId = [string]$advertisement.serviceId
        address = [string]$remote.Address
        httpPort = $httpPort
      }
    } catch [System.Net.Sockets.SocketException] {
      if ($_.Exception.SocketErrorCode -ne [System.Net.Sockets.SocketError]::TimedOut) {
        throw
      }
    }
  }
} finally {
  $client.Dispose()
}

$services = @($found.Values)
if ($services.Count -eq 0) {
  throw "No Context Bridge service was discovered. Confirm both devices are on the same trusted LAN, LAN discovery is enabled, and TCP 8787 / UDP $DiscoveryPort are allowed by the host firewall."
}
if ($services.Count -gt 1) {
  $summary = ($services | ForEach-Object { "$($_.serviceId) at $($_.address):$($_.httpPort)" }) -join "; "
  throw "Multiple Context Bridge services were found: $summary. Re-run with -ServiceId to select one."
}

$service = $services[0]
$serviceUrl = "http://$($service.address):$($service.httpPort)"
$health = Invoke-RestMethod -Uri "$serviceUrl/health" -Method Get -TimeoutSec 5
if (-not $health.ok -or $health.serviceId -ne $service.serviceId) {
  throw "The discovered service failed identity verification."
}

Write-Host "Discovered Context Bridge '$($service.serviceId)' at $serviceUrl."
Write-Warning "LAN onboarding uses HTTP. Use it only on a trusted private network. The one-time invite is still required."

& (Join-Path $PSScriptRoot "join-workspace.ps1") `
  -ServiceUrl $serviceUrl `
  -DisplayName $DisplayName `
  -AllowPrivateHttp `
  -Force:$Force
