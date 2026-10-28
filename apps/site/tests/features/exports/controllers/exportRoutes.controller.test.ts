import assert from "node:assert/strict";
import test from "node:test";
import { exportRoute } from "../../../../src/features/exports/controllers/exportRoutes.controller";
import type { ExportRouteDependencies } from "../../../../src/features/exports/exportRoutes.port";

const context = { params: Promise.resolve({ projectId: "project-1" }) };
const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const request = (allowedOrigin = origin): Request =>
  new Request(`${origin}/v1/projects/project-1/export-jobs/claim`, {
    method: "POST",
    headers: {
      origin: allowedOrigin,
      "x-theoryfoundry-session-id": "session-1",
    },
  });
const unused = (): never =>
  assert.fail("admission must finish before persistence");

void test("export admission checks origin and authentication before persistence", async () => {
  let authenticated = 0;
  const handler = exportRoute("claim", {
    authenticate: async () => {
      authenticated++;
      return new Response(null, { status: 401 });
    },
    createStore: unused,
    createExports: unused,
  });
  assert.equal(
    (await handler(request("https://attacker.invalid"), context)).status,
    403,
  );
  assert.equal(authenticated, 0);
  assert.equal((await handler(request(), context)).status, 401);
  assert.equal(authenticated, 1);
});

void test("export claims bind owner, project and session and hide infrastructure failures", async () => {
  const dependencies: ExportRouteDependencies = {
    authenticate: async () => ({
      id: "owner-1",
      email: "owner@example.invalid",
      name: "Owner",
    }),
    createStore: (
      ownerId,
    ): {
      get: () => never;
      claim: (
        projectId: string,
        sessionId: string,
        modes: string[],
      ) => Promise<undefined>;
    } => {
      assert.equal(ownerId, "owner-1");
      return {
        get: unused,
        claim: async (projectId, sessionId, modes): Promise<undefined> => {
          assert.equal(projectId, "project-1");
          assert.equal(sessionId, "session-1");
          assert.ok(modes.includes("chat"));
          return undefined;
        },
      };
    },
    createExports: unused,
  };
  const response = await exportRoute("claim", dependencies)(request(), context);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  dependencies.createStore = (): never => {
    throw new Error("private database details");
  };
  const failed = await exportRoute("claim", dependencies)(request(), context);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), {
    error: { code: "EXPORT_UNAVAILABLE" },
  });
});
