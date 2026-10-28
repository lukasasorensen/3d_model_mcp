import { WorkerAuthError } from "../../../../dist/shared/utils/authenticationError.util.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthenticationWorkflow } from "../../../../dist/domains/authentication/index.js";
import { createCredentialLock } from "../../../../dist/infrastructure/authentication/credentialLock.adapter.js";
const identity = {
  origin: "https://cad.example",
  issuer: "https://cad.example/api/auth",
  resource: "https://cad.example/mcp",
};
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "worker-auth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const saved = new Map();
  let serial = 0;
  let active = 0;
  let maximum = 0;
  let closed = 0;
  const revoked = [];
  const store = {
    read: async (account) => saved.get(account) ?? null,
    write: async (value) => {
      saved.set(value.account, value);
    },
    remove: async (account) => {
      saved.delete(account);
    },
  };
  const used = new Set();
  const transport = {
    async exchange(parameters) {
      if (parameters.refresh_token) {
        assert.equal(
          used.has(parameters.refresh_token),
          false,
          "rotation must not reuse a refresh token",
        );
        used.add(parameters.refresh_token);
      }
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return {
        token: `access-${++serial}`,
        refreshToken: `refresh-${serial}`,
        account: "owner",
        expiresAt: Date.now() + 300_000,
      };
    },
    async revoke(token) {
      revoked.push(token);
    },
  };
  const create = () =>
    createAuthenticationWorkflow({
      identity,
      store,
      transport,
      lock: createCredentialLock(directory, identity.origin),
      listen: async () => ({
        wait: async () => "code",
        close: async () => {
          closed++;
        },
      }),
    });
  return {
    create,
    saved,
    store,
    transport,
    revoked,
    maximum: () => maximum,
    closed: () => closed,
  };
}
test("PKCE login saves only refresh credentials, verifies binding, and closes listener", async (t) => {
  const f = await fixture(t);
  let authorization;
  const auth = f.create();
  assert.equal(
    await auth.login(async (url) => {
      authorization = new URL(url);
    }),
    "owner",
  );
  assert.equal(
    authorization.searchParams.get("client_id"),
    "theoryfoundry-local-worker",
  );
  assert.equal(authorization.searchParams.get("resource"), identity.resource);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.searchParams.get("code_challenge").length, 43);
  assert.equal(authorization.searchParams.get("state").length, 43);
  assert.equal(
    JSON.stringify([...f.saved.values()]).includes("access-"),
    false,
  );
  assert.equal(f.saved.get("owner").origin, identity.origin);
  assert.equal((await auth.accessToken("owner")).token, "access-1");
  assert.equal(f.closed(), 1);
});
test("independent clients serialize refresh and observe logout before cached token use", async (t) => {
  const f = await fixture(t);
  const initial = f.create();
  await initial.login(async () => {});
  const clients = Array.from({ length: 5 }, () => f.create());
  await Promise.all(clients.map((auth) => auth.accessToken("owner")));
  assert.equal(f.maximum(), 1);
  await initial.logout("owner");
  assert.equal(f.revoked.length, 1);
  await assert.rejects(clients[0].accessToken("owner"), {
    code: "LOGIN_REQUIRED",
  });
});
test("invalid grant clears local credentials; network failure preserves them for retry", async (t) => {
  const f = await fixture(t);
  await f.create().login(async () => {});
  f.transport.exchange = async () => {
    throw new WorkerAuthError("OAUTH_UNAVAILABLE", "safe");
  };
  await assert.rejects(f.create().accessToken("owner"), {
    code: "OAUTH_UNAVAILABLE",
  });
  assert.ok(f.saved.has("owner"));
  f.transport.exchange = async () => {
    throw new WorkerAuthError("LOGIN_REQUIRED", "safe");
  };
  await assert.rejects(f.create().accessToken("owner"), {
    code: "LOGIN_REQUIRED",
  });
  assert.equal(f.saved.has("owner"), false);
});
test("revocation failure preserves credential; successful retry removes it", async (t) => {
  const f = await fixture(t);
  const auth = f.create();
  await auth.login(async () => {});
  f.transport.revoke = async () => {
    throw new WorkerAuthError("REVOCATION_FAILED", "safe");
  };
  await assert.rejects(auth.logout("owner"), { code: "REVOCATION_FAILED" });
  assert.ok(f.saved.has("owner"));
  f.transport.revoke = async () => {};
  await auth.logout("owner");
  assert.equal(f.saved.size, 0);
});
test("write failure revokes newly issued token and never returns access; opener failure closes listener", async (t) => {
  const f = await fixture(t);
  f.store.write = async () => {
    throw new Error("secret-bearing native error");
  };
  await assert.rejects(
    f.create().login(async () => {}),
    { code: "CREDENTIAL_WRITE_FAILED" },
  );
  assert.equal(f.revoked.length, 1);
  assert.equal(f.closed(), 1);
  await assert.rejects(
    f.create().login(async () => {
      throw new Error("browser failed");
    }),
  );
  assert.equal(f.closed(), 2);
});
test("refresh cannot switch the saved account", async (t) => {
  const f = await fixture(t);
  await f.create().login(async () => {});
  f.transport.exchange = async () => ({
    token: "foreign",
    refreshToken: "foreign-refresh",
    account: "other",
    expiresAt: Date.now() + 100_000,
  });
  await assert.rejects(f.create().accessToken("owner"), {
    code: "LOGIN_REQUIRED",
  });
  assert.equal(f.saved.size, 0);
  assert.deepEqual(f.revoked, ["foreign-refresh"]);
});
