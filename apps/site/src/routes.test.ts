import assert from "node:assert/strict";
import test from "node:test";
import { POST as restoreRevision } from "./app/v1/projects/[projectId]/revisions/[revisionId]/restore/route";
import { BROWSER_RENDERER } from "@rjls/contracts";
import { createClaimLocalMcpRenderHandler, createCompleteLocalMcpRenderHandler, localMcpBridgeEnabled } from "./lib/local-mcp-browser-routes";
import { createReadinessHandler } from "./lib/readiness-route";
import { isCadDomainError } from "./lib/server-auth";

test("readiness route returns 503 unless the renderer probe succeeds", async () => {
  const unavailable = createReadinessHandler(async () => ({ probeReadiness: async () => { throw new Error("/private/toolchain detail"); } }));
  const failedResponse = await unavailable();
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { readiness: { status: "unavailable", message: "The local CAD runtime is unavailable." } });

  const ready = createReadinessHandler(async () => ({ probeReadiness: async () => ({ status: "ready" as const, profile: "browser-wasm" as const }) }));
  const readyResponse = await ready();
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), { readiness: { status: "ready", profile: "browser-wasm" } });
});

test("restore route enforces exact same-origin requests", async () => {
  const response = await restoreRevision(new Request("http://localhost/v1", { method: "POST", headers: { origin: "https://attacker.invalid" } }), { params: Promise.resolve({ projectId: "demo-project", revisionId: "revision-1" }) });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "ORIGIN_DENIED", message: "The request origin is not allowed." } });
});

test("project read errors distinguish hidden projects from operational failures", () => {
  assert.equal(isCadDomainError({ code: "PROJECT_NOT_FOUND" }, "PROJECT_NOT_FOUND"), true);
  assert.equal(isCadDomainError(new Error("database unavailable"), "PROJECT_NOT_FOUND"), false);
});

test("local MCP bridge is opt-in and disabled in production", () => {
  assert.equal(localMcpBridgeEnabled({ NODE_ENV: "development", RJLS_LOCAL_MCP_BRIDGE: "1" }), true);
  assert.equal(localMcpBridgeEnabled({ NODE_ENV: "development" }), false);
  assert.equal(localMcpBridgeEnabled({ NODE_ENV: "production", RJLS_LOCAL_MCP_BRIDGE: "1" }), false);
});

test("local MCP bridge claims bounded jobs for one browser session", async () => {
  const job = {
    version: "1" as const, jobId: "local-render-1", projectId: "demo-project", candidateId: "candidate-1",
    token: "a".repeat(64), source: "cube(1);", sourceHash: "b".repeat(64), format: "stl" as const,
    createdAt: "2026-08-18T12:00:00.000Z", deadline: "2026-08-18T12:01:00.000Z",
  };
  const claims: Array<[string, string]> = [];
  const handler = createClaimLocalMcpRenderHandler(async () => ({ localBrowserRenderer: {
    async claimNext(projectId, sessionId) { claims.push([projectId, sessionId]); return job; },
    async complete() {},
  } }), { NODE_ENV: "development", RJLS_LOCAL_MCP_BRIDGE: "1", RJLS_ALLOWED_ORIGIN: "http://localhost:3000" });
  const response = await handler(new Request("http://localhost:3000/v1/local-mcp/browser-renders/next?projectId=demo-project", {
    headers: { "x-rjls-session-id": "session-1" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(claims, [["demo-project", "session-1"]]);
  assert.deepEqual(await response.json(), { job });
  const denied = await handler(new Request("http://localhost:3000/v1/local-mcp/browser-renders/next?projectId=demo-project", {
    headers: { origin: "https://attacker.invalid", "x-rjls-session-id": "session-1" },
  }));
  assert.equal(denied.status, 403);
});

test("local MCP bridge completion requires exact origin and bound session", async () => {
  const completed: unknown[] = [];
  const handler = createCompleteLocalMcpRenderHandler(async () => ({ localBrowserRenderer: {
    async claimNext() { return null; },
    async complete(_jobId, completion) { completed.push(completion); },
  } }), { NODE_ENV: "development", RJLS_LOCAL_MCP_BRIDGE: "1", RJLS_ALLOWED_ORIGIN: "http://localhost:3000" });
  const completion = {
    token: "a".repeat(64), sessionId: "session-1", sourceHash: "b".repeat(64), outcome: "VALID", diagnostics: [],
    provenance: {
      profile: "browser-wasm", renderer: "openscad-wasm", rendererVersion: "1.0.0",
      openscadVersion: BROWSER_RENDERER.openscadVersion,
      openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
      openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
      bosl2Version: BROWSER_RENDERER.bosl2Version,
      bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}`,
      backend: BROWSER_RENDERER.backend, commandPolicyVersion: "openscad-browser-manifold-v1",
      validationPolicyVersion: "cad-validation-v1",
    },
  };
  const response = await handler(new Request("http://localhost:3000/v1/local-mcp/browser-renders/local-render-1", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-rjls-session-id": "session-1" },
    body: JSON.stringify(completion),
  }), { params: Promise.resolve({ jobId: "local-render-1" }) });
  assert.equal(response.status, 200);
  assert.equal(completed.length, 1);
  const denied = await handler(new Request("http://localhost:3000/v1/local-mcp/browser-renders/local-render-1", {
    method: "POST", headers: { origin: "https://attacker.invalid", "content-type": "application/json", "x-rjls-session-id": "session-1" },
    body: JSON.stringify(completion),
  }), { params: Promise.resolve({ jobId: "local-render-1" }) });
  assert.equal(denied.status, 403);
});
