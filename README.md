# Context Bridge

当前发布版本：**0.2.0**。

通过一个共享 MCP 服务，在不同账号、不同设备之间交接项目目标、进度、决定、下一步和选定文件。GitHub 分发插件与源码；每台设备加入同一个工作区，使用自己的个人凭据。

## 开始使用

需要 Node.js 20+、Git 和支持插件 Hook 的本地 Codex 或 Cursor。Windows 操作使用 PowerShell。

```powershell
git clone https://github.com/Liy0413/context-bridge.git
Set-Location context-bridge
.\context-bridge.cmd
```

主设备按顺序操作：

1. `[1]` 首次初始化，然后 `[2]` 启动共享服务。
2. 同一可信局域网选择 `[10]` 开放专用网络防火墙；跨网络临时测试选择 `[4]` 启动隧道。
3. `[7]` 创建工作区，并为副设备创建 `editor` 或 `viewer` 一次性邀请码。
4. `[14]` 安装插件，配置 MCP 的服务地址和 owner 凭据。
5. `[12]` 将实际工作项目连接到工作区。

副设备按顺序操作：

1. 克隆仓库并打开控制台。
2. 同一可信局域网选择 `[9]`，公网选择 `[8]`，输入自己的设备名称和邀请码。
3. `[14]` 安装插件，用生成的个人连接文件配置 MCP。
4. `[12]` 输入副设备上的实际工作项目目录，连接到同一工作区。
5. 重启代理，审核插件 Hook，并在工作项目中新建对话。

主副设备的详细操作、MCP 认证及故障处理见 [安装说明](docs/INSTALL.md) 和 [控制台说明](docs/CONSOLE.zh-CN.md)。服务仅在主设备部署一次。

## 插件内置半自动同步

Hook 随插件安装，每个工作项目只保存自己的连接标记。

- 会话启动时检查最新检查点。Codex 的启动、恢复和压缩续接可触发检查；Cursor 原生 `sessionStart` 在创建新对话时触发。
- 发现尚未应用的检查点后，向代理提供摘要和匹配、缺失、不同文件清单，先询问用户再应用。
- 会话中的项目文本文件发生变化时，在代理结束响应前询问是否发布；同一批修改不重复询问。
- 网络故障时放行并记录错误。发布和应用均须用户确认。

结束询问由代理完成响应触发，直接关闭窗口不保证能弹出询问。当前变化检测仅覆盖脚本支持的文本类型，单文件上限 256 KiB，最多记录 2,000 个文件。

检查点包含显式发布的项目内容，不提供其他账号的私有聊天、隐藏提示或模型内部状态。完整项目和大文件通过 Git 引用等方式交接。

## 四个技能

- `context-bridge-join`：使用邀请码加入工作区。
- `context-bridge-publish`：发布当前项目检查点。
- `context-bridge-resume`：检查差异并继续已共享工作。
- `context-bridge-share`：创建工作区和一次性邀请。

示例请求：

```text
将当前项目整理为检查点并发布到我的共享工作区，排除凭据和无关内容。
```

```text
读取最新检查点，先展示本地文件差异，等我确认后再应用。
```

其他支持 Agent Skills 的代理可按 [技能说明](docs/SKILLS.md) 单独使用工作流程。独立技能安装不包含插件 Hook。当前含 Hook 的插件适用于本地或 GitHub marketplace 的桌面安装，不适用于 OpenAI 公共插件目录提交。

## Agensi 发布包

可上传的 [Skill Pack ZIP](dist/agensi/context-bridge-workspace-handoff-pack-v0.2.0.zip) 包含四个技能和独立加入脚本。Agensi 通过 MCP 交付技能，不安装插件 Hook，也不托管共享服务。商品文案、要求和重新打包步骤见 [Agensi 发布说明](docs/AGENSI.md)。

## 文档

- [安装与连接](docs/INSTALL.md)
- [中文控制台](docs/CONSOLE.zh-CN.md)
- [技能与代理支持](docs/SKILLS.md)
- [架构](docs/ARCHITECTURE.md)
- [服务部署](docs/DEPLOYMENT.md)
- [安全策略](SECURITY.md)

## 开发验证

```powershell
Set-Location server
npm ci
npm test
npm run typecheck
```

当前实现使用单进程 JSON 存储和开发 API Key，适合私有测试。公开生产服务仍需 OAuth、持久化数据库、审计和凭据撤销等完善。Quick Tunnel 地址会随重启变化，使用临时隧道时应更新连接配置；仓库中的 MCP 地址必须由服务运营者验证后使用。
