const CACHE = "taipei-bus-shell-v5";
const FILES = [
  "./",
  "./index.html",
  "./icon.svg",
  "./app/style.css",
  "./app/ui.js",
  "./app/bridge.js",
  "./app/config.js",
  "./app/db.js",
  "./app/model.js",
  "./app/search.js",
  "./app/groups.js",
  "./app/sync.js",
  "./app/worker.js",
];
const shellUrls = new Set(
  FILES.map((file) => new URL(file, self.registration.scope).href),
);
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const old = (await caches.keys()).filter(
        (key) => key.startsWith("taipei-bus-shell-") && key !== CACHE,
      );
      await self.clients.claim();
      if (old.length) {
        // 舊版頁面沒有更新監聽器；新殼層完整安裝後一次重載，避免仍使用舊選站程式。
        const clients = await self.clients.matchAll({ type: "window" });
        // 不等待 navigation 完成：導覽的 fetch 會等待 activate 結束，等待彼此將造成死鎖。
        for (const client of clients.filter((client) =>
          client.url.startsWith(self.registration.scope),
        ))
          client.navigate(client.url).catch(() => {});
      }
      await Promise.all(old.map((key) => caches.delete(key)));
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !shellUrls.has(event.request.url))
    return;
  // 固定版本殼層，避免離線時模組與網頁版本混搭。更新時提升 CACHE 版本。
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) =>
          (await cache.match(event.request)) || fetch(event.request),
      ),
  );
});
