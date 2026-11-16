import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { createLocalProxy } from "../../../tooling/local-instance/browserProxy.script.mjs";
test("fixed local gateway streams bodies/cookies and rejects foreign hosts/origins", async () => {
  let calls = 0;
  const upstream = createServer((incoming, outgoing) => {
    calls++;
    assert.equal(incoming.headers["x-forwarded-host"], "127.0.0.1:43100");
    assert.equal(incoming.headers["x-forwarded-for"], undefined);
    outgoing.setHeader("set-cookie", [
      "session=local; HttpOnly",
      "other=value",
    ]);
    incoming.pipe(outgoing);
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = createLocalProxy(
    "http://127.0.0.1:43100",
    new URL(`http://127.0.0.1:${upstream.address().port}`),
  );
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const send = (host, origin) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: proxy.address().port,
          path: "/v1/test",
          method: "POST",
          headers: { host, origin, "x-forwarded-for": "untrusted" },
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () =>
            resolve({
              status: response.statusCode,
              cookies: response.headers["set-cookie"],
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end("streamed payload");
    });
  try {
    assert.deepEqual(await send("127.0.0.1:43100", "http://127.0.0.1:43100"), {
      status: 200,
      cookies: ["session=local; HttpOnly", "other=value"],
      body: "streamed payload",
    });
    assert.equal(
      (await send("evil.example", "http://127.0.0.1:43100")).status,
      403,
    );
    assert.equal(
      (await send("127.0.0.1:43100", "https://evil.example")).status,
      403,
    );
    assert.equal(calls, 1);
  } finally {
    proxy.closeAllConnections();
    upstream.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => upstream.close(resolve)),
    ]);
  }
});
