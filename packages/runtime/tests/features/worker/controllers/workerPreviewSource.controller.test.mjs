import { CadDomainError } from "@theoryfoundry/model-project";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import assert from "node:assert/strict";
import test from "node:test";
import { verifyRemoteMcpToken } from "../../../../dist/features/authentication/workflows/remoteMcpAuthentication.workflow.js";
import { createWorkerPreviewSourceHandler } from "../../../../dist/features/worker/controllers/workerPreviewSource.controller.js";
import { McpAuthenticationError } from "../../../../dist/shared/utils/mcpAuthentication.util.js";
import { handleWorkerPreviewSourceRequest } from "../../../../dist/workerPreviewSource.composition.js";
const origin = "https://cad.example";
const endpoint = `${origin}/v1/worker/preview/source`;
const input = { version: "1", projectId: "project" };
const request = (body = input, headers = {}) =>
  new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

test("configured preview route requires both flags and rejects cookie-only authentication", async () => {
  const keys = [
    "THEORYFOUNDRY_REMOTE_MCP_ENABLED",
    "THEORYFOUNDRY_LOCAL_WORKER_ENABLED",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const [remote, worker, expected] of [
      ["0", "0", 404],
      ["1", "0", 404],
      ["0", "1", 404],
      ["1", "1", 401],
    ]) {
      process.env[keys[0]] = remote;
      process.env[keys[1]] = worker;
      const response = await handleWorkerPreviewSourceRequest(
        request(input, { cookie: "session=browser" }),
      );
      assert.equal(response.status, expected);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});

test("preview handler enforces origin, strict JSON and streaming limits before resolving source", async () => {
  let authenticated = 0;
  let resolved = 0;
  const handler = createWorkerPreviewSourceHandler({
    enabled: () => true,
    origin: () => origin,
    authenticate: async () => {
      authenticated++;
      return "owner";
    },
    service: (owner) => ({
      resolve: async (body) => {
        assert.equal(owner, "owner");
        assert.deepEqual(body, input);
        resolved++;
        return { source: "cube(1);" };
      },
    }),
  });
  assert.equal((await handler(new Request(endpoint))).status, 405);
  assert.equal(
    (await handler(request(input, { origin: "https://foreign.example" })))
      .status,
    403,
  );
  assert.equal(authenticated, 0);
  for (const body of [
    { ...input, ownerId: "other" },
    { ...input, version: "2" },
    { ...input, revisionId: "r", candidateId: "c" },
  ]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal(
    (await handler(new Request(endpoint, { method: "POST", body: "{" })))
      .status,
    400,
  );
  assert.equal(
    (await handler(request(input, { "content-length": "999999" }))).status,
    413,
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(128 * 1024 + 1));
      controller.close();
    },
  });
  assert.equal(
    (
      await handler(
        new Request(endpoint, { method: "POST", body: stream, duplex: "half" }),
      )
    ).status,
    413,
  );
  const abort = new AbortController();
  abort.abort();
  assert.equal(
    (
      await handler(
        new Request(endpoint, {
          method: "POST",
          body: JSON.stringify(input),
          signal: abort.signal,
        }),
      )
    ).status,
    408,
  );
  assert.equal(resolved, 0);
  for (const headers of [{}, { origin }]) {
    const response = await handler(request(input, headers));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(resolved, 2);
});

test("preview errors distinguish missing targets, domain conflicts and operational outages", async () => {
  let failure;
  const handler = createWorkerPreviewSourceHandler({
    enabled: () => true,
    origin: () => origin,
    authenticate: async () => "owner",
    service: () => ({
      resolve: async () => {
        throw failure;
      },
    }),
  });
  for (const code of [
    "PROJECT_NOT_FOUND",
    "REVISION_NOT_FOUND",
    "CANDIDATE_NOT_FOUND",
  ]) {
    failure = new CadDomainError(code, "Missing");
    assert.equal((await handler(request())).status, 404);
  }
  for (const code of [
    "INVALID_CANDIDATE_STATE",
    "SOURCE_HASH_MISMATCH",
    "CORRUPT_PROJECT",
  ]) {
    failure = new CadDomainError(code, "Invalid source");
    assert.equal((await handler(request())).status, 409);
  }
  for (const error of [
    new Error("private storage detail"),
    new RangeError("storage range error"),
  ]) {
    failure = error;
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "WORKER_PREVIEW_SOURCE_UNAVAILABLE" },
    });
  }
  const unavailable = createWorkerPreviewSourceHandler({
    enabled: () => true,
    origin: () => origin,
    authenticate: async () => {
      throw new Error("private auth database detail");
    },
    service: () => {
      throw new Error("Must not dispatch");
    },
  });
  const response = await unavailable(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: { code: "AUTHENTICATION_UNAVAILABLE" },
  });
});

test("preview authorization uses CAD audience and scope and rechecks revoked grants on every source read", async () => {
  const keys = await generateKeyPair("ES256");
  const jwks = { keys: [await exportJWK(keys.publicKey)] };
  const issuer = `${origin}/api/auth`,
    resource = `${origin}/mcp`;
  let grant = "grant-a",
    reads = 0;
  const sign = (audience = resource, scope = "cad:tools") =>
    new SignJWT({ client_id: "worker", cad_grant: "grant-a", scope })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject("owner")
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(keys.privateKey);
  const pool = { query: async () => ({ rows: grant ? [{ id: grant }] : [] }) };
  const handler = createWorkerPreviewSourceHandler({
    enabled: () => true,
    origin: () => origin,
    authenticate: async (request) => {
      const bearer = request.headers.get("authorization");
      if (!bearer?.startsWith("Bearer "))
        throw new McpAuthenticationError(401, "invalid_token");
      return verifyRemoteMcpToken(bearer.slice(7), {
        pool,
        jwks,
        issuer,
        resource,
      });
    },
    service: (owner) => ({
      resolve: async () => {
        assert.equal(owner, "owner");
        reads++;
        return {};
      },
    }),
  });
  const token = await sign();
  const call = (token) =>
    handler(request(input, { authorization: `Bearer ${token}` }));
  assert.equal((await call(await sign(`${origin}/unrelated`))).status, 401);
  assert.equal(
    (await call(await sign(resource, "offline_access"))).status,
    403,
  );
  assert.equal(reads, 0);
  assert.equal((await call(token)).status, 200);
  grant = undefined;
  const revoked = await call(token);
  assert.equal(revoked.status, 401);
  assert.ok(revoked.headers.get("www-authenticate").includes("invalid_token"));
  assert.equal(reads, 1);
});
