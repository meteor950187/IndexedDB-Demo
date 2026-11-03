import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.js";
import { normalizeBundle } from "../app/model.js";
import { openDatabase, replaceSnapshot, inspectCache } from "../app/db.js";

test("快取檢視讀實際筆數與索引，分頁不重複、不修改資料", async () => {
  const db = await openDatabase("inspector-" + crypto.randomUUID());
  try {
    const bundle = normalizeBundle(fixture());
    await replaceSnapshot(db, bundle, {
      version: "one",
      savedAt: "2026-11-03T00:00:00Z",
      counts: { routes: 999 },
    });
    const first = await inspectCache(db, { store: "routes", limit: 1 });
    assert.equal(first.databaseName, db.name);
    assert.equal(first.schemaVersion, 2);
    assert.equal(first.stores.length, 5);
    assert.equal(first.stores.find((s) => s.name === "routes").count, 2);
    assert.equal(
      first.stores.find((s) => s.name === "routes").indexes[0].multiEntry,
      true,
    );
    assert.deepEqual(
      first.stores
        .find((s) => s.name === "routeStops")
        .indexes.find((i) => i.name === "routeDirection").keyPath,
      ["routeId", "direction"],
    );
    assert.equal(first.rows.length, 1);
    const second = await inspectCache(db, {
      store: "routes",
      offset: 1,
      limit: 1,
      expectedVersion: "one",
    });
    assert.notEqual(first.rows[0].id, second.rows[0].id);
    const end = await inspectCache(db, {
      store: "routes",
      offset: 2,
      limit: 1,
    });
    assert.deepEqual(end.rows, []);
    for (const store of ["stops", "routeStops", "stationGroups", "meta"]) {
      const result = await inspectCache(db, { store });
      assert.ok(result.rows.length);
      assert.equal(result.meta.version, "one");
    }
    await assert.rejects(
      inspectCache(db, { store: "routes", expectedVersion: "old" }),
      /版本/,
    );
    await assert.rejects(inspectCache(db, { store: "not-a-store" }), /資料表/);
    assert.equal(
      (await inspectCache(db, { store: "meta" })).rows[0].counts.routes,
      999,
    );
  } finally {
    db.close();
  }
});

test("尚未下載時可檢視空資料庫；限制每頁讀取量與無效分頁參數", async () => {
  const db = await openDatabase("empty-inspector-" + crypto.randomUUID());
  try {
    const data = await inspectCache(db, {
      store: "routes",
      limit: 1000000,
      offset: -2,
    });
    assert.equal(data.limit, 50);
    assert.equal(data.offset, 0);
    assert.equal(data.meta, null);
    assert.deepEqual(data.rows, []);
    assert.ok(data.stores.every((s) => s.count === 0));
  } finally {
    db.close();
  }
});
