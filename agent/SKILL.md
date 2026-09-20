---
name: rvm-viewer-v3
description: 用户上传一个 .rvm 工业模型及可选 CADC 属性文件并要求在 AIDT 聊天中查看时，生成指向已部署 RVM Viewer 的薄 HTML，并用 send_file_to_user 发送该 HTML。
license: MIT
---

# RVM Viewer 天赋

## 适用范围

- 必须有一个 `.rvm` 文件，可同时处理一个 `.att`、`.attrib` 或 `.txt` CADC 属性文件。
- 不读取或嵌入模型及属性字节；不处理 OBJ、STL 或 RVT。
- 对 OBJ、STL、RVT、图片、视频、CAD 图纸（step/stp/dwg/dxf）的查看或格式转换请求
  （含"把 RVM 转成/导出成 OBJ、STL"），一律说明本天赋只做 RVM 聊天查看后拒绝；
  不为这类请求编写或运行转换、解析脚本。
- 生成的 HTML 必须由聊天预览打开，不能替代为本地文件链接或裸 iframe URL。

## 操作流程

1. 在运行时工作区确认用户最新上传的 RVM；若有属性文件，同时确认对应的 ATT、ATTRIB 或 TXT。
2. 执行以下命令。`<SKILL_DIR>` 是本天赋安装后的实际目录：

```bash
node "<SKILL_DIR>/scripts/pack_thin_html.mjs" \
  --file-ref "media/<uuid>_model.rvm" \
  --attrs-ref "media/<uuid>_model.txt" \
  --name "model.rvm" \
  --output "<工作区>/rvm-viewer.html"
```

   没有属性文件时省略 `--attrs-ref`。
3. 确认 stdout 返回 `{"ok":true,"mode":"rvm-fileref",...}`，并核对 `attrsRef` 是否符合输入。
4. 用 `send_file_to_user` 发送 `rvm-viewer.html` 本身，并说明从聊天预览打开。

## 问题回答规则

- 用户已拿到 viewer 后，模型结构、节点数量、专业代号等统计问题优先依据
  CADC 属性文件回答；属性文件没有的信息如实说明，引导用户在 viewer 中查看。
- 不为了回答问题去解析 `.rvm` 二进制、编写临时解析脚本或重跑打包命令；
  打包脚本只在"生成查看页"这一个目的下运行。
- 介绍 viewer 功能时只允许说以下实际存在的功能，不得添加剖切、线框切换、
  专业/区域过滤、颜色编码、多模型合并等未实现的能力；模型输入只支持
  一个 `.rvm` 加一个可选属性文件：

  - 三维视图：鼠标旋转、平移、缩放；定位选中节点、按当前视角适配、恢复等轴视图
  - 左侧结构树：层级展开收起、按名称查找节点、隔离显示某节点、恢复全部显示；
    树头部显示属性挂接统计（挂接数 · 未匹配数）
  - 右侧属性面板：点选节点显示其 CADC 属性与层级路径

## 交付规则

- 脚本优先以薄页的 `document.baseURI` 解析平台文件地址；平台未注入 base 时，
  从配置页 `/agents/<id>/...` 或普通聊天的 `agent_id` 查询参数推导工作区预览地址。
  不要手动修改生成 HTML。
- 薄页读取已部署 viewer 的入口并以嵌套 srcdoc 启动，注入模型/属性文件查询参数和部署目录
  Worker 地址，以兼容当前线上包。模型仍通过平台文件接口读取，不嵌入 HTML。
- 薄页顶部状态条仅用于连接、读取和启动错误。收到可信的渲染成功回执后，状态条自动
  收起，页面显示 viewer 自身的三维画布、模型结构树、节点属性面板和相机工具，不保留
  重复状态栏。
- 当前验收环境为 AIDT 与 viewer 同源部署；不同域名需要另行验证 CORS 和登录权限。
- 默认 viewer 地址由发布流程写入天赋副本。若脚本报告地址仍是占位符，应要求部署者
  先用 HTTPS 地址重新生成发布包，不要绕过地址校验。
- 页面长期未加载时，用户可点击薄页顶部的“重试”。应先确认 viewer 服务在线，以及
  用户是从 AIDT 聊天预览打开；再排查平台文件请求的认证和 CORS 错误。
