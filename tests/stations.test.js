import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.js";
import { normalizeBundle } from "../app/model.js";
import { openDatabase, replaceSnapshot, query } from "../app/db.js";

function rawStations() {
  const raw = fixture();
  raw.routes.BusInfo = ["262", "262區", "26", "226", "622", "1262"].map(
    (nameZh, i) => ({
      Id: i + 1,
      nameZh,
      pathAttributeName: nameZh,
      departureZh: "中和",
      destinationZh: "台北",
    }),
  );
  raw.locations.BusInfo = [
    {
      id: 10,
      name: "智光商職",
      lat: 24.994,
      lon: 121.513,
      address: "中正路北側",
      bearing: "N",
    },
    {
      id: 11,
      name: "智光商職",
      lat: 24.995,
      lon: 121.513,
      address: "中正路南側",
      bearing: "S",
    },
    {
      id: 12,
      name: "智光商職",
      lat: 24.9945,
      lon: 121.513,
      address: "另一月台",
    },
    {
      id: 20,
      name: "臺北車站(忠孝)",
      lat: 25.046,
      lon: 121.516,
      address: "忠孝路東側",
      bearing: "E",
    },
    {
      id: 21,
      name: "臺北車站（忠孝）",
      lat: 25.046,
      lon: 121.517,
      address: "忠孝路西側",
      bearing: "W",
    },
    {
      id: 22,
      name: "臺北車站(公園)",
      lat: 25.044,
      lon: 121.517,
      address: "公園路",
    },
    { id: 30, name: "智光商職", lat: 25.2, lon: 121.7, address: "遠處同名站" },
  ];
  const stop = (Id, routeId, stopLocationId, seqNo, goBack) => ({
    Id,
    routeId,
    stopLocationId,
    seqNo,
    goBack,
    nameZh: raw.locations.BusInfo.find((r) => r.id === stopLocationId).name,
  });
  raw.stops.BusInfo = [
    stop(1, 1, 10, 1, "0"),
    stop(2, 1, 12, 2, "0"),
    stop(3, 1, 20, 5, "0"),
    stop(4, 1, 21, 1, "1"),
    stop(5, 1, 11, 5, "1"),
    stop(6, 2, 10, 1, "0"),
    stop(7, 2, 20, 5, "0"),
    stop(8, 3, 30, 1, "0"),
    stop(9, 3, 22, 2, "0"),
  ];
  return raw;
}
export { rawStations };
async function setup(raw = rawStations()) {
  const db = await openDatabase("stations-" + crypto.randomUUID());
  const bundle = normalizeBundle(raw);
  await replaceSnapshot(db, bundle, {
    id: "current",
    version: "v1",
    counts: {},
  });
  return db;
}
test("262只命中獨立名稱的完整數字段，262區另列且完全相符在前", async () => {
  const db = await setup();
  assert.deepEqual(
    (await query(db, "searchRoutes", ["２６２"])).map((r) => r.name),
    ["262", "262區"],
  );
  assert.deepEqual(
    (await query(db, "searchRoutes", ["26"])).map((r) => r.name),
    ["26"],
  );
  assert.deepEqual(
    (await query(db, "searchRoutes", ["226"])).map((r) => r.name),
    ["226"],
  );
  db.close();
});
test("近距離同名合群、遠方同名分開、忠孝與公園子站區及全部站區", async () => {
  const db = await setup();
  const result = await query(db, "searchStations", ["智光商職"]);
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups.map((g) => g.stopIds.length).sort(), [1, 3]);
  const taipei = await query(db, "searchStations", ["台 北 車 站"]);
  assert.equal(taipei.groups.length, 3);
  assert.equal(taipei.groups[0].kind, "hub");
  assert.equal(taipei.groups[0].stopIds.length, 3);
  const zhongxiao = await query(db, "searchStations", ["台北車站忠孝"]);
  assert.equal(zhongxiao.groups.length, 1);
  assert.equal(zhongxiao.groups[0].stopIds.length, 2);
  const suggestion = await query(db, "searchStations", ["志光商職"]);
  assert.equal(suggestion.suggestion, "智光商職");
  db.close();
});
test("自動配對站群內站位，去重保留多個組合，交換後重新選方向與站位", async () => {
  const db = await setup();
  const start = (await query(db, "searchStations", ["智光商職"])).groups.find(
    (g) => g.stopIds.length === 3,
  );
  const end = (await query(db, "searchStations", ["台北車站忠孝"])).groups[0];
  const matches = await query(db, "groupTrips", [start.id, end.id]);
  assert.deepEqual(
    matches.map((m) => m.route.name),
    ["262", "262區"],
  );
  assert.equal(matches[0].options.length, 2);
  assert.ok(
    matches[0].options.every(
      (o) => o.from.seq < o.to.seq && o.from.direction === o.to.direction,
    ),
  );
  assert.equal(matches[0].options[0].to.location.address, "忠孝路東側");
  const reverse = await query(db, "groupTrips", [end.id, start.id]);
  assert.equal(reverse.length, 1);
  assert.equal(reverse[0].direction, "1");
  assert.equal(reverse[0].from.stopId, "21");
  assert.equal(reverse[0].to.stopId, "11");
  const single = await query(db, "groupRoutes", [start.id]);
  assert.equal(single.length, 3);
  assert.deepEqual(await query(db, "groupTrips", [start.id, start.id]), []);
  db.close();
});
test("官方明示裁撤或不停靠的站牌不可列為可搭乘組合，但保留完整站序", async () => {
  const raw = rawStations();
  for (const row of raw.stops.BusInfo)
    if (
      row.routeId === 1 &&
      row.goBack === "0" &&
      [10, 12].includes(row.stopLocationId)
    )
      row.nameZh += "(暫時裁撤)";
  raw.locations.BusInfo.find((s) => s.id === 30).name = "智光商職(暫時裁撤)";
  const db = await setup(raw);
  const start = (await query(db, "searchStations", ["智光商職"])).groups.find(
    (g) => g.stopIds.length === 3,
  );
  const end = (await query(db, "searchStations", ["台北車站忠孝"])).groups[0];
  assert.deepEqual(
    (await query(db, "groupTrips", [start.id, end.id])).map(
      (m) => m.route.name,
    ),
    ["262區"],
  );
  assert.equal((await query(db, "routeStops", ["1", "0"])).length, 3);
  assert.ok(
    (await query(db, "searchStations", ["智光商職"])).groups.every(
      (g) => !g.name.includes("裁撤"),
    ),
  );
  db.close();
});
