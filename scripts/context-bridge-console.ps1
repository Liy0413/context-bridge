[CmdletBinding()]
param(
  [ValidateSet("menu", "status")]
  [string]$Action = "menu"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Join-Path $projectRoot ".tools\context-bridge-console"
$serverPidPath = Join-Path $stateRoot "server.pid"
$serverOutLog = Join-Path $stateRoot "server.out.log"
$serverErrorLog = Join-Path $stateRoot "server.error.log"
$tunnelPidPath = Join-Path $stateRoot "tunnel.pid"
$tunnelOutLog = Join-Path $stateRoot "tunnel.out.log"
$tunnelErrorLog = Join-Path $stateRoot "tunnel.error.log"
$tunnelUrlPath = Join-Path $stateRoot "tunnel-url.txt"
$ownerEnvironmentName = "CONTEXT_BRIDGE_OPERATOR_KEY"

if (-not (Test-Path -LiteralPath $stateRoot)) {
  New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
}

function Write-Color([string]$Text, [ConsoleColor]$Color = [ConsoleColor]::Gray) {
  Write-Host $Text -ForegroundColor $Color
}

function Write-Header([string]$Subtitle = "主菜单") {
  Clear-Host
  Write-Color "==============================================================" Cyan
  Write-Color "                  Context Bridge 控制台" Cyan
  Write-Color "  $Subtitle" DarkCyan
  Write-Color "==============================================================" Cyan
  Write-Host ""
}

function Wait-ForEnter {
  Write-Host ""
  [void](Read-Host "按 Enter 返回")
}

function Read-Required([string]$Prompt) {
  while ($true) {
    $value = (Read-Host $Prompt).Trim()
    if ($value) { return $value }
    Write-Color "输入不能为空。" Yellow
  }
}

function Confirm-Choice([string]$Prompt) {
  $answer = (Read-Host "$Prompt [y/N]").Trim()
  return $answer -match "^(y|yes)$"
}

function Test-Health([string]$BaseUrl = "http://127.0.0.1:8787") {
  try {
    $health = Invoke-RestMethod -Uri "$($BaseUrl.TrimEnd('/'))/health" -Method Get -TimeoutSec 2
    return [bool]$health.ok
  } catch {
    return $false
  }
}

function Get-TrackedProcess([string]$PidPath) {
  if (-not (Test-Path -LiteralPath $PidPath)) { return $null }
  try {
    $state = Get-Content -Raw -Encoding UTF8 -LiteralPath $PidPath | ConvertFrom-Json
    $processId = [int]$state.pid
    $expectedStart = [DateTime]::Parse([string]$state.startTimeUtc).ToUniversalTime()
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    $actualStart = $process.StartTime.ToUniversalTime()
    if ([Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 2) { return $null }
    return $process
  } catch {
    return $null
  }
}

function Save-TrackedProcess([System.Diagnostics.Process]$Process, [string]$PidPath, [string]$Kind) {
  $state = [ordered]@{
    pid = $Process.Id
    startTimeUtc = $Process.StartTime.ToUniversalTime().ToString("o")
    kind = $Kind
  }
  [System.IO.File]::WriteAllText(
    $PidPath,
    ($state | ConvertTo-Json),
    (New-Object System.Text.UTF8Encoding($false))
  )
}

function Get-TunnelUrl {
  if (Test-Path -LiteralPath $tunnelUrlPath) {
    $saved = (Get-Content -Raw -LiteralPath $tunnelUrlPath).Trim()
    if ($saved -match "^https://[a-z0-9-]+\.trycloudflare\.com$") { return $saved }
  }
  foreach ($logPath in @($tunnelErrorLog, $tunnelOutLog)) {
    if (Test-Path -LiteralPath $logPath) {
      $contents = Get-Content -Raw -LiteralPath $logPath -ErrorAction SilentlyContinue
      $match = [regex]::Match($contents, "https://[a-z0-9-]+\.trycloudflare\.com")
      if ($match.Success) {
        [System.IO.File]::WriteAllText($tunnelUrlPath, $match.Value)
        return $match.Value
      }
    }
  }
  return $null
}

function Show-Status {
  $credentialsReady = Test-Path -LiteralPath (Join-Path $projectRoot "credentials.local.json")
  $environmentReady = Test-Path -LiteralPath (Join-Path $projectRoot "server\.env")
  $serviceOnline = Test-Health
  $serverProcess = Get-TrackedProcess $serverPidPath
  $tunnelProcess = Get-TrackedProcess $tunnelPidPath
  $tunnelUrl = Get-TunnelUrl

  Write-Color "当前状态" White
  Write-Host ("  初始化文件 : {0}" -f $(if ($credentialsReady -and $environmentReady) { "就绪" } else { "未完成" }))
  Write-Host ("  本地服务   : {0}" -f $(if ($serviceOnline) { "在线 http://127.0.0.1:8787" } else { "离线" }))
  Write-Host ("  控制台进程 : {0}" -f $(if ($serverProcess) { "PID $($serverProcess.Id)" } else { "未跟踪" }))
  Write-Host ("  临时隧道   : {0}" -f $(if ($tunnelProcess) { "运行中 PID $($tunnelProcess.Id)" } else { "未运行/未跟踪" }))
  if ($tunnelUrl) { Write-Host "  公网地址   : $tunnelUrl" }
  Write-Host ""
}

function Invoke-Setup {
  Write-Header "首次初始化"
  $credentialsPath = Join-Path $projectRoot "credentials.local.json"
  $envPath = Join-Path $projectRoot "server\.env"
  if ((Test-Path -LiteralPath $credentialsPath) -or (Test-Path -LiteralPath $envPath)) {
    Write-Color "检测到已有本地配置。为避免轮换密钥，本控制台不会重复初始化。" Yellow
    Write-Host "credentials.local.json: $(Test-Path -LiteralPath $credentialsPath)"
    Write-Host "server\.env:             $(Test-Path -LiteralPath $envPath)"
    Write-Host "如需全新初始化，请先按手册备份并明确处理旧数据。"
    return
  }
  & (Join-Path $PSScriptRoot "setup-server-dev.ps1")
  if ($LASTEXITCODE -ne 0) { throw "初始化脚本执行失败。" }
  Write-Color "初始化完成。" Green
}

function Start-LocalService {
  Write-Header "启动本地服务"
  if (Test-Health) {
    Write-Color "服务已经在线，无需重复启动。" Green
    return
  }
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "server\.env"))) {
    throw "缺少 server/.env。请先选择 '首次初始化'。"
  }

  Remove-Item -LiteralPath $serverOutLog, $serverErrorLog -Force -ErrorAction SilentlyContinue
  $startScript = Join-Path $PSScriptRoot "start-server-dev.ps1"
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOutLog `
    -RedirectStandardError $serverErrorLog `
    -PassThru
  Save-TrackedProcess $process $serverPidPath "server"

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-Health) { $ready = $true; break }
    if ($process.HasExited) { break }
  }
  if (-not $ready) {
    Write-Color "服务未能在 10 秒内启动。" Red
    if (Test-Path -LiteralPath $serverErrorLog) {
      Write-Color "错误日志：" Yellow
      Get-Content -LiteralPath $serverErrorLog -Tail 20
    }
    throw "启动失败。日志位于 $stateRoot"
  }
  Write-Color "服务已启动：http://127.0.0.1:8787" Green
  Write-Host "后台 PID：$($process.Id)"
  Write-Host "日志目录：$stateRoot"
}

