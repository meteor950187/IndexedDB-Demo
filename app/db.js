import { normalizeText, findTrips } from "./model.js";

export function openDatabase(name = "TaipeiBusOffline-v1") {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["routes", "stops"]) {
        const store = db.createObjectStore(name, { keyPath: "id" });
        store.createIndex("tokens", "tokens", { multiEntry: true });
      }
      const rs = db.createObjectStore("routeStops", { keyPath: "id" });
      rs.createIndex("stop", "stopId");
      rs.createIndex("routeDirection", ["routeId", "direction"]);
      db.createObjectStore("meta", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("資料庫升級被其他分頁阻擋，請關閉舊分頁後重試"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

const result = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export const readMeta = (db) =>
  result(db.transaction("meta").objectStore("meta").get("current"));

export function replaceSnapshot(db, bundle, meta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["routes", "stops", "routeStops", "meta"],
      "readwrite",
    );
    tx.oncomplete = () => resolve(meta);
    tx.onabort = () =>
      reject(tx.error || new Error("寫入已取消，保留原有資料"));
    tx.onerror = () => {}; // onabort is the terminal failure; never resolve before commit.
    try {
      for (const name of ["routes", "stops", "routeStops"]) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of bundle[name]) store.put(row);
      }
      tx.objectStore("meta").put({ ...meta, id: "current" });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export function updateMeta(db, meta) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readwrite");
    tx.oncomplete = () => resolve(meta);
    tx.onabort = () => reject(tx.error || new Error("同步狀態寫入失敗"));
    tx.objectStore("meta").put({ ...meta, id: "current" });
  });
}

export async function query(db, method, args = [], expectedVersion = null) {
  // 所有請求使用同一 readonly transaction，避免同步換版時混合兩代資料。
  const tx = db.transaction(
    ["routes", "stops", "routeStops", "meta"],
    "readonly",
  );
  const meta = result(tx.objectStore("meta").get("current"));
  const [data, snapshot] = await Promise.all([
    readQuery(tx, method, args),
    meta,
  ]);
  if (expectedVersion && snapshot?.version !== expectedVersion)
    throw new Error("資料版本已更新，請重新查詢");
  return data;
}

async function readQuery(tx, method, args) {
  const routes = tx.objectStore("routes");
  const stops = tx.objectStore("stops");
  const rs = tx.objectStore("routeStops");
  if (method === "searchStops" || method === "searchRoutes") {
    const text = normalizeText(args[0]).slice(0, 100);
    if (!text) return [];
    const store = method === "searchStops" ? stops : routes;
    const prefix = [...text].slice(0, 2).join("");
    const rows = await result(store.index("tokens").getAll(prefix));
    return rows
      .filter((r) => r.search.includes(text))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "zh-Hant", { numeric: true }) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 60);
  }
  if (method === "routeStops") {
    const rows = await result(
      rs.index("routeDirection").getAll([String(args[0]), String(args[1])]),
    );
    return rows.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
  }
  if (method === "stop") return result(stops.get(String(args[0])));
  if (method === "routesByStop" || method === "trips") {
    const pending = [
      result(rs.index("stop").getAll(String(args[0]))),
      result(routes.getAll()),
    ];
    if (method === "trips")
      pending.push(result(rs.index("stop").getAll(String(args[1]))));
    const [from, routeList, to] = await Promise.all(pending);
    const byId = new Map(routeList.map((r) => [r.id, r]));
    const matches =
      method === "trips"
        ? findTrips(from, to)
        : [
            ...new Map(
              from.map((row) => [
                `${row.routeId}:${row.direction}`,
                { routeId: row.routeId, direction: row.direction, from: row },
              ]),
            ).values(),
          ];
    return matches
      .map((m) => ({ ...m, route: byId.get(m.routeId) }))
      .sort(
        (a, b) =>
          a.route.name.localeCompare(b.route.name, "zh-Hant", {
            numeric: true,
          }) || a.direction.localeCompare(b.direction),
      );
  }
  throw new Error(`不支援的查詢：${method}`);
}
