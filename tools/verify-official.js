import "fake-indexeddb/auto";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { normalizeBundle } from "../app/model.js";
import { openDatabase, replaceSnapshot, query } from "../app/db.js";
import { distance } from "../app/groups.js";
const raw = Object.fromEntries(
  await Promise.all(
    ["routes", "stops", "locations"].map(async (key) => [
      key,
      JSON.parse(await readFile(`output/source/${key}.json`, "utf8")),
    ]),
  ),
);
const inspection = JSON.parse(
  await readFile("output/source/inspection.json", "utf8"),
);
const start = raw.locations.BusInfo.filter((s) => s.name === "智光商職");
const end = raw.locations.BusInfo.filter(
  (s) => s.name.normalize("NFKC") === "臺北車站(忠孝)",
);
const ids = (list) => new Set(list.map((s) => String(s.id)));
function rawPairs(from, to) {
  const fromIds = ids(from),
    toIds = ids(to);
  const output = [];
  for (const routeName of ["262", "262區"]) {
    const routeIds = new Set(
      raw.routes.BusInfo.filter((r) => r.nameZh === routeName).map((r) =>
        String(r.Id),
      ),
    );
    const rows = raw.stops.BusInfo.filter((r) =>
      routeIds.has(String(r.routeId)),
    );
    for (const a of rows.filter((r) => fromIds.has(String(r.stopLocationId))))
      for (const b of rows.filter((r) => toIds.has(String(r.stopLocationId)))) {
        if (
          a.routeId !== b.routeId ||
          String(a.goBack) !== String(b.goBack) ||
          Number(a.seqNo) >= Number(b.seqNo)
        )
          continue;
        const describe = (r) => {
          const location = raw.locations.BusInfo.find(
            (s) => String(s.id) === String(r.stopLocationId),
          );
          return {
            station: location.name,
            stopId: String(location.id),
            rowId: String(r.Id),
            sequence: Number(r.seqNo),
            address: location.address,
            routeRecordAddress: r.address,
            lat: Number(location.lat),
            lon: Number(location.lon),
          };
        };
        output.push({
          route: routeName,
          routeId: String(a.routeId),
          direction: String(a.goBack),
          from: describe(a),
          to: describe(b),
        });
      }
  }
  return output;
}
const forward = rawPairs(start, end),
  reverse = rawPairs(end, start);
const bundle = normalizeBundle(raw);
const db = await openDatabase("official-evidence-" + crypto.randomUUID());
await replaceSnapshot(db, bundle, { id: "current", version: "evidence" });
const a = (await query(db, "searchStations", ["智光商職"])).groups[0];
const b = (await query(db, "searchStations", ["臺北車站忠孝"])).groups[0];
for (const [from, to, expected] of [
  [a, b, forward],
  [b, a, reverse],
]) {
  const actual = await query(db, "groupTrips", [from.id, to.id]);
  for (const pair of expected)
    assert.ok(
      actual
        .find(
          (r) => r.route.id === pair.routeId && r.direction === pair.direction,
        )
        ?.options.some(
          (o) => o.from.id === pair.from.rowId && o.to.id === pair.to.rowId,
        ),
    );
}
const routeSearch = (await query(db, "searchRoutes", ["262"])).map(
  (r) => r.name,
);
assert.deepEqual(routeSearch, ["262", "262區"]);
db.close();
const diameter = (list) =>
  Math.round(
    Math.max(
      ...list.flatMap((a) =>
        list.map((b) =>
          distance(
            { lat: Number(a.lat), lon: Number(a.lon) },
            { lat: Number(b.lat), lon: Number(b.lon) },
          ),
        ),
      ),
    ),
  );
const report = {
  capturedAt: inspection.inspectedAt,
  sources: inspection.headers,
  officialName: "智光商職",
  noOfficialName: "志光商職",
  start: { count: start.length, diameterMeters: diameter(start) },
  end: { count: end.length, diameterMeters: diameter(end) },
  routeSearch,
  forward,
  reverse,
  note: "由官方原始列獨立配對後，與新查詢結果逐筆核對。地址顯示優先使用站位檔，routeRecordAddress保留差異供追溯。",
};
await writeFile(
  "docs/station-data-evidence.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
