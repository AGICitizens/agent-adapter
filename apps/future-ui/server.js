import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(".");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

createServer((req, res) => {
  const url = req.url === "/" ? "/index.html" : req.url ?? "/index.html";
  const path = join(root, url.replace(/\?.*$/, ""));
  const filePath = existsSync(path) ? path : join(root, "index.html");

  try {
    const ext = extname(filePath).toLowerCase();
    const body = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Future UI preview running at http://127.0.0.1:${port}\n`);
});
