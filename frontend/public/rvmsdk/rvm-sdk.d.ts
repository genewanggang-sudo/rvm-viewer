/**
 * rvm-sdk.d.ts — RVM wasm 能力层 TypeScript 声明（v0.4.0-stage3）
 *
 * **本文件由 cmd/sdkgen 自动生成，勿手改。**
 * 单一事实源是 server-go/internal/apischema（op 清单与文档）；
 * 稳定类型段维护在 cmd/sdkgen/main.go 的模板常量里。
 * 重新生成：cd server-go && ./gen-sdk-types.sh
 * 变更流程：改 bridge 绑定 → test-wasm.sh（parity 红）→ 更新 apischema
 * → 重新生成 → tsc 与 contract-test 复验（见 apischema 包注释）。
 *
 * 用法（二选一）：
 *   1. tsconfig.json 的 include/files 纳入本文件 → RvmRpc / RvmStore /
 *      newSessionId 成为全局类型（对应 <script> 经典脚本加载）；
 *   2. 模块侧引用数据类型：
 *      import type { TreeNode, NodeDetail } from "../dist/rvm-sdk";
 *
 * 完整字段与语义见 docs/api.md。
 */

/* ============================ 数据类型 ============================ */

/** open 的返回：场景句柄与初始统计。 */
export interface OpenInfo {
  handle: number;
  sourceFile: string;
  sourceFormat: string;
  nodeCount: number;
  entityCount: number;
  attributeNodeCount: number;
}

/** meta 的返回：计数按当前场景实时重算（编辑后调用反映最新状态）。 */
export interface MetaInfo {
  sourceFile: string;
  sourceFormat: string;
  nodeCount: number;
  entityCount: number;
  attributeNodeCount: number;
}

/** 场景树节点（tree 的返回，递归结构）。 */
export interface TreeNode {
  name: string;
  /** 从根下第一级起的节点名数组——一切按节点寻址的接口都用它。 */
  segments: string[];
  visible: boolean;
  excluded: boolean;
  entityCount: number;
  propertyCount: number;
  children: TreeNode[];
}

/** 节点材质详情（node 返回的 material 字段；无材质时为 null）。 */
export interface MaterialDetail {
  name: string | null;
  diffuse: number[] | null;
  emissive: number[] | null;
  metallic: number | null;
  roughness: number | null;
  transparency: number | null;
}

/** 节点详情（node 的返回）。 */
export interface NodeDetail {
  name: string;
  segments: string[];
  visible: boolean;
  excluded: boolean;
  entityCount: number;
  propertyCount: number;
  translation: [number, number, number];
  /** 顺序为 [w, x, y, z]。 */
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  material: MaterialDetail | null;
}

/** 节点子树的世界坐标 AABB（bbox 的返回；无几何时调用会报错）。 */
export interface BBox {
  min: [number, number, number];
  max: [number, number, number];
}

export type ExportFormat =
  | "rvm" | "rvmtxt" | "glb" | "gltf" | "obj"
  | "stl" | "stlascii" | "ply" | "plybin" | "png" | "html" | "pdf";

export interface ExportOptions {
  /** 仅 rvm/rvmtxt：附带 CADC 属性列表第二文件。 */
  attributes?: boolean;
  /** obj/stl/stlascii/ply/plybin：Z-up → Y-up。 */
  axisYUp?: boolean;
  /** gltf：缩进输出。 */
  prettyPrint?: boolean;
}

export interface ExportedFile {
  name: string;
  /** 出向字节（底层 buffer 已转移到主线程，可直接 Blob / GLTFLoader）。 */
  data: Uint8Array;
}

/** export 的返回：rvm/rvmtxt 带 attributes 时 files 含两个文件。 */
export interface ExportResult {
  format: ExportFormat;
  mime: string;
  ext: string;
  files: ExportedFile[];
}

export interface RenderOptions {
  /** 默认 1600。 */
  width?: number;
  /** 默认 1200。 */
  height?: number;
  transparent?: boolean;
  /** [r, g, b]，各 0..1。 */
  background?: [number, number, number];
}

/** patchNode 的材质入参（颜色为 0..1 数组，均可选）。 */
export interface MaterialPatchInput {
  name?: string;
  diffuse?: number[];
  emissive?: number[];
  metallic?: number;
  roughness?: number;
  transparency?: number;
}

/** 参数化基本体（createEntity 可选附带）。 */
export interface PrimitiveSpec {
  kind: number;
  params?: number[];
}

/** patchNode 的 body（按 op 判别）。segments 为目标节点路径（空数组 = 根）。 */
export type PatchBody =
  | { op: "rename"; segments: string[]; name: string }
  | { op: "create"; segments: string[]; name: string }
  | { op: "createEntity"; segments: string[]; name: string; primitive?: PrimitiveSpec }
  | { op: "delete"; segments: string[] }
  | { op: "visible"; segments: string[]; visible: boolean }
  | { op: "excluded"; segments: string[]; excluded: boolean }
  | {
      op: "transform"; segments: string[];
      translation?: [number, number, number];
      quaternion?: [number, number, number, number];
      scale?: [number, number, number];
    }
  | { op: "material"; segments: string[]; material: MaterialPatchInput }
  | { op: "merge"; segments: string[]; source: string[] };

