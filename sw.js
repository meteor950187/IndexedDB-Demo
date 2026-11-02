const CACHE = "taipei-bus-shell-v2";
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
  "./app/sync.js",
  "./app/worker.js",
];
const shellUrls = new Set(
  FILES.map((file) => new URL(file, self.registration.scope).href),
);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("taipei-bus-shell-") && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
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
