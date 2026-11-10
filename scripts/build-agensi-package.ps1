[CmdletBinding()]
param(
  [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = Split-Path -Parent $PSScriptRoot
$version = [string]((Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectRoot "plugin.json") | ConvertFrom-Json).version)
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot "dist\agensi" }
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$stagingRoot = Join-Path $projectRoot ".tools\agensi-package-staging"
$zipPath = Join-Path $outputRoot "context-bridge-workspace-handoff-pack-v$version.zip"

if (Test-Path -LiteralPath $stagingRoot) {
  $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
  $expectedParent = (Resolve-Path -LiteralPath (Join-Path $projectRoot ".tools")).Path
  if (-not (Split-Path -Parent $resolvedStaging).Equals($expectedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clear an unexpected staging directory: $resolvedStaging"
  }
  Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $stagingRoot "skills") -Force | Out-Null
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\agensi\README.md") -Destination (Join-Path $stagingRoot "README.md")
Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\agensi\requirements.md") -Destination (Join-Path $stagingRoot "requirements.md")
Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE") -Destination (Join-Path $stagingRoot "LICENSE")

$skillNames = @(
  "context-bridge-join",
  "context-bridge-publish",
  "context-bridge-resume",
  "context-bridge-share"
)
foreach ($skillName in $skillNames) {
  $source = Join-Path $projectRoot "skills\$skillName"
  $destination = Join-Path $stagingRoot "skills\$skillName"
  Copy-Item -LiteralPath $source -Destination $destination -Recurse
}

$skillFiles = @(Get-ChildItem -LiteralPath $stagingRoot -Recurse -File -Filter "SKILL.md")
if ($skillFiles.Count -ne 4) { throw "Expected 4 SKILL.md files, found $($skillFiles.Count)." }
foreach ($skillFile in $skillFiles) {
  $content = Get-Content -Raw -Encoding UTF8 -LiteralPath $skillFile.FullName
  if ($content -notmatch "(?ms)^---\s*.*?^name:\s*\S+.*?^description:\s*.+?^---\s*$") {
    throw "Invalid SKILL.md frontmatter: $($skillFile.FullName)"
  }
}

$forbiddenExtensions = @(".exe", ".dll", ".so", ".dylib", ".bin", ".app", ".dmg", ".msi", ".deb", ".rpm", ".wasm", ".class", ".jar", ".war")
$files = @(Get-ChildItem -LiteralPath $stagingRoot -Recurse -File)
if ($files.Count -gt 1000) { throw "Package exceeds Agensi's 1,000-file limit." }
foreach ($file in $files) {
  if ($forbiddenExtensions -contains $file.Extension.ToLowerInvariant()) {
    throw "Forbidden executable file type: $($file.FullName)"
  }
  if ($file.DirectoryName -match "[\\/](node_modules|site-packages|\.git)([\\/]|$)") {
    throw "Bundled dependency or repository metadata is not allowed: $($file.FullName)"
  }
}

$scripts = @(Get-ChildItem -LiteralPath $stagingRoot -Recurse -File | Where-Object { $_.DirectoryName -match "[\\/]scripts$" })
foreach ($script in $scripts) {
  if ($script.Length -gt 20KB) { throw "Script exceeds the 20 KB review guideline: $($script.FullName)" }
}

if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
$zip = Get-Item -LiteralPath $zipPath
if ($zip.Length -gt 50MB) { throw "ZIP exceeds Agensi's 50 MB website-upload limit." }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
$checksumPath = "$zipPath.sha256"
[System.IO.File]::WriteAllText(
  $checksumPath,
  "$hash  $($zip.Name)`n",
  [System.Text.UTF8Encoding]::new($false)
)

Remove-Item -LiteralPath $stagingRoot -Recurse -Force

Write-Host "Agensi package created: $zipPath"
Write-Host "Version: $version"
Write-Host "Skills: $($skillFiles.Count)"
Write-Host "Files: $($files.Count)"
Write-Host "ZIP bytes: $($zip.Length)"
Write-Host "SHA-256: $hash"
Write-Host "Checksum file: $checksumPath"
