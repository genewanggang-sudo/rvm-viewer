# AVEVA Review 风格 RVM 属性浏览实施方案

- 日期：2026-09-18
- 状态：已实施（本地与发布构建验证通过，线上 AIDT 待重新发布）
- 目标：在现有 RVM Viewer 中增加模型层级树和节点属性浏览，并支持将 CADC 属性文件按节点名挂接到 RVM 场景

## 1. 结论

“按节点名挂接 RVM 属性”表示：读取与 RVM 配套的 CADC 属性文件，以每条 `NEW <节点名>`
记录中的节点名匹配 RVM 场景节点，再把该记录下的名称和值关联到匹配节点。它不是在每个节点上显示一个
名为“RVM 属性”的布尔字段，也不是根据显示路径拼接文本。

本次参考 AVEVA Review 的 Explorer 和 Data Viewer 工作方式，采用以下界面：

- 左侧“模型结构”显示 RVM 原始层级树；
- 中央保留现有 three.js 三维视图；
- 右侧“属性”显示当前树节点的原始属性名和值；
- 树节点选择后立即查询该节点属性，空属性节点显示明确空状态；
- 加载属性文件后显示成功挂接数和未匹配数；
- 本地开发支持一个 `.rvm` 和一个可选 `.att`、`.attrib` 或 `.txt` 属性文件；
- URL/AIDT 通道增加可选 `attrs` 文件引用，未提供属性文件时仍可浏览 RVM 自带属性和层级。

本次不根据节点名称猜测三维对象与 RVM 节点的对应关系。只有 SDK 或 GLB 明确提供从三维对象到
`segments` 的可靠映射后，才实现“三维点选反向选中树节点”。

## 2. 调研依据

### 2.1 AVEVA Review 6.2

本地调研资料：`tmp/pdfs/aveva-review-6.2-user-manual.pdf`。

- 手册 PDF 第 21 页说明 Explorer 以 PDMS 元素层级显示模型，可展开层级并定位元素；
- 手册 PDF 第 169 至 173 页说明 Data Viewer 可读取属性文本，显示全部条目或按当前 Review
  选择过滤，并可由数据行定位元素；
- Explorer、三维视图和搜索/数据结果共享当前选择，这是 Review 的主要浏览模型。

因此本项目应把“结构”和“属性”作为查看器常驻工作区，而不是把属性放到上传成功提示或独立弹窗中。

### 2.2 Autodesk Navisworks RVM Reader

Autodesk 官方文档补充了行业中常见的 RVM 属性导入规则：

- RVM Reader 支持二进制和 ASCII RVM；
- 可配套读取 `.att`、`.attrib`、`.txt` 属性文件；
- 属性按场景元素名称匹配，未找到对应元素的属性记录会计入未匹配；
- 默认可查找与模型同名的属性文件；
- Properties Window 是随当前选择变化的可停靠属性面板。

官方资料：

