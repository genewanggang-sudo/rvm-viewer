// rvm-rpc.js — 主线程侧的 wasm 能力层 RPC 客户端。
//
// 为何需要本文件：wasm 只在 Worker 内运行（rvm-wasm.js 用 importScripts 加载
// wasm_exec.js，那是 CJS 语义），主线程访问 wasm 的**唯一通道**是
// rvm-worker.js 的消息协议。本文件把该协议 Promise 化，并统一超时/崩溃/就绪语义。
//
// 为何是**经典脚本**（无 export）而非 ESM：验证页（wire-test.html，与
// wasm-ab.html 同构）是经典脚本、无法 import；经典脚本 + 全局挂载对
// 主线程 / Worker / 验证页三种宿主都成立，且验证页可**直接复用同一份实现**
// ——避免「测试与生产两份 RPC 逻辑漂移」（wasm-ab.html 与 wasm-check.html
// 已各自内联一份，正是这种漂移的雏形）。
//
// 加载顺序：index.html 中须置于 importmap **之前**（经典脚本先于 module 执行）。

"use strict";

/**
 * 耗时较长的 op：超时上限放宽到 longTimeoutMs。
 *
 * 为何分类而非统一：读路径（tree/node/history）正常在毫秒级，短超时能**快速
 * 暴露协议错**（字段名拼错会静默无响应）；而导出/渲染大模型可达数十秒，
 * 统一短超时会误杀。
 */
const LONG_OPS = new Set(["open", "export", "exportGLB", "render", "preview"]);

/** 默认超时（毫秒）。 */
const DEFAULT_TIMEOUT_MS = 30000;
/** 长任务超时（毫秒）。 */
const DEFAULT_LONG_TIMEOUT_MS = 180000;

class RvmRpc {
  /**
   * @param {object} [opts]
   * @param {string} [opts.workerUrl] Worker 脚本地址
   * @param {number} [opts.timeoutMs] 默认超时
   * @param {number} [opts.longTimeoutMs] 长任务超时
   */
  constructor(opts = {}) {
    this.workerUrl = opts.workerUrl || "./rvm-worker.js";
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.longTimeoutMs = opts.longTimeoutMs || DEFAULT_LONG_TIMEOUT_MS;

    this.worker = null;
    this.seq = 0;
    /** id → {resolve, reject, timer} */
    this.pending = new Map();
    /** 终态错误：Worker 已不可用（不重启，见 failAll 注释） */
    this.dead = null;
    /** wasm 版本号，就绪后填充 */
    this.version = null;
    this._ready = null;
  }

  /** 启动 Worker。幂等：重复调用无副作用。 */
  start() {
    if (this.worker) return this;
    this.worker = new Worker(this.workerUrl);

    this.worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data || {};
      const p = this.pending.get(id);
      if (!p) {
        // id=0 是 Worker 的**预加载失败**通知（rvm-worker.js 启动即 ensureBridge，
        // 失败时 postMessage({id:0, ok:false})）。立刻终止全部等待，省掉
        // 逐个超时的 30s 煎熬。
        if (id === 0 && ok === false) this.failAll(`wasm 预加载失败：${error}`);
        return;
      }
      clearTimeout(p.timer);
      this.pending.delete(id);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };

    // Worker 崩溃 / 消息反序列化失败：必须拒绝全部 pending。
    // 若只打日志，UI 会**永久卡在 loading**——那是最难诊断的失败形态。
    this.worker.onerror = (e) => this.failAll(`Worker 异常：${(e && e.message) || "未知"}`);
    this.worker.onmessageerror = () => this.failAll("Worker 消息反序列化失败");

    return this;
  }

  /**
   * 等待 wasm 就绪，返回版本号。幂等：多次调用返回同一 Promise。
   *
   * 为何 version 探针即可代表「就绪」：rvm-worker.js 启动即 ensureBridge()
   * 预加载 wasm，故 version 消息会排队等到 wasm 编译完成才被应答。
   */
  ready() {
    if (!this._ready) {
      // 用长超时：首次调用要等 wasm 完成下载 + 编译（6.3MB，冷启动可能 >30s），
      // 默认短超时会把「首次加载慢」误判为失败。此后 version 瞬时返回。
      this._ready = this.call("version", {}, undefined, this.longTimeoutMs).then((v) => {
        this.version = v;
        return v;
      });
    }
    return this._ready;
  }

  /**
   * 发起一次调用。
   * @param {string} op rvm-worker.js 协议中的 op 名
   * @param {object} [payload] 其余字段（handle/segments/body/bytes/...）
   * @param {ArrayBuffer[]} [transfer] 零拷贝转移的底层缓冲
   * @param {number} [timeoutOverride] 显式超时（毫秒）；省略则按 op 自动分类
   * @returns {Promise<any>} result 原样返回；失败 reject(Error)
   */
  call(op, payload = {}, transfer, timeoutOverride) {
    if (this.dead) return Promise.reject(this.dead);
    if (!this.worker) this.start();

    const id = ++this.seq;
    const ms = timeoutOverride || (LONG_OPS.has(op) ? this.longTimeoutMs : this.timeoutMs);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`操作 ${op} 超时（${ms}ms）`));
        }
      }, ms);
      this.pending.set(id, { resolve, reject, timer });

      const msg = { id, op, ...payload };
      try {
        transfer ? this.worker.postMessage(msg, transfer) : this.worker.postMessage(msg);
      } catch (e) {
        // DataCloneError 等发送期错误：立刻失败，不必等超时
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`发送 ${op} 失败：${e.message}`));
      }
    });
  }

  /** 当前活跃句柄数（泄漏诊断，对应 bridge.handleCount）。 */
  handleCount() {
    return this.call("handleCount");
  }

  /**
   * 终止全部等待中的调用并置终态。
   *
   * 为何**不自动重启 Worker**：wasm 持有全部场景句柄（bridge.go 的 handles 表），
   * 重启即丢场景。静默重启会让用户「模型莫名消失」——显式置 dead + 状态栏提示
   * + 后续调用快速失败，是更可诊断的语义。
   */
  failAll(message) {
    this.dead = new Error(message);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(this.dead);
    }
    this.pending.clear();
  }
}

// 挂到全局：经典脚本加载后，index.html 与验证页通过 RvmRpc 取用。
// 同时挂 globalThis 与 self，使 Worker/Node 宿主同样可用（与 rvm-wasm.js
// 的「双宿主导出」约定一致）。
globalThis.RvmRpc = RvmRpc;
if (typeof self !== "undefined") self.RvmRpc = RvmRpc;