function Stop-TrackedProcess([string]$PidPath, [string]$Label) {
  $process = Get-TrackedProcess $PidPath
  if (-not $process) {
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    Write-Color "$Label 没有由本控制台启动的活动进程。" Yellow
    return
  }
  & taskkill.exe /PID $process.Id /T /F | Out-Null
  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
  Write-Color "$Label 已停止。" Green
}

function Stop-LocalService {
  Write-Header "停止本地服务"
  Stop-TrackedProcess $serverPidPath "本地服务"
  if (Test-Health) {
    Write-Color "8787 端口上仍有服务在线；它可能不是由本控制台启动，请在原终端中停止。" Yellow
  }
}

function Resolve-Cloudflared {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in @(
    (Join-Path $projectRoot ".tools\cloudflared.exe"),
    (Join-Path $projectRoot "cloudflared.exe")
  )) {
    if (Test-Path -LiteralPath $candidate) { return $candidate }
  }
  $custom = (Read-Host "未自动找到 cloudflared.exe，请输入它的完整路径（直接回车取消）").Trim().Trim('"')
  if (-not $custom) { return $null }
  if (-not (Test-Path -LiteralPath $custom)) { throw "文件不存在：$custom" }
  return (Resolve-Path -LiteralPath $custom).Path
}

function Start-QuickTunnel {
  Write-Header "启动 Cloudflare 临时隧道"
  if (-not (Test-Health)) { throw "本地服务离线。请先启动本地服务。" }
  $existing = Get-TrackedProcess $tunnelPidPath
  if ($existing) {
    $existingUrl = Get-TunnelUrl
    Write-Color "临时隧道已经运行。" Green
    if ($existingUrl) { Write-Host "公网地址：$existingUrl" }
    return
  }
  $cloudflared = Resolve-Cloudflared
  if (-not $cloudflared) {
    Write-Color "已取消。请先下载 cloudflared.exe，再重新选择此项。" Yellow
    return
  }

  Remove-Item -LiteralPath $tunnelOutLog, $tunnelErrorLog, $tunnelUrlPath -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $cloudflared `
    -ArgumentList "tunnel --url http://127.0.0.1:8787 --no-autoupdate" `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelOutLog `
    -RedirectStandardError $tunnelErrorLog `
    -PassThru
  Save-TrackedProcess $process $tunnelPidPath "tunnel"

  $url = $null
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    $url = Get-TunnelUrl
    if ($url) { break }
    if ($process.HasExited) { break }
  }
  if (-not $url) {
    Write-Color "15 秒内没有取得隧道地址。" Red
    if (Test-Path -LiteralPath $tunnelErrorLog) { Get-Content -LiteralPath $tunnelErrorLog -Tail 25 }
    throw "隧道启动失败或仍在等待。日志位于 $stateRoot"
  }
  Write-Color "临时隧道已启动。" Green
  Write-Host "公网服务：$url"
  Write-Host "MCP 地址：$url/mcp"
  Write-Color "此地址在隧道重启后会变化，只适合临时测试。" Yellow
}

