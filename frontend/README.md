# RVM Viewer 前端

纯静态 React 18 查看器。three.js 负责画布与相机，`public/rvmsdk/` 中的
Worker/WASM 在后台解析 `.rvm` 并生成 GLB 预览场景。

## 数据入口

- 本地开发页在 `.env.development` 开启时显示左侧文件选择和测试模型入口；中央画布无模型时保持空白。
- 用户可选择一个 `.rvm`，同时选择一个 `.att`、`.attrib` 或 `.txt` 属性文件。
- 开发样本：仅 Vite 开发服务器提供 `tmp/testdata/WD1-PSUP.RVM` 和 `WD1-PSUP.txt`，
  生产不显示入口。
- 平台页：`?file=<绝对 RVM URL>&attrs=<可选属性 URL>&name=<显示名>&embed=1`。
  `name` 只作为界面显示名；WASM 解析仍使用 RVM URL 的 `.rvm` 文件名。嵌入模式只隐藏本地
  文件和测试模型入口，仍显示三维画布、结构树、属性面板和相机工具，并在成功渲染后向父页发送
  `rvm-viewer:rendered` 回执。

加载成功后，WASM 会话保持打开，左侧层级树通过节点 `segments` 查询右侧属性。
换模型或卸载页面时关闭会话。属性文件按节点名挂接，界面保留原始属性名和值，并显示
`attached` 和 `missed` 统计；没有属性文件时仍可浏览模型层级。没有颜色信息的几何使用默认
`#B9C7D1`，有颜色、纹理或顶点色的几何保持原始外观。

## 本地检查

```powershell
corepack pnpm@10.12.1 install
corepack pnpm@10.12.1 verify
corepack pnpm@10.12.1 dev
```

`verify` 依次运行 Prettier、ESLint、严格 TypeScript、100% 类型覆盖、Vitest 覆盖率
和生产构建。Vite 默认监听 `http://127.0.0.1:5173/`。

## 环境配置

| 模式        | 配置文件           | 访问路径              | 开发入口 |
| ----------- | ------------------ | --------------------- | -------- |
| development | `.env.development` | `/`                   | 显示     |
| production  | `.env.production`  | `/sample/rvm-viewer/` | 隐藏     |

两份团队配置由 Git 管理。个人覆盖使用 `.env.local`、`.env.development.local` 或
`.env.production.local`，这些文件均被 Git 忽略。`VITE_RVM_ENABLE_DEV_UI` 还受
`import.meta.env.DEV` 约束，因此生产构建即使误配为 `true` 也不会显示调试入口。

## 部署

```powershell
corepack pnpm@10.12.1 build
```

发布 `dist/` 的全部文件到 HTTPS 静态站 `/sample/rvm-viewer/` 子路径。服务器必须
正确返回 `.wasm` 的 `application/wasm` MIME 类型，并允许 Worker 从同一子路径的
`rvmsdk/` 加载运行时资源。AIDT 发布目录请使用根目录的 `prepare:aidt` 脚本生成。
