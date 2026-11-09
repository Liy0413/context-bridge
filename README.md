# Context Bridge

Context Bridge 是一个 Codex / ChatGPT 插件原型，用于在**用户明确授权**的不同账号和设备之间共享工作检查点。

它同步的是显式发布的数据，而不是 Codex 的隐藏状态：

- 当前目标、进度摘要、关键决策、阻塞项、下一步；
- 相关文件的相对路径、SHA-256、大小和状态；
- 必要的小型文本文件内容；
- 完整项目的 Git commit / branch / repository 或对象存储引用。

## 为什么不能直接“复制另一个账号的全部上下文”

插件不能绕过账号权限读取另一个账号的私有聊天、隐藏提示、模型内部状态或任意设备文件。两个账号必须分别登录 Context Bridge，并通过一次性邀请加入同一个共享工作区。只有显式发布到该工作区的数据才会被共享。

## 架构

```text
GitHub 仓库
├── 分发插件、安装信息和版本更新
└── 保存项目代码或 Git 引用

Codex 账号 A / 设备 A ─┐
Codex 账号 B / 设备 B ─┼─ HTTPS ─ 唯一的共享 MCP 服务 ─ 持久化数据
Codex 账号 C / 设备 C ─┘
```

- 插件包：`plugin.json`、`mcp.json` 和 `skills/context-bridge/SKILL.md`。
- MCP 服务：`server/`，提供账号身份、工作区、邀请和检查点工具。
- 权限：`owner`、`editor`、`viewer`。
- 开发认证：邀请引导后签发个人 API Key，仅用于本地/私有测试。
- 生产认证：必须替换成 OAuth 2.1 + PKCE、稳定 profile ID、scope 和服务端令牌校验。

所有设备必须连接 `mcp.json` 中同一个 HTTPS 地址。设备不得各自运行独立数据仓库，否则邀请码和工作区无法互认。详细设计见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 服务端开发

下面的脚本仅供服务端运营者开发和测试。普通客户端设备不运行服务。

它会生成 Alice、Bob 两套随机开发密钥，密钥只保存在被 Git 忽略的本地文件中，不会输出到终端：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-server-dev.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-server-dev.ps1
```

测试身份保存在 `credentials.local.json`，服务环境变量保存在 `server/.env`。两者都不得提交或分享。

手动运行方式：

```powershell
cd server
npm install
$env:CONTEXT_BRIDGE_USERS='{"alice-dev-key":{"id":"usr_alice","displayName":"Alice"},"bob-dev-key":{"id":"usr_bob","displayName":"Bob"}}'
npm run dev
```

健康检查：`GET http://localhost:8787/health`；MCP endpoint：`POST http://localhost:8787/mcp`。

测试：

```powershell
cd server
npm test
npm run typecheck
```

## 发布和安装

1. 服务端运营者按照 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) 部署唯一的 HTTPS MCP 服务。
2. 运行 `scripts/configure-distribution.ps1` 写入 GitHub 仓库和服务地址。
3. 将仓库发布到 GitHub；其他设备通过 GitHub marketplace 安装插件。
4. 账号 A 创建 workspace 和一次性 `editor`/`viewer` 邀请。
5. 新设备按照 [`docs/INSTALL.md`](docs/INSTALL.md) 运行 `scripts/join-workspace.ps1`，填写邀请码。
6. A 调用 `publish_checkpoint`，其他设备调用 `get_latest_checkpoint` 恢复工作。

## 生产化清单

- 使用 Auth0、Stytch 或其他成熟 IdP 实现 MCP OAuth 2.1，而不是自行发明认证协议；
- 把 JSON 存储替换为 PostgreSQL，并为 workspace/member/checkpoint 建立行级权限；
- 把大文件放进 S3/R2/OSS 等对象存储，使用短期签名 URL 和内容哈希；
- 端到端加密敏感 artifact，密钥不落入 MCP 日志；
- 增加审计日志、撤销邀请、成员移除、速率限制、配额和恶意内容扫描；
- 发布前补齐隐私政策、数据保留/删除和账号导出流程；
- 对冲突使用“检查点序号 + 文件哈希”乐观锁，不静默覆盖本地修改。

## 当前限制

- JSON 存储只适合单进程开发；
- API Key 方案不适合公开插件提交；
- 单个内联文件最大 256 KiB，每个检查点内联内容合计最大 2 MiB；
- 还没有对象存储上传、OAuth 服务、管理 UI 和端到端加密。