function Stop-QuickTunnel {
  Write-Header "停止 Cloudflare 临时隧道"
  Stop-TrackedProcess $tunnelPidPath "临时隧道"
  Remove-Item -LiteralPath $tunnelUrlPath -Force -ErrorAction SilentlyContinue
}

function Get-OwnerProfile {
  $credentialsPath = Join-Path $projectRoot "credentials.local.json"
  if (-not (Test-Path -LiteralPath $credentialsPath)) {
    throw "缺少 credentials.local.json。请先完成首次初始化。"
  }
  $credentials = Get-Content -Raw -Encoding UTF8 -LiteralPath $credentialsPath | ConvertFrom-Json
  $profile = $credentials.profiles | Where-Object { $_.id -eq "usr_alice" } | Select-Object -First 1
  if (-not $profile) { $profile = $credentials.profiles | Select-Object -First 1 }
  if (-not $profile -or -not $profile.apiKey) { throw "没有找到可用的主身份 API Key。" }
  return $profile
}

function Select-McpUrl {
  Write-Host "选择连接地址："
  Write-Host "  [1] 本机服务 http://127.0.0.1:8787/mcp"
  Write-Host "  [2] 当前 Quick Tunnel 公网地址"
  Write-Host "  [3] 手动输入地址"
  $choice = (Read-Host "请输入 1-3").Trim()
  switch ($choice) {
    "1" { return "http://127.0.0.1:8787/mcp" }
    "2" {
      $url = Get-TunnelUrl
      if (-not $url) { throw "没有检测到可用的 Quick Tunnel 地址。" }
      return "$url/mcp"
    }
    "3" {
      $url = Read-Required "请输入以 /mcp 结尾的 HTTP(S) 地址"
      if ($url -notmatch "^https?://" -or $url -notmatch "/mcp/?$") {
        throw "MCP 地址必须以 http:// 或 https:// 开头，并以 /mcp 结尾。"
      }
      return $url.TrimEnd('/')
    }
    default { throw "无效选项。" }
  }
}

