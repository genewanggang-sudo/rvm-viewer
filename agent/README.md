# AIDT 天赋包

这个目录只保留可复现的天赋源码：`SKILL.md` 和 `scripts/pack_thin_html.mjs`。已生成的 ZIP 不属于源码，统一放在根目录被忽略的 `tmp/`。

## 生成发布包

先确定前端将发布到的 HTTPS URL，在仓库中运行：

```powershell
Set-Location frontend
corepack pnpm@10.12.1 prepare:aidt -- --viewer-url https://viewer.example.com/
```

命令会在 `tmp/aidt-release/<timestamp>/` 生成：

- `viewer/`：部署到该 HTTPS 静态站的构建产物；
- `agent/`：已经写入该 viewer URL 的天赋源码副本；
- `manifest.json`：文件清单和 SHA-256 校验值。

压缩生成目录中的 `agent/` 后上传到 AIDT。源码中的 `DEFAULT_VIEWER_URL` 占位符不会被改写，因此不会把环境地址或临时发布物提交到 Git。

## 本地联调

```powershell
Set-Location frontend
corepack pnpm@10.12.1 dev

node ../agent/scripts/pack_thin_html.mjs `
  --input C:\path\to\model.obj `
  --output ..\tmp\thin.html `
  --viewer-url http://127.0.0.1:5173/
```

打开 `tmp/thin.html` 可验证 OBJ/STL 的 payload 或 postMessage 路径。RVM `--file-ref` 依赖 AIDT 的预览页、文件服务和登录态，不能以本地文件方式等价验证。

## 文件引用模式

对 `.rvm`（可选 `.att`）使用 `--file-ref "media/<uuid>_model.rvm"`。生成的薄 HTML 在预览页中将相对 `media/` 路径根据 `document.baseURI` 解析为绝对平台文件 URL，再附加到 viewer iframe。该动作避免外部静态 viewer 将路径误解析到自身域名。

真正的 AIDT E2E 仍要验证外部 viewer 是否获准跨域携带登录态读取该绝对 URL；见根 README 的风险说明。
