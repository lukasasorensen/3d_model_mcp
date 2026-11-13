import test from "node:test";
import assert from "node:assert/strict";
import { localSetupHandler } from "../../../../dist/features/local-setup/controllers/localSetup.controller.js";
test("first-account setup requires local enablement, exact origin and the private capability", async () => {
  let created = 0;
  const origin = "http://127.0.0.1:43100";
  const token = "a".repeat(64);
  const service = {
    create: async () => {
      created++;
      return Response.json({ ok: true });
    },
  };
  const handler = localSetupHandler(origin, token, service);
  const request = (
    headers = {},
    body = JSON.stringify({
      email: "local@example.com",
      name: "Local",
      password: "a long password",
    }),
  ) =>
    new Request(`${origin}/v1/local-setup`, {
      method: "POST",
      headers: { origin, "x-theoryfoundry-setup": token, ...headers },
      body,
    });
  assert.equal(
    (await localSetupHandler(undefined, token, service)(request())).status,
    404,
  );
  assert.equal(
    (await handler(request({ origin: "https://evil.example" }))).status,
    403,
  );
  assert.equal(
    (await handler(request({ "x-theoryfoundry-setup": "wrong" }))).status,
    403,
  );
  assert.equal((await handler(request({}, "x".repeat(4097)))).status, 413);
  assert.equal(created, 0);
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(created, 1);
});

test("published localhost port validates Host and Origin even when Next uses an internal request URL", async () => {
  const origin = "http://127.0.0.1:43100";
  const token = "a".repeat(64);
  const handler = localSetupHandler(origin, token, {
    create: async () => Response.json({ ok: true }),
  });
  const request = (host) =>
    new Request("http://localhost:3000/v1/local-setup", {
      method: "POST",
      headers: { host, origin, "x-theoryfoundry-setup": token },
      body: JSON.stringify({
        email: "local@example.com",
        name: "Local",
        password: "a long password",
      }),
    });
  assert.equal((await handler(request("127.0.0.1:43100"))).status, 200);
  assert.equal((await handler(request("evil.example"))).status, 403);
});
