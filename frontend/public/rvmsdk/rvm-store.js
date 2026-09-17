// rvm-store.js — 会话持久化的 IndexedDB 封装（替代原后端磁盘存储）。
//
// 对应关系（原后端见 server-go/internal/persist/persist.go）：
//
//	<dir>/<id>/snapshot.rvm   →  记录字段 rvm   （Uint8Array，export 产出的 RVM 字节）
//	<dir>/<id>/snapshot.txt   →  记录字段 attr  （可选；无属性时不存在）
//	<dir>/<id>/meta.json      →  记录的标量字段（id/name/sourceFile/计数/时间戳）
//	<dir>/<id>/history.json   →  **不持久化**（方案 §4.2 既定决策）
//	<dir>/<id>/undo-N.rvm     →  **不持久化**（同上：内存快照无法持久化）
//
// 为何撤销栈不持久化：快照载体是 RVM 序列化字节（MemSnapshots），持久化会让
// 存储翻倍且恢复慢；刷新后撤销栈清空是多数编辑器的合理产品行为。
//
// 为何纯 JS 实现而非 Go：持久化不需要 Go 参与，JS 直接存 Uint8Array 更简单
// （方案 §4.2 建议）。IndexedDB 在同源下主线程与 Worker 共享，故本模块可被
// 任一侧加载。
//
// 加载方式同 rvm-rpc.js：经典脚本，挂 globalThis。

"use strict";

const DB_NAME = "rvm-editor";
const DB_VERSION = 1;
const STORE = "sessions";

class RvmStore {
  constructor() {
    this.db = null;
    this._opening = null;
  }

  /**
   * 打开（或创建）数据库。幂等：多次调用返回同一 Promise。
   * @returns {Promise<void>}
   */
  open() {
    if (this.db) return Promise.resolve();
    if (this._opening) return this._opening;

    this._opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          // savedAt 索引：列表按保存时间降序（对齐 persist.List 的排序语义）
          os.createIndex("savedAt", "savedAt", { unique: false });
        }
      };

      req.onsuccess = () => {
        this.db = req.result;
        // 另一标签页触发版本升级时须让路，否则本页的后续事务会全部失败
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
          this._opening = null;
        };
        resolve();
      };

      req.onerror = () => reject(new Error(`打开存储失败：${req.error && req.error.message}`));
      req.onblocked = () => reject(new Error("存储被其他标签页占用，请关闭后重试"));
    });

    // 失败后允许重试（不缓存 rejected Promise）
    this._opening.catch(() => { this._opening = null; });
    return this._opening;
  }

  /** 内部：取事务对象。 */
  async _store(mode) {
    await this.open();
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  /** 内部：把 IDBRequest 包成 Promise。 */
  static _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存（put，同 id 覆盖）。
   *
   * 配额错误必须显式转成可读文案：IndexedDB 有配额上限，大模型快照可能
   * 数 GB，静默失败会让用户以为「保存成功」而实际没存。
   * @param {object} record 见文件头对应关系；rvm/attr 为 Uint8Array
   */
  async save(record) {
    const os = await this._store("readwrite");
    try {
      await RvmStore._req(os.put(record));
    } catch (e) {
      throw RvmStore._friendly(e, record);
    }
  }

  /** 配额/约束错误 → 可读文案。 */
  static _friendly(e, record) {
    const name = e && e.name;
    if (name === "QuotaExceededError") {
      const mb = record && record.rvm ? (record.rvm.length / 1048576).toFixed(1) : "?";
      return new Error(`存储空间不足（本次快照约 ${mb} MB）——请删除旧会话后重试`);
    }
    return new Error(`保存失败：${(e && e.message) || name || "未知错误"}`);
  }

  /**
   * 列出全部会话，按 savedAt 降序（最近保存在前）。
   * 损坏条目跳过——对齐 persist.List 的容错语义（单条坏数据不该让整个列表失败）。
   * @returns {Promise<object[]>} 不含 rvm/attr 字节的元数据（列表不需要字节）
   */
  async list() {
    const os = await this._store("readonly");
    const all = await RvmStore._req(os.getAll());
    return all
      .filter((r) => r && r.id && typeof r.savedAt === "number")
      .sort((a, b) => b.savedAt - a.savedAt)
      // 剥离字节：列表只渲染元数据，携带数 MB 的 Uint8Array 无谓
      .map(({ rvm, attr, ...meta }) => meta);
  }

  /**
   * 取单条完整记录（含 rvm/attr 字节）。
   * @param {string} id
   * @returns {Promise<object|undefined>}
   */
  async get(id) {
    const os = await this._store("readonly");
    return RvmStore._req(os.get(id));
  }

  /** 删除单条。 */
  async remove(id) {
    const os = await this._store("readwrite");
    await RvmStore._req(os.delete(id));
  }

  /** 清空全部（调试与「重置」用）。 */
  async clear() {
    const os = await this._store("readwrite");
    await RvmStore._req(os.clear());
  }
}

/**
 * 生成会话 ID。
 * 优先用 crypto.randomUUID（需安全上下文：https 或 localhost）；非安全上下文
 * （如局域网 IP 访问）下它不可用，回退到时间戳 + 随机串——碰撞概率足够低，
 * 且本地单用户场景无需全局唯一。
 */
function newSessionId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

globalThis.RvmStore = RvmStore;
globalThis.newSessionId = newSessionId;
if (typeof self !== "undefined") {
  self.RvmStore = RvmStore;
  self.newSessionId = newSessionId;
}
