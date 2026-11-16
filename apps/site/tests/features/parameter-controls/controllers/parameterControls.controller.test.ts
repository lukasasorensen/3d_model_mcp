import test from "node:test";
import assert from "node:assert/strict";
import { createParameterControlsHandlers } from "../../../../src/features/parameter-controls/controllers/parameterControls.controller";
import type { ParameterControlsDependencies } from "../../../../src/features/parameter-controls/parameterControls.port";

const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const context = { params: Promise.resolve({ projectId: "project" }) };
const input = {
  parentRevision: "r1",
  sessionId: "session",
  requestId: "request",
  operations: [{ op: "set_value", id: "width", value: 30 }],
};
const request = (body: unknown = input, headers = {}): Request =>
  new Request(`${origin}/v1/projects/project/parameters`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-theoryfoundry-session-id": "session",
      ...headers,
    },
    body: JSON.stringify(body),
  });
void test("parameter routes reject cross-origin, missing auth, session mismatches and oversized/definition edits before runtime access", async () => {
  const deps: ParameterControlsDependencies = {
    authenticate: async () => ({ id: "owner" }),
    withRuntime: async () => assert.fail("must not access runtime"),
  };
  const handler = createParameterControlsHandlers(deps);
  assert.equal(
    (
      await handler.POST(
        request(input, { origin: "https://other.invalid" }),
        context,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handler.POST(
        request(input, { "x-theoryfoundry-session-id": "other" }),
        context,
      )
    ).status,
    409,
  );
  for (const body of [
    { ...input, modelBody: "cube(1);" },
    { ...input, operations: [{ op: "delete", id: "width" }] },
    { ...input, operations: [...input.operations, ...input.operations] },
    { ...input, operations: [] },
  ])
    assert.equal((await handler.POST(request(body), context)).status, 400);
  assert.equal(
    (await handler.POST(request("a".repeat(270_000)), context)).status,
    413,
  );
  const denied = createParameterControlsHandlers({
    ...deps,
    authenticate: async () => new Response(null, { status: 401 }),
  });
  assert.equal((await denied.POST(request(), context)).status, 401);
  assert.equal((await denied.GET(new Request(origin), context)).status, 401);
});
