import type { LocalMcpBrowserRenderJob } from "@theoryfoundry/contracts";
import { BROWSER_RENDERER } from "@theoryfoundry/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createClaimLocalMcpRenderHandler,
  createCompleteLocalMcpRenderHandler,
} from "../../../../src/features/browser-rendering/controllers/localMcpRoutes.controller";

void test("local MCP bridge claims bounded jobs for one browser session", async () => {
  const job = {
    version: "1" as const,
    jobId: "local-render-1",
    projectId: "demo-project",
    candidateId: "candidate-1",
    token: "a".repeat(64),
    source: "cube(1);",
    sourceHash: "b".repeat(64),
    format: "stl" as const,
    createdAt: "2026-08-18T12:00:00.000Z",
    deadline: "2026-08-18T12:01:00.000Z",
  };
  const claims: Array<[string, string]> = [];
  const handler = createClaimLocalMcpRenderHandler(
    async () => ({
      localBrowserRenderer: {
        async claimNext(
          projectId,
          sessionId,
        ): Promise<LocalMcpBrowserRenderJob> {
          claims.push([projectId, sessionId]);
          return job;
        },
        async complete(): Promise<void> {},
      },
    }),
    {
      NODE_ENV: "development",
      THEORYFOUNDRY_LOCAL_MCP_BRIDGE: "1",
      THEORYFOUNDRY_ALLOWED_ORIGIN: "http://localhost:3000",
    },
  );
  const response = await handler(
    new Request(
      "http://localhost:3000/v1/local-mcp/browser-renders/next?projectId=demo-project",
      {
        headers: { "x-theoryfoundry-session-id": "session-1" },
      },
    ),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(claims, [["demo-project", "session-1"]]);
  assert.deepEqual(await response.json(), { job });
  const denied = await handler(
    new Request(
      "http://localhost:3000/v1/local-mcp/browser-renders/next?projectId=demo-project",
      {
        headers: {
          origin: "https://attacker.invalid",
          "x-theoryfoundry-session-id": "session-1",
        },
      },
    ),
  );
  assert.equal(denied.status, 403);
});

void test("local MCP bridge completion requires exact origin and bound session", async () => {
  const completed: unknown[] = [];
  const handler = createCompleteLocalMcpRenderHandler(
    async () => ({
      localBrowserRenderer: {
        async claimNext(): Promise<null> {
          return null;
        },
        async complete(_jobId, completion): Promise<void> {
          completed.push(completion);
        },
      },
    }),
    {
      NODE_ENV: "development",
      THEORYFOUNDRY_LOCAL_MCP_BRIDGE: "1",
      THEORYFOUNDRY_ALLOWED_ORIGIN: "http://localhost:3000",
    },
  );
  const completion = {
    token: "a".repeat(64),
    sessionId: "session-1",
    sourceHash: "b".repeat(64),
    outcome: "VALID",
    diagnostics: [],
    provenance: {
      profile: "browser-wasm",
      renderer: "openscad-wasm",
      rendererVersion: "1.0.0",
      openscadVersion: BROWSER_RENDERER.openscadVersion,
      openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
      openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
      bosl2Version: BROWSER_RENDERER.bosl2Version,
      bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}`,
      backend: BROWSER_RENDERER.backend,
      commandPolicyVersion: "openscad-browser-manifold-v1",
      validationPolicyVersion: "cad-validation-v1",
    },
  };
  const response = await handler(
    new Request(
      "http://localhost:3000/v1/local-mcp/browser-renders/local-render-1",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-theoryfoundry-session-id": "session-1",
        },
        body: JSON.stringify(completion),
      },
    ),
    { params: Promise.resolve({ jobId: "local-render-1" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(completed.length, 1);
  const denied = await handler(
    new Request(
      "http://localhost:3000/v1/local-mcp/browser-renders/local-render-1",
      {
        method: "POST",
        headers: {
          origin: "https://attacker.invalid",
          "content-type": "application/json",
          "x-theoryfoundry-session-id": "session-1",
        },
        body: JSON.stringify(completion),
      },
    ),
    { params: Promise.resolve({ jobId: "local-render-1" }) },
  );
  assert.equal(denied.status, 403);
});
