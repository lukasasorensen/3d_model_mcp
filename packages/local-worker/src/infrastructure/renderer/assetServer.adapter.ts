import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { BROWSER_RENDERER } from "@theoryfoundry/contracts";
import { LocalWorkerError } from "../../shared/utils/workerError.util.js";
const files = [
  ["/", "index.html", "text/html", ""],
  ["/proof.js", "proof.js", "text/javascript", ""],
  ["/openscad-worker.js", "openscad-worker.js", "text/javascript", ""],
  [
    "/vendor/openscad/openscad.js",
    "vendor/openscad/openscad.js",
    "text/javascript",
    BROWSER_RENDERER.openscadGlueSha256,
  ],
  [
    "/vendor/openscad/openscad.wasm",
    "vendor/openscad/openscad.wasm",
    "application/wasm",
    BROWSER_RENDERER.openscadWasmSha256,
  ],
  [
    "/vendor/openscad/bosl2.zip",
    "vendor/openscad/bosl2.zip",
    "application/octet-stream",
    BROWSER_RENDERER.bosl2ArchiveSha256,
  ],
  [
    "/vendor/openscad/manifest.json",
    "vendor/openscad/manifest.json",
    "application/json",
    "",
  ],
] as const;
export async function startAssetServer(
  directory: URL,
): Promise<{ origin: string; close(): Promise<void> }> {
  const assets = new Map(
    await Promise.all(
      files.map(async ([route, file, mime, digest]) => {
        const bytes = await readFile(new URL(file, directory));
        if (
          digest &&
          createHash("sha256").update(bytes).digest("hex") !== digest
        )
          throw new LocalWorkerError(
            "RENDERER_INTEGRITY",
            "Renderer assets do not match the pinned version. Rebuild worker assets.",
          );
        return [route as string, { bytes, mime }] as const;
      }),
    ),
  );
  let origin = "";
  const server = createServer((request, response) => {
    if (
      !origin ||
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin) ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    const asset = assets.get(request.url ?? "");
    if (!asset) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": asset.mime,
      "content-length": asset.bytes.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'",
    });
    response.end(asset.bytes);
  });
  server.requestTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Asset server did not bind.");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
