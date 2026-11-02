export const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("臺", "台")
    .replace(/\s/g, "");
export const stationText = (value) =>
  normalizeText(value).replace(/[()（）·・]/g, "");
export const unavailableStop = (name) =>
  /裁撤|不停靠|停用|暫停服務|暫停使用|已取消/.test(String(name || ""));
export function tokens(value) {
  const chars = [...value];
  return [
    ...new Set(
      chars.flatMap((c, i) =>
        i + 1 < chars.length ? [c, c + chars[i + 1]] : [c],
      ),
    ),
  ];
}
export function indexNames(names, normalize = normalizeText) {
  const searchNames = [...new Set(names.filter(Boolean).map(normalize))];
  return { searchNames, tokens: [...new Set(searchNames.flatMap(tokens))] };
}
export function matchRank(record, text, numeric = false) {
  const names = record.searchNames || [];
  const matches = names.filter((name) =>
    numeric ? (name.match(/\d+/g) || []).includes(text) : name.includes(text),
  );
  if (!matches.length) return Infinity;
  if (names[0] === text) return 0;
  if (matches.includes(text)) return 1;
  if (names[0]?.startsWith(text)) return 2;
  return matches.some((n) => n.startsWith(text)) ? 3 : 4;
}
export const compareNames = (a, b) =>
  a.name.localeCompare(b.name, "zh-Hant", { numeric: true }) ||
  a.id.localeCompare(b.id);
