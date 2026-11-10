# Context Bridge 从零开始详细操作说明

本说明适合第一次配置，也适合以后每次照着重复操作。它覆盖：

- 主设备首次初始化；
- 日常启动共享服务；
- 同一局域网连接；
- Cloudflare 临时公网连接；
- 创建工作区和一次性邀请码；
- 新设备加入并保存个人 API Key；
- 在 Codex、Claude Code、Cursor 或 Copilot 中安装 Skill；
- 配置 MCP；
- 从设备 A 发布、在设备 B 恢复；
- 地址变化、401、邀请码失效等故障处理。

当前项目目录是：

```text
C:\Users\86157\Desktop\skills
```

当前阶段的本地改动尚未发布 GitHub。另一台设备如果需要最新版脚本，应先通过 U 盘、局域网共享或压缩包复制整个项目目录。

---

## 推荐：直接使用中文终端控制台

现在不必逐条输入本手册中的底层命令。在 CMD 中进入项目目录后，只运行：

```cmd
cd /d C:\Users\86157\Desktop\skills
context-bridge
```

如果当前使用 PowerShell，则运行：

```powershell
Set-Location 'C:\Users\86157\Desktop\skills'
.\context-bridge.cmd
```

随后会出现中文编号菜单。输入选项编号即可操作；例如选择 `[2]` 启动服务，选择 `[4]` 启动临时隧道，选择 `[7]` 创建工作区和邀请码。

控制台操作的完整说明见 [`CONSOLE.zh-CN.md`](CONSOLE.zh-CN.md)。下面的手动步骤仍然保留，用于理解原理和排查故障。

---

## 0. 操作前先判断你打开的是 CMD 还是 PowerShell

### CMD 的特征

提示符类似：

```text
C:\Users\86157>
```

CMD 不认识 `Set-Location`。在 CMD 中切换目录应使用：

```cmd
cd /d C:\Users\86157\Desktop\skills
```

### PowerShell 的特征

提示符通常类似：

```text
PS C:\Users\86157>
```

PowerShell 可以使用：

```powershell
Set-Location C:\Users\86157\Desktop\skills
```

### 最稳妥的做法

不论当前窗口是 CMD 还是 PowerShell，都可以用下面这种形式运行项目脚本：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\脚本名称.ps1"
```

后文所有 PowerShell 脚本都优先给出这种通用写法。

---

## 1. 先理解主设备和客户端设备

### 主设备

主设备负责：

- 运行唯一的 Context Bridge 服务；
- 保存 `server/data/store.json`；
- 保存 owner 身份；
- 创建工作区和邀请码；
- 在远程模式下运行 Cloudflare 隧道。

主设备必须保持开机，Context Bridge 服务窗口必须保持运行。

### 客户端设备

客户端设备负责：

- 使用一次性邀请码加入；
- 保存自己的 `connection.local.json`；
- 使用自己的 API Key 连接 MCP；
- 发布或读取检查点。

客户端不要运行第二个 Context Bridge 服务，否则会形成完全独立的数据仓库，邀请码和工作区无法互认。

### 重要文件

- `credentials.local.json`：主设备本地 owner 等开发身份，绝不能分享；
- `connection.local.json`：某一台客户端自己的个人连接凭据，不能复制给其他设备；
- `server/.env`：服务运行配置和启动身份，不能提交；
- `server/data/store.json`：工作区、邀请、成员、检查点和凭据哈希；
- `mcp.json`：插件默认连接的 MCP 地址，不应包含 API Key。

---

## 2. 决定是否需要首次初始化

先进入项目目录。

在 CMD 中：

```cmd
cd /d C:\Users\86157\Desktop\skills
```

检查初始化文件：

```cmd
powershell -NoProfile -Command "Test-Path '.\credentials.local.json'; Test-Path '.\server\.env'"
```

### 如果输出两行 `True`

说明主设备已经初始化。不要再次运行 `setup-server-dev.ps1`，否则可能重新生成 owner API Key。直接跳到“第 4 节：日常启动主服务”。

### 如果任意一行是 `False`

说明这是全新主设备或初始化不完整，继续下一节。

---

## 3. 主设备首次初始化

在项目目录执行：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\setup-server-dev.ps1"
```

脚本会执行：

1. 检查 Node.js 和 npm；
2. 生成两个随机开发身份；
3. 写入 `credentials.local.json`；
4. 写入 `server/.env`；
5. 安装服务依赖；
6. 构建 TypeScript；
7. 运行测试和类型检查。

成功时应看到类似：

```text
Context Bridge development server setup is ready.
Credentials were saved to: ...\credentials.local.json
Secrets were not printed.
```

如果看到 `[RandomNumberGenerator] 不包含名为 Fill 的方法`，说明使用的是旧版本脚本。当前本地脚本已经改成兼容 Windows PowerShell 5.1 的 `GetBytes()` 写法，请确认复制的是最新项目文件。

