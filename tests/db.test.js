import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.js";
import { normalizeBundle } from "../app/model.js";
import { openDatabase, replaceSnapshot, readMeta, query } from "../app/db.js";

test("索引搜尋、路線及直達查詢，寫入失敗仍保留完整前版", async () => {
  const db = await openDatabase("test-" + crypto.randomUUID());
  const bundle = normalizeBundle(fixture());
  await replaceSnapshot(db, bundle, {
    id: "current",
    version: "one",
    counts: { routes: 2 },
  });
  assert.equal((await query(db, "searchStops", ["臺北"])).length, 2);
  assert.equal((await query(db, "searchRoutes", ["藍1"])).length, 1);
  assert.equal((await query(db, "routeStops", ["1", "0"])).length, 3);
  assert.equal((await query(db, "trips", ["10", "20"])).length, 1);
  const broken = { ...bundle, routes: [{ name: "沒有主鍵" }] };
  await assert.rejects(
    replaceSnapshot(db, broken, { id: "current", version: "two" }),
  );
  assert.equal((await readMeta(db)).version, "one");
  assert.equal((await query(db, "searchStops", ["台北"])).length, 2);
  await assert.rejects(
    query(db, "routeStops", ["1", "0"], "old-version"),
    /版本/,
  );
  assert.equal((await query(db, "routeStops", ["1", "0"], "one")).length, 3);
  db.close();
});
