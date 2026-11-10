# Context Bridge 手动创建与连接操作手册

这份手册用于你以后自行完成以下操作：

1. 在主设备启动唯一的 Context Bridge 服务；
2. 选择公网临时隧道或同一局域网连接；
3. 创建共享工作区和一次性邀请码；
4. 在新账号或新设备加入；
5. 配置个人 Bearer API Key；
6. 发布检查点并在另一设备恢复工作。

本文命令以 Windows PowerShell 和当前项目目录为例：

```powershell
C:\Users\86157\Desktop\skills
```

## 推荐：一条命令进入交互界面

CMD：

```cmd
cd /d C:\Users\86157\Desktop\skills
context-bridge
```

PowerShell：

```powershell
Set-Location 'C:\Users\86157\Desktop\skills'
.\context-bridge.cmd
```

输入菜单给出的编号即可操作。完整菜单说明见 [`CONSOLE.zh-CN.md`](CONSOLE.zh-CN.md)；下面继续保留手动命令，便于排错。

## 一、先记住三个概念

- **主设备**：运行唯一 Context Bridge 服务并保存共享数据的电脑。
- **客户端设备**：加入共享工作区的其他电脑或账号。客户端不启动自己的服务。
- **一次性邀请码**：只用于新设备首次加入。加入成功后，设备会获得自己的 API Key；以后不需要重复使用邀请码。

Context Bridge 只共享明确发布的检查点和文件信息，不会复制其他账号的私有聊天、隐藏提示或任意本地文件。

## 二、只需做一次的准备

### 1. 初始化主设备

如果 `server/.env` 和 `credentials.local.json` 还不存在，运行：

```powershell
Set-Location C:\Users\86157\Desktop\skills
powershell -ExecutionPolicy Bypass -File .\scripts\setup-server-dev.ps1
```

该脚本会安装服务依赖、构建项目并生成本地 owner 测试身份。`server/.env` 和 `credentials.local.json` 都是秘密文件，不要上传或发送给别人。

### 2. 局域网模式首次开放 Windows 防火墙

仅在需要局域网自动发现时操作。用“以管理员身份运行”的 PowerShell 执行：

```powershell
Set-Location C:\Users\86157\Desktop\skills
powershell -ExecutionPolicy Bypass -File .\scripts\enable-lan-access.ps1
```

它只为 Windows“专用网络”开放 TCP 8787 和 UDP 8788。不要在公共 Wi-Fi 上使用局域网 HTTP 加入。

### 3. 可选：安装四个 Agent Skills

先预览，以 Codex 为例：

```powershell
node .\scripts\install-agent-skills.mjs --agent codex --scope user --dry-run
```

确认后安装：

```powershell
node .\scripts\install-agent-skills.mjs --agent codex --scope user
```

把 `codex` 换成 `claude-code`、`cursor` 或 `github-copilot` 可安装到其他代理。安装后重新启动代理会话。

## 三、每次使用时：启动主设备服务

打开第一个 PowerShell 窗口，保持窗口运行：

```powershell
Set-Location C:\Users\86157\Desktop\skills
powershell -ExecutionPolicy Bypass -File .\scripts\start-server-dev.ps1
```

在另一个窗口检查本机服务：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

看到 `ok` 为 `true` 才继续。

服务数据保存在 `server/data/store.json`。关闭和重新启动服务不会自动删除工作区、成员或检查点。

## 四、选择连接方式

### 方式 A：同一可信局域网

两台设备连接同一个家庭或办公室 Wi-Fi/有线网络，并确认主设备的网络类型是“专用网络”。

主设备的 `server/.env` 应包含：

```dotenv
CONTEXT_BRIDGE_LAN_DISCOVERY=1
CONTEXT_BRIDGE_LAN_DISCOVERY_PORT=8788
```

修改后必须重新启动服务。局域网模式不需要 Cloudflare 隧道。

### 方式 B：不同网络或远程设备

打开第二个 PowerShell 窗口并保持运行：

