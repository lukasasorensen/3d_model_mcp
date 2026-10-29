import { createServer } from "node:http";
import { createHash } from "node:crypto";
export async function startPackageRegistry(manifest, tarball) {
  let origin;
  const server = createServer((request, response) => {
    void (async () => {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405).end();
        return;
      }
      const path = decodeURIComponent((request.url ?? "").split("?")[0]);
      if (path === `/${manifest.name}`) {
        const version = {
          ...manifest,
          dist: {
            tarball: `${origin}/worker.tgz`,
            integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
            shasum: createHash("sha1").update(tarball).digest("hex"),
          },
        };
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            name: manifest.name,
            "dist-tags": { latest: manifest.version },
            versions: { [manifest.version]: version },
            time: { [manifest.version]: "2020-01-01T00:00:00.000Z" },
          }),
        );
      } else if (path === "/worker.tgz")
        response
          .writeHead(200, {
            "content-type": "application/octet-stream",
            "content-length": tarball.length,
          })
          .end(tarball);
      else {
        if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
          response.writeHead(400).end();
          return;
        }
        const upstream = await fetch(
          `https://registry.npmjs.org${request.url}`,
          { signal: AbortSignal.timeout(30_000) },
        );
        response
          .writeHead(upstream.status, {
            "content-type":
              upstream.headers.get("content-type") ?? "application/json",
          })
          .end(Buffer.from(await upstream.arrayBuffer()));
      }
    })().catch(() => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
