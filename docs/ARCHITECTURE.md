# 架构 · 0.2.0

Context Bridge 由分发包、插件 Hook 和唯一共享服务组成。

## 分发与运行

- GitHub 保存源码、插件、四个技能以及 Agensi ZIP。
- 根 `plugin.json` 声明 OpenAI 扩展，指向 `hooks/codex-hooks.json`。
- Cursor 清单 `.cursor-plugin/plugin.json` 发现 `hooks/hooks.json`。
- `hooks/context-bridge-semi-auto.mjs` 加载共享实现 `scripts/hooks/context-bridge-semi-auto.mjs`。
- MCP 服务管理身份、工作区、成员权限、一次性邀请和检查点。所有设备访问同一实例。
- Agensi 交付四个技能和独立加入脚本，运行时仍需用户自己的 Context Bridge 服务。

## 项目识别

Hook 从事件工作目录或宿主提供的项目目录查找连接标记。优先使用 `.context-bridge.local.json`；也可以识别工作项目中的 `connection.local.json`。

项目标记记录服务地址、工作区和本机凭据文件路径。凭据不随插件分发；`.context-bridge.state.json` 记录本机应用状态和会话文件基线。没有标记的项目直接放行。

## 会话事件

启动时对项目支持的文本文件建立基线，并读取最新检查点。根据 SHA-256 比较文件，向代理注入摘要和差异。代理必须取得确认后才能应用，对本地修改逐项处理；成功后记录已应用 ID。

结束响应时比较文本文件基线，出现尚未询问的变化则请求代理询问是否发布。用户同意后通过发布 Skill 写入工作区。递归保护避免自动续轮重复触发。

检测排除依赖、构建目录和秘密文件，单文件上限 256 KiB，最多记录 2,000 个文本文件。该机制不能识别所有二进制或超限文件变化。

## 服务与权限

加入端点在没有个人凭据时验证邀请码，签发个人 API Key。邀请和凭据以哈希持久化。owner 创建邀请；editor 发布和读取；viewer 读取。

服务端存储是单进程 JSON 文件。检查点保存显式项目记录与文件清单，小型文件可以内联，完整代码和大文件使用 Git 等外部引用。

## 网络

公网使用 HTTPS；可信局域网可通过 UDP 8788 发现同一服务后使用 HTTP 加入。发现报文只携带非秘密元数据，仍需邀请码。LAN 与公网指向同一存储。

`/health`、`/info`、`/onboarding/join`、`/mcp` 必须由同一服务提供。临时隧道依赖主机在线且地址随重启变化；稳定服务使用固定域名。

部署见 [DEPLOYMENT.md](DEPLOYMENT.md)，用户流程见 [INSTALL.md](INSTALL.md)。
