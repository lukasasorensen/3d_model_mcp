import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLocalWorkerServer } from "../src/index.js";
import { createCadToolCatalog } from "@theoryfoundry/contracts";
import { fixture, validationInput } from "./fixtures/compute.fixture.js";
void test("MCP handshake is offline, catalog is shared, project tools forward, compute stays local", async () => {
  const f = fixture();
  const names: string[] = [];
  const worker = createLocalWorkerServer({
    ...f.deps,
    callHosted: async (name, input) => {
      names.push(name);
      assert.equal(input.projectId, "project");
      const state = {
        state: {
          projectId: "project",
          currentRevision: null,
          source: null,
          artifacts: [],
          diagnostics: [],
          rendererAvailability: "unavailable",
        },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(state) }],
        structuredContent: state,
      };
    },
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "worker-test", version: "1" });
  try {
    await worker.server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      Object.keys(createCadToolCatalog()).sort(),
    );
    assert.equal(f.calls.length, 0);
    assert.equal(names.length, 0);
    assert.match(
      listed.tools.find((tool) => tool.name === "validate_and_render")!
        .description!,
      /locally/,
    );
    const state = await client.callTool({
      name: "get_project_state",
      arguments: { projectId: "project" },
    });
    assert.equal(
      (state.structuredContent as { state: { rendererAvailability: string } })
        .state.rendererAvailability,
      "ready",
    );
    const result = await client.callTool({
      name: "validate_and_render",
      arguments: validationInput,
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(names, ["get_project_state"]);
    assert.deepEqual(
      f.calls.map((call) => call.path),
      ["validation/begin", "validation/complete"],
    );
    const invalid = await client.callTool({
      name: "validate_and_render",
      arguments: { ...validationInput, unexpected: true },
    });
    assert.equal(invalid.isError, true);
    assert.equal(f.calls.length, 2);
  } finally {
    await worker.close();
    await client.close();
  }
});
void test("MCP cancellation stops rendering and server shutdown waits for hosted lease cleanup", async () => {
  const f = fixture();
  let rendering!: () => void;
  const entered = new Promise<void>((resolve) => {
    rendering = resolve;
  });
  let closed = false;
  f.deps.renderer.render = async (
    _input,
    signal,
  ): ReturnType<typeof f.deps.renderer.render> => {
    rendering();
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  };
  f.deps.renderer.close = async (): Promise<void> => {
    closed = true;
  };
  const worker = createLocalWorkerServer({
    ...f.deps,
    callHosted: async () => {
      throw new Error("not used");
    },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  try {
    await worker.server.connect(b);
    await client.connect(a);
    const abort = new AbortController();
    const result = client.callTool(
      { name: "validate_and_render", arguments: validationInput },
      undefined,
      { signal: abort.signal },
    );
    const rejected = assert.rejects(result);
    await entered;
    abort.abort();
    await rejected;
    await worker.close();
    assert.equal(closed, true);
    assert.equal(f.calls.at(-1)!.path, "validation/cancel");
    assert.equal(f.calls.at(-1)!.signal.aborted, false);
  } finally {
    await worker.close();
    await client.close();
  }
});
void test("hosted tool errors remain actionable and are not relabeled as success", async () => {
  const worker = createLocalWorkerServer({
    ...fixture().deps,
    callHosted: async () => ({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: { code: "NOT_FOUND", message: "Project not found." },
          }),
        },
      ],
    }),
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  try {
    await worker.server.connect(b);
    await client.connect(a);
    const result = await client.callTool({
      name: "get_project_state",
      arguments: { projectId: "missing" },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result), /NOT_FOUND/);
  } finally {
    await worker.close();
    await client.close();
  }
});

void test("local validation returns compact MCP metadata for a large stored generated body", async () => {
  const f = fixture();
  const { CAD_LIMITS, parameterSnapshotSchema } =
    await import("@theoryfoundry/contracts");
  const { createHash } = await import("node:crypto");
  const modelBody = "/*" + '"'.repeat(220 * 1024) + "*/ cube([3,4,5]);";
  const parameters = parameterSnapshotSchema.parse(
    Array.from({ length: 50 }, (_, index) => ({
      id: `p${index}`,
      binding: `p${index}`,
      type: "number",
      label: `Parameter ${index}`,
      description: "x".repeat(2000),
      defaultValue: 20,
      value: 20,
    })),
  );
  f.lease.source = `// theoryfoundry:parameters:start v1\n${parameters.map((p) => `${p.binding} = ${p.value};`).join("\n")}\n// theoryfoundry:parameters:end\n${modelBody}`;
  f.lease.sourceHash = createHash("sha256")
    .update(f.lease.source)
    .digest("hex");
  Object.assign(f.candidate, {
    modelBody,
    parameters,
    sourceHash: f.lease.sourceHash,
    sourceBytes: Buffer.byteLength(f.lease.source),
  });
  assert.ok(
    Buffer.byteLength(JSON.stringify({ candidate: f.candidate })) >
      CAD_LIMITS.toolResultBytes,
  );
  const worker = createLocalWorkerServer({
    ...f.deps,
    callHosted: async () => {
      throw new Error("Validation must remain local");
    },
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "large-generated-worker", version: "1" });
  try {
    await worker.server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = (await client.callTool({
      name: "validate_and_render",
      arguments: validationInput,
    })) as CallToolResult;
    assert.equal(result.isError, undefined, JSON.stringify(result.content));
    const payload = result.structuredContent as {
      candidate: { modelBody?: string; parameters?: unknown; state: string };
    };
    assert.equal(Object.hasOwn(payload.candidate, "modelBody"), false);
    assert.deepEqual(payload.candidate.parameters, parameters);
    assert.equal(payload.candidate.state, "VALID");
    assert.ok(
      Buffer.byteLength(JSON.stringify(payload)) < CAD_LIMITS.toolResultBytes,
    );
    const text = result.content.find((part) => part.type === "text");
    assert.equal(text?.type, "text");
    assert.deepEqual(JSON.parse(text!.text), payload);
    assert.equal(f.candidate.modelBody, modelBody);
    assert.deepEqual(
      f.calls.map((call) => call.path),
      ["validation/begin", "validation/complete"],
    );
  } finally {
    await worker.close();
    await client.close();
  }
});

void test("worker MCP input budget rejects oversized argument trees before forwarding", async () => {
  const f = fixture();
  let forwarded = false;
  const worker = createLocalWorkerServer({
    ...f.deps,
    callHosted: async () => {
      forwarded = true;
      throw new Error("Unexpected forwarding");
    },
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "input-budget-test", version: "1" });
  try {
    await worker.server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: "edit_parameters",
      arguments: {
        operations: Array.from({ length: 20_000 }, () => ({
          op: "set_value",
          id: "x",
          value: [],
        })),
      },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /maximum of 65536 elements/);
    assert.ok(JSON.stringify(result).length < 1024);
    assert.equal(forwarded, false);
  } finally {
    await client.close();
    await worker.close();
  }
});