function Ensure-OperatorClient {
  $clientPath = Join-Path $projectRoot "server\dist\src\operator-client.js"
  if (Test-Path -LiteralPath $clientPath) { return $clientPath }
  Write-Color "正在构建管理客户端……" Cyan
  Push-Location (Join-Path $projectRoot "server")
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败。" }
  } finally {
    Pop-Location
  }
  if (-not (Test-Path -LiteralPath $clientPath)) { throw "管理客户端构建后仍不存在。" }
  return $clientPath
}

function Invoke-BridgeOperator([string]$McpUrl, [string]$ToolAction, [string[]]$ExtraArguments = @()) {
  $profile = Get-OwnerProfile
  $clientPath = Ensure-OperatorClient
  try {
    Set-Item -Path "Env:$ownerEnvironmentName" -Value ([string]$profile.apiKey)
    $arguments = @(
      $clientPath,
      "--url", $McpUrl,
      "--key-env", $ownerEnvironmentName,
      "--action", $ToolAction,
      "--output-encoding", "base64"
    ) + $ExtraArguments
    $output = & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "MCP 管理请求失败。请检查服务、地址和 owner 身份。" }
    $encoded = ($output -join "").Trim()
    try {
      $jsonBytes = [Convert]::FromBase64String($encoded)
      $json = [Text.Encoding]::UTF8.GetString($jsonBytes)
      return $json | ConvertFrom-Json
    } catch {
      throw "管理客户端返回值无法解析。请查看日志并重新运行 npm run build。原始错误：$($_.Exception.Message)"
    }
  } finally {
    Remove-Item -Path "Env:$ownerEnvironmentName" -ErrorAction SilentlyContinue
  }
}

function Show-WorkspaceRows([object]$Identity, [object[]]$Workspaces) {
  if (-not $Workspaces -or $Workspaces.Count -eq 0) {
    Write-Color "当前身份还没有工作区。" Yellow
    return
  }
  for ($index = 0; $index -lt $Workspaces.Count; $index += 1) {
    $workspace = $Workspaces[$index]
    $membership = $workspace.members | Where-Object { $_.userId -eq $Identity.id } | Select-Object -First 1
    $role = if ($membership) { $membership.role } else { "未知" }
    Write-Host ("  [{0}] {1}  角色={2}  ID={3}" -f ($index + 1), $workspace.name, $role, $workspace.id)
  }
}

function Show-OwnerConnection {
  Write-Header "主身份连接信息"
  $profile = Get-OwnerProfile
  $mcpUrl = Select-McpUrl
  $profile.apiKey | Set-Clipboard
  Write-Color "主身份 API Key 已复制到剪贴板，未显示在终端。" Green
  Write-Host "身份：$($profile.displayName) ($($profile.id))"
  Write-Host "MCP 地址：$mcpUrl"
  Write-Host "连接类型：Streamable HTTP"
  Write-Host "认证方式：Bearer API Key"
  Write-Host "连接名称：context_bridge_owner"
  Write-Color "粘贴完成并保存连接后，请清空剪贴板。" Yellow
}

