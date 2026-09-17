// rvm-wasm.js — RVM 编辑器的 wasm 胶水层。
//
// 职责：加载 wasm 模块、把 Go 侧同步接口包装为 Promise、管理句柄生命周期。
// 本文件是**唯一**的 JS/Go 边界，前端其余代码只调用这里暴露的方法。
//
// 加载方式：`importScripts("rvm-wasm.js")`，加载后使用全局 `RvmBridge`。
// 本文件是**纯全局脚本**（无 ESM export）——Worker 的 importScripts 是 CJS
// 语义，含 export 语句会导致语法错误。wasm 只在 Worker 内运行，主线程无需
// 导入本文件。
//
// 设计依据见 docs/golang/wasm-frontend-plan.md。

/** wasm 模块与 Go 胶水的默认路径（相对本文件所在目录）。 */
const DEFAULT_WASM = "rvmedit.wasm";
const DEFAULT_EXEC = "wasm_exec.js";

/**
 * Go 侧返回值的统一解包：把 {error} 转成异常，其余原样返回。
 * Go 侧约定所有失败都返回 {error: "..."} 而非 panic 越界。
 */
function unwrap(result) {
  if (result && typeof result === "object" && typeof result.error === "string") {
    throw new Error(result.error);
  }
  return result;
}

/**
 * 解包 JSON 中转结果（Go 侧返回 {json: "..."}）。
 *
 * 为何存在这层：syscall/js 的类型支持面比预期窄，两类值**无法**直接跨边界
 * ——① 含未导出类型字段的结构（如 engine.treeNode）会让反射转换死循环，
 * 实测 149s 不返回；② []float64 切片不被 ValueOf 支持，直接 panic。
 * 故 tree/node/bbox 统一序列化为 JSON 字符串返回，此处还原为对象。
 */
function unwrapJSON(result) {
  const r = unwrap(result);
  if (typeof r !== "object" || typeof r.json !== "string") {
    throw new Error("期望 JSON 中转结果（{json: string}）");
  }
  return JSON.parse(r.json);
}

/** 等待 wasm 初始化完成（Go 侧 main 会调用 __rvmReady(version)）。 */
function waitReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`wasm 初始化超时（${timeoutMs}ms）`)),
      timeoutMs,
    );
    globalThis.__rvmReady = (version) => {
      clearTimeout(timer);
      delete globalThis.__rvmReady;
      resolve(version);
    };
  });
}

/**
 * RvmBridge — wasm 能力层的 JS 门面。
 * 除 load 外所有方法同步（Go 侧 js.FuncOf 回调即同步返回）。
 */
class RvmBridge {
  /** @param {object} api Go 侧暴露的 rvmBridge 对象 @param {string} version */
  constructor(api, version) {
    this.api = api;
    this.version = version;
  }

  /**
   * 在 **Worker** 中加载 wasm。
   * @param {object} [opts]
   * @param {string} [opts.wasmUrl] wasm 模块地址
   * @param {string} [opts.execUrl] wasm_exec.js 地址
   * @param {number} [opts.timeoutMs] 初始化超时（默认 60s，首次含 5.6MB 传输）
   * @returns {Promise<RvmBridge>}
   */
  static async load(opts = {}) {
    const wasmUrl = opts.wasmUrl || DEFAULT_WASM;
    const execUrl = opts.execUrl || DEFAULT_EXEC;
    const timeoutMs = opts.timeoutMs || 60000;

    // Worker 内用 importScripts 同步加载 Go 胶水（无 document，不能用 <script>）
    importScripts(execUrl);

    // Go 构造函数由 wasm_exec.js 注入到全局
    const go = new globalThis.Go();
    const resp = await fetch(wasmUrl);
    if (!resp.ok) {
      throw new Error(`加载 wasm 失败：HTTP ${resp.status}（${wasmUrl}）`);
    }
    const buf = await resp.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(buf, go.importObject);

    const ready = waitReady(timeoutMs);
    go.run(instance); // Go 侧 main 常驻（select{}），此调用不返回
    const version = await ready;

    return new RvmBridge(globalThis.rvmBridge, version);
  }