```powershell
Set-Location C:\Users\86157\Desktop\skills
powershell -ExecutionPolicy Bypass -File .\scripts\start-cloudflare-quick-tunnel.ps1 `
  -CloudflaredPath .\.tools\cloudflared.exe
```

复制输出中的：

```text
https://随机名称.trycloudflare.com
```

把它记为 `$ServiceUrl` 并验证：

```powershell
$ServiceUrl = "https://随机名称.trycloudflare.com"
powershell -ExecutionPolicy Bypass -File .\scripts\verify-public-service.ps1 `
  -ServiceUrl $ServiceUrl `
  -AllowReportedUrlMismatch
```

看到 `Public service verification passed` 才把地址交给新设备。

Quick Tunnel 每次重启通常会更换地址。主设备服务和隧道窗口都必须保持运行。当前阶段可以直接把新地址私下交给新设备，不需要发布 GitHub。

如果希望同步修改本机 `mcp.json`，可运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-distribution.ps1 `
  -Repository Liy0413/context-bridge `
  -ServiceUrl $ServiceUrl
```

该命令会修改本机分发配置；在你决定发布前不要执行 `git push`。

## 五、主账号创建工作区和邀请码

### 1. 首次认证 owner 身份

把主设备第一个本地 owner API Key 复制到剪贴板，不在终端显示：

```powershell
$owner = (Get-Content -Raw -Encoding UTF8 .\credentials.local.json | ConvertFrom-Json).profiles[0]
$owner.apiKey | Set-Clipboard
```

在主账号的 MCP/插件认证界面选择 Bearer API Key，然后粘贴。不要把 owner API Key 交给其他账号。

### 2. 只在第一次创建工作区

在已连接 Context Bridge 的代理中输入：

```text
使用 context-bridge-share 创建一个名为“我的共享工作区”的工作区。
```

记录返回的工作区名称和 ID。同一个团队通常只创建一次，不要每次启动都重新创建工作区。

### 3. 每个新设备创建一个新邀请码

输入：

```text
使用 context-bridge-share，为“我的共享工作区”创建一个 24 小时有效的 editor 一次性邀请码，并直接告诉我邀请码、权限和到期时间。
```

权限选择：

- `editor`：可以读取和发布检查点；
- `viewer`：只能读取检查点。

一个邀请码只能成功使用一次。每个新账号或新设备都应创建自己的邀请码。

## 六、新设备加入工作区

先把项目目录复制到新设备，或在以后发布 GitHub 后再克隆仓库。进入项目目录后选择一种方式。

### 公网 HTTPS 加入

```powershell
$ServiceUrl = "https://随机名称.trycloudflare.com"
powershell -ExecutionPolicy Bypass -File .\scripts\join-workspace.ps1 `
  -ServiceUrl $ServiceUrl `
  -DisplayName "我的第二台设备"
```

出现提示后粘贴一次性邀请码。成功后会生成被 Git 忽略的 `connection.local.json`。

### 局域网自动发现加入

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\join-workspace-lan.ps1 `
  -DisplayName "我的第二台设备"
```

脚本会自动发现同一局域网中的服务，然后要求输入邀请码。

### 跨平台 Node.js 加入

公网：

```powershell
node .\skills\context-bridge-join\scripts\join-workspace.mjs `
  --service-url $ServiceUrl `
  --display-name "我的第二台设备"
```

局域网：

```powershell
node .\skills\context-bridge-join\scripts\join-workspace.mjs `
  --discover-lan `
  --display-name "我的第二台设备"
```

如果 `connection.local.json` 已存在，脚本会在消费邀请码之前停止。通常应继续使用原来的连接文件。只有明确要替换该设备身份时才使用 `-Force`（PowerShell）或 `--force`（Node.js）。

## 七、把新设备连接到 MCP

读取连接信息：

```powershell
$connection = Get-Content -Raw -Encoding UTF8 .\connection.local.json | ConvertFrom-Json
$connection.mcpUrl
$connection.apiKey | Set-Clipboard
```