function Manage-Workspaces {
  $mcpUrl = Select-McpUrl
  while ($true) {
    Write-Header "owner 工作区管理"
    Write-Host "当前 MCP：$mcpUrl"
    Write-Host ""
    Write-Host "  [1] 查看当前身份"
    Write-Host "  [2] 列出工作区"
    Write-Host "  [3] 创建工作区"
    Write-Host "  [4] 创建一次性邀请码"
    Write-Host "  [5] 发布文字检查点（不含文件）"
    Write-Host "  [6] 更换 MCP 地址"
    Write-Host "  [0] 返回主菜单"
    Write-Host ""
    $choice = (Read-Host "请输入选项").Trim()
    try {
      switch ($choice) {
        "1" {
          $result = Invoke-BridgeOperator $mcpUrl "whoami"
          Write-Color "当前身份：$($result.profile.displayName) ($($result.profile.id))" Green
          Wait-ForEnter
        }
        "2" {
          $identity = (Invoke-BridgeOperator $mcpUrl "whoami").profile
          $workspaces = @((Invoke-BridgeOperator $mcpUrl "list-workspaces").workspaces)
          Show-WorkspaceRows $identity $workspaces
          Wait-ForEnter
        }
        "3" {
          $name = Read-Required "工作区名称"
          $created = Invoke-BridgeOperator $mcpUrl "create-workspace" @("--name", $name)
          Write-Color "已创建：$($created.workspace.name)" Green
          Write-Host "工作区 ID：$($created.workspace.id)"
          Write-Host "当前角色：owner"
          Wait-ForEnter
        }
        "4" {
          $identity = (Invoke-BridgeOperator $mcpUrl "whoami").profile
          $workspaces = @((Invoke-BridgeOperator $mcpUrl "list-workspaces").workspaces)
          if ($workspaces.Count -eq 0) {
            Write-Color "没有工作区。请先选择 [3] 创建工作区。" Yellow
            Wait-ForEnter
            continue
          }
          Show-WorkspaceRows $identity $workspaces
          $workspaceChoice = 0
          $rawChoice = Read-Required "选择工作区编号"
          if (-not [int]::TryParse($rawChoice, [ref]$workspaceChoice) -or $workspaceChoice -lt 1 -or $workspaceChoice -gt $workspaces.Count) {
            throw "工作区编号无效。"
          }
          $roleChoice = (Read-Host "邀请码权限：[1] editor  [2] viewer").Trim()
          $role = switch ($roleChoice) { "1" { "editor" } "2" { "viewer" } default { throw "权限选项无效。" } }
          $hours = 0
          $rawHours = Read-Required "有效小时数（1-168，建议 24）"
          if (-not [int]::TryParse($rawHours, [ref]$hours) -or $hours -lt 1 -or $hours -gt 168) {
            throw "有效小时数必须是 1-168 的整数。"
          }
          $selected = $workspaces[$workspaceChoice - 1]
          $created = Invoke-BridgeOperator $mcpUrl "create-invite" @(
            "--workspace-id", [string]$selected.id,
            "--role", $role,
            "--expires-in-hours", [string]$hours
          )
          $created.invite.code | Set-Clipboard
          Write-Color "一次性邀请码已创建并复制到剪贴板：" Green
          Write-Host $created.invite.code
          Write-Host "权限：$($created.invite.role)"
          Write-Host "到期：$($created.invite.expiresAt)"
          Write-Color "邀请码使用一次后失效；只发送给目标设备。" Yellow
          Wait-ForEnter
        }
        "5" {
          $identity = (Invoke-BridgeOperator $mcpUrl "whoami").profile
          $workspaces = @((Invoke-BridgeOperator $mcpUrl "list-workspaces").workspaces)
          if ($workspaces.Count -eq 0) {
            Write-Color "没有工作区。请先选择 [3] 创建工作区。" Yellow
            Wait-ForEnter
            continue
          }
          Show-WorkspaceRows $identity $workspaces
          $workspaceChoice = 0
          $rawChoice = Read-Required "选择工作区编号"
          if (-not [int]::TryParse($rawChoice, [ref]$workspaceChoice) -or $workspaceChoice -lt 1 -or $workspaceChoice -gt $workspaces.Count) {
            throw "工作区编号无效。"
          }
          $title = Read-Required "检查点标题"
          $summary = Read-Required "当前进度摘要"
          $nextStep = (Read-Host "下一步（可直接回车留空）").Trim()
          $selected = $workspaces[$workspaceChoice - 1]
          $extra = @(
            "--workspace-id", [string]$selected.id,
            "--title", $title,
            "--summary", $summary
          )
          if ($nextStep) { $extra += @("--next-step", $nextStep) }
          $published = Invoke-BridgeOperator $mcpUrl "publish-checkpoint" $extra
          Write-Color "检查点发布成功。" Green
          Write-Host "编号：#$($published.checkpoint.sequence)"
          Write-Host "标题：$($published.checkpoint.title)"
          Write-Host "ID：$($published.checkpoint.id)"
          Write-Host "文件：0（本菜单只发布文字交接信息）"
          Wait-ForEnter
        }
        "6" { $mcpUrl = Select-McpUrl }
        "0" { return }
        default { Write-Color "无效选项。" Yellow; Start-Sleep -Milliseconds 800 }
      }
    } catch {
      Write-Color "操作失败：$($_.Exception.Message)" Red
      Wait-ForEnter
    }
  }
}

