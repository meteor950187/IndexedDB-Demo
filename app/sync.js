import { normalizeBundle } from "./model.js";
import { readMeta, replaceSnapshot, updateMeta } from "./db.js";

export async function decodeJson(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let stream = new Blob([data]).stream();
  // 伺服器若設定 Content-Encoding，fetch 已自動解壓；依 magic bytes 避免重複解壓。
  if (data[0] === 0x1f && data[1] === 0x8b)
    stream = stream.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse((await new Response(stream).text()).replace(/^\uFEFF/, ""));
}

export async function syncOnce(
  db,
  settings,
  emit = () => {},
  fetchImpl = fetch,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("下載逾時，請稍後重試")),
    settings.timeoutMs,
  );
  let downloadedBytes = 0;
  try {
    emit({ phase: "downloading", message: "正在下載官方資料…" });
    const entries = await Promise.all(
      Object.entries(settings.sources).map(async ([key, url]) => {
        // 尊重一般 HTTP 快取，不用 cache-busting query 或 no-store。
        const response = await fetchImpl(url, {
          signal: controller.signal,
          cache: "default",
          credentials: "omit",
        });
        if (!response.ok)
          throw new Error(`${key} 下載失敗（HTTP ${response.status}）`);
        const bytes = await response.arrayBuffer();
        downloadedBytes += bytes.byteLength;
        return [key, await decodeJson(bytes)];
      }),
    );
    emit({ phase: "validating", message: "正在檢查路線與站牌資料…" });
    const bundle = normalizeBundle(Object.fromEntries(entries));
    const payload = JSON.stringify([
      bundle.routes,
      bundle.stops,
      bundle.routeStops,
    ]);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payload),
    );
    const version = [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const previous = await readMeta(db);
    const now = new Date().toISOString();
    const meta = {
      id: "current",
      version,
      checkedAt: now,
      savedAt: previous?.version === version ? previous.savedAt : now,
      sourceTimes: bundle.sourceTimes,
      counts: {
        routes: bundle.routes.length,
        stops: bundle.stops.length,
        routeStops: bundle.routeStops.length,
      },
      downloadedBytes,
    };
    if (previous?.version === version) {
      await updateMeta(db, meta);
      return { changed: false, meta };
    }
    emit({ phase: "writing", message: "正在儲存離線資料…" });
    await replaceSnapshot(db, bundle, meta);
    return { changed: true, meta };
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