- [RVM File Reader](https://help.autodesk.com/cloudhelp/2026/ENU/Navisworks/files/GUID-8C4487C7-7DD0-457D-BC08-B3628F33C173.htm)
- [Use File Readers](https://help.autodesk.com/cloudhelp/2023/ENU/Navisworks/files/GUID-F495CE91-9C5B-43EB-93CD-A320C053DF22.htm)
- [Properties Window](https://help.autodesk.com/cloudhelp/2023/ENU/Navisworks/files/GUID-DE27B147-B234-4AFE-8E2C-ACA82120A253.htm)

这属于软件行为惯例，不构成统一的 RVM 属性字段标准。不同来源可以使用不同属性名，查看器应保留
`RefNo`、`Type`、`Position`、`Orientation`、`Description`、`Tag`、`Discipline`、
`Matref`、`Spref` 等原始名称和值，不擅自翻译、合并或改写。

### 2.3 当前 WASM SDK

仓库内 SDK 已提供实现所需能力：

| 接口 | 用途 |
| --- | --- |
| `open({ name, bytes, attrs? })` | 打开 RVM，并可在打开时挂接属性字节 |
| `tree({ handle })` | 返回递归场景树，节点含 `name`、`path`、`segments`、`propertyCount`、`children` |
| `getProperties({ handle, segments })` | 按稳定节点路径读取属性列表 |
| `attachAttributes({ handle, bytes })` | 为已打开会话追加 CADC 属性，返回 `attached`、`missed` |
| `preview({ handle })` | 生成 GLB 三维预览 |
| `close({ handle })` | 释放 WASM 会话 |

`segments` 是节点寻址键，`path` 只用于显示。当前适配器在生成 GLB 后立即关闭 handle，导致后续
无法查询树和属性，实施时必须改为模型会话生命周期内保留 handle。

### 2.4 真实样本

固定验收样本：

- `tmp/testdata/WD1-PSUP.RVM`：1,193,280 字节；
- `tmp/testdata/WD1-PSUP.txt`：2,400,946 字节；
- TXT 有 8,150 个 `NEW` 条目，扣除 Header 后有 8,149 条属性节点记录；
- 当前 SDK 验证结果：RVM 树有 4,677 个节点、2,628 个实体，4,084 个节点成功挂接属性。

属性记录数大于 RVM 树节点数是正常情况，未匹配记录必须作为诊断结果显示，不能把它当作整个模型
加载失败。

## 3. 产品交互

### 3.1 桌面布局

模型加载成功后，查看器使用三栏工作区：

```text
┌──────────────┬───────────────────────────────┬──────────────────┐
│ 模型结构     │                               │ 属性             │
│ ▾ WD1-PSUP   │          三维视图             │ 节点名称         │
│   ▸ 0001     │                               │ 路径             │
│   ▾ 0002     │                               │ 属性名    值     │
│     PLATE... │                               │ RefNo     ...    │
└──────────────┴───────────────────────────────┴──────────────────┘
```

- 左栏宽 280px，右栏宽 320px，中间画布占剩余空间；
- 面板使用现有深色查看器风格，面板本身不做装饰性卡片；
- 树默认只展开根节点，避免一次渲染 4,677 个可见行；
- 有子节点的行使用展开/收起图标；整行可选中；
- 当前节点保持高亮，并在右栏显示节点名和完整路径；
- 属性按 SDK 返回顺序展示，名称列固定宽度，长值换行且可选择复制；
- 没有属性文件时仍显示树；没有属性的节点显示“此节点没有属性”。
- 三维预览对没有颜色信息的几何使用默认浅冷灰蓝色 `#B9C7D1`；模型自带颜色、纹理和顶点色保持不变。
- 渲染器使用 sRGB 输出、ACES 色调映射、环境光和补光，保证无颜色的工业几何在深色背景上保持轮廓可见。

### 3.2 小屏布局

宽度不超过 900px 时，结构和属性改为覆盖式侧栏，各自使用工具栏图标打开，任何时刻最多打开一侧，
中央画布保持可操作。按钮使用图标和可访问标签，侧栏内容不与状态栏、相机工具重叠。

### 3.3 文件选择

开发文件面板增加第二个可选文件：

- 模型：必选，只接受 `.rvm`；
- 属性：可选，接受 `.att`、`.attrib`、`.txt`；
- “加载模型”一次提交两个文件；
- 测试入口同时加载固定 RVM 和 TXT，确保开发验收覆盖属性挂接。

属性文件扩展名只作为输入筛选，实际解析由 WASM 完成。解析失败显示具体错误，旧模型会话继续保留到
新模型成功建立或明确关闭，避免中途出现泄漏。

### 3.4 挂接状态

加载完成后在结构面板显示简洁诊断：

```text
属性挂接 4,084 · 未匹配 4,065
```

其中：

- `attached` 表示成功关联到场景节点的属性记录数；
- `missed` 表示属性文件中没有找到同名场景节点的记录数；
- 未提供属性文件时显示“未加载外部属性”；
- `missed > 0` 是可检查的数据质量信息，不阻止查看模型和已匹配属性。

## 4. 数据与生命周期设计

### 4.1 会话对象

`rvmSdk.ts` 将一次导入封装为 `RvmModelSession`：

```ts
interface RvmModelSession {
  object: THREE.Object3D;
  meta: RvmMeta;
  tree: RvmTreeNode;
  getProperties(segments: string[]): Promise<RvmProperty[]>;
  close(): Promise<void>;
}
```

创建顺序：

1. `open` RVM，可选传入属性字节；
2. 并行调用 `preview` 和 `tree`；
3. 解析 GLB，返回会话；
4. 任一步失败都关闭刚创建的 handle；
5. 成功后由 `useViewer` 持有会话；
6. 换模型、组件卸载或新结果过期时关闭旧/过期会话。

`close()` 必须幂等。属性查询发生在活跃会话上；如果用户快速切换节点，过期请求结果不得覆盖较新的
选择。

### 4.2 React 状态

`useViewer` 增加：

- `tree`：当前模型树；
- `selectedNode`：当前选中节点，加载后默认根节点；
- `properties`：当前节点属性；
- `propertyPhase`：`idle | loading | loaded | error`；
- `attributeStats`：外部属性是否加载及 `attached/missed`；
- `selectNode(node)`：更新选择并读取属性。

树节点只保存 SDK 返回的不可变数据。展开状态属于 Explorer 组件的局部 UI 状态，不进入 WASM 会话。

### 4.3 数据通道

URL 协议扩展为：

```text
?file=<RVM URL>&attrs=<可选属性文件 URL>&name=<显示名>&embed=1
```

RVM 与属性文件并行拉取，均使用 `credentials: 'include'`。`attrs` 存在但拉取失败时必须报错，不能悄悄
以无属性模式继续，否则用户会误以为文件中没有属性。

AIDT 薄页在上传文件中识别一个 RVM 和一个可选属性文件，将两个工作区引用分别传给 viewer。
没有属性文件时保持现有单 RVM 工作流。

## 5. 失败处理

| 场景 | 行为 |
| --- | --- |
| RVM 扩展名不支持 | 在拉取/读取前拒绝 |
| 属性扩展名不支持 | 在拉取/读取前拒绝，并列出支持格式 |
| 属性文件拉取失败 | 整次 URL 加载失败并显示 HTTP/网络原因 |
| 属性解析失败 | 新会话关闭，显示 WASM 错误 |
| GLB 预览或树读取失败 | 新会话关闭，不替换当前成功模型 |
| 节点属性查询失败 | 保留模型和选择，在属性栏显示查询错误 |
| 快速换模型/卸载 | 关闭过期会话，不更新已卸载组件 |
| `missed > 0` | 模型正常加载，显示未匹配计数 |

## 6. 实施范围

需要修改：

| 文件/模块 | 修改内容 |
| --- | --- |
| `frontend/src/viewer/rvmSdk.ts` | 引入长生命周期会话、树和属性查询、幂等关闭 |
| `frontend/src/hooks/useViewer.ts` | 管理会话、树选择、属性请求和清理 |
| `frontend/src/channels/dataChannels.ts` | 支持可选 `attrs` URL 并行拉取 |
| `frontend/src/protocol.ts` | 增加 `attrs` 查询参数 |
| `frontend/src/viewer/localModel.ts` | 校验和读取可选属性文件 |
| `frontend/src/components/LocalFileLoader.tsx` | 增加属性文件选择 |
| `frontend/src/components/ModelExplorer.tsx` | 新增可展开模型树和挂接统计 |
| `frontend/src/components/PropertiesPanel.tsx` | 新增当前节点属性表和状态 |
| `frontend/src/App.tsx`、`global.css` | 组装响应式三栏工作区 |
| `frontend/vite.config.ts` | 开发模式同时提供测试 TXT |
| `agent/scripts/pack_thin_html.mjs` | 识别并传递可选属性文件引用 |
| `agent/README.md`、`agent/SKILL.md` | 说明支持的上传组合和行为 |
| `frontend/test/*` | 覆盖会话、通道、选择、组件和清理行为 |

## 7. 明确不做

- 不把 CADC 字段映射成自定义中文字段或新的业务分类；
- 不实现属性编辑、删除或导出；
- 不实现属性搜索和条件过滤；
- 不用节点名启发式实现三维点选联动；
- 不修改 RVM/WASM 二进制格式；
- 不引入后端服务或把模型上传到第三方。

## 8. 验收标准

### 8.1 自动化

运行：

```powershell
Set-Location frontend
corepack pnpm@10.12.1 verify
```

必须通过格式、ESLint、TypeScript、100% 类型覆盖、测试覆盖和生产构建。关键断言包括：

- 成功会话在浏览期间不关闭，换模型和卸载时关闭且只关闭一次；
- 预览、树或 GLTF 解析失败时仍关闭 handle；
- `segments` 原样用于属性查询；
- 过期属性请求不会覆盖新选择；
- URL 通道正确传入可选属性字节，并处理属性拉取失败；
- 本地选择器正确接受三种属性扩展名；
- Explorer 展开、收起、选择和空属性状态可用；
- 生产构建不包含测试数据。

### 8.2 真实样本

用 `WD1-PSUP.RVM + WD1-PSUP.txt` 验证：

- 模型保持现有渲染结果：134,012 个顶点、106,096 个三角面；
- 树显示 4,677 个节点，根节点默认选中；
- 显示 4,084 个成功挂接节点及对应未匹配数；
- 选择有属性节点可看到真实 `RefNo`、`Position`、`Orientation` 等值；
- 选择无属性节点显示空状态，页面不报错；
- 反复换模型后 Worker/WASM 中不残留旧 handle；
- 桌面和窄屏下，树、画布、属性和工具按钮互不遮挡。

## 9. 实施顺序

1. 先完成会话对象和 SDK 单元测试，保证 handle 生命周期正确；
2. 扩展本地与 URL 数据通道，打通属性字节输入；
3. 在 hook 中接入树、选择和属性请求；
4. 实现 Explorer、属性面板和响应式布局；
5. 扩展 AIDT 薄页和说明；
6. 运行完整质量门禁；
7. 启动本地开发页，用真实样本完成浏览器验收。

## 10. 实施结果

2026-09-18 已按本方案完成：

- SDK 导入改为长生命周期会话，支持树、节点属性查询、幂等关闭以及失败/过期会话清理；
- 属性文件通过独立 `attachAttributes` 调用挂接，可显示准确的 `attached` 和 `missed`；
- 本地入口、测试入口、URL 通道和 AIDT 薄页均支持可选 ATT、ATTRIB、TXT；
- 桌面使用 280px Explorer、中央三维画布、320px 属性面板；900px 以下使用覆盖式侧栏；
- canvas 使用显式停靠尺寸和 `ResizeObserver`，桌面/窄屏切换时 WebGL 缓冲区跟随实际画布；
- Explorer 支持逐级展开和节点选择，属性面板显示原始 SDK 名称和值；
- `corepack pnpm@10.12.1 verify` 全部通过：66 个测试通过，类型覆盖和语句、分支、
  函数、行覆盖率均为 100%，生产构建成功；
- 真实 `WD1-PSUP.RVM + WD1-PSUP.txt` 浏览器验证结果为 134,012 个顶点、106,096 个
  三角面、4,677 个树节点、2,628 个实体、4,084 个成功挂接、4,065 个未匹配；
- 节点选择已验证可读取 `RefNo`、`Position`、`Orientation`、`Description`、
  `Discipline` 等真实属性；
- 桌面画布和 WebGL 缓冲区均为 838×1092；390×844 窄屏下画布和缓冲区均为
  390×802，两个侧栏默认收起且可独立打开。
- 已生成本地 AIDT 发布目录 `tmp/aidt-release/2026-09-18T02-59-14-058Z/`；打包后的薄页脚本
  已验证可同时写入 RVM 和 TXT 引用，未执行线上上传或覆盖。

本次没有实现三维对象反向选中树节点，因为现有 GLB 没有提供到 RVM `segments` 的可靠映射。
线上剩余步骤是重新部署 `frontend/dist/` 并上传更新后的 AIDT 天赋包，再在平台登录态验证
RVM 与属性文件的双文件权限。源码、发布构建和本地真实数据链路已经完成。
