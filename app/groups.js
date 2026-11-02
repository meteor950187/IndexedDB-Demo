import {
  normalizeText,
  stationText,
  indexNames,
  unavailableStop,
} from "./search.js";

export const STATION_DIAMETER_METERS = 400;
export const HUB_DIAMETER_METERS = 900;
export function validPosition(stop) {
  return (
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lon) &&
    stop.lat > 20 &&
    stop.lat < 27 &&
    stop.lon > 118 &&
    stop.lon < 124
  );
}
export function distance(a, b) {
  if (!validPosition(a) || !validPosition(b)) return Infinity;
  const rad = (value) => (value * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function cluster(items, members, diameter) {
  const clusters = [];
  for (const item of [...items].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  )) {
    const points = members(item);
    const target = clusters.find((group) =>
      group.every((other) =>
        members(other).every((a) =>
          points.every((b) => distance(a, b) <= diameter),
        ),
      ),
    );
    if (target) target.push(item);
    else clusters.push([item]);
  }
  return clusters;
}
function areaLabel(stops) {
  const addresses = [...new Set(stops.map((s) => s.address).filter(Boolean))];
  const roads = [
    ...new Set(
      addresses
        .map((a) => a.match(/[^\d()（）\s]{1,18}(?:路|街|大道)/)?.[0])
        .filter(Boolean),
    ),
  ];
  return roads.length
    ? roads.slice(0, 3).join("、")
    : addresses[0]?.slice(0, 40) || "位置資訊未提供";
}
function groupRecord(stops, kind, name, baseName, childIds = []) {
  const stopIds = stops
    .map((s) => s.id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const positioned = stops.filter(validPosition);
  return {
    id: `${kind}:${normalizeText(name)}:${stopIds[0]}`,
    kind,
    name,
    baseName,
    stopIds,
    childIds,
    area: areaLabel(stops),
    lat: positioned.length
      ? positioned.reduce((sum, s) => sum + s.lat, 0) / positioned.length
      : null,
    lon: positioned.length
      ? positioned.reduce((sum, s) => sum + s.lon, 0) / positioned.length
      : null,
    ...indexNames(
      kind === "hub"
        ? [baseName]
        : [name, ...stops.flatMap((s) => s.aliases || [])],
      stationText,
    ),
  };
}
export function buildStationGroups(stops) {
  const byName = new Map();
  for (const stop of stops) {
    if (unavailableStop(stop.name)) continue;
    const key = normalizeText(stop.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(stop);
  }
  const leaves = [];
  const byId = new Map(stops.map((s) => [s.id, s]));
  for (const list of byName.values()) {
    for (const members of cluster(list, (s) => [s], STATION_DIAMETER_METERS)) {
      const displayName = members[0].name.normalize("NFKC");
      // 僅以官方括號站區作層級；營運狀態文字不當成道路站區。
      const parts = displayName.match(/^(.+?)\(([^()]+)\)$/);
      const base =
        parts && !/裁撤|停用|取消|不停靠|暫停/.test(parts[2])
          ? parts[1]
          : displayName;
      leaves.push(groupRecord(members, "station", displayName, base));
    }
  }
  const families = new Map();
  for (const group of leaves) {
    const key = normalizeText(group.baseName);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(group);
  }
  const hubs = [];
  for (const family of families.values()) {
    if (family.length < 2) continue;
    for (const children of cluster(
      family,
      (g) => g.stopIds.map((id) => byId.get(id)),
      HUB_DIAMETER_METERS,
    )) {
      if (new Set(children.map((g) => normalizeText(g.name))).size < 2)
        continue;
      const baseName = children[0].baseName;
      const hub = groupRecord(
        children.flatMap((g) => g.stopIds.map((id) => byId.get(id))),
        "hub",
        `${baseName}（全部站區）`,
        baseName,
        children.map((g) => g.id),
      );
      hub.areas = children.map(
        (g) => g.name.slice(g.baseName.length).replace(/[()]/g, "") || "周邊",
      );
      for (const child of children) child.parentId = hub.id;
      hubs.push(hub);
    }
  }
  return [...hubs, ...leaves];
}
