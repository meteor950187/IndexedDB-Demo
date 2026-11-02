import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { fixture } from "./fixtures.js";
import { openDatabase, readMeta, query } from "../app/db.js";
import { decodeJson, syncOnce } from "../app/sync.js";

const settings = {
  sources: {
    routes: "https://test/routes",
    stops: "https://test/stops",
    locations: "https://test/locations",
  },
  timeoutMs: 1000,
};
const fetcher = (raw) => async (url) =>
  new Response(gzipSync(JSON.stringify(raw[url.split("/").at(-1)])));

test("支援 gzip 及已解壓 JSON，拒絕非 JSON", async () => {
  const text = JSON.stringify(fixture().routes);
  assert.deepEqual(await decodeJson(gzipSync(text)), fixture().routes);
  assert.deepEqual(
    await decodeJson(new TextEncoder().encode(text)),
    fixture().routes,
  );
  await assert.rejects(
    decodeJson(new TextEncoder().encode("<html>Error</html>")),
  );
});
test("完整同步、相同內容不重寫、下載或格式錯誤保留舊快取", async () => {
  const db = await openDatabase("sync-" + crypto.randomUUID());
  const first = await syncOnce(db, settings, () => {}, fetcher(fixture()));
  assert.equal(first.changed, true);
  assert.equal(first.meta.counts.routes, 2);
  const second = await syncOnce(db, settings, () => {}, fetcher(fixture()));
  assert.equal(second.changed, false);
  assert.equal(second.meta.savedAt, first.meta.savedAt);
  const raw = fixture();
  raw.locations.BusInfo = [];
  await assert.rejects(syncOnce(db, settings, () => {}, fetcher(raw)));
  await assert.rejects(
    syncOnce(
      db,
      settings,
      () => {},
      async () => new Response("bad", { status: 503 }),
    ),
    /503/,
  );
  assert.equal((await readMeta(db)).version, first.meta.version);
  assert.equal((await query(db, "trips", ["10", "20"])).length, 1);
  db.close();
});
test("首次下載失敗不留下可用快取旗標", async () => {
  const db = await openDatabase("fail-" + crypto.randomUUID());
  await assert.rejects(
    syncOnce(
      db,
      settings,
      () => {},
      async () => {
        throw new Error("offline");
      },
    ),
  );
  assert.equal(await readMeta(db), undefined);
  db.close();
});