如果提示 `node` 或 `npm` 不存在，需要先安装 Node.js 20 或更新版本，然后关闭并重新打开终端。

初始化完成后，不要再次重复执行本节。

---

## 4. 日常启动主服务

每次主设备重启后都需要执行本节。

### 窗口 A：运行 Context Bridge 服务

打开一个 CMD 或 PowerShell 窗口：

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-server-dev.ps1"
```

正常时应看到类似：

```text
Context Bridge LAN discovery listening on UDP 8788
Context Bridge listening on http://0.0.0.0:8787
```

这个窗口不能关闭。按 `Ctrl+C` 才会停止服务。

### 窗口 B：检查服务健康状态

再打开一个窗口：

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -Command "Invoke-RestMethod 'http://127.0.0.1:8787/health' | ConvertTo-Json"
```

应看到：

```json
{
  "ok": true,
  "service": "context-bridge",
  "mode": "single-shared-service"
}
```

只有 `ok` 为 `true` 才继续。

### 如果提示端口已被占用

错误通常包含 `EADDRINUSE` 或“端口 8787 已被使用”。先检查是否已经有服务在运行：

```cmd
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess"
```

如果健康检查已经成功，就不要启动第二个服务。

---

## 5. 选择连接方式

只需在下面两种方式中选择一种。

### 选择局域网的情况

- 两台设备连接同一个可信家庭/办公室网络；
- 不需要从外网连接；
- 希望不填写服务地址，自动发现主设备。

继续阅读“第 6 节”。

### 选择公网临时隧道的情况

- 两台设备不在同一网络；
- 需要临时远程测试；
- 可以接受主设备和隧道必须持续运行；
- 可以接受每次隧道重启后 URL 改变。

继续阅读“第 7 节”。

---

## 6. 同一局域网连接

局域网加入使用 HTTP，只能在可信私有网络使用，不能用于酒店、机场、咖啡店或访客 Wi-Fi。

### 6.1 检查服务端发现配置

在主设备执行：

```cmd
powershell -NoProfile -Command "Get-Content '.\server\.env' | Select-String 'CONTEXT_BRIDGE_LAN_DISCOVERY'"
```

应包含：

```text
CONTEXT_BRIDGE_LAN_DISCOVERY=1
CONTEXT_BRIDGE_LAN_DISCOVERY_PORT=8788
```

如果刚修改 `server/.env`，必须停止并重新启动窗口 A 的服务。

### 6.2 首次开放 Windows 私有网络防火墙

仅第一次需要。右键 PowerShell，选择“以管理员身份运行”，执行：

```powershell
Set-Location C:\Users\86157\Desktop\skills
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\enable-lan-access.ps1"
```

成功时会显示已为专用网络开放 TCP 8787 和 UDP 8788。

### 6.3 新设备自动发现并加入

把最新版项目目录复制到客户端设备，进入目录后执行：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\join-workspace-lan.ps1" -DisplayName "我的第二台设备"
```

脚本会：

1. 向 UDP 8788 发送发现请求；
2. 验证返回服务的身份；
3. 要求输入一次性邀请码；
4. 创建客户端个人身份；
5. 保存 `connection.local.json`。

输入邀请码时终端不会显示真实字符，这是正常现象。

成功时会显示工作区名称、设备名称和连接文件位置，但不会显示 API Key。

---

## 7. 不同网络：Cloudflare 临时公网连接

### 7.1 检查 cloudflared

主设备执行：

```cmd
powershell -NoProfile -Command "Test-Path '.\.tools\cloudflared.exe'"
```

输出 `True` 才继续。如果是 `False`，需要先下载官方 Windows 版 `cloudflared.exe`，放入：

```text
C:\Users\86157\Desktop\skills\.tools\cloudflared.exe
```

### 7.2 窗口 C：启动临时隧道

确保窗口 A 的 Context Bridge 服务正在运行，然后打开新窗口：

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-cloudflare-quick-tunnel.ps1" -CloudflaredPath ".\.tools\cloudflared.exe"
```

找到类似下面的地址：

```text
https://随机单词.trycloudflare.com
```

这个地址每次启动可能不同。窗口 C 不能关闭。

### 7.3 验证公网服务

在窗口 B 中把地址替换成实际值：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\verify-public-service.ps1" -ServiceUrl "https://随机单词.trycloudflare.com" -AllowReportedUrlMismatch
```

成功时应看到：

```text
Public service verification passed.
Auth: unauthenticated requests are rejected
```

### 7.4 是否需要修改 mcp.json

当前暂不发布 GitHub时，新设备可以在加入命令中直接填写新 URL，不一定要修改 `mcp.json`。

如果需要让本机插件默认使用该地址，可以执行：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-distribution.ps1" -Repository "Liy0413/context-bridge" -ServiceUrl "https://随机单词.trycloudflare.com"
```

