import { CadDomainError } from "@theoryfoundry/model-project";
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerValidationHandler } from "../../../../dist/features/worker/controllers/workerValidation.controller.js";
import { McpAuthenticationError } from "../../../../dist/shared/utils/mcpAuthentication.util.js";
import { handleWorkerValidationRequest } from "../../../../dist/workerValidation.composition.js";
const body = {
  version: "1",
  projectId: "project",
  candidateId: "candidate",
  previewProfile: "standard",
};
const request = (value = body, headers = {}) =>
  new Request("https://cad.example/v1/worker/validation/begin", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });

test("worker routes are opt-in, reject foreign origins, and require OAuth rather than browser sessions", async () => {
  let enabled = false;
  let authenticated = 0;
  const handler = createWorkerValidationHandler({
    enabled: () => enabled,
    origin: () => "https://cad.example",
    authenticate: async () => {
      authenticated++;
      throw new McpAuthenticationError(401, "invalid_token");
    },
    service: () => {
      throw new Error("Must not create a service");
    },
  });
  assert.equal((await handler(request(), "begin")).status, 404);
  enabled = true;
  assert.equal(
    (await handler(request(body, { origin: "https://other.example" }), "begin"))
      .status,
    403,
  );
  assert.equal(authenticated, 0);
  const denied = await handler(
    request(body, { cookie: "session=browser-cookie" }),
    "begin",
  );
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("cache-control"), "no-store");
});

test("worker handlers validate bounded JSON before dispatch and preserve operational/capacity errors", async () => {
  let calls = 0;
  let failure;
  const handler = createWorkerValidationHandler({
    enabled: () => true,
    origin: () => "https://cad.example",
    authenticate: async () => "owner",
    service: (owner) => ({
      begin: async (input) => {
        assert.equal(owner, "owner");
        assert.deepEqual(input, body);
        calls++;
        if (failure) throw failure;
        return { accepted: true };
      },
    }),
  });
  assert.equal(
    (await handler(request({ ...body, ownerId: "forged" }), "begin")).status,
    400,
  );
  assert.equal(
    (await handler(request(body, { "content-length": "999999" }), "begin"))
      .status,
    413,
  );
  assert.equal(calls, 0);
  const ok = await handler(request(), "begin");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  failure = new CadDomainError("WORKER_CAPACITY", "Busy");
  assert.equal((await handler(request(), "begin")).status, 429);
  failure = new Error("database unavailable");
  assert.equal((await handler(request(), "begin")).status, 503);
  failure = new RangeError("storage failure");
  assert.equal((await handler(request(), "begin")).status, 503);
});

test("streamed request limits do not depend on Content-Length", async () => {
  const handler = createWorkerValidationHandler({
    enabled: () => true,
    origin: () => "https://cad.example",
    authenticate: async () => "owner",
    service: () => {
      throw new Error("Must not dispatch oversized input");
    },
  });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(128 * 1024 + 1));
      controller.close();
    },
  });
  const response = await handler(
    new Request("https://cad.example/v1/worker/validation/begin", {
      method: "POST",
      body: stream,
      duplex: "half",
    }),
    "begin",
  );
  assert.equal(response.status, 413);
});

test("the configured production handler refuses cookie-only authentication before database access", async () => {
  const previous = [
    process.env.THEORYFOUNDRY_REMOTE_MCP_ENABLED,
    process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED,
  ];
  try {
    process.env.THEORYFOUNDRY_REMOTE_MCP_ENABLED = "1";
    process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED = "1";
    const response = await handleWorkerValidationRequest(
      request(body, { cookie: "session=browser-cookie" }),
      "begin",
    );
    assert.equal(response.status, 401);
  } finally {
    for (const [index, key] of [
      "THEORYFOUNDRY_REMOTE_MCP_ENABLED",
      "THEORYFOUNDRY_LOCAL_WORKER_ENABLED",
    ].entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
  }
});
