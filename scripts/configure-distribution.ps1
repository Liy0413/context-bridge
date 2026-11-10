[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")]
  [string]$Repository,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^https://")]
  [string]$ServiceUrl
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serviceBase = $ServiceUrl.TrimEnd("/")

$pluginPath = Join-Path $projectRoot "plugin.json"
$plugin = Get-Content -Raw -Encoding UTF8 $pluginPath | ConvertFrom-Json
$plugin | Add-Member -NotePropertyName repository -NotePropertyValue "https://github.com/$Repository" -Force
$plugin | Add-Member -NotePropertyName homepage -NotePropertyValue "https://github.com/$Repository#readme" -Force
[System.IO.File]::WriteAllText(
  $pluginPath,
  ($plugin | ConvertTo-Json -Depth 20),
  [System.Text.UTF8Encoding]::new($false)
)

$mcpPath = Join-Path $projectRoot "mcp.json"
$mcp = Get-Content -Raw -Encoding UTF8 $mcpPath | ConvertFrom-Json
$mcp.mcpServers.context_bridge.url = "$serviceBase/mcp"
[System.IO.File]::WriteAllText(
  $mcpPath,
  ($mcp | ConvertTo-Json -Depth 20),
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Configured GitHub repository: https://github.com/$Repository"
Write-Host "Configured shared MCP endpoint: $serviceBase/mcp"
