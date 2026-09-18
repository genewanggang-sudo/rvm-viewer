# AIDT 天赋包

这里保存可复现的天赋源码：`SKILL.md` 和单 RVM 薄 HTML 生成脚本。任何 ZIP、模型、
截图或发布产物都应留在根 `tmp/`，不进入 Git。

## 当前平台入口

本项目智能体为「RVM 模型查看器」，ID `cr36T4`，唯一启用天赋 `rvm-viewer-v3`。
普通聊天：<https://www.czy3d.com/aidt/chat?agent_id=cr36T4>。
配置页：<https://www.czy3d.com/aidt/agents/cr36T4/configure>。
上传一个 `.rvm` 后发送“请加载并显示我上传的 RVM 文件”，在对话中打开返回的 HTML。
已登录用户、`qwen3.8-max` 和同源 viewer 的普通聊天链路已真实验证；智能体未公开发布。

「RVT联调测试-测完删」（`iSQtvy`）是旧 OBJ/STL/RVT 联调项，不是本项目入口。

## 生成发布包

先部署或预留一个 HTTPS viewer 地址，然后运行：

```powershell
Set-Location frontend
corepack pnpm@10.12.1 prepare:aidt -- --viewer-url https://viewer.example.com/
```

`tmp/aidt-release/<timestamp>/` 中的 `viewer/` 用于静态部署，`agent/` 是已写入真实
viewer 地址的天赋包副本，`manifest.json` 记录文件 SHA-256。

## 本地检查

```powershell
node scripts/pack_thin_html.mjs `
  --file-ref "media/demo.rvm" `
  --output ..\tmp\rvm-shell.html `
  --viewer-url http://127.0.0.1:5173/
```

薄页不会携带模型字节。优先使用平台注入的 `document.baseURI`；缺少 base 时，
从父页面 `/agents/<id>/...` 或聊天的 `agent_id` 查询参数推导工作区文件接口。
它读取部署的 viewer 入口，以嵌套
srcdoc 启动并注入文件查询参数、正确的 Worker 部署目录，兼容当前线上旧包。

当前验证环境为 AIDT 与 viewer 同源（`www.czy3d.com`）。真实验收必须在平台登录态
执行；不同域名的部署还需要验证入口 CORS、Worker 同源限制和平台文件 Cookie 权限。