export type MeshOpName =
  | "triangulate" | "generateNormal" | "analyze" | "splitByGroup"
  | "optimize" | "weld" | "smooth" | "subdivide" | "merge"
  | "transform" | "boolean" | "repair" | "simplify";

/**
 * meshOp 的 body。op 决定哪些字段有意义（字段表见 docs/api.md）：
 * boolean 用 a/b/mode/keepOperands；weld/repair 用 tolerance；
 * simplify 用 maxTriangles；transform 用 scale；其余以 segments 为目标。
 */
export interface MeshOpBody {
  op: MeshOpName;
  segments?: string[];
  a?: string[];
  b?: string[];
  mode?: "union" | "intersect" | "subtract";
  keepOperands?: boolean;
  tolerance?: number;
  maxTriangles?: number;
  scale?: [number, number, number];
  policy?: string;
}

/** 场景统计（undo/redo/meshOp 返回的 stats，键随操作类型不同）。 */
export interface SceneStats {
  [key: string]: number;
}

/** 历史条目（具体字段随操作类型，at/pending 为常见键）。 */
export interface HistoryEntry {
  op?: string;
  at?: number;
  pending?: boolean;
  [key: string]: unknown;
}

export interface HistoryInfo {
  canUndo: number;
  canRedo: number;
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}

/** undo / redo 的返回（失败时 error 与 history 并存，便于刷新按钮态）。 */
export interface UndoRedoResult {
  ok: boolean;
  undone?: number;
  redone?: number;
  history: HistoryInfo;
  stats: SceneStats;
  error?: string;
}

/** meshOp 的返回：result 形态随 op 不同（见 docs/api.md），stats 供 UI 刷新。 */
export interface MeshOpResult {
  result: unknown;
  stats: SceneStats;
}

export interface PropertyEntry {
  name: string;
  value: string;
}

/** attachAttributes 的返回。 */
export interface AttachResult {
  attached: number;
  missed: number;
}

/* ========================= 载荷辅助类型 ========================= */

/** open 的入参。bytes/attrs 传 ArrayBuffer 并放进 call 的 transfer 列表。 */
export interface OpenPayload {
  /** 文件名：扩展名决定格式识别。 */
  name: string;
  bytes: ArrayBuffer;
  /** 可选：RVM 的 CADC 属性 .txt / OBJ 的 .mtl。 */
  attrs?: ArrayBuffer;
}

export interface HandlePayload {
  handle: number;
}

export interface SegmentsPayload {
  segments: string[];
}

/* ============================ 持久化 ============================ */

/** store.get 的返回（完整记录，含快照字节）。 */
export interface SessionRecord {
  id: string;
  name: string;
  sourceFile: string;
  sourceFormat: string;
  nodeCount: number;
  entityCount: number;
  attributeNodeCount: number;
  createdAt: number;
  savedAt: number;
  snapshotBytes: number;
  /** export({format:"rvm", opts:{attributes:true}}) 产出的模型字节。 */
  rvm: Uint8Array;
  /** 属性列表字节（保存时无属性则缺省）。 */
  attr?: Uint8Array;
}

/** store.list 的返回（不含 rvm/attr 字节），按 savedAt 降序。 */
export type SessionMeta = Omit<SessionRecord, "rvm" | "attr">;

/* ========================= op 类型映射（生成） ========================= */

/**
 * rpc.call 的 op → payload/result 映射。
 * call("open", {...}) 即可获得对应返回类型的补全与检查。
 * 标注【长任务】的 op 在 rvm-rpc.js 中默认 180s 超时（其余 30s）。
 */
