import { settings as defaults } from "./config.js";
import { openDatabase, readMeta } from "./db.js";
import { syncOnce } from "./sync.js";

let settings = defaults;
let database;
let active;
let timer;
let failures = 0;
let initialized = false;
let channel;
const post = (Cmd, Data, requestId) =>
  self.postMessage({ Cmd, Data, requestId });

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => runSync().catch(() => {}), ms);
}

async function performSync() {
  database ||= await openDatabase(settings.databaseName);
  const queuedAt = Date.now();
  const execute = async () => {
    const current = await readMeta(database);
    if (current && Date.parse(current.checkedAt) > queuedAt)
      return { changed: false, meta: current };
    return syncOnce(database, settings, (status) => post("Status", status));
  };
  // 不同分頁共享同一資料庫：避免同時下載/寫入；單分頁另由 active 合併要求。
  return navigator.locks
    ? navigator.locks.request(settings.databaseName + ":sync", execute)
    : execute();
}

function runSync() {
  if (active) return active;
  clearTimeout(timer);
  active = (async () => {
    try {
      const outcome = await performSync();
      failures = 0;
      post("InitSyncEnd", outcome.meta);
      if (outcome.changed)
        channel?.postMessage({ version: outcome.meta.version });
      post("Status", {
        phase: "ready",
        message: outcome.changed
          ? "資料已更新，可離線查詢"
          : "已確認資料，內容無變更",
        meta: outcome.meta,
      });
      schedule(settings.syncIntervalMs);
      return outcome;
    } catch (error) {
      failures++;
      const retryMs = Math.min(
        settings.maxRetryMs,
        settings.retryMs * 2 ** Math.min(failures - 1, 6),
      );
      post("SyncError", { message: error.message || "同步失敗", retryMs });
      schedule(retryMs);
      throw error;
    } finally {
      active = null;
    }
  })();
  return active;
}

self.addEventListener("message", async ({ data }) => {
  if (data.Cmd === "Init" && !initialized) {
    initialized = true;
    settings = { ...defaults, ...data.Settings };
    try {
      database = await openDatabase(settings.databaseName);
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(settings.databaseName + ":updates");
        channel.onmessage = async () => {
          try {
            const latest = await readMeta(database);
            if (latest) post("SnapshotChanged", latest);
          } catch (error) {
            post("SyncError", { message: error.message, retryMs: 0 });
          }
        };
      }
      const meta = await readMeta(database);
      post("InitSyncStart", { cached: Boolean(meta), meta });
      await runSync();
    } catch (error) {
      // runSync 已通報下載錯誤；openDatabase 失敗則在此通報。
      if (!database) post("SyncError", { message: error.message, retryMs: 0 });
    }
  }
  if (data.Cmd === "Sync") {
    try {
      post("Reply", { ok: true, result: await runSync() }, data.requestId);
    } catch (error) {
      post("Reply", { ok: false, message: error.message }, data.requestId);
    }
  }
});