这只修改本机文件。不要执行 `git push`，除非以后明确决定发布。

---

## 8. 主账号连接 owner 身份

这一节只在**主设备、主账号**上操作。目标是让主账号使用本机保存的主身份访问 Context Bridge，然后由这个身份创建工作区并成为该工作区的 `owner`。

先理解三个概念：

- `Alice` 是开发脚本默认生成的主身份，身份 ID 是 `usr_alice`；
- API Key 只用于证明“当前连接是 Alice”，它不是 OpenAI Platform API Key，也不需要充值；
- `owner` 是某一个工作区里的角色。Alice 在创建工作区之前只是一个身份；当 Alice 调用 `create_workspace` 创建工作区后，才成为该工作区的 `owner`。

不要把主身份的 API Key 发给另一台设备。其他账号应使用一次性邀请码换取各自独立的个人 API Key。

### 8.1 确认当前终端和项目目录

如果窗口提示符类似 `C:\Users\86157>`，说明当前使用的是 **CMD**。先执行：

```cmd
cd /d C:\Users\86157\Desktop\skills
```

确认已经进入正确目录：

```cmd
cd
dir credentials.local.json
dir server\.env
```

正常情况应满足：

- `cd` 显示 `C:\Users\86157\Desktop\skills`；
- 能找到 `credentials.local.json`；
- 能找到 `server\.env`。

如果两个文件都存在，**不要再次运行** `setup-server-dev.ps1`。开发初始化脚本会重新生成身份密钥，旧连接可能因此失效。

如果 `credentials.local.json` 不存在，回到第 3 节完成一次初始化，再继续本节。

### 8.2 确认主服务正在运行

保持启动服务的终端窗口不要关闭。在另一个 CMD 窗口执行：

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -Command "Invoke-RestMethod 'http://127.0.0.1:8787/health' | ConvertTo-Json -Depth 5"
```

能够返回 JSON，说明本机服务可访问。如果显示“无法连接到远程服务器”或“连接被拒绝”，先在另一个窗口启动服务：

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-server-dev.ps1
```

看到服务已经监听 `8787` 端口后，不要关闭这个窗口。

如果准备通过 Quick Tunnel 连接，还要确认隧道窗口也保持运行，并检查公网健康地址。把下面的示例域名换成隧道窗口当前显示的域名：

```cmd
powershell -NoProfile -Command "Invoke-RestMethod 'https://随机单词.trycloudflare.com/health' | ConvertTo-Json -Depth 5"
```

Quick Tunnel 每次重启都可能产生新域名。旧域名不能继续使用。

### 8.3 只查看身份名称，不显示密钥

在项目目录执行：

```cmd
powershell -NoProfile -Command "$credentials = Get-Content -Raw -Encoding UTF8 '.\credentials.local.json' | ConvertFrom-Json; $credentials.profiles | Select-Object id, displayName | Format-Table -AutoSize"
```

默认开发配置应显示类似：

```text
id         displayName
--         -----------
usr_alice  Alice
usr_bob    Bob
```

本手册把第一个身份 `Alice` 作为主身份。不要运行会输出整个 `credentials.local.json` 的命令，因为文件中含有真实 API Key。

### 8.4 把主身份 API Key 安全复制到剪贴板

继续在项目目录执行：

```cmd
powershell -NoProfile -Command "$credentials = Get-Content -Raw -Encoding UTF8 '.\credentials.local.json' | ConvertFrom-Json; $owner = $credentials.profiles | Where-Object id -eq 'usr_alice' | Select-Object -First 1; if (-not $owner -or -not $owner.apiKey) { throw '没有找到 usr_alice 的 API Key' }; $owner.apiKey | Set-Clipboard; Write-Host '主身份 API Key 已复制到剪贴板，终端未显示密钥。'"
```

这条命令会：

1. 读取本机秘密文件；
2. 按身份 ID 查找 `usr_alice`，而不是盲目取数组第一项；
3. 把 API Key 放入剪贴板；
4. 不在终端中打印 API Key。

不要把剪贴板内容粘贴到聊天、README、`mcp.json`、Skill 或 GitHub。下一步只粘贴到代理提供的认证秘密输入框。

### 8.5 根据“谁在连接”选择 MCP 地址

MCP 地址必须以 `/mcp` 结尾。三种地址不要混用：

- **当前主设备上的本地 Codex/代理**：使用 `http://127.0.0.1:8787/mcp`。这是临时测试最简单的方式；
- **同一可信局域网内的另一台设备**：使用 `http://主设备局域网IP:8787/mcp`，例如 `http://192.168.1.20:8787/mcp`；
- **从云端运行的代理，或不在同一局域网的设备**：使用当前 Quick Tunnel 公网地址，例如 `https://随机单词.trycloudflare.com/mcp`。

特别注意：