function Join-ByUrl {
  Write-Header "使用公网地址和邀请码加入"
  $defaultUrl = $null
  try {
    $mcp = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $projectRoot "mcp.json") | ConvertFrom-Json
    $defaultUrl = [string]$mcp.mcpServers.context_bridge.url -replace "/mcp/?$", ""
  } catch {}
  if ($defaultUrl) { Write-Host "直接回车使用默认地址：$defaultUrl" }
  $serviceUrl = (Read-Host "服务基础地址（不要带 /mcp）").Trim()
  if (-not $serviceUrl) { $serviceUrl = $defaultUrl }
  if (-not $serviceUrl) { throw "没有可用的服务地址。" }
  $serviceUrl = $serviceUrl -replace "/mcp/?$", ""
  $displayName = Read-Required "本设备/身份名称"
  & (Join-Path $PSScriptRoot "join-workspace.ps1") -ServiceUrl $serviceUrl -DisplayName $displayName
}

function Join-ByLan {
  Write-Header "局域网自动发现并加入"
  Write-Color "只在可信家庭或办公室私有网络中使用。" Yellow
  $displayName = Read-Required "本设备/身份名称"
  & (Join-Path $PSScriptRoot "join-workspace-lan.ps1") -DisplayName $displayName
}

function Enable-LanFirewall {
  Write-Header "启用局域网访问"
  Write-Host "这会为专用网络添加 TCP 8787 和 UDP 8788 入站规则。"
  if (-not (Confirm-Choice "继续并显示 Windows 管理员授权窗口？")) {
    Write-Color "已取消。" Yellow
    return
  }
  $script = Join-Path $PSScriptRoot "enable-lan-access.ps1"
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "局域网防火墙配置失败或被取消。" }
  Write-Color "局域网防火墙规则已配置。" Green
}

function Install-AgentSkills {
  Write-Header "安装 Context Bridge Skills"
  Write-Host "选择目标代理："
  Write-Host "  [1] Codex"
  Write-Host "  [2] Claude Code"
  Write-Host "  [3] Cursor"
  Write-Host "  [4] GitHub Copilot"
  Write-Host "  [5] 全部"
  $agentChoice = (Read-Host "请输入 1-5").Trim()
  $agent = switch ($agentChoice) {
    "1" { "codex" }
    "2" { "claude-code" }
    "3" { "cursor" }
    "4" { "github-copilot" }
    "5" { "all" }
    default { throw "代理选项无效。" }
  }
  $scopeChoice = (Read-Host "安装范围：[1] 当前项目  [2] 当前用户").Trim()
  $scope = switch ($scopeChoice) { "1" { "project" } "2" { "user" } default { throw "范围选项无效。" } }
  & node (Join-Path $PSScriptRoot "install-agent-skills.mjs") --agent $agent --scope $scope --project-path $projectRoot
  if ($LASTEXITCODE -ne 0) { throw "Skill 安装失败。目标中已有 Skill 时，请先检查而不是直接覆盖。" }
}

