# RVM Viewer 前端

纯静态 React viewer。构建产物可以部署到任意 HTTPS 静态托管；它没有自己的后端和上传接口。

## 技术边界

- React 18 管理 UI，three.js `ViewerEngine` 管理 WebGL 生命周期与资源释放。
- OBJ、ASCII/Binary STL 在浏览器中解析；RVM 交给 `public/rvmsdk/` 中的 Worker/WASM 运行时生成预览场景。
- 所有 TypeScript 均开启严格检查；`pnpm verify` 依次执行格式、lint、类型、100% type coverage、测试覆盖和构建。

## 数据入口

| 优先级 | 入口                         | 用途                                                           |
| ------ | ---------------------------- | -------------------------------------------------------------- |
| 1      | `?payload=<base64url(JSON)>` | 小型几何数据                                                   |
| 2      | `?file=<URL>[&att=<URL>]`    | 文件缓冲区；可以是 AIDT 文件的绝对 URL，也可以是同源 JSON 文件 |
| 3      | `?demo=1`                    | 内置演示模型                                                   |
| 4      | 父窗口 `postMessage`         | 较大 OBJ/STL 的几何注入                                        |

带 `payload` 或 `file` 时通道独占，忽略后续 `postMessage`。`file` 加载使用 `credentials: 'include'`；真实 AIDT 预览还取决于平台的跨域策略和登录 Cookie。

首页默认显示本地上传面板，支持 `.obj`、`.stl`、`.rvm` 和可选 `.att/.txt`。`?embed=1` 隐藏外围 UI，供嵌入场景使用。

## 开发

```powershell
corepack pnpm@10.12.1 install
corepack pnpm@10.12.1 verify
corepack pnpm@10.12.1 dev
```

Vite 固定监听 `127.0.0.1:5173`。浏览器公开配置参考 [.env.example](D:/work/rvm-viewer/frontend/.env.example)：`VITE_RVM_VIEWER_TITLE`、`VITE_RVM_ENABLE_LOCAL_UPLOAD`、`VITE_RVM_MAX_LOCAL_FILE_MB`。不要在 `.env` 中放任何秘密信息。

## 部署

```powershell
corepack pnpm@10.12.1 build
```

上传 `dist/` 的全部内容到 HTTPS 静态站，然后访问 `/?demo=1`。生成 AIDT 发布目录请从本目录执行：

```powershell
corepack pnpm@10.12.1 prepare:aidt -- --viewer-url https://viewer.example.com/
```

此命令的生成物位于根目录 `tmp/aidt-release/`，不会提交到 Git。
