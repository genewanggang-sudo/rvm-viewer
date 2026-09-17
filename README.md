# rvm-viewer

面向 AIDT 聊天预览的工业模型查看器。用户上传 OBJ、STL 或 RVM 后，智能体生成一个很小的 HTML 交付件；该 HTML 在聊天预览中嵌入部署在 HTTPS 上的 WebGL viewer，完成模型显示。

## 当前进展

- `frontend/`：React 18、Vite、严格 TypeScript 和 three.js 静态 viewer；支持本地手动上传 OBJ、STL、RVM 和可选 ATT。
- `agent/`：AIDT 天赋包源码；小模型走 URL payload，大模型走 `postMessage`，RVM 走工作区文件引用。
- `frontend/public/rvmsdk/`：随前端部署的 RVM Worker/WASM 运行时，RVM 不再是“待接入”的占位能力。
- 质量门禁：格式、lint、TypeScript、100% 类型覆盖率、Vitest 覆盖率和生产构建均由 `pnpm verify` 串联。
- 尚未完成真实 AIDT 端到端验收：需要先部署 HTTPS viewer，再用平台登录态验证预览页对工作区 RVM 文件的跨域读取。

## 交付链路

```text
用户上传模型
  -> AIDT 工作区 media/<uuid>_<name>
  -> agent/scripts/pack_thin_html.mjs 生成薄 HTML
  -> send_file_to_user 发送 HTML
  -> AIDT 以 srcdoc 预览 HTML
  -> HTTPS viewer 获取数据并用 WebGL 渲染
```

数据通道优先级为 `payload > file > demo > postMessage`。本地手动上传独立走同一套渲染生命周期。

RVM 的 `fileref` 交付件不会把模型嵌入 HTML：薄 HTML 会将 `media/...` 按其 `document.baseURI` 解析为平台文件的绝对 URL，再传给外部 viewer。这样不会错误地把路径解析到 viewer 静态站域名。

## 本地开发

要求 Node `>=20.19.0`，使用项目锁定的 pnpm 版本。

```powershell
Set-Location frontend
corepack pnpm@10.12.1 install
corepack pnpm@10.12.1 verify
corepack pnpm@10.12.1 dev
```

打开 `http://127.0.0.1:5173/?demo=1` 可看内置模型；首页的“本地预览”面板可直接加载 OBJ、STL、RVM。浏览器公开配置以 [frontend/.env.example](D:/work/rvm-viewer/frontend/.env.example) 为准，不能写入令牌、Cookie 或平台密钥。

## 部署与 AIDT 包

先确定最终的 HTTPS 静态站地址，再生成发布物。命令会构建前端，将部署目录和已配置 viewer 地址的天赋包都生成到被忽略的 `tmp/aidt-release/`，不会修改源码中的占位地址。

```powershell
Set-Location frontend
corepack pnpm@10.12.1 prepare:aidt -- --viewer-url https://viewer.example.com/
```

将生成目录中的 `viewer/` 发布到该 HTTPS 地址；将 `agent/` 压缩后上传为 AIDT 天赋。详见 [agent/README.md](D:/work/rvm-viewer/agent/README.md)。在此之后，需要实际运行三项平台验收：OBJ payload、OBJ postMessage、RVM/ATT fileref。

## 目录与 Git 规则

| 路径 | 是否纳入 Git | 用途 |
| --- | --- | --- |
| `frontend/` | 是 | 可部署的 viewer 源码、测试、配置和锁文件 |
| `agent/` | 是 | 天赋定义与可复现的打包脚本源码 |
| `scripts/` | 是 | 可复现的发布准备流程 |
| `docs/` | 是 | 架构、集成约束和审查记录 |
| `tmp/` | 否 | 临时资料、调试脚本、日志、截图、浏览器 profile、构建/发布产物 |

根目录不再保留 `tools/`。一次性辅助代码不应进入版本历史；真正会影响交付、需要他人重复执行的自动化才属于受控源码。

## 已知外部风险

平台预览页到平台文件服务的同源读取已有调研证据，但“外部 HTTPS viewer 使用绝对 AIDT 文件 URL 并携带登录态”的 CORS、Cookie SameSite 和平台 sandbox 组合尚未在真实 AIDT 会话中验证。部署后若该请求被拦截，需要平台提供允许的文件代理/CORS 策略；这不是前端静态构建可单独解决的问题。
