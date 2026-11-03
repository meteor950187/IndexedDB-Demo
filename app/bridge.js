import { settings } from "./config.js";
import { openDatabase, query, readMeta, inspectCache } from "./db.js";

export class BusBridge extends EventTarget {
  constructor(options = {}) {
    super();
    this.settings = { ...settings, ...options };
    this.ready = false;
    this.pending = new Map();
    this.InitPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.InitPromise.catch(() => {});
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }) => {
      if (
        (data.Cmd === "InitSyncStart" && data.Data.cached) ||
        data.Cmd === "InitSyncEnd" ||
        data.Cmd === "SnapshotChanged"
      ) {
        const meta = data.Cmd === "InitSyncStart" ? data.Data.meta : data.Data;
        this.version = meta.version;
        this.ready = true;
        this.resolveReady(meta);
        // 首次失敗後按重試成功，新的查詢仍可正常 await。
        this.InitPromise = Promise.resolve(meta);
        this.dispatchEvent(new CustomEvent("ready", { detail: meta }));
      }
      if (data.Cmd === "Status")
        this.dispatchEvent(new CustomEvent("status", { detail: data.Data }));
      if (data.Cmd === "SyncError") {
        if (!this.ready) this.rejectReady(new Error(data.Data.message));
        this.dispatchEvent(new CustomEvent("syncerror", { detail: data.Data }));
      }
      if (data.Cmd === "Reply") {
        const pending = this.pending.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(data.requestId);
          data.Data.ok
            ? pending.resolve(data.Data.result)
            : pending.reject(new Error(data.Data.message));
        }
      }
    };
    this.worker.onerror = () =>
      this.fail(new Error("背景同步程式無法執行，請重新整理頁面"));
    this.worker.postMessage({ Cmd: "Init", Settings: this.settings });
  }
  fail(error) {
    this.rejectReady(error);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.dispatchEvent(
      new CustomEvent("syncerror", {
        detail: { message: error.message, retryMs: 0 },
      }),
    );
  }
  async database() {
    await this.InitPromise;
    this.dbPromise ||= openDatabase(this.settings.databaseName);
    return this.dbPromise;
  }
  async query(method, ...args) {
    const db = await this.database();
    return query(db, method, args, this.version);
  }
  async queryAtVersion(version, method, ...args) {
    return query(await this.database(), method, args, version);
  }
  async meta() {
    return readMeta(await this.database());
  }
  async inspectCache(options) {
    // 首次下載失敗或仍在同步時，也能展示本機空資料庫。
    const db = await openDatabase(this.settings.databaseName);
    try {
      return await inspectCache(db, options);
    } finally {
      db.close();
    }
  }
  sync() {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("同步等待逾時，請稍後再試"));
      }, 120000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ Cmd: "Sync", requestId });
    });
  }
  dispose() {
    this.worker.terminate();
    this.fail(new Error("查詢已關閉"));
    this.dbPromise?.then((db) => db.close());
  }
}
