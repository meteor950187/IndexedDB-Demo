import { findTrips } from "./model.js";
import {
  normalizeText,
  stationText,
  indexNames,
  matchRank,
  compareNames,
  unavailableStop,
} from "./search.js";
import { buildStationGroups } from "./groups.js";

export const SCHEMA_VERSION = 2;
const STORES = ["routes", "stops", "routeStops", "stationGroups", "meta"];
export function openDatabase(name = "TaipeiBusOffline-v1") {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, SCHEMA_VERSION);
    let blocked = false;
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (event.oldVersion === 0) {
        for (const name of ["routes", "stops"]) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          store.createIndex("tokens", "tokens", { multiEntry: true });
        }
        const rs = db.createObjectStore("routeStops", { keyPath: "id" });
        rs.createIndex("stop", "stopId");
        rs.createIndex("routeDirection", ["routeId", "direction"]);
        db.createObjectStore("meta", { keyPath: "id" });
      }
      const groups = db.createObjectStore("stationGroups", { keyPath: "id" });
      groups.createIndex("tokens", "tokens", { multiEntry: true });
      groups.createIndex("stop", "stopIds", { multiEntry: true });
      if (event.oldVersion > 0) migrateSnapshot(tx);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("資料庫升級被舊分頁阻擋，請關閉舊分頁後重試"));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function migrateSnapshot(tx) {
  const values = {};
  let pending = 3;
  for (const name of ["routes", "stops", "meta"]) {
    const request = tx.objectStore(name).getAll();
    request.onsuccess = () => {
      values[name] = request.result;
      if (--pending) return;
      try {
        for (const route of values.routes)
          tx.objectStore("routes").put({
            ...route,
            ...indexNames([route.name, ...route.variants]),
          });
        const stops = values.stops.map((s) => ({
          ...s,
          ...indexNames([s.name, ...(s.aliases || [])], stationText),
        }));
        for (const stop of stops) tx.objectStore("stops").put(stop);
        const groups = buildStationGroups(stops);
        for (const group of groups) tx.objectStore("stationGroups").put(group);
        const meta = values.meta.find((m) => m.id === "current");
        if (meta)
          tx.objectStore("meta").put({
            ...meta,
            modelVersion: 2,
            version: `station-v2:${meta.version}`,
            counts: {
              ...meta.counts,
              groups: groups.filter((g) => g.kind === "station").length,
            },
          });
      } catch {
        tx.abort();
      }
    };
  }
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
    const tx = db.transaction(STORES, "readwrite");
    tx.oncomplete = () => resolve(meta);
    tx.onabort = () =>
      reject(tx.error || new Error("寫入已取消，保留原有資料"));
    tx.onerror = () => {};
    try {
      for (const name of STORES.filter((n) => n !== "meta")) {
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
  const tx = db.transaction(STORES, "readonly");
  const [data, meta] = await Promise.all([
    readQuery(tx, method, args),
    result(tx.objectStore("meta").get("current")),
  ]);
  if (expectedVersion && meta?.version !== expectedVersion)
    throw new Error("資料版本已更新，請重新查詢");
  return data;
}
async function search(store, text, numeric = false) {
  if (!text) return [];
  const rows = await result(
    store.index("tokens").getAll([...text].slice(0, 2).join("")),
  );
  return rows
    .filter((r) => Number.isFinite(matchRank(r, text, numeric)))
    .sort(
      (a, b) =>
        matchRank(a, text, numeric) - matchRank(b, text, numeric) ||
        compareNames(a, b),
    );
}
async function readQuery(tx, method, args) {
  const routes = tx.objectStore("routes");
  const stops = tx.objectStore("stops");
  const rs = tx.objectStore("routeStops");
  const groups = tx.objectStore("stationGroups");
  if (method === "searchRoutes" || method === "searchStops") {
    const text = (method === "searchRoutes" ? normalizeText : stationText)(
      args[0],
    ).slice(0, 100);
    return (
      await search(
        method === "searchRoutes" ? routes : stops,
        text,
        method === "searchRoutes" && /^\d+$/.test(text),
      )
    ).slice(0, 60);
  }
  if (method === "searchStations") {
    const text = stationText(args[0]).slice(0, 100);
    let matches = await search(groups, text);
    let suggestion = null;
    if (!matches.length && ["志光", "志光商職"].includes(text)) {
      const suggested = await search(groups, "智光商職");
      if (suggested.length) {
        matches = suggested;
        suggestion = "智光商職";
      }
    }
    return { groups: matches.slice(0, 60), suggestion, total: matches.length };
  }
  if (method === "groupForStop")
    return (await result(groups.index("stop").getAll(String(args[0])))).find(
      (g) => g.kind === "station",
    );
  if (method === "group") return result(groups.get(String(args[0])));
  if (method === "routeStops")
    return (
      await result(
        rs.index("routeDirection").getAll([String(args[0]), String(args[1])]),
      )
    ).sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
  if (method === "stop") return result(stops.get(String(args[0])));
  if (method === "groupTrips" || method === "groupRoutes") {
    const [start, end, routeList] = await Promise.all([
      result(groups.get(args[0])),
      method === "groupTrips" ? result(groups.get(args[1])) : null,
      result(routes.getAll()),
    ]);
    if (!start || (method === "groupTrips" && !end))
      throw new Error("站群已更新，請重新選站");
    if (start.id === end?.id) return [];
    const stopIds = [...new Set([...start.stopIds, ...(end?.stopIds || [])])];
    const [rowsByStop, locations] = await Promise.all([
      Promise.all(stopIds.map((id) => result(rs.index("stop").getAll(id)))),
      Promise.all(stopIds.map((id) => result(stops.get(id)))),
    ]);
    const rows = new Map(stopIds.map((id, i) => [id, rowsByStop[i]]));
    const locationMap = new Map(
      locations.filter(Boolean).map((s) => [s.id, s]),
    );
    const from = start.stopIds.flatMap((id) => rows.get(id));
    const to = end?.stopIds.flatMap((id) => rows.get(id));
    const matches = groupOptions(from, to);
    const routeMap = new Map(routeList.map((r) => [r.id, r]));
    const enrich = (row) =>
      row ? { ...row, location: locationMap.get(row.stopId) } : undefined;
    return matches
      .map((m) => {
        const options = m.options.map((o) => ({
          from: enrich(o.from),
          to: enrich(o.to),
        }));
        return { ...m, route: routeMap.get(m.routeId), options, ...options[0] };
      })
      .sort(
        (a, b) =>
          compareNames(a.route, b.route) ||
          a.direction.localeCompare(b.direction),
      );
  }
  if (method === "routesByStop" || method === "trips") {
    const [from, routeList, to] = await Promise.all([
      result(rs.index("stop").getAll(String(args[0]))),
      result(routes.getAll()),
      method === "trips"
        ? result(rs.index("stop").getAll(String(args[1])))
        : null,
    ]);
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
          compareNames(a.route, b.route) ||
          a.direction.localeCompare(b.direction),
      );
  }
  throw new Error(`不支援的查詢：${method}`);
}
function groupOptions(startRows, endRows) {
  const groups = new Map();
  for (const from of startRows)
    for (const to of endRows || [null]) {
      if (unavailableStop(from.name) || (to && unavailableStop(to.name)))
        continue;
      if (
        to &&
        (from.routeId !== to.routeId ||
          from.direction !== to.direction ||
          from.seq >= to.seq ||
          from.stopId === to.stopId)
      )
        continue;
      const key = `${from.routeId}:${from.direction}`;
      if (!groups.has(key))
        groups.set(key, {
          routeId: from.routeId,
          direction: from.direction,
          pairs: new Map(),
        });
      const group = groups.get(key);
      const pairKey = `${from.stopId}:${to?.stopId || ""}`;
      const previous = group.pairs.get(pairKey);
      if (
        !previous ||
        (to
          ? to.seq - from.seq < previous.to.seq - previous.from.seq
          : from.seq < previous.from.seq)
      )
        group.pairs.set(pairKey, { from, to });
    }
  return [...groups.values()].map(({ pairs, ...group }) => ({
    ...group,
    options: [...pairs.values()].sort(
      (a, b) =>
        (a.to ? a.to.seq - a.from.seq : a.from.seq) -
          (b.to ? b.to.seq - b.from.seq : b.from.seq) ||
        a.from.id.localeCompare(b.from.id),
    ),
  }));
}
