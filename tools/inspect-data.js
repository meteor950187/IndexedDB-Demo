import { mkdir, writeFile } from "node:fs/promises";
import { settings } from "../app/config.js";
import { decodeJson } from "../app/sync.js";
import { normalizeBundle, normalizeText } from "../app/model.js";

await mkdir("output/source", { recursive: true });
const raw = {};
const headers = {};
await Promise.all(
  Object.entries(settings.sources).map(async ([key, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${key}: ${response.status}`);
    raw[key] = await decodeJson(await response.arrayBuffer());
    headers[key] = {
      url,
      etag: response.headers.get("etag"),
      modified: response.headers.get("last-modified"),
      updateTime: raw[key].EssentialInfo?.UpdateTime,
    };
    await writeFile(`output/source/${key}.json`, JSON.stringify(raw[key]));
  }),
);
const bundle = normalizeBundle(raw);
const locations = raw.locations.BusInfo.filter((s) =>
  /[智志]光商職|[台臺]北車站/.test(s.name),
);
const routes = raw.routes.BusInfo.filter((r) => /262/.test(r.nameZh));
const routeIds = new Set(routes.map((r) => String(r.Id)));
const locationIds = new Set(locations.map((r) => String(r.id)));
const stops = raw.stops.BusInfo.filter(
  (s) =>
    routeIds.has(String(s.routeId)) &&
    locationIds.has(String(s.stopLocationId)),
);
// 重現舊版缺陷的診斷資料，不使用這個拼接字串進行正式查詢。
const search262 = bundle.routes
  .map((r) => ({
    ...r,
    search: normalizeText([r.name, ...r.variants].join(" ")),
  }))
  .filter((r) => r.search.includes("262"))
  .map((r) => ({
    id: r.id,
    name: r.name,
    variants: r.variants,
    search: r.search,
  }));
const report = {
  inspectedAt: new Date().toISOString(),
  headers,
  locations,
  routes: routes.map((r) => ({
    id: r.Id,
    name: r.nameZh,
    variant: r.pathAttributeName,
    departure: r.departureZh,
    destination: r.destinationZh,
  })),
  stops,
  oldSearch262: search262,
};
await writeFile(
  "output/source/inspection.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
