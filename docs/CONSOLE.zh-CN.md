# Context Bridge 中文终端控制台

控制台把原来的多条 PowerShell 命令集中成一个中文编号菜单。操作者只需要启动一次，然后输入菜单中的数字。

## 1. 启动方式

在 CMD 中：

```cmd
cd /d C:\Users\86157\Desktop\skills
context-bridge
```

在 PowerShell 中：

```powershell
Set-Location 'C:\Users\86157\Desktop\skills'
.\context-bridge.cmd
```

如果项目以后放到其他目录，先进入那个目录，再运行 `context-bridge` 或 `.\context-bridge.cmd`。

## 2. 主菜单

控制台当前提供以下操作：

```text
 [1] 首次初始化（只运行一次）
 [2] 启动本地服务
 [3] 停止本地服务
 [4] 启动 Cloudflare 临时隧道
 [5] 停止 Cloudflare 临时隧道
 [6] 复制 owner 密钥并显示连接参数
 [7] owner 工作区管理（创建工作区/邀请码）
 [8] 使用公网地址和邀请码加入
 [9] 局域网自动发现并加入
[10] 启用主设备局域网防火墙规则
[11] 安装 Agent Skills
[12] 将项目连接到插件半自动同步
[13] 查看说明和日志路径
[14] 安装/更新本机 Context Bridge 插件
 [0] 退出
```

每次返回主菜单时，顶部会显示初始化、本地服务和临时隧道的当前状态。

## 3. 主设备第一次使用

按以下顺序选择：

1. 选择 `[1]` 完成初始化；
2. 选择 `[2]` 启动唯一的本地服务；
3. 只在需要跨网络测试时选择 `[4]` 启动 Quick Tunnel；
4. 选择 `[7]` 进入 owner 工作区管理；
5. 在子菜单选择 `[3]` 创建工作区；
6. 再选择 `[4]` 创建一次性邀请码。

如果 `credentials.local.json` 或 `server/.env` 已经存在，控制台会拒绝重复初始化，避免旧 API Key 意外失效。

## 4. owner 工作区管理

选择主菜单 `[7]` 后，先选择连接地址：

- `[1]` 连接本机服务，适合主设备操作；
- `[2]` 使用控制台当前启动的 Quick Tunnel；
- `[3]` 手动输入其他以 `/mcp` 结尾的地址。

随后可执行：

```text
[1] 查看当前身份
[2] 列出工作区
[3] 创建工作区
[4] 创建一次性邀请码
[5] 发布文字检查点（不含文件）
[6] 更换 MCP 地址
[0] 返回主菜单
```

创建邀请码时需要依次选择工作区、`editor` 或 `viewer` 权限，以及 1-168 小时的有效期。邀请码会显示一次并复制到剪贴板。

选择 `[5]` 可以直接发布一个包含标题、进度摘要和下一步的文字检查点，用于验证副设备读取。完整文件交接仍应由 Codex 按 `context-bridge-publish` Skill 整理并发布。

## 5. 配置 Codex 的 owner 连接

选择主菜单 `[6]`，再选择本地或公网地址。控制台会：

- 显示 MCP URL、连接类型和认证方式；
- 把 owner API Key 复制到剪贴板；
- 不在终端显示真实 API Key。

在 Codex/MCP 连接界面中选择 Streamable HTTP 和 Bearer API Key，粘贴后保存。完成后建议清空剪贴板。

## 6. 新设备加入

公网方式选择 `[8]`：

1. 输入服务基础地址，地址末尾不要带 `/mcp`；
2. 输入本设备名称；
3. 在隐藏输入中粘贴一次性邀请码；
4. 个人凭据会保存到 `connection.local.json`。

同一可信局域网方式选择 `[9]`。客户端会自动发现主设备，然后要求输入设备名称和一次性邀请码。主设备首次提供局域网服务前，应选择 `[10]`，并在 Windows 管理员授权窗口确认防火墙规则。

## 7. 项目半自动同步

暂不发布 GitHub 时，每台设备先选择 `[14]`，把当前源码中的 Context Bridge 插件安装到本机。控制台会注册仓库内 `.agents/plugins/marketplace.json`，通过 Codex 本地 marketplace 正式安装插件，并同时准备 Cursor 本地兼容包。安装过程只复制可分发清单、Skills、Hooks 和公开文档，不复制凭据、服务数据或日志。重启 Codex/Cursor 后，在插件管理中确认 Context Bridge 已启用，并审核插件自带的 `sessionStart`/`stop` Hooks。

然后选择主菜单 `[12]`，把实际工作项目连接到工作区：

1. 输入实际工作项目的完整路径，例如 `C:\Users\86157\Desktop\爬坡展示交接文档\unitree-g1-ramp-3d-sim`；
2. 主机选择本地服务或当前隧道地址；副机会自动读取加入时生成的 `connection.local.json`；
3. 输入工作区名称，直接回车默认使用“测试工作区”；
4. 在 Codex 中打开目标项目。Hook 来自插件，不再要求项目中存在 `.cursor/hooks.json`。

插件包同时带有 Cursor 原生 `hooks/hooks.json` 和 OpenAI Codex `hooks/codex-hooks.json`，共用同一套脚本。项目连接操作只创建被 Git 忽略的 `.context-bridge.local.json`；API Key 不会复制到项目。运行状态保存在同样被忽略的 `.context-bridge.state.json`。副设备也可以直接在目标项目运行加入 Skill，让 `connection.local.json` 同时充当连接标记。

半自动同步的行为是：

- 打开或恢复项目会只读检查最新检查点；
- 如果发现尚未应用的新检查点，Codex 会先显示匹配、缺失和冲突文件，再询问是否应用；
- 未经确认不会写文件，对本地已修改文件不会静默覆盖；
- 本次会话修改过项目文件时，结束前会询问是否发布检查点；
- 只有明确同意后，Codex 才按 `context-bridge-publish` Skill 整理和发布。

如果使用 Quick Tunnel，隧道重启后 URL 会变化，需要重新选择 `[12]` 更新项目连接。每台设备需要安装一次插件；插件更新后可能需要重新审核 Hook。

当前带生命周期 Hook 的版本适合本地 marketplace、GitHub 仓库 marketplace 或其他手动桌面安装方式。根据 OpenAI 当前规则，带本地生命周期 Hook 的插件不能直接提交到公共插件目录；如果以后需要公共目录版本，应另外提供不含 Hook 的版本。

## 8. 后台运行与日志

服务和 Quick Tunnel 由控制台在后台启动。控制台关闭后，它们会继续运行；下次重新打开控制台仍可查看状态和停止进程。

运行状态和日志保存在：

```text
.tools\context-bridge-console\
```

该目录已被 Git 忽略。停止操作只会终止由本控制台启动且 PID 与启动时间都匹配的进程，避免旧 PID 被系统复用后误停其他程序。

如果服务并非由控制台启动，请回到原来的服务终端按 `Ctrl+C` 停止。

## 9. 安全提示

- 不要分享 `credentials.local.json`、`connection.local.json` 或 `server/.env`；
- owner API Key 不能作为邀请码发给其他人；
- 一次性邀请码只交给目标设备；
- Quick Tunnel 地址每次重启可能变化，只适合临时测试；
- 局域网 HTTP 只用于可信家庭或办公室私有网络；
- 当前 API Key 和 JSON 存储仍是开发方案，不适合直接作为公开生产服务。

## 10. 手动排错

如果控制台操作失败，先选择 `[13]` 查看日志目录。更完整的原因和手动命令见 [`MANUAL-DETAILED.zh-CN.md`](MANUAL-DETAILED.zh-CN.md)。
