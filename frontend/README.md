# RVM Viewer 前端

纯静态 React 18 查看器。three.js 负责画布与相机，`public/rvmsdk/` 中的
Worker/WASM 在后台解析 `.rvm` 并生成 GLB 预览场景。

## 数据入口

- 本地页：用户选择一个 `.rvm` 文件。
- 开发样本：仅 Vite 开发服务器提供 `tmp/testdata/WD1-PSUP.RVM`，生产不显示入口。
- 平台页：`?file=<绝对 RVM URL>&name=<显示名>&embed=1`。嵌入模式不显示本地控件，
  并在成功渲染后向父页发送 `rvm-viewer:rendered` 回执。

`.txt` CADC 属性文件不是当前输入协议的一部分；它不影响基本的几何预览。

## 本地检查

```powershell
corepack pnpm@10.12.1 install
corepack pnpm@10.12.1 verify
corepack pnpm@10.12.1 dev
```

`verify` 依次运行 Prettier、ESLint、严格 TypeScript、100% 类型覆盖、Vitest 覆盖率
和生产构建。Vite 默认监听 `http://127.0.0.1:5173/`。

## 部署

```powershell
corepack pnpm@10.12.1 build
```

发布 `dist/` 的全部文件到 HTTPS 静态站根路径。服务器必须正确返回 `.wasm` 的
`application/wasm` MIME 类型，并允许 Worker 加载同目录 `rvmsdk/` 运行时资源。
AIDT 发布目录请使用根目录的 `prepare:aidt` 脚本生成。
