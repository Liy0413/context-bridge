# Agensi Skill Pack 发布 · 0.2.0

发布包：[context-bridge-workspace-handoff-pack-v0.2.0.zip](../dist/agensi/context-bridge-workspace-handoff-pack-v0.2.0.zip)。

该包包含四个 Skill、独立 Node.js 加入脚本、要求说明和 MIT 许可。需要用户提供 Context Bridge MCP 服务。Agensi 通过 MCP 交付文本技能，不能安装桌面插件、Hook 或 MCP 配置。

## 重新打包

在仓库根目录使用 PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-agensi-package.ps1
```

输出位于 `dist/agensi/`，包含 ZIP 和 SHA-256 校验文件。源技能位于 `skills/`，打包文案位于 `packaging/agensi/`。ZIP 不包含桌面插件清单、Hook、服务端数据或个人凭据。

## 提交

1. 在 Agensi 开启 Creator Mode。
2. 打开 [提交页面](https://www.agensi.io/dashboard/submit)，上传 ZIP。
3. 按 [商品页草稿](../packaging/agensi/LISTING.md) 填写摘要、依赖和权限；定价由发布者选择。
4. 核对预览、安全扫描和要求说明后提交审核。

现有文件仅用于准备上传，不表示已在 Agensi 上架。平台打包要求见 [Agensi packaging](https://www.agensi.io/docs/packaging)，支持内容见 [What you can sell](https://www.agensi.io/docs/what-you-can-sell)。
