[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$HttpPort = 8787,
  [ValidateRange(1, 65535)]
  [int]$DiscoveryPort = 8788
)

$ErrorActionPreference = "Stop"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this script from an elevated PowerShell window (Run as administrator)."
}

$httpRule = "Context Bridge LAN HTTP"
$discoveryRule = "Context Bridge LAN Discovery"
if (-not (Get-NetFirewallRule -DisplayName $httpRule -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $httpRule -Direction Inbound -Action Allow -Protocol TCP -LocalPort $HttpPort -Profile Private | Out-Null
}
if (-not (Get-NetFirewallRule -DisplayName $discoveryRule -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $discoveryRule -Direction Inbound -Action Allow -Protocol UDP -LocalPort $DiscoveryPort -Profile Private | Out-Null
}

Write-Host "LAN access enabled for private networks: TCP $HttpPort and UDP $DiscoveryPort."
