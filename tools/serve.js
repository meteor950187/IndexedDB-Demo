import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    const path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const relative = path === "/" ? "index.html" : path.slice(1);
    if (
      !/^(index\.html|sw\.js|icon\.svg|app\/[a-z-]+\.(js|css))$/.test(relative)
    ) {
      response.writeHead(404).end("Not found");
      return;
    }
    const body = await readFile(resolve(root, relative));
    response.writeHead(200, {
      "Content-Type": types[extname(relative)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response
      .writeHead(error.code === "ENOENT" ? 404 : 400)
      .end("Unable to serve file");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}`),
);
