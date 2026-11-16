import { createServer, request as httpRequest } from "node:http";
import { pathToFileURL } from "node:url";
const hopHeaders = new Set([
  "connection",
  "proxy-connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
function endToEnd(headers) {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !hopHeaders.has(key)),
  );
}
/** Fixed upstream only: the published gateway cannot proxy arbitrary destinations. */
export function createLocalProxy(
  origin,
  upstream = new URL("http://app:3000"),
) {
  const allowed = new URL(origin);
  if (
    allowed.origin !== origin ||
    allowed.protocol !== "http:" ||
    allowed.hostname !== "127.0.0.1"
  )
    throw new Error("Local proxy requires a canonical IPv4 loopback origin.");
  const server = createServer((incoming, outgoing) => {
    if (
      incoming.headers.host !== allowed.host ||
      (incoming.headers.origin && incoming.headers.origin !== origin) ||
      !incoming.url?.startsWith("/") ||
      incoming.url.startsWith("//")
    ) {
      outgoing.writeHead(403, { "cache-control": "no-store" });
      outgoing.end();
      return;
    }
    const headers = endToEnd(incoming.headers);
    delete headers["x-forwarded-for"];
    headers["x-forwarded-host"] = allowed.host;
    headers["x-forwarded-proto"] = "http";
    const remote = httpRequest(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        path: incoming.url,
        method: incoming.method,
        headers,
      },
      (response) => {
        outgoing.writeHead(
          response.statusCode ?? 502,
          endToEnd(response.headers),
        );
        response.on("error", () => outgoing.destroy());
        response.pipe(outgoing);
      },
    );
    remote.on("error", () => {
      if (!outgoing.headersSent)
        outgoing.writeHead(502, { "cache-control": "no-store" });
      outgoing.end();
    });
    incoming.on("aborted", () => remote.destroy());
    outgoing.on("close", () => {
      if (!outgoing.writableEnded) remote.destroy();
    });
    incoming.pipe(remote);
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 120000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createLocalProxy(
    process.env.THEORYFOUNDRY_LOCAL_PROXY_ORIGIN ?? "",
  );
  server.listen(3000, "0.0.0.0");
  const close = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
