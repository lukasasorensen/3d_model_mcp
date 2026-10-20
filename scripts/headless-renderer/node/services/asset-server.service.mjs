import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const files = new Map([
  ["/", ["index.html", "text/html"]], ["/proof.js", ["proof.js", "text/javascript"]],
  ["/openscad-worker.js", ["openscad-worker.js", "text/javascript"]],
  ...["openscad.js", "openscad.wasm", "bosl2.zip", "manifest.json"].map(name => [`/vendor/openscad/${name}`, [`vendor/openscad/${name}`, name.endsWith(".js") ? "text/javascript" : name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream"]]),
]);

export async function startAssetServer(directory) {
  const assets = new Map(await Promise.all([...files].map(async ([route, [name, mime]]) => [route, { bytes: await readFile(new URL(name, directory)), mime }])));
  const requests = [];
  let origin;
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin) || request.headers["sec-fetch-site"] === "cross-site") {
      response.writeHead(403).end(); return;
    }
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    const asset = assets.get(request.url);
    if (!asset) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": asset.mime, "content-length": asset.bytes.length, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(asset.bytes);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, requests, async close() {
    await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  } };
}