function Install-SemiAutoHooks {
  Write-Header "将项目连接到插件半自动同步"
  Write-Host "Context Bridge 插件负责 Hook；此操作只为当前项目保存工作区连接标记。"
  Write-Host "项目打开时检查新检查点，并在本次工作修改文件后询问是否发布。"
  Write-Color "发现新检查点时只展示差异；未经你确认不会应用或覆盖文件。" Yellow
  Write-Host ""

  $targetInput = Read-Required "要启用半自动同步的项目完整路径"
  $targetInput = $targetInput.Trim().Trim('"')
  if (-not (Test-Path -LiteralPath $targetInput -PathType Container)) {
    throw "项目目录不存在：$targetInput"
  }
  $targetProject = (Resolve-Path -LiteralPath $targetInput).Path

  $connectionPath = Join-Path $projectRoot "connection.local.json"
  $ownerCredentialsPath = Join-Path $projectRoot "credentials.local.json"
  $credentialPath = $null
  $credentialProfileId = $null
  $mcpUrl = $null

  if (Test-Path -LiteralPath $connectionPath) {
    $connection = Get-Content -Raw -Encoding UTF8 -LiteralPath $connectionPath | ConvertFrom-Json
    if (-not $connection.apiKey) { throw "connection.local.json 中没有可用的 API Key。" }
    $credentialPath = $connectionPath
    if ($connection.mcpUrl) { $mcpUrl = [string]$connection.mcpUrl }
    Write-Host "使用身份：$($connection.profile.displayName) ($($connection.profile.id))"
  } elseif (Test-Path -LiteralPath $ownerCredentialsPath) {
    $ownerProfile = Get-OwnerProfile
    $credentialPath = $ownerCredentialsPath
    $credentialProfileId = [string]$ownerProfile.id
    Write-Host "使用身份：$($ownerProfile.displayName) ($($ownerProfile.id))"
  } else {
    throw "未找到 connection.local.json 或 credentials.local.json。请先加入工作区或完成主机初始化。"
  }

  if (-not $mcpUrl) { $mcpUrl = Select-McpUrl }
  if ($mcpUrl -notmatch "^https?://" -or $mcpUrl -notmatch "/mcp/?$") {
    throw "连接文件中的 MCP 地址无效，必须以 /mcp 结尾：$mcpUrl"
  }
  $mcpUrl = $mcpUrl.TrimEnd('/')

  $workspaceName = (Read-Host "工作区名称（直接回车使用：测试工作区）").Trim()
  if (-not $workspaceName) { $workspaceName = "测试工作区" }

  $installer = Join-Path $PSScriptRoot "install-context-bridge-hooks.mjs"
  $arguments = @(
    $installer,
    "--project", $targetProject,
    "--mcp-url", $mcpUrl,
    "--workspace-name", $workspaceName,
    "--credential-file", $credentialPath,
    "--link-only"
  )
  if ($credentialProfileId) {
    $arguments += @("--credential-profile-id", $credentialProfileId)
  }

  & node @arguments
  if ($LASTEXITCODE -ne 0) { throw "项目连接失败。" }
  Write-Color "连接完成。Hook 由已安装的 Context Bridge 插件提供，不再需要项目内 .cursor/hooks.json。" Green
}

function Install-LocalContextBridgePlugin {
  Write-Header "安装/更新本机 Context Bridge 插件"
  Write-Host "将为 Cursor 安装本地兼容包，并通过本地 marketplace 为 Codex 正式安装插件。"
  Write-Host "不会复制任何凭据、服务数据或本地日志。"
  & node (Join-Path $PSScriptRoot "install-local-plugin.mjs")
  if ($LASTEXITCODE -ne 0) { throw "本机插件安装失败。" }

  $codexCommand = Get-Command codex -ErrorAction SilentlyContinue
  if (-not $codexCommand) { throw "没有找到 codex 命令，无法注册 Codex 本地 marketplace。" }
  $marketplaceName = "context-bridge-github"
  $pluginId = "context-bridge@$marketplaceName"
  $marketplaces = ((& codex plugin marketplace list --json) -join "`n") | ConvertFrom-Json
  $knownMarketplace = @($marketplaces.marketplaces) | Where-Object { $_.name -eq $marketplaceName } | Select-Object -First 1
  if (-not $knownMarketplace) {
    & codex plugin marketplace add $projectRoot --json
    if ($LASTEXITCODE -ne 0) { throw "Codex 本地 marketplace 注册失败。" }
  }

  $plugins = ((& codex plugin list --json) -join "`n") | ConvertFrom-Json
  $installedPlugin = @($plugins.installed) | Where-Object { $_.pluginId -eq $pluginId } | Select-Object -First 1
  if ($installedPlugin) {
    & codex plugin marketplace upgrade $marketplaceName --json
    if ($LASTEXITCODE -ne 0) { throw "Codex 插件更新失败。" }
  } else {
    & codex plugin add $pluginId --json
    if ($LASTEXITCODE -ne 0) { throw "Codex 插件安装失败。" }
  }

  Write-Color "插件已安装。请重启 Codex/Cursor，打开新对话并审核 Context Bridge Hooks。" Green
}

