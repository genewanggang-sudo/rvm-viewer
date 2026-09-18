---
name: rvm-viewer
description: 用户上传一个 .rvm 工业模型并要求在 AIDT 聊天中查看时，生成指向已部署 RVM Viewer 的薄 HTML，并用 send_file_to_user 发送该 HTML。
license: MIT
---

# RVM Viewer 天赋

## 适用范围

- 仅处理用户上传的 `.rvm` 文件。
- 不读取或嵌入模型字节；不处理 OBJ、STL、RVT 或 CADC `.txt`。
- 生成的 HTML 必须由聊天预览打开，不能替代为本地文件链接或裸 iframe URL。

## 操作流程

1. 在运行时工作区确认用户最新上传的 RVM，路径形如 `media/<uuid>_<原文件名>.rvm`。
2. 执行以下命令。`<SKILL_DIR>` 是本天赋安装后的实际目录：

```bash
node "<SKILL_DIR>/scripts/pack_thin_html.mjs" \
  --file-ref "media/<uuid>_model.rvm" \
  --name "model.rvm" \
  --output "<工作区>/rvm-viewer.html"
```

3. 确认 stdout 返回 `{"ok":true,"mode":"rvm-fileref",...}`。
4. 用 `send_file_to_user` 发送 `rvm-viewer.html` 本身，并说明从聊天预览打开。

## 交付规则

- 脚本优先以薄页的 `document.baseURI` 解析平台文件地址；平台未注入 base 时，
  从配置页 `/agents/<id>/...` 或普通聊天的 `agent_id` 查询参数推导工作区预览地址。
  不要手动修改生成 HTML。
- 薄页读取已部署 viewer 的入口并以嵌套 srcdoc 启动，注入文件查询参数和部署目录
  Worker 地址，以兼容当前线上包。模型仍通过平台文件接口读取，不嵌入 HTML。
- 当前验收环境为 AIDT 与 viewer 同源部署；不同域名需要另行验证 CORS 和登录权限。
- 默认 viewer 地址由发布流程写入天赋副本。若脚本报告地址仍是占位符，应要求部署者
  先用 HTTPS 地址重新生成发布包，不要绕过地址校验。
- 页面长期未加载时，用户可点击薄页顶部的“重试”。应先确认 viewer 服务在线，以及
  用户是从 AIDT 聊天预览打开；再排查平台文件请求的认证和 CORS 错误。
