import test from "node:test";
import assert from "node:assert/strict";
import { createObjectEditingHandlers } from "../../../../src/features/object-editing/controllers/objectEditing.controller";
import type { ObjectEditingDependencies } from "../../../../src/features/object-editing/objectEditing.port";
const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const context = { params: Promise.resolve({ projectId: "project" }) };
const input = {
  parentRevision: "r1",
  sessionId: "session",
  requestId: "request",
  modelFiles: {
    version: 1,
    files: [{ id: "f", name: "Part", body: "cube(1);" }],
    objects: [{ id: "o", name: "Part", fileId: "f" }],
    composition: { operation: "union", objectIds: ["o"] },
  },
};
const request = (body: unknown = input, headers = {}): Request =>
  new Request(`${origin}/v1/projects/project/objects`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-theoryfoundry-session-id": "session",
      ...headers,
    },
    body: JSON.stringify(body),
  });
void test("object routes reject unauthorized, cross-origin, wrong-session, oversized and invalid snapshot requests before runtime access", async () => {
  const deps: ObjectEditingDependencies = {
    authenticate: async () => ({ id: "owner" }),
    withRuntime: async () => assert.fail("must not access runtime"),
  };
  const handler = createObjectEditingHandlers(deps);
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
    { ...input, parameters: [] },
    {
      ...input,
      modelFiles: {
        ...input.modelFiles,
        composition: { operation: "union", objectIds: ["missing"] },
      },
    },
    {
      ...input,
      modelFiles: {
        ...input.modelFiles,
        objects: [
          {
            id: "o",
            name: "Part",
            fileId: "f",
            transform: {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [0, 1, 1],
            },
          },
        ],
      },
    },
  ])
    assert.equal((await handler.POST(request(body), context)).status, 400);
  assert.equal(
    (await handler.POST(request("a".repeat(300_000)), context)).status,
    413,
  );
  const denied = createObjectEditingHandlers({
    ...deps,
    authenticate: async () => new Response(null, { status: 401 }),
  });
  assert.equal((await denied.POST(request(), context)).status, 401);
  assert.equal((await denied.GET(new Request(origin), context)).status, 401);
});
