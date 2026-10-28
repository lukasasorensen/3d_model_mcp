import { CadDomainError } from "@theoryfoundry/runtime";
import assert from "node:assert/strict";
import test from "node:test";
import { previewRoute } from "../../../../src/features/model-preview/controllers/previewRoutes.controller";
import type { PreviewRouteDependencies } from "../../../../src/features/model-preview/previewRoutes.port";

const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const context = { params: Promise.resolve({ projectId: "project-1" }) };
const presence = {
  sessionId: "session-1",
  tabId: "tab-1",
  visible: true,
  ready: true,
  busy: false,
  localEnabled: false,
  remoteEnabled: false,
};
const request = (body: unknown = presence): Request =>
  new Request(`${origin}/v1/projects/project-1/preview-presence`, {
    method: "POST",
    headers: { origin, "x-theoryfoundry-session-id": "session-1" },
    body: JSON.stringify(body),
  });
const unused = (): never => assert.fail("unexpected preview capability");
const dependencies = (): PreviewRouteDependencies => ({
  authenticate: async () => ({
    id: "owner-1",
    email: "owner@example.invalid",
    name: "Owner",
  }),
  authorize: async (ownerId, projectId): Promise<void> => {
    assert.equal(ownerId, "owner-1");
    assert.equal(projectId, "project-1");
  },
  presence: unused,
  claim: unused,
  status: unused,
  complete: unused,
});

void test("preview presence binds owner and session and rejects mismatched completion context", async () => {
  const deps = dependencies();
  let updates = 0;
  deps.presence = async (ownerId, projectId, body): Promise<void> => {
    assert.equal(ownerId, "owner-1");
    assert.equal(projectId, "project-1");
    assert.deepEqual(body, presence);
    updates++;
  };
  const handler = previewRoute("presence", deps);
  assert.equal(
    (
      await handler(
        request({ ...presence, sessionId: "other-session" }),
        context,
      )
    ).status,
    403,
  );
  assert.equal(updates, 0);
  assert.equal((await handler(request(), context)).status, 200);
  assert.equal(updates, 1);
});

void test("preview authorization distinguishes hidden projects from infrastructure failures", async () => {
  const deps = dependencies();
  deps.authorize = async (): Promise<never> => {
    throw new CadDomainError("PROJECT_NOT_FOUND", "Project unavailable.");
  };
  const missing = await previewRoute("presence", deps)(request(), context);
  assert.equal(missing.status, 404);
  deps.authorize = async (): Promise<never> => {
    throw new Error("private database details");
  };
  const failed = await previewRoute("presence", deps)(request(), context);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), {
    error: { code: "PREVIEW_SERVICE_UNAVAILABLE" },
  });
});
