import { indexNames, stationText } from "./search.js";
import { buildStationGroups } from "./groups.js";
export { normalizeText, tokens } from "./search.js";

function records(raw, label) {
  if (!raw || !Array.isArray(raw.BusInfo) || !raw.BusInfo.length)
    throw new Error(`${label}資料為空或格式不符`);
  return raw.BusInfo;
}
function id(value, label) {
  if (value === undefined || value === null || String(value).trim() === "")
    throw new Error(`${label}缺少識別碼`);
  return String(value);
}
function name(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label}缺少名稱`);
  return value.trim();
}

export function normalizeBundle(raw) {
  const routeMap = new Map();
  for (const row of records(raw.routes, "路線")) {
    const key = id(row.Id, "路線");
    let route = routeMap.get(key);
    if (!route) {
      route = {
        id: key,
        name: name(row.nameZh, "路線"),
        departure: row.departureZh || "",
        destination: row.destinationZh || "",
        providers: [],
        variants: [],
      };
      routeMap.set(key, route);
    }
    if (row.providerName && !route.providers.includes(row.providerName))
      route.providers.push(row.providerName);
    const variant = row.pathAttributeName || row.nameZh;
    if (!route.variants.includes(variant)) route.variants.push(variant);
  }
  const stopMap = new Map();
  for (const row of records(raw.locations, "站位")) {
    const key = id(row.id, "站位");
    stopMap.set(key, {
      id: key,
      name: name(row.name, "站位"),
      address: row.address || "",
      bearing: row.bearing || "",
      lat: Number(row.lat),
      lon: Number(row.lon),
      aliases: [],
    });
  }
  const routeStops = [];
  const seen = new Set();
  const usedStops = new Set();
  for (const row of records(raw.stops, "站牌")) {
    const routeId = id(row.routeId, "路線");
    if (!routeMap.has(routeId))
      throw new Error(`站牌參照不存在的路線 ${routeId}`);
    const stopId = id(row.stopLocationId, "站位");
    // 官方各檔獨立更新：站位缺列時可由站牌自身的名稱與座標補足。
    if (!stopMap.has(stopId))
      stopMap.set(stopId, {
        id: stopId,
        name: name(row.nameZh, "站牌"),
        address: row.address || "",
        bearing: row.bearing || "",
        lat: Number(row.latitude),
        lon: Number(row.longitude),
        aliases: [],
      });
    const stop = stopMap.get(stopId);
    if (row.nameZh && !stop.aliases.includes(row.nameZh))
      stop.aliases.push(row.nameZh);
    const seq = Number(row.seqNo);
    const direction = String(row.goBack);
    if (!Number.isInteger(seq) || seq < 0 || !["0", "1"].includes(direction))
      throw new Error("站序或去返程資料不符");
    const key = id(row.Id, "站牌");
    if (seen.has(key)) throw new Error(`重複站牌識別碼 ${key}`);
    seen.add(key);
    usedStops.add(stopId);
    routeStops.push({
      id: key,
      routeId,
      stopId,
      direction,
      seq,
      name: row.nameZh || stop.name,
    });
  }
  const routes = [...routeMap.values()].map((r) => ({
    ...r,
    ...indexNames([r.name, ...r.variants]),
  }));
  const stops = [...stopMap.values()]
    .filter((s) => usedStops.has(s.id))
    .map((s) => ({
      ...s,
      ...indexNames([s.name, ...s.aliases], stationText),
    }));
  return {
    routes,
    stops,
    routeStops,
    stationGroups: buildStationGroups(stops),
    sourceTimes: Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        value.EssentialInfo?.UpdateTime || null,
      ]),
    ),
  };
}

export function findTrips(startRows, endRows) {
  const best = new Map();
  for (const from of startRows)
    for (const to of endRows) {
      if (
        from.routeId !== to.routeId ||
        from.direction !== to.direction ||
        from.seq >= to.seq ||
        from.stopId === to.stopId
      )
        continue;
      const key = `${from.routeId}:${from.direction}`;
      const candidate = {
        routeId: from.routeId,
        direction: from.direction,
        from,
        to,
      };
      const previous = best.get(key);
      if (!previous || to.seq - from.seq < previous.to.seq - previous.from.seq)
        best.set(key, candidate);
    }
  return [...best.values()];
}