  /**
   * 打开模型。
   * @param {string} name 文件名（扩展名决定格式识别）
   * @param {Uint8Array} bytes 模型数据
   * @param {Uint8Array} [attrs] 可选：CADC 属性文件（.rvm）或 .mtl（.obj）
   * @returns {{handle:number, sourceFile:string, sourceFormat:string,
   *            nodeCount:number, entityCount:number, attributeNodeCount:number}}
   */
  open(name, bytes, attrs) {
    return unwrap(this.api.open(name, bytes, attrs));
  }

  /**
   * 取场景元数据（计数按当前场景实时重算，编辑后调用可反映最新状态）。
   * @param {number} handle
   */
  meta(handle) {
    return unwrap(this.api.meta(handle));
  }

  /**
   * 导出 GLB（可渲染格式的最小闭环）。
   * @param {number} handle
   * @returns {Uint8Array}
   */
  exportGLB(handle) {
    return unwrap(this.api.exportGLB(handle));
  }

  /* --------------------- 读路径（阶段 2）-------------------- */

  /**
   * 场景树（结构与原 GET /api/sessions/{id}/tree 一致）。
   * @param {number} handle
   * @returns {{root: object}}
   */
  tree(handle) {
    return unwrapJSON(this.api.tree(handle));
  }

  /**
   * 节点详情（结构与原 GET /node 一致；quaternion 顺序 [w,x,y,z]）。
   * @param {number} handle
   * @param {string[]} segments 节点路径（根下第一级开始的节点名数组）
   */
  node(handle, segments) {
    return unwrapJSON(this.api.node(handle, segments));
  }

  /**
   * 节点包围盒。
   * @param {number} handle
   * @param {string[]} segments
   * @returns {{min:number[], max:number[]}}
   */
  bbox(handle, segments) {
    return unwrapJSON(this.api.bbox(handle, segments));
  }

  /**
   * 多格式导出。
   * @param {number} handle
   * @param {string} format rvm|rvmtxt|glb|gltf|obj|stl|stlascii|ply|plybin|png|html|pdf
   * @param {object} [opts]
   * @param {boolean} [opts.attributes] 仅 rvm/rvmtxt：附带 CADC 属性列表
   * @param {boolean} [opts.axisYUp]    obj/stl/ply 系：Z-up → Y-up
   * @param {boolean} [opts.prettyPrint] gltf：是否缩进
   * @returns {{format:string, mime:string, ext:string,
   *            files: Array<{name:string, data:Uint8Array}>}}
   */
  export(handle, format, opts) {
    return unwrap(this.api.export(handle, format, opts));
  }

  /**
   * 软件光栅渲染 PNG。
   * @param {number} handle
   * @param {object} [opts]
   * @param {number} [opts.width] 默认 1600
   * @param {number} [opts.height] 默认 1200
   * @param {boolean} [opts.transparent]
   * @param {number[]} [opts.background] [r,g,b] 0..1
   * @returns {Uint8Array} PNG 字节
   */
  render(handle, opts) {
    return unwrap(this.api.render(handle, opts));
  }

  /**
   * 3D 预览 GLB（面向 three.js 展示，对应原 GET /preview 端点）。
   * @param {number} handle
   * @returns {Uint8Array}
   */
  preview(handle) {
    return unwrap(this.api.preview(handle));
  }

  /* --------------------- 写路径（阶段 3）-------------------- */

  /**
   * 节点编辑（对应原 PATCH /node，9 个 op）。
   *
   * 破坏性 op（delete/merge）会走整场景快照，撤销即从快照恢复。
   *
   * @param {number} handle
   * @param {object} body
   * @param {string[]} body.segments 节点路径（空数组 = 根节点）
   * @param {string} body.op create|delete|rename|visible|excluded|translate|
   *                        transform|material|primitive
   * @param {string} [body.name] rename/create 的新名
   * @param {boolean} [body.visible]
   * @param {boolean} [body.excluded]
   * @param {number[]} [body.translation] translate：[x,y,z]
   * @param {number[]} [body.quaternion] transform：[w,x,y,z]
   * @param {number[]} [body.scale] transform：[x,y,z]
   * @param {object} [body.material] {name,diffuse,emissive,metallic,roughness,transparency}
   * @param {object} [body.primitive] {kind,params}
   * @param {string[]} [body.source] merge：来源路径
   * @returns {object} 操作结果（各 op 字段不同，均含 ok:true）
   */
  patchNode(handle, body) {
    return unwrapJSON(this.api.patchNode(handle, body));
  }

