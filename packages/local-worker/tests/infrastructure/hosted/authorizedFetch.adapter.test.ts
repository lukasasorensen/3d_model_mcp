import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  createAuthorizedFetch,
  createHostedWorkerApi,
  createHostedToolCaller,
} from "../../../src/infrastructure/hosted/index.js";
import { fixture } from "../../fixtures/compute.fixture.js";
void test("authenticated HTTP transport forwards MCP and multipart artifacts without session or credential leakage", async () => {
  const calls: string[] = [];
  let tokenReads = 0;
  const host = createServer((request, response) => {
    void (async (): Promise<void> => {
      assert.equal(
        request.headers.authorization,
        "Bearer synthetic-test-token",
      );
      calls.push(`${request.method} ${request.url}`);
      if (request.method === "GET") {
        response.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      if (request.url === "/mcp") {
        const rpc = JSON.parse(bytes.toString()) as {
          method: string;
          id?: number;
          params: { name: string };
        };
        if (rpc.id === undefined) {
          response.writeHead(202).end();
          return;
        }
        const result =
          rpc.method === "initialize"
            ? {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "hosted-fixture", version: "1" },
              }
            : {
                content: [{ type: "text", text: "hosted-result" }],
                structuredContent: { forwarded: rpc.params.name },
              };
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
        return;
      }
      if (request.url === "/v1/worker/exports/complete") {
        const form = await new Request("http://fixture", {
          method: "POST",
          headers: { "content-type": request.headers["content-type"]! },
          body: bytes,
        }).formData();
        assert.equal(
          JSON.parse(String(form.get("metadata"))).token,
          "b".repeat(64),
        );
        const artifact = form.get("artifact");
        assert.ok(artifact instanceof File);
        assert.equal(await artifact.text(), "fixture-artifact");
      }
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true }));
    })().catch(() => {
      response.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = createAuthorizedFetch(origin, async () => {
    tokenReads++;
    return "synthetic-test-token";
  });
  try {
    const result = await createHostedToolCaller(origin, request)(
      "list_revisions",
      { projectId: "project" },
      AbortSignal.timeout(5000),
    );
    assert.deepEqual(result.structuredContent, { forwarded: "list_revisions" });
    const f = fixture();
    const {
      source: _source,
      deadline: _deadline,
      renderer: _renderer,
      executionOrigin: _origin,
      state: _state,
      ...capability
    } = f.exportLease;
    void _source;
    void _deadline;
    void _renderer;
    void _origin;
    void _state;
    assert.deepEqual(
      await createHostedWorkerApi(origin, request).upload(
        {
          ...capability,
          outcome: "COMPLETED",
          provenance: f.deps.renderer.provenance,
        },
        f.bytes,
        AbortSignal.timeout(5000),
      ),
      { ok: true },
    );
    assert.ok(tokenReads >= 4);
    assert.ok(calls.includes("POST /v1/worker/exports/complete"));
    const before = tokenReads;
    await assert.rejects(
      request("https://other.example/mcp"),
      /unsupported hosted endpoint/,
    );
    await assert.rejects(
      request(`${origin}/mcp?token=no`),
      /unsupported hosted endpoint/,
    );
    assert.equal(tokenReads, before);
  } finally {
    await new Promise<void>((resolve) => {
      host.close(() => resolve());
      host.closeAllConnections();
    });
  }
});
void test("transport refuses redirects and bounds response bodies", async () => {
  let redirected = false;
  const host = createServer((request, response) => {
    if (request.url === "/mcp")
      response.writeHead(302, { location: "/destination" }).end();
    else if (request.url === "/destination") {
      redirected = true;
      response.end();
    } else response.writeHead(200).end("x".repeat(2 * 1024 * 1024 + 1));
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = createAuthorizedFetch(origin, async () => "synthetic");
  try {
    await assert.rejects(request(`${origin}/mcp`));
    assert.equal(redirected, false);
    await assert.rejects(
      request(`${origin}/v1/worker/preview/source`),
      /byte limit/,
    );
  } finally {
    await new Promise<void>((resolve) => {
      host.close(() => resolve());
      host.closeAllConnections();
    });
  }
});
