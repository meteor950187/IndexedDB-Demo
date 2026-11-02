import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.js";
import { normalizeBundle } from "../app/model.js";
import { tokens, normalizeText } from "../app/search.js";
import { openDatabase, query, readMeta } from "../app/db.js";
import { buildStationGroups, distance } from "../app/groups.js";

test("v1快取離線升至v2，保留站序與同步時間並重建搜尋及站群", async () => {
  const name = "migration-" + crypto.randomUUID();
  const raw = fixture();
  raw.routes.BusInfo[0].nameZh = "26";
  raw.routes.BusInfo[0].pathAttributeName = "26";
  raw.routes.BusInfo[1].nameZh = "26";
  raw.routes.BusInfo[1].pathAttributeName = "26";
  const bundle = normalizeBundle(raw);
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const key of ["routes", "stops"])
        db.createObjectStore(key, { keyPath: "id" }).createIndex(
          "tokens",
          "tokens",
          { multiEntry: true },
        );
      const rs = db.createObjectStore("routeStops", { keyPath: "id" });
      rs.createIndex("stop", "stopId");
      rs.createIndex("routeDirection", ["routeId", "direction"]);
      db.createObjectStore("meta", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(
        ["routes", "stops", "routeStops", "meta"],
        "readwrite",
      );
      for (const key of ["routes", "stops", "routeStops"])
        for (const row of bundle[key]) {
          const old = { ...row };
          delete old.searchNames;
          if (key !== "routeStops") {
            old.search = normalizeText(
              [row.name, ...(row.variants || row.aliases)].join(" "),
            );
            old.tokens = tokens(old.search);
          }
          tx.objectStore(key).put(old);
        }
      tx.objectStore("meta").put({
        id: "current",
        version: "old-hash",
        savedAt: "2026-01-01T00:00:00Z",
        counts: { routes: 2, stops: 3 },
        sourceTimes: { routes: "old" },
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => reject(tx.error);
    };
  });
  const db = await openDatabase(name);
  assert.equal(db.version, 2);
  const meta = await readMeta(db);
  assert.equal(meta.savedAt, "2026-01-01T00:00:00Z");
  assert.equal(meta.modelVersion, 2);
  assert.equal(meta.version, "station-v2:old-hash");
  assert.deepEqual(await query(db, "searchRoutes", ["262"]), []);
  assert.equal((await query(db, "searchRoutes", ["26"])).length, 1);
  assert.equal(
    (await query(db, "searchStations", ["台北車站"])).groups.length,
    2,
  );
  assert.equal((await query(db, "routeStops", ["1", "0"])).length, 3);
  db.close();
});
test("站群不以連鎖距離擴張，缺少座標的同名站不合併", () => {
  const stops = [0, 1, 2].map((i) => ({
    id: String(i),
    name: "同名站",
    lat: 25 + i * 0.0027,
    lon: 121.5,
    address: "某路",
    aliases: [],
  }));
  assert.ok(distance(stops[0], stops[2]) > 400);
  const groups = buildStationGroups(stops);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((g) => g.stopIds.length <= 2));
  const invalid = buildStationGroups([
    { ...stops[0], lat: null },
    { ...stops[1], lat: NaN },
  ]);
  assert.equal(invalid.length, 2);
});