在新设备所用代理的 MCP 设置中添加：

- 名称：`context_bridge`
- 类型：Streamable HTTP
- URL：上一步显示的 `mcpUrl`
- 认证：Bearer API Key
- Key：从剪贴板粘贴

优先使用代理提供的秘密输入框或系统凭据存储，不要把 API Key 写进公开配置、Skill、聊天记录或 Git。

重新启动代理会话，然后输入：

```text
使用 Context Bridge 调用 whoami 和 list_workspaces，告诉我当前身份和可访问的工作区，不要显示任何 API Key。
```

身份和工作区正确即表示连接成功。

## 八、发布和恢复工作

### 在设备 A 发布

```text
使用 context-bridge-publish，把当前项目状态发布到“我的共享工作区”。包含目标、已完成内容、关键决定、阻塞项、下一步、Git 引用和安全的文件哈希清单。不要上传任何密钥或 .env 内容。
```

### 在设备 B 恢复

```text
使用 context-bridge-resume，从“我的共享工作区”的最新检查点恢复工作。先总结检查点并比较本地文件哈希；不要覆盖本地已修改文件。
```

Context Bridge 记录的是显式检查点。完整项目文件仍应通过同一个 Git 仓库或对象存储传输。

## 九、以后哪些步骤需要重复

每次主设备重启后：

1. 启动 Context Bridge 服务；
2. 远程使用时重新启动 Quick Tunnel；
3. 如果 Quick Tunnel 地址改变，更新客户端 MCP URL；
4. 已加入设备继续使用原来的个人 API Key，不必重新创建邀请码。

只有以下情况需要新邀请码：

- 新账号第一次加入；
- 新设备需要独立身份；
- 原连接文件丢失并决定创建新身份；
- 旧邀请码已使用或过期。

## 十、停止服务

临时测试结束时：

1. 在 Cloudflare 隧道窗口按 `Ctrl+C`；
2. 在 Context Bridge 服务窗口按 `Ctrl+C`。

停止隧道后，原来的 `trycloudflare.com` 地址会失效。工作区数据仍保存在主设备的 `server/data/store.json`。

## 十一、常见故障

### 本机健康检查失败

- 确认服务窗口仍在运行；
- 确认端口 8787 没有被其他程序占用；
- 重新运行 `scripts/start-server-dev.ps1`。

### 局域网发现不到服务

- 两台设备必须在同一个局域网；
- Windows 网络类型应为“专用网络”；
- 确认 `CONTEXT_BRIDGE_LAN_DISCOVERY=1`；
- 确认服务已在修改环境变量后重启；
- 以管理员身份运行 `scripts/enable-lan-access.ps1`；
- 检查 TCP 8787 和 UDP 8788 防火墙规则。

### 提示邀请码无效

邀请码可能已使用、过期或属于另一服务实例。回到 owner 账号重新创建一个邀请码，不要反复重试旧码。

### MCP 返回 401

检查是否使用当前设备自己的 `connection.local.json` 中的 API Key，并确认认证方式是 Bearer。不要使用邀请码代替 API Key。

### Quick Tunnel 地址无法访问

隧道进程可能已经停止或地址已经变化。重新启动隧道、验证新 URL，并更新客户端 MCP URL。

### 本地已有 connection.local.json

这通常表示设备已经加入。不要重复加入。先调用 `whoami` 检查身份；只有明确要替换身份时才备份旧文件并使用强制覆盖选项。

## 十二、安全检查清单

- 不提交 `credentials.local.json`；
- 不提交 `connection.local.json`；
- 不提交 `server/.env` 或 `.env.production`；
- 不公开 owner API Key、个人 API Key 或邀请码；
- 不在命令行参数中放邀请码；
- 不把 Quick Tunnel 当作正式长期服务；
- 只在可信私有网络使用局域网 HTTP 加入；
- 覆盖本地文件前先比较哈希并确认；
- 定期备份 `server/data/store.json`。
