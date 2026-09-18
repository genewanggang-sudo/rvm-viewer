# RVM Viewer

面向 AIDT 聊天预览的 RVM 工业模型查看器。前端是一个纯静态 React/three.js
应用，RVM 文件由随应用部署的 Worker/WASM 解析；没有后端、数据库或上传 API。

## 当前范围

- 产品只接受单个 `.rvm` 文件。
- 本地开发页可选择本机 RVM，或点击“加载测试 RVM”。测试样本仅在开发服务器中从
  `tmp/testdata/` 提供，构建产物不包含样本和测试按钮。
- AIDT 通过很小的 HTML 交付件把工作区 RVM 的绝对 URL 传给 HTTPS viewer。
- CADC `.txt` 是可选的附属属性清单；当前产品不读取或展示它，能力与边界见
  [RVM WASM 能力核对](docs/2026-09-17_RVM_WASM能力核对.md)。

## 本地开发

要求 Node `>=20.19.0`，pnpm 固定为 `10.12.1`。

```powershell
Set-Location frontend
corepack pnpm@10.12.1 install
corepack pnpm@10.12.1 verify
corepack pnpm@10.12.1 dev
```

打开 `http://127.0.0.1:5173/`。开发模式出现“加载测试 RVM”按钮；它读取被 Git
忽略的 `tmp/testdata/WD1-PSUP.RVM`。加载后可用右下角按钮适配模型或恢复等轴视图。

## 发布与 AIDT

先确定 HTTPS 静态站地址，再生成不可提交的发布目录：

```powershell
Set-Location frontend
corepack pnpm@10.12.1 prepare:aidt -- --viewer-url https://viewer.example.com/
```

命令在 `tmp/aidt-release/` 生成三部分：

- `viewer/`：发布到 HTTPS 根路径的静态构建产物。
- `agent/`：已写入 viewer 地址的 AIDT 天赋包源码副本。
- `manifest.json`：文件大小和 SHA-256 清单。

发布静态目录后，将 `agent/` 压缩上传为 AIDT 天赋。真实平台验证仍要求在已登录的
AIDT 对话中上传一个 RVM，并检查外部 viewer 是否有权读取平台文件 URL；没有平台
HTTPS 地址和会话时，不能把本地构建验证称为平台端到端验收。

## Git 规则

| 路径 | Git 管理 | 用途 |
| --- | --- | --- |
| `frontend/` | 是 | 可部署的查看器源码、测试、锁文件和 WASM 运行时 |
| `agent/` | 是 | AIDT 天赋说明及可复现的薄 HTML 生成脚本 |
| `scripts/` | 是 | 发布准备流程 |
| `docs/` | 是 | 架构、集成与验收说明 |
| `tmp/` | 否 | 样本、截图、日志、浏览器 profile、调试脚本和发布产物 |

根目录不保留 `tools/`。一次性辅助资料统一放在 `tmp/`；只有影响实际交付且需要
复现的脚本才进入受控源码。
