import test from "node:test";
import assert from "node:assert/strict";
import { WORKER_OAUTH_CALLBACK } from "@theoryfoundry/contracts";
import { createLoopbackListener } from "../../../dist/infrastructure/authentication/loopbackListener.adapter.js";
const issuer = "https://cad.example/api/auth";
const callback = (overrides = {}) =>
  `${WORKER_OAUTH_CALLBACK}?${new URLSearchParams({ state: "expected", iss: issuer, code: "sensitive-code", ...overrides })}`;
test("listener rejects wrong state, issuer, duplicate parameters, wrong path, and replay without leaking code", async () => {
  const listener = await createLoopbackListener("expected", issuer);
  try {
    for (const url of [
      callback({ state: "wrong" }),
      callback({ iss: "https://evil.example" }),
      callback() + "&state=expected",
      callback().replace("/oauth/callback", "/other"),
    ]) {
      const response = await fetch(url);
      assert.equal(response.status, 400);
      assert.equal((await response.text()).includes("sensitive-code"), false);
    }
    const response = await fetch(callback());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.text()).includes("sensitive-code"), false);
    assert.equal(await listener.wait(), "sensitive-code");
    assert.equal((await fetch(callback())).status, 400);
  } finally {
    await listener.close();
  }
});
test("cancellation, denial and busy port fail cleanly, then port is reusable", async () => {
  const listener = await createLoopbackListener("expected", issuer);
  try {
    await assert.rejects(createLoopbackListener("other", issuer), {
      code: "CALLBACK_UNAVAILABLE",
    });
    const signal = AbortSignal.abort();
    await assert.rejects(listener.wait(signal), { code: "LOGIN_CANCELLED" });
  } finally {
    await listener.close();
  }
  const next = await createLoopbackListener("expected", issuer);
  try {
    await fetch(callback({ error: "access_denied" }));
    await assert.rejects(next.wait(), { code: "AUTHORIZATION_DENIED" });
  } finally {
    await next.close();
  }
});