- `127.0.0.1` 永远表示“正在发起连接的那台机器自己”。另一台设备填写这个地址不会连接到主设备；
- 云端代理无法访问你电脑的 `127.0.0.1` 或家庭局域网地址，必须使用公网 HTTPS 地址；
- 局域网 HTTP 只适合可信家庭或办公室网络，不要在酒店、机场或访客 Wi-Fi 中使用；
- 无论选择哪种地址，所有设备都必须最终连接到**同一个主服务及同一个数据存储**，否则工作区和邀请码互不相认。

本节在主设备上做临时测试时，优先使用：

```text
http://127.0.0.1:8787/mcp
```

### 8.6 方法 A：在 Codex/代理的 MCP 连接界面添加主身份

不同版本的界面名称可能略有不同，入口一般叫“插件”“MCP”“工具”或“连接”。添加一个 Streamable HTTP MCP 连接，并填写：

- 连接名称：`context_bridge_owner`；
- 类型：`Streamable HTTP`；
- URL：第 8.5 节选出的地址；
- 认证类型：`API Key` 或 `Bearer Token`；
- Header 方案：`Bearer`；
- API Key/Token：粘贴第 8.4 节复制的内容。

如果界面同时存在“普通文本参数”和“秘密/Secret”输入框，必须使用秘密输入框。不要把 Key 填到 URL 查询参数里，也不要手工写入插件包中的 `mcp.json`。

