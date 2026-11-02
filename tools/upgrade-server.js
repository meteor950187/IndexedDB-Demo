// 僅供 tests/browser-upgrade.js：同一 origin 從真實舊版切換新版，驗證 Service Worker 更新。
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = "907a54d";
const files = [
  "index.html",
  "icon.svg",
  "sw.js",
  "app/style.css",
  "app/ui.js",
  "app/bridge.js",
  "app/config.js",
  "app/db.js",
  "app/model.js",
  "app/sync.js",
  "app/worker.js",
];
const old = new Map(
  files.map((path) => [
    path,
    execFileSync("git", ["show", `${baseline}:${path}`], {
      cwd: root,
      maxBuffer: 2e6,
    }),
  ]),
);
let latest = false;
createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (
    req.method === "POST" &&
    ["/__test/reset", "/__test/upgrade"].includes(path)
  ) {
    latest = path.endsWith("upgrade");
    res.writeHead(200).end("OK");
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405).end();
    return;
  }
  const file = path === "/" ? "index.html" : path.slice(1);
  if (!/^(index\.html|sw\.js|icon\.svg|app\/[a-z-]+\.(js|css))$/.test(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = latest
      ? await readFile(new URL("../" + file, import.meta.url))
      : old.get(file);
    if (!data) {
      res.writeHead(404).end();
      return;
    }
    const type = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".css")
        ? "text/css"
        : file.endsWith(".svg")
          ? "image/svg+xml"
          : "text/html";
    res
      .writeHead(200, {
        "Content-Type": type + "; charset=utf-8",
        "Cache-Control": "no-store",
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4174, "127.0.0.1", () =>
  console.log("Upgrade test: http://127.0.0.1:4174"),
);
