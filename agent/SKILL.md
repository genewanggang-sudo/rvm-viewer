---
name: rvm-viewer
description: 用户上传 .obj/.stl 三维模型时，解析几何并生成指向 RVM Viewer 的"薄 HTML"（小模型走 URL payload，大模型走 postMessage）；上传 .rvm/.att（AVEVA PDMS/E3D 评审模型）时生成文件引用型薄 HTML（前端通过 RVM Worker/WASM 拉取并解析工作区原文件）；上传 .rvt 时返回格式转换指引。用 send_file_to_user 发给用户在聊天内预览。
license: MIT
---

# rvm-viewer（模型查看器天赋）

## 何时使用

- 用户上传 `.obj` / `.stl` 并要求解析、显示、预览 → **流程 A：解析打包**（payload/postmsg 模式）。
- 用户上传 `.rvm`（可带 `.att`）→ **流程 A2：文件引用打包**（fileref 模式，原文件不进 HTML）。
- 用户上传 `.rvt`（或询问 RVT 怎么处理）→ **流程 B：RVT 指引**。

## 用户上传文件在哪里（重要）

用户上传的文件自动落在运行时工作区：

```
media/<uuid>_<原始文件名>
```

- 同名文件多次上传会各自占一个 uuid 前缀，**取最新上传的一份**（`ls -t media/*_<原名> | head -1`）；
- 把 `media/` 下的**相对路径**（含 uuid 前缀的文件名）原样传给打包脚本的 `--file-ref` / `--att` 参数；
- 用户说"刚才传的/最新的那个"时，按上传时间排序确认；不确定就把候选路径列给用户确认。

## 流程 A：解析打包（.obj/.stl）

1. 在工作区里找到用户最新上传的附件的绝对路径（用 `ls`/文件列表确认）。
2. 运行打包脚本（把 `<SKILL_DIR>` 替换为本天赋在运行时的实际目录）：

```bash
node "<SKILL_DIR>/scripts/pack_thin_html.mjs" --input "<附件绝对路径>" --output "<工作区>/viewer_output.html"
```

3. 脚本 stdout 输出一行 JSON，例如：
   `{"ok":true,"format":"OBJ","vertices":8,"triangles":12,"output":"...","mode":"payload","htmlBytes":...}`
   - `mode:"payload"` — 小模型，几何已在链接里，viewer 打开即渲染；
   - `mode:"postmsg"` — 大模型，打开后由页面自动向 viewer 注入几何。
4. 成功后：用不超过 3 句话向用户说明解析结果（格式、顶点数、三角面数），然后**立即用 `send_file_to_user` 发送 `viewer_output.html`**。

## 交付纪律（流程 A / A2 通用，硬规则）

- 必须用 `send_file_to_user` 发送 HTML 文件本身；不要用 `file://`、`localhost`、外部 CDN 或裸 iframe 链接代替发文件；
- 脚本已内置校验：viewer 地址必须是 `https://`（`http://127.0.0.1/*` 仅限本地联调）。如脚本报地址错误，检查天赋脚本顶部的 `DEFAULT_VIEWER_URL` 配置，不要手工拼接地址绕过；
- 不要修改脚本输出、不要在 HTML 外再补一段 postMessage 代码——数据通道由脚本自动选择并保证唯一性（URL 带 payload/file 后 viewer 会忽略后续消息）；
- 用户反馈"打不开/一直转圈"时：告诉用户点页面顶部的"重试"按钮，并检查 viewer 服务是否在线；fileref 模式则确认用户是从聊天预览打开的；不要重新发明发送逻辑。

## 流程 A2：文件引用打包（.rvm / .att）

`.rvm`（AVEVA PDMS/E3D 评审模型）通常体积很大，**不要读内容、不要内嵌**，只传引用：

```bash
node "<SKILL_DIR>/scripts/pack_thin_html.mjs" \
  --file-ref "media/<uuid>_model.rvm" \
  --att "media/<uuid>_model.att" \
  --name "model.rvm" \
  --output "<工作区>/viewer_output.html"
```

1. `--file-ref` 填 `media/` 下最新上传的 `.rvm` 相对路径；`--att` 可选（有就带上）。
2. 脚本输出 `mode:"fileref"`，交付件只有几 KB。
3. 向用户说明：模型已生成引用，**请从聊天内预览打开**（此交付件依赖登录态拉取文件，另存到本地打不开）。页面会按预览页的基地址把 `media/` 路径解析为绝对平台文件地址。
4. 用 `send_file_to_user` 发送 HTML。

## 流程 B：RVT 指引（.rvt）

`.rvt` 是 Autodesk Revit 专有二进制格式，浏览器（纯前端）和 Node 运行时都无法直接解析。此时：

1. **不要**运行打包脚本，**不要**假装解析了 RVT。
2. 向用户说明转换路径，要点：
   - 纯前端显示的可行路线是"先转换、后显示"：在 Revit 中 `文件 → 导出 → IFC/FBX`，或用转换工具得到 `.ifc` / `.obj` / `.glb`；
   - IFC 保留 BIM 语义（构件类型/属性），OBJ/GLB 仅几何与外观；
   - 转换后的 `.obj` / `.stl` 直接上传到本对话，本天赋即可打包显示。
3. 如需在浏览器中直接解析 BIM 语义，可建议使用 web-ifc（WASM）方案加载 IFC，这是纯前端可完成的。

## 边界

- `.obj` / `.stl` → 流程 A；`.rvm` / `.att` → 流程 A2；`.rvt` → 流程 B 指引；其余格式提示用户先转换。
- 不访问外网、不依赖 npm 安装；脚本仅用 Node 标准库。
- 解析打包（--input）单文件建议 < 50MB，更大的先让用户做减面/简化处理；`.rvm` 一律走 A2 引用模式，不解析、不内嵌。