function Show-HelpPaths {
  Write-Header "操作说明"
  Write-Host "详细手册："
  Write-Color "  $projectRoot\docs\MANUAL-DETAILED.zh-CN.md" Cyan
  Write-Host ""
  Write-Host "简明手册："
  Write-Color "  $projectRoot\docs\MANUAL.zh-CN.md" Cyan
  Write-Host ""
  Write-Host "后台日志："
  Write-Color "  $stateRoot" Cyan
}

function Invoke-SafeMenuAction([scriptblock]$ScriptBlock) {
  try {
    & $ScriptBlock
  } catch {
    Write-Color "操作失败：$($_.Exception.Message)" Red
  }
  Wait-ForEnter
}

function Show-MainMenu {
  while ($true) {
    Write-Header
    Show-Status
    Write-Host "  [1] 首次初始化（只运行一次）"
    Write-Host "  [2] 启动本地服务"
    Write-Host "  [3] 停止本地服务"
    Write-Host "  [4] 启动 Cloudflare 临时隧道"
    Write-Host "  [5] 停止 Cloudflare 临时隧道"
    Write-Host "  [6] 复制 owner 密钥并显示连接参数"
    Write-Host "  [7] owner 工作区管理（创建工作区/邀请码）"
    Write-Host "  [8] 使用公网地址和邀请码加入"
    Write-Host "  [9] 局域网自动发现并加入"
    Write-Host " [10] 启用主设备局域网防火墙规则"
    Write-Host " [11] 安装 Agent Skills"
    Write-Host " [12] 将项目连接到插件半自动同步"
    Write-Host " [13] 查看说明和日志路径"
    Write-Host " [14] 安装/更新本机 Context Bridge 插件"
    Write-Host "  [0] 退出"
    Write-Host ""
    $choice = (Read-Host "请输入选项编号").Trim()
    switch ($choice) {
      "1" { Invoke-SafeMenuAction { Invoke-Setup } }
      "2" { Invoke-SafeMenuAction { Start-LocalService } }
      "3" { Invoke-SafeMenuAction { Stop-LocalService } }
      "4" { Invoke-SafeMenuAction { Start-QuickTunnel } }
      "5" { Invoke-SafeMenuAction { Stop-QuickTunnel } }
      "6" { Invoke-SafeMenuAction { Show-OwnerConnection } }
      "7" { Manage-Workspaces }
      "8" { Invoke-SafeMenuAction { Join-ByUrl } }
      "9" { Invoke-SafeMenuAction { Join-ByLan } }
      "10" { Invoke-SafeMenuAction { Enable-LanFirewall } }
      "11" { Invoke-SafeMenuAction { Install-AgentSkills } }
      "12" { Invoke-SafeMenuAction { Install-SemiAutoHooks } }
      "13" { Invoke-SafeMenuAction { Show-HelpPaths } }
      "14" { Invoke-SafeMenuAction { Install-LocalContextBridgePlugin } }
      "0" { Write-Color "已退出 Context Bridge 控制台。" Cyan; return }
      default { Write-Color "无效选项，请输入菜单中的编号。" Yellow; Start-Sleep -Milliseconds 800 }
    }
  }
}

Set-Location $projectRoot
if ($Action -eq "status") {
  Show-Status
  exit 0
}
Show-MainMenu
