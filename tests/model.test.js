import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.js";
import { normalizeBundle, findTrips, normalizeText } from "../app/model.js";

test("合併重複路線 Id，保留業者與支線名稱，保留同名不同站位", () => {
  const b = normalizeBundle(fixture());
  assert.equal(b.routes.length, 2);
  assert.deepEqual(b.routes[0].providers, ["甲", "乙"]);
  assert.equal(b.routes[0].variants.length, 2);
  assert.equal(b.stops.length, 3);
  assert.equal(b.routeStops.length, 6);
  assert.equal(normalizeText(" 臺北 Ａ１ "), "台北a1");
});
test("空資料、格式錯誤、孤兒路線與無效站序都拒絕", () => {
  for (const key of ["routes", "stops", "locations"]) {
    const raw = fixture();
    raw[key].BusInfo = [];
    assert.throws(() => normalizeBundle(raw));
  }
  const raw = fixture();
  raw.stops.BusInfo[0].routeId = 999;
  assert.throws(() => normalizeBundle(raw), /路線/);
  const bad = fixture();
  bad.stops.BusInfo[0].seqNo = "oops";
  assert.throws(() => normalizeBundle(bad), /站序/);
});
test("相同方向且上車在下車之前；循環重複站只取最近可用區間", () => {
  const rows = normalizeBundle(fixture()).routeStops;
  const start = rows.filter((r) => r.stopId === "10");
  const end = rows.filter((r) => r.stopId === "20");
  const forward = findTrips(start, end);
  assert.equal(forward.length, 1);
  assert.equal(forward[0].from.seq, 1);
  assert.equal(forward[0].to.seq, 3);
  const back = findTrips(end, start);
  assert.equal(back.length, 1);
  assert.equal(back[0].to.seq, 5);
  assert.deepEqual(findTrips([start[0]], [end[1]]), []);
  assert.deepEqual(findTrips([start[0]], [start[0]]), []);
});