本项目的 `mcp.json` 只声明“此连接使用 Bearer API Key”，不会也不应该保存真实 Key。这个结构与 [OpenAI 的插件 MCP 认证格式](https://developers.openai.com/plugins/build/plugins)一致。

保存连接后：

1. 关闭当前旧聊天；
2. 新建一个 Codex 聊天，或完全退出并重新启动代理；
3. 确认新聊天能够看到 Context Bridge 工具；
4. 再执行第 8.8 节的验证提示词。

如果仍然看不到工具，先不要重新生成 Key，直接查看第 8.9 节。

### 8.7 方法 B：Codex CLI 使用环境变量连接

如果使用的是 Codex CLI，而不是桌面连接界面，可以让配置只记录环境变量名称，不把 Key 写进 `config.toml`。

在 **PowerShell** 中执行下面几行。注意：这些是 PowerShell 命令，不要逐行直接输入 CMD；可以先在 CMD 中输入 `powershell` 进入 PowerShell。

```powershell
Set-Location 'C:\Users\86157\Desktop\skills'
$credentials = Get-Content -Raw -Encoding UTF8 '.\credentials.local.json' | ConvertFrom-Json
$owner = $credentials.profiles | Where-Object id -eq 'usr_alice' | Select-Object -First 1
if (-not $owner -or -not $owner.apiKey) { throw '没有找到 usr_alice 的 API Key' }
$env:CONTEXT_BRIDGE_OWNER_API_KEY = $owner.apiKey
codex mcp add context_bridge_owner --url 'http://127.0.0.1:8787/mcp' --bearer-token-env-var CONTEXT_BRIDGE_OWNER_API_KEY
codex mcp list
codex
```

如果使用公网隧道，只替换 `--url` 后面的地址，例如：

```powershell
codex mcp add context_bridge_owner --url 'https://随机单词.trycloudflare.com/mcp' --bearer-token-env-var CONTEXT_BRIDGE_OWNER_API_KEY
```

这里的 `$env:CONTEXT_BRIDGE_OWNER_API_KEY` 只对当前 PowerShell 窗口及从它启动的子进程有效：

- 必须在**同一个 PowerShell 窗口**中运行最后的 `codex`；
- 关闭窗口后，临时环境变量会消失；
- 下次使用 CLI 时，重新执行读取密钥和设置 `$env:` 的几行即可；
- 不要把真实 Key 直接写在 `codex mcp add` 命令或脚本里。

如果提示 `context_bridge_owner` 已经存在，先运行：

```powershell
codex mcp list
```

确认现有条目的 URL。URL 正确时不必重复添加，只需在当前 PowerShell 中重新设置环境变量，然后运行 `codex`。只有明确需要替换旧配置时，才执行：

```powershell
codex mcp remove context_bridge_owner
```

再重新运行 `codex mcp add ...`。Codex CLI 的 HTTP MCP 添加和检查方式也可参见 [OpenAI Docs MCP 文档](https://developers.openai.com/learn/docs-mcp)。

### 8.8 验证身份和 owner 角色

在**新建的代理聊天**中输入：

```text
使用 Context Bridge 的 whoami 和 list_workspaces。只告诉我：
1. 当前身份的 displayName 和 id；
2. 能访问的工作区名称和角色；
3. 如果还没有工作区，明确说“认证成功，但尚未创建工作区”。
不要显示、复述或猜测任何 API Key。
```

根据返回结果判断：

- `whoami` 返回 `Alice (usr_alice)`：主身份认证成功；
- `list_workspaces` 返回空列表：这是正常的，说明认证成功但还没有工作区，继续第 9 节；
- 已有目标工作区且角色为 `owner`：主账号连接完全正确；
- 已有目标工作区但角色为 `editor` 或 `viewer`：当前 Key 不是创建该工作区的主身份 Key；
- 返回 `Bob (usr_bob)`：连接使用了第二个开发身份，不是本手册选定的主身份。

如果还没有工作区，在第 9 节用 Alice 调用 `create_workspace`。创建成功后再次调用 `list_workspaces`，该工作区的角色应为 `owner`。之后只有这个 owner 身份可以为工作区创建邀请码。

### 8.9 常见故障定位

#### 情况 1：出现 `401`、`Unauthorized` 或“认证失败”

依次检查：

1. 是否把 Key 粘贴到了 Bearer/API Key 认证框，而不是 URL 或普通参数框；
2. 是否连接到了生成这把 Key 的同一台 Context Bridge 服务；
3. 是否在生成 `credentials.local.json` 后又重新运行过初始化脚本；
4. 使用 CLI 时，启动 `codex` 的同一个 PowerShell 中是否存在环境变量：

```powershell
if ($env:CONTEXT_BRIDGE_OWNER_API_KEY) { '环境变量已设置' } else { '环境变量未设置' }
```

不要用 `echo $env:CONTEXT_BRIDGE_OWNER_API_KEY`，那会直接显示秘密。

#### 情况 2：连接成功，但没有 Context Bridge 工具

检查：

- URL 是否以 `/mcp` 结尾；
- 主服务是否仍在运行；
- 使用 Quick Tunnel 时，隧道是否仍在运行、域名是否已经变化；
- 添加连接后是否新建了聊天或重启代理；
- `codex mcp list` 中是否能看到 `context_bridge_owner`。

#### 情况 3：本机健康检查成功，但代理连接失败

如果代理运行在云端，它不能访问 `127.0.0.1`。改用 Quick Tunnel 提供的公网 `https://.../mcp` 地址，然后重建代理会话。

#### 情况 4：`whoami` 正确，但工作区列表为空

这不是认证故障。它表示这套服务的数据存储中还没有由该身份创建或加入的工作区。继续第 9 节创建工作区。

#### 情况 5：能看到工作区，但不是 `owner`

角色记录在服务端，不能通过修改客户端名称或换一个显示名称变成 owner。请使用最初创建该工作区的身份 Key；如果连接到了另一套服务或另一份数据文件，也需要切回原来的服务实例。

### 8.10 连接完成后的安全收尾

确认代理已经安全保存认证信息后，可以清空 Windows 剪贴板：

```cmd
powershell -NoProfile -Command "Set-Clipboard -Value ''"
```

继续遵守以下规则：

- 不提交 `credentials.local.json` 和 `server\.env`；
- 不在聊天、截图、日志或 GitHub Issue 中显示 owner API Key；
- 不把 owner API Key 当作邀请码发给其他账号；
- 其他设备只接收一次性邀请码，并生成自己的个人凭据；
- Quick Tunnel 只用于临时测试，隧道关闭后公网连接会中断。

---

## 9. 创建工作区

一个共享项目通常只需要创建一个工作区，不要每次启动都创建新的。

在 owner 代理中输入：

```text
使用 context-bridge-share 创建一个名为“我的共享工作区”的工作区，并告诉我工作区 ID。
```

记录：

- 工作区名称；
- 工作区 ID；
- owner 身份。

以后创建邀请码、发布检查点和恢复工作都使用同一个工作区。

如果 `list_workspaces` 已经能看到目标工作区，跳过本节。

---

## 10. 创建一次性邀请码

每个新账号或新设备创建一个单独邀请码。

### editor 邀请

允许读取和发布检查点：

```text
使用 context-bridge-share，为“我的共享工作区”创建一个 24 小时有效的 editor 一次性邀请码。直接告诉我邀请码、权限和北京时间到期时间，不要显示 owner API Key。
```

### viewer 邀请

只允许读取检查点：

```text
使用 context-bridge-share，为“我的共享工作区”创建一个 24 小时有效的 viewer 一次性邀请码。直接告诉我邀请码、权限和北京时间到期时间。
```

邀请码规则：

- 只能成功使用一次；
- 到期后失效；
- 只能加入它对应的工作区；
- 不等于 API Key；
- 不要放进 Git、日志、URL 或公开聊天。

如果邀请码被使用、过期或输入错误，应创建新码，不要持续重试旧码。

---

## 11. 新设备准备项目和 Skills

由于当前本地改动尚未发布 GitHub，请把整个项目目录复制到新设备。不要复制以下秘密文件：

- `credentials.local.json`；
- `connection.local.json`；
- `server/.env`；
- `.env.production`；
- `server/data/store.json`。

在新设备进入项目目录后，可以安装四个 Skills。

### Codex

```cmd
node .\scripts\install-agent-skills.mjs --agent codex --scope user --dry-run
node .\scripts\install-agent-skills.mjs --agent codex --scope user
```

### Claude Code

```cmd
node .\scripts\install-agent-skills.mjs --agent claude-code --scope user --dry-run
node .\scripts\install-agent-skills.mjs --agent claude-code --scope user
```

### Cursor

```cmd
node .\scripts\install-agent-skills.mjs --agent cursor --scope user --dry-run
node .\scripts\install-agent-skills.mjs --agent cursor --scope user
```

### GitHub Copilot

```cmd
node .\scripts\install-agent-skills.mjs --agent github-copilot --scope user --dry-run
node .\scripts\install-agent-skills.mjs --agent github-copilot --scope user
```

安装完成后重新启动代理会话。Skill 安装器只复制说明和安全脚本，不会自动配置 MCP 或 API Key。

---

## 12. 新设备通过公网加入

在客户端项目目录运行，把 URL 替换为本次隧道地址：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\join-workspace.ps1" -ServiceUrl "https://随机单词.trycloudflare.com" -DisplayName "我的第二台设备"
```

出现下面提示时粘贴邀请码：

```text
Enter the one-time workspace invite code
```

成功时会创建：

```text
connection.local.json
```

并显示类似：

```text
Joined workspace '我的共享工作区' as '我的第二台设备'.
The personal connection credential was saved to: ...\connection.local.json
```

如果该文件已经存在，脚本会在消费邀请码之前停止。通常说明设备已经加入，不要再次加入。

---

## 13. 新设备通过局域网加入

确保：

- 主服务正在运行；
- 两台设备在同一专用网络；
- 主设备已开放 TCP 8787 和 UDP 8788；
- `CONTEXT_BRIDGE_LAN_DISCOVERY=1`；
- 新设备拥有一次性邀请码。

客户端运行：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\join-workspace-lan.ps1" -DisplayName "我的第二台设备"
```

成功时同样生成 `connection.local.json`。

如果发现多个 Context Bridge 服务，脚本会要求通过 `-ServiceId` 选择。不要随便选择未知服务。

---

## 14. 使用跨平台 Node.js 加入脚本

macOS、Linux 或不希望依赖 PowerShell 时，可以使用 Skill 自带的 Node.js 20+ 脚本。

### 公网

```text
node skills/context-bridge-join/scripts/join-workspace.mjs \
  --service-url https://随机单词.trycloudflare.com \
  --display-name "My second device"
```

### 局域网

```text
node skills/context-bridge-join/scripts/join-workspace.mjs \
  --discover-lan \
  --display-name "My second device"
```

该脚本：

- 不接受命令行中的邀请码；
- 交互输入时隐藏邀请码；
- 不在输出中显示 API Key；
- 默认拒绝覆盖现有连接文件；
- 只在明确使用 `--force` 时替换连接身份。

---

## 15. 新设备配置 MCP

### 15.1 查看 MCP URL

客户端项目目录执行：

```cmd
powershell -NoProfile -Command "$connection = Get-Content -Raw -Encoding UTF8 '.\connection.local.json' | ConvertFrom-Json; $connection.mcpUrl"
```

这个 URL 可以显示，不是秘密。

### 15.2 把个人 API Key 复制到剪贴板

```cmd
powershell -NoProfile -Command "$connection = Get-Content -Raw -Encoding UTF8 '.\connection.local.json' | ConvertFrom-Json; $connection.apiKey | Set-Clipboard"
```

不要把 `connection.local.json` 或 API Key 发给其他设备。每台设备应拥有自己的连接文件。

### 15.3 在代理中添加连接

- 名称：`context_bridge`；
- 类型：Streamable HTTP；
- URL：第 15.1 步的 `mcpUrl`；
- 认证：Bearer；
- Key：从剪贴板粘贴。

保存后重新启动代理会话。

### 15.4 验证客户端身份

输入：

```text
使用 Context Bridge 调用 whoami 和 list_workspaces。告诉我当前设备身份、工作区和角色，不要显示凭据。
```

预期结果：

- 身份是客户端自己的显示名称；
- 能看到“我的共享工作区”；
- 角色是邀请指定的 `editor` 或 `viewer`。

---

## 16. 完整同步测试

### 16.1 设备 A 发布检查点

在项目目录打开代理，输入：

```text
使用 context-bridge-publish，把当前项目状态发布到“我的共享工作区”。包含当前目标、完成内容、关键决定、阻塞项、下一步、Git 引用和安全的文件哈希清单。排除 .env、凭据、邀请码和连接文件。
```

预期返回：

- checkpoint ID；
- sequence 序号；
- 工作区；
- 文件记录数量。

### 16.2 设备 B 恢复检查点

输入：

```text
使用 context-bridge-resume，从“我的共享工作区”的最新检查点恢复工作。先总结目标、决定和下一步，再比较本地文件哈希；不要覆盖本地已修改文件。
```

如果设备 B 没有完整项目文件，应先通过 Git、压缩包或对象存储获取文件，再依据检查点继续。

### 16.3 判断是否成功

满足以下条件表示共享链路正常：

- 两台设备的 `whoami` 返回不同个人身份；
- 两台设备能看到同一个 workspace ID；
- 设备 B 能读到设备 A 发布的 checkpoint ID；
- 文件哈希比较结果合理；
- 没有传输 `.env`、API Key 或邀请码。

---

## 17. Quick Tunnel 地址改变时如何处理

隧道重启后，旧 URL 通常立即失效，但工作区和 API Key 不会失效。

操作顺序：

1. 主设备重新启动隧道；
2. 记录新的 `https://...trycloudflare.com`；
3. 运行公网验证脚本；
4. 在每个代理的 MCP 设置中把旧 URL 改为新 URL 加 `/mcp`；
5. 保留原来的个人 API Key；
6. 不需要新邀请码，也不需要重新加入。

如果希望同步更新客户端 `connection.local.json` 中记录的 URL，可在客户端项目目录执行：

```powershell
$newServiceUrl = "https://新的随机地址.trycloudflare.com"
$path = Resolve-Path .\connection.local.json
$connection = Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
$connection.serviceUrl = $newServiceUrl.TrimEnd("/")
$connection.mcpUrl = "$($newServiceUrl.TrimEnd('/'))/mcp"
[System.IO.File]::WriteAllText($path, ($connection | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
```

这段命令保留原来的个人 API Key，只更新地址。之后仍需同步修改代理的 MCP 设置。

---

## 18. 每次日常使用的最短流程

### 同一局域网，已有身份

1. 主设备启动 Context Bridge 服务；
2. 客户端使用原有 MCP 配置和 API Key；
3. 设备 A 发布检查点；
4. 设备 B 恢复检查点。

不需要重复创建工作区、邀请码或 `connection.local.json`。

### 不同网络，已有身份

1. 主设备启动 Context Bridge 服务；
2. 主设备启动 Quick Tunnel；
3. 验证新 URL；
4. 如果 URL 改变，更新各客户端 MCP URL；
5. 保留原 API Key；
6. 发布和恢复检查点。

### 新设备第一次加入

1. 主设备启动服务；
2. 确定局域网或公网方式；
3. owner 创建一个新邀请码；
4. 新设备运行加入脚本；
5. 新设备配置个人 MCP Key；
6. 调用 `whoami` 和 `list_workspaces`；
7. 执行发布/恢复测试。

---

## 19. 停止服务

临时测试结束后按顺序停止：

1. 在窗口 C（Cloudflare）按 `Ctrl+C`；
2. 在窗口 A（Context Bridge）按 `Ctrl+C`。

停止服务不会删除 `server/data/store.json`。停止隧道会使本次 Quick Tunnel URL 失效。

---

## 20. 备份共享数据

备份前建议先停止 Context Bridge 服务，避免复制写入中的文件。

在主设备执行：

```powershell
Set-Location C:\Users\86157\Desktop\skills
$backupDirectory = ".\.tools\backups"
New-Item -ItemType Directory -Force $backupDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item ".\server\data\store.json" "$backupDirectory\store-$timestamp.json"
```

`.tools` 已被 Git 忽略。正式部署时应使用独立加密备份，并定期验证恢复流程。

---

## 21. 常见错误与处理

### `'Set-Location' 不是内部或外部命令`

原因：当前是 CMD，不是 PowerShell。

处理：

```cmd
cd /d C:\Users\86157\Desktop\skills
```

### `-File 参数的实际参数不存在`

原因：没有切换到项目目录，或者脚本路径错误。

处理：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\86157\Desktop\skills\scripts\setup-server-dev.ps1"
```

### `RandomNumberGenerator 不包含 Fill 方法`

原因：旧版脚本不兼容 Windows PowerShell 5.1。

处理：使用当前已修复的 `scripts/setup-server-dev.ps1`。它使用兼容的 `GetBytes()`。

### `node` 或 `npm` 不是命令

安装 Node.js 20 或更新版本，安装后关闭所有终端并重新打开。

### `EADDRINUSE` 或端口 8787 被占用

可能已经有 Context Bridge 在运行。先执行健康检查。如果健康检查成功，不要启动第二个实例。

### `No Context Bridge service was discovered`

逐项检查：

- 两台设备是否在同一网络；
- 主设备网络是否为“专用”；
- 服务是否正在运行；
- `CONTEXT_BRIDGE_LAN_DISCOVERY=1`；
- 修改 `.env` 后是否重启服务；
- TCP 8787 和 UDP 8788 防火墙规则；
- 路由器是否禁止无线设备之间互访。

### `invalid_invite`

邀请码已使用、过期、输入错误，或来自另一个服务实例。创建一个新邀请码。

### `connection.local.json already exists`

设备很可能已经加入。不要重复加入，先配置该文件中的 MCP URL 和 API Key。只有明确要替换设备身份时才使用 `-Force` 或 `--force`。

### MCP 返回 401

检查：

- 使用的是 `connection.local.json` 中的个人 API Key；
- 认证方式是 Bearer；
- 没有把邀请码当成 API Key；
- 没有使用另一台设备的连接文件；
- URL 指向当前运行的同一个服务。

### Quick Tunnel 超时、502 或旧地址打不开

确认窗口 A 和窗口 C 都在运行。若隧道已重启，使用新 URL，验证后更新所有客户端 MCP URL。

### `npm install` 下载失败

检查网络、代理、防火墙和 npm registry。依赖安装成功后重新运行初始化脚本。

### PowerShell 禁止运行脚本

使用本文提供的：

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "脚本路径"
```

它只对这一次 PowerShell 进程应用 Bypass，不永久修改系统执行策略。

---

## 22. 安全检查清单

每次操作前后检查：

- [ ] 主设备只有一个 Context Bridge 服务实例；
- [ ] `credentials.local.json` 没有复制到客户端；
- [ ] 每台客户端拥有自己的 `connection.local.json`；
- [ ] API Key 没有出现在命令行、Git、日志或聊天中；
- [ ] 邀请码只交给目标账号并且只使用一次；
- [ ] `.env`、连接文件和数据文件没有提交；
- [ ] 局域网 HTTP 只在可信专用网络使用；
- [ ] Quick Tunnel 只用于临时测试；
- [ ] 发布检查点前排除了秘密文件；
- [ ] 恢复文件前先比较哈希，不覆盖本地修改；
- [ ] 已定期备份 `server/data/store.json`。

---

## 23. 一页速查

### 主设备启动

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-server-dev.ps1"
```

### 公网隧道

```cmd
cd /d C:\Users\86157\Desktop\skills
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-cloudflare-quick-tunnel.ps1" -CloudflaredPath ".\.tools\cloudflared.exe"
```

### 公网加入

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\join-workspace.ps1" -ServiceUrl "https://实际地址.trycloudflare.com" -DisplayName "设备名称"
```

### 局域网加入

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\join-workspace-lan.ps1" -DisplayName "设备名称"
```

### 验证连接

```text
使用 Context Bridge 调用 whoami 和 list_workspaces，不要显示任何凭据。
```

### 发布

```text
使用 context-bridge-publish 发布当前项目检查点，排除所有秘密文件。
```

### 恢复

```text
使用 context-bridge-resume 恢复最新检查点，先比较本地文件哈希，不要覆盖本地修改。
```

---

## 24. 半自动同步（推荐）

主机和副机分别先在各自的 Context Bridge 控制台选择：

```text
[14] 安装/更新本机 Context Bridge 插件
```

控制台会把当前仓库注册成 Codex 本地 marketplace，正式安装 `context-bridge@context-bridge-github`，并同时复制 Cursor 本地兼容包。重启 Codex/Cursor，启用 Context Bridge，并审核插件自带 Hook。插件在 `hooks/hooks.json` 中提供 Cursor 原生事件，在 `hooks/codex-hooks.json` 中提供 OpenAI Codex 兼容事件，共用一个命令脚本。

随后选择 `[12] 将项目连接到插件半自动同步`，输入实际工作项目的完整路径和工作区名称。主机使用 `credentials.local.json` 中的 owner 身份，副机使用加入工作区后生成的 `connection.local.json`；连接操作只记录凭据文件路径，不会复制或显示 API Key，也不再向工作项目写入 Hook 脚本。

插件提供以下事件：

- `sessionStart`（Codex 兼容名 `SessionStart`）：新建项目会话时只读检查最新检查点；
- `stop`（Codex 兼容名 `Stop`）：检测到本次会话修改了项目文件时，要求 Codex 询问是否发布检查点。

发现新检查点后，Hook 只会把摘要及匹配、缺失、冲突文件清单交给 Codex。Codex 必须先展示差异并取得确认，才能应用；本地不同文件必须逐项保留或合并，不能静默覆盖。成功应用后会在本机记录检查点 ID，避免下次重复提醒。

这些本地文件已加入目标项目的 `.gitignore`：

```text
.context-bridge.local.json
.context-bridge.state.json
connection.local.json
```

`.context-bridge.local.json` 保存服务地址、工作区 ID 和本机凭据文件路径；`.context-bridge.state.json` 保存本机已应用检查点和会话基线；`connection.local.json` 是副设备加入工作区后签发的个人凭据。它们都不应提交到 Git。Hook 随插件分发，因此每台设备只安装一次插件，各工作项目只需建立自己的本地连接标记。
