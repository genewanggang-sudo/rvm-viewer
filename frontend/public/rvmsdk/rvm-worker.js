// rvm-worker.js — wasm 能力层的 Worker 宿主。
//
// 为何用 Worker：Go 的 js.FuncOf 回调是**同步**的，「解析+导出+渲染」在
// WD1 样本上耗时约 2.6s，跑在主线程会冻结 UI（见 wasm-frontend-plan §7.1）。
// 放进 Worker 后主线程只收发消息，天然不阻塞。
//
// 消息协议（主线程 → Worker）：
//   { id, op: "open",        name, bytes, attrs? }   打开模型
//   { id, op: "meta",        handle }                元数据
//   { id, op: "tree",        handle }                场景树
//   { id, op: "node",        handle, segments }      节点详情
//   { id, op: "bbox",        handle, segments }      包围盒
//   { id, op: "export",      handle, format, opts? } 多格式导出
//   { id, op: "exportGLB",   handle }                导出 GLB
//   { id, op: "render",      handle, opts? }         渲染 PNG
//   { id, op: "preview",     handle }                预览 GLB
//   { id, op: "patchNode",   handle, body }          节点编辑（9 个 op）
//   { id, op: "meshOp",      handle, body }          网格操作（9 项）
//   { id, op: "getProperties",  handle, segments }   列属性
//   { id, op: "setProperty",    handle, segments, name, value }
//   { id, op: "removeProperty", handle, segments, name }
//   { id, op: "undo",        handle, steps? }        撤销
//   { id, op: "redo",        handle, steps? }        重做
//   { id, op: "history",     handle }                历史元数据
//   { id, op: "attachAttributes", handle, bytes }    挂接 CADC 属性
//   { id, op: "close",       handle }                释放句柄
//   { id, op: "handleCount" } / { id, op: "version" }
// （Worker → 主线程）：
//   { id, ok: true,  result }
//   { id, ok: false, error }
//
// 字节数据走 Transferable（ArrayBuffer 零拷贝转移），避免大模型复制开销。
// 返回 Uint8Array 的操作统一声明 transfer，把底层 ArrayBuffer 移交主线程。

// importScripts 是 CJS 语义，加载后 RvmBridge 挂在全局（见 rvm-wasm.js 双宿主导出）
importScripts("rvm-wasm.js");

let bridgePromise = null;

/** 惰性加载 wasm（首次调用时初始化，之后复用）。 */
function ensureBridge() {
  if (!bridgePromise) {
    bridgePromise = RvmBridge.load();
  }
  return bridgePromise;
}

/** 统一应答：成功回 result，失败回 error（绝不让异常静默丢失）。 */
async function handle(msg) {
  const { id, op } = msg;
  try {
    const rvm = await ensureBridge();
    switch (op) {
      case "version":
        return { id, ok: true, result: rvm.version };
      case "open": {
        const attrs = msg.attrs ? new Uint8Array(msg.attrs) : undefined;
        const info = rvm.open(msg.name, new Uint8Array(msg.bytes), attrs);
        return { id, ok: true, result: info };
      }
      case "meta":
        return { id, ok: true, result: rvm.meta(msg.handle) };
      case "tree":
        return { id, ok: true, result: rvm.tree(msg.handle) };
      case "node":
        return { id, ok: true, result: rvm.node(msg.handle, msg.segments) };
      case "bbox":
        return { id, ok: true, result: rvm.bbox(msg.handle, msg.segments) };
      case "export": {
        const out = rvm.export(msg.handle, msg.format, msg.opts);
        // 每个产物文件单独转移 ArrayBuffer（rvm 可能含属性列表第二文件）
        return { id, ok: true, result: out, transfer: out.files.map((f) => f.data.buffer) };
      }
      case "exportGLB": {
        const glb = rvm.exportGLB(msg.handle);
        // 转移底层 ArrayBuffer，避免大产物（WD1 GLB 约 6MB）复制
        return { id, ok: true, result: glb, transfer: [glb.buffer] };
      }
      case "render": {
        const png = rvm.render(msg.handle, msg.opts);
        return { id, ok: true, result: png, transfer: [png.buffer] };
      }
      case "preview": {
        const glb = rvm.preview(msg.handle);
        return { id, ok: true, result: glb, transfer: [glb.buffer] };
      }
      /* --------------------- 写路径（阶段 3）-------------------- */
      case "patchNode":
        return { id, ok: true, result: rvm.patchNode(msg.handle, msg.body) };
      case "meshOp":
        return { id, ok: true, result: rvm.meshOp(msg.handle, msg.body) };
      case "getProperties":
        return { id, ok: true, result: rvm.getProperties(msg.handle, msg.segments) };
      case "setProperty":
        return {
          id, ok: true,
          result: rvm.setProperty(msg.handle, msg.segments, msg.name, msg.value),
        };
      case "removeProperty":
        return {
          id, ok: true,
          result: rvm.removeProperty(msg.handle, msg.segments, msg.name),
        };
      case "undo":
        return { id, ok: true, result: rvm.undo(msg.handle, msg.steps) };
      case "redo":
        return { id, ok: true, result: rvm.redo(msg.handle, msg.steps) };
      case "history":
        return { id, ok: true, result: rvm.history(msg.handle) };
      case "attachAttributes": {
        const attrs = new Uint8Array(msg.bytes);
        return { id, ok: true, result: rvm.attachAttributes(msg.handle, attrs) };
      }
      case "close":
        return { id, ok: true, result: rvm.close(msg.handle) };
      case "handleCount":
        return { id, ok: true, result: rvm.handleCount() };
      default:
        return { id, ok: false, error: `未知操作：${op}` };
    }
  } catch (e) {
    return { id, ok: false, error: (e && e.message) || String(e) };
  }
}

self.onmessage = async (e) => {
  const reply = await handle(e.data);
  if (reply.transfer) {
    self.postMessage(reply, reply.transfer);
  } else {
    self.postMessage(reply);
  }
};

// 启动即预加载 wasm：让 5.6MB 传输与编译在用户选文件前完成，减少首用等待。
ensureBridge().catch((e) => {
  self.postMessage({ id: 0, ok: false, error: `wasm 预加载失败：${e.message}` });
});