export interface RvmOps {
  /** 能力层版本号（ready() 的探针也用它）。 */
  version: { payload: void; result: string };
  /** 导入模型。bytes/attrs 传 ArrayBuffer 并放 transfer 列表；扩展名决定格式识别，.zip 不挂包内属性。【长任务】 */
  open: { payload: OpenPayload; result: OpenInfo };
  /** 释放句柄。重复导入/恢复前先释放旧的（泄漏用 handleCount 诊断）。 */
  close: { payload: HandlePayload; result: { ok: boolean } };
  /** 场景元数据；计数按当前场景实时重算，编辑后调用反映最新状态。 */
  meta: { payload: HandlePayload; result: MetaInfo };
  /** 当前活跃句柄数（泄漏诊断）。 */
  handleCount: { payload: void; result: number };
  /** 导出 GLB（export 的 glb 便捷口）。【长任务】 */
  exportGLB: { payload: HandlePayload; result: Uint8Array };
  /** 场景树（递归 TreeNode；寻址键是 segments）。 */
  tree: { payload: HandlePayload; result: { root: TreeNode } };
  /** 节点详情（quaternion 顺序 [w,x,y,z]）。 */
  node: { payload: HandlePayload & SegmentsPayload; result: NodeDetail };
  /** 子树世界坐标 AABB；无几何时报错。 */
  bbox: { payload: HandlePayload & SegmentsPayload; result: BBox };
  /** 多格式导出（12 格式）。rvm/rvmtxt 带 attributes 时产出双文件。【长任务】 */
  export: { payload: HandlePayload & { format: ExportFormat; opts?: ExportOptions }; result: ExportResult };
  /** 软件光栅渲染 PNG（不依赖 WebGL）。【长任务】 */
  render: { payload: HandlePayload & { opts?: RenderOptions }; result: Uint8Array };
  /** 面向 three.js 的预览 GLB（含法线）：GLTFLoader.parseAsync(glb.buffer, '')。【长任务】 */
  preview: { payload: HandlePayload; result: Uint8Array };
  /** 节点编辑（body 为 9 个 op 的判别联合，见 PatchBody）。 */
  patchNode: { payload: HandlePayload & { body: PatchBody }; result: Record<string, unknown> };
  /** 网格操作（9 op；破坏性操作走整场景快照，可撤销）。 */
  meshOp: { payload: HandlePayload & { body: MeshOpBody }; result: MeshOpResult };
  /** 列出节点属性。 */
  getProperties: { payload: HandlePayload & SegmentsPayload; result: { properties: PropertyEntry[] } };
  /** 设置属性；value 任意 JSON 值，归一为字符串。 */
  setProperty: { payload: HandlePayload & SegmentsPayload & { name: string; value: unknown }; result: { newValue: string; [key: string]: unknown } };
  /** 删除属性。 */
  removeProperty: { payload: HandlePayload & SegmentsPayload & { name: string }; result: Record<string, unknown> };
  /** 撤销（快照恢复会换场景对象，句柄不变，无需重新 open）。 */
  undo: { payload: HandlePayload & { steps?: number }; result: UndoRedoResult };
  /** 重做。 */
  redo: { payload: HandlePayload & { steps?: number }; result: UndoRedoResult };
  /** 历史元数据。 */
  history: { payload: HandlePayload; result: HistoryInfo };
  /** 挂接 CADC 属性列表（同名幂等覆盖）；bytes 传 ArrayBuffer 并放 transfer。 */
  attachAttributes: { payload: HandlePayload & { bytes: ArrayBuffer }; result: AttachResult };
}

/* ============================ 全局声明 ============================ */

/**
 * 主线程 RPC 客户端（对应 rvm-rpc.js，经典脚本挂全局）。
 *
 * 错误语义：任何失败 reject Error(message)（中文消息）。
 * 超时：读类默认 30s；长任务（见 RvmOps 各 op 注释）默认 180s，
 * 可用第 4 参覆盖。Worker 崩溃/预加载失败后进入终态（不自动重启——
 * 重启会丢全部句柄），后续调用立即 reject。
 */
declare global {
  class RvmRpc {
    constructor(opts?: {
      /** Worker 脚本地址（默认 "./rvm-worker.js"，相对页面）。 */
      workerUrl?: string;
      /** 读类默认超时（毫秒）。 */
      timeoutMs?: number;
      /** 长任务默认超时（毫秒）。 */
      longTimeoutMs?: number;
    });

    readonly version: string | null;

    /** 启动 Worker（幂等；call 会自动触发，一般无需手动调）。 */
    start(): RvmRpc;

    /** 等 wasm 就绪并返回版本号（幂等，多次调用返回同一 Promise）。 */
    ready(): Promise<string>;

    /**
     * 发起一次调用。
     * @param op 操作名（见 docs/api.md）
     * @param payload 其余字段（handle/segments/body/bytes/...）
     * @param transfer 零拷贝转移的 ArrayBuffer 列表（入参字节必放）
     * @param timeoutMs 显式超时；省略按 op 自动分类
     */
    call<K extends keyof RvmOps>(
      op: K,
      payload?: RvmOps[K]["payload"],
      transfer?: ArrayBuffer[],
      timeoutMs?: number,
    ): Promise<RvmOps[K]["result"]>;

    /** 当前活跃句柄数（泄漏诊断）。 */
    handleCount(): Promise<number>;
  }

  /**
   * IndexedDB 会话持久化（对应 rvm-store.js，可选组件）。
   * 撤销栈不持久化（既定决策）；配额不足抛带体积提示的错误。
   */
  class RvmStore {
    /** 保存（put 语义：同 id 覆盖）。rvm/attr 为 export 产出的 Uint8Array。 */
    save(record: SessionRecord): Promise<void>;
    /** 列出全部会话元数据（不含字节），按 savedAt 降序；损坏条目跳过。 */
    list(): Promise<SessionMeta[]>;
    /** 取单条完整记录（含 rvm/attr 字节）；不存在返回 undefined。 */
    get(id: string): Promise<SessionRecord | undefined>;
    remove(id: string): Promise<void>;
    clear(): Promise<void>;
  }

  /**
   * 生成会话 id：优先 crypto.randomUUID（需安全上下文），
   * 否则回退时间戳 + 随机串。
   */
  function newSessionId(): string;
}