  /**
   * 网格操作（对应原 POST /mesh，9 项）。
   * @param {number} handle
   * @param {object} body
   * @param {string} body.op analyze|boolean|merge|simplify|smooth|subdivide|
   *                      transform|repair|weld
   * @param {string[]} [body.segments] 单节点操作的目标
   * @param {string[]} [body.a] 二元操作的第一操作数
   * @param {string[]} [body.b] 二元操作的第二操作数
   * @param {string} [body.mode] boolean：union|intersect|subtract
   * @param {boolean} [body.keepOperands] boolean：是否保留操作数节点
   * @param {number} [body.tolerance] weld/repair 容差
   * @param {number} [body.maxTriangles] simplify 目标三角形数
   * @param {number[]} [body.scale] transform：[x,y,z]
   * @param {string} [body.policy] repair：修复策略
   * @returns {{result:object, stats:object}} 操作结果与场景统计
   */
  meshOp(handle, body) {
    return unwrapJSON(this.api.meshOp(handle, body));
  }

  /**
   * 列出节点属性（对应原 GET /properties）。
   * @param {number} handle
   * @param {string[]} segments
   * @returns {{properties: Array<{name:string, value:string}>}}
   */
  getProperties(handle, segments) {
    return unwrapJSON(this.api.getProperties(handle, segments));
  }

  /**
   * 设置属性（对应原 PATCH /properties）。
   * value 接受任意 JSON 值，非字符串经 JSON 中转归一（对齐后端
   * String(value ?? '') 语义：42 → "42"）。
   * @param {number} handle
   * @param {string[]} segments
   * @param {string} name
   * @param {*} value
   * @returns {object} 含 newValue（归一后的字符串）
   */
  setProperty(handle, segments, name, value) {
    return unwrapJSON(this.api.setProperty(handle, segments, name, value));
  }

  /**
   * 删除属性（对应原 DELETE /properties）。
   * @param {number} handle
   * @param {string[]} segments
   * @param {string} name
   * @returns {object}
   */
  removeProperty(handle, segments, name) {
    return unwrapJSON(this.api.removeProperty(handle, segments, name));
  }

  /**
   * 撤销（对应原 POST /undo）。
   * 快照恢复会替换 Go 侧场景对象——句柄本身不变，无需重新 open。
   * @param {number} handle
   * @param {number} [steps] 步数（默认 1，上限 50）
   * @returns {{ok:boolean, undone:number, history:object, stats:object}}
   */
  undo(handle, steps) {
    return unwrapJSON(this.api.undo(handle, steps));
  }

  /**
   * 重做（对应原 POST /redo）。
   * @param {number} handle
   * @param {number} [steps] 步数（默认 1，上限 50）
   * @returns {{ok:boolean, redone:number, history:object, stats:object}}
   */
  redo(handle, steps) {
    return unwrapJSON(this.api.redo(handle, steps));
  }

  /**
   * 历史元数据（对应原 GET /history）。
   * @param {number} handle
   * @returns {{canUndo:number, canRedo:number, undo:object[], redo:object[]}}
   */
  history(handle) {
    return unwrapJSON(this.api.history(handle));
  }

  /**
   * 挂接 CADC 属性列表（对应原 POST /attributes）。
   * 属性按节点名匹配挂到现有节点上。
   * @param {number} handle
   * @param {Uint8Array} bytes CADC 属性文件内容
   * @returns {{attached:number, missed:number}}
   */
  attachAttributes(handle, bytes) {
    return unwrapJSON(this.api.attachAttributes(handle, bytes));
  }

  /**
   * 释放场景句柄。页面卸载前应调用（或由宿主统一回收）。
   * @param {number} handle
   */
  close(handle) {
    return unwrap(this.api.close(handle));
  }

  /** 当前活跃句柄数（泄漏诊断）。 */
  handleCount() {
    return this.api.handleCount();
  }
}

// 挂到全局：importScripts 加载后，Worker 通过 self.RvmBridge 取用。
self.RvmBridge = RvmBridge;
