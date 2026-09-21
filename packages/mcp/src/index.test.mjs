import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCadMcpServer, createCadToolRegistry, invokeCadTool, MCP_BOUNDARY } from "../dist/index.js";

const calls = [];
const repository = new Proxy({}, {
  get(_target, property) {
    return async (...args) => {
      calls.push([property, args]);
      if (property === "getProjectState") return { projectId: args[0], currentRevision: null, source: null, artifacts: [], diagnostics: [] };
      if (property === "listRevisions") return [];
      return { projectId: "demo" };
    };
  },
});

test("exposes exactly the approved transport-neutral CAD tool allowlist", () => {
  const registry = createCadToolRegistry(repository);
  assert.deepEqual(Object.keys(registry), [
    "create_project",
    "update_project",
    "get_project_state",
    "read_model_source",
    "propose_model_source",
    "validate_and_render",
    "promote_candidate",
    "export_model",
    "list_revisions",
    "restore_revision",
  ]);
  assert.equal(MCP_BOUNDARY, "mcp");
  assert.ok(createCadMcpServer(repository));
});

test("official MCP SDK negotiates, exposes schemas, and invokes the transport-neutral server", async () => {
  const server = createCadMcpServer(repository);
  const client = new Client({ name: "cad-domain-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), Object.keys(createCadToolRegistry(repository)));
    assert.ok(listed.tools.every((tool) => tool.inputSchema.additionalProperties === false));
    assert.ok(listed.tools.every((tool) => tool.outputSchema?.additionalProperties === false));
    const result = await client.callTool({ name: "get_project_state", arguments: { projectId: "demo" } });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.state.projectId, "demo");
    const invalid = await client.callTool({ name: "get_project_state", arguments: { projectId: "demo", path: "/tmp" } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test("strict tool validation rejects paths, unknown keys, and unsupported profiles", async () => {
  const registry = createCadToolRegistry(repository);
  for (const input of [
    { projectId: "../demo" },
    { projectId: "demo", path: "/tmp/project" },
  ]) {
    assert.deepEqual(await invokeCadTool(registry, "get_project_state", input), {
      ok: false,
      error: { code: "INVALID_TOOL_INPUT", message: "Tool input failed strict schema validation." },
    });
  }
  assert.equal((await invokeCadTool(registry, "validate_and_render", { projectId: "demo", candidateId: "candidate-1", previewProfile: "ultra" })).ok, false);
  assert.equal((await invokeCadTool(registry, "export_model", { projectId: "demo", revision: "revision-1", format: "stl" })).ok, false);
});

test("export_model fails safely when the requested revision is not current", async () => {
  const staleRepository = new Proxy({}, {
    get(_target, property) {
      return async () => {
        if (property === "getExportMetadata") throw new (await import("@rjls/model-project")).CadDomainError("STALE_REVISION", "Exports are available only for the current revision.");
        return {};
      };
    },
  });
  const result = await invokeCadTool(createCadToolRegistry(staleRepository, { exportModel: () => staleRepository.getExportMetadata() }), "export_model", { projectId: "demo", revision: "revision-old", format: "3mf" });
  assert.deepEqual(result, { ok: false, error: { code: "STALE_REVISION", message: "Exports are available only for the current revision.", details: {} } });
});

test("tool cancellation is passed to the renderer boundary", async () => {
  const registry = createCadToolRegistry(repository);
  const controller = new AbortController();
  const result = await invokeCadTool(
    registry,
    "validate_and_render",
    { projectId: "demo", candidateId: "candidate-1", previewProfile: "standard" },
    { signal: controller.signal },
  );
  assert.equal(result.ok, false);
  const call = calls.find(([name]) => name === "validateAndRender");
  assert.equal(call[1][0].signal, controller.signal);
});

test("unexpected failures are redacted from tool results", async () => {
  const unsafeRepository = new Proxy({}, { get: () => async () => { throw new Error("/Users/example/.ssh/private-key"); } });
  const result = await invokeCadTool(createCadToolRegistry(unsafeRepository), "get_project_state", { projectId: "demo" });
  assert.deepEqual(result, { ok: false, error: { code: "INTERNAL_ERROR", message: "The CAD tool failed safely." } });
  assert.doesNotMatch(JSON.stringify(result), /Users|private-key/);
});

 test("project tools validate details and dispatch mutations", async () => {
  const registry = createCadToolRegistry(repository);
  for (const [name, input] of [
    ["create_project", { name: "Bracket", description: "Mounting bracket" }],
    ["update_project", { projectId: "demo", description: "Updated bracket" }],
  ]) {
    assert.equal((await invokeCadTool(registry, name, input)).ok, true);
    assert.equal(registry[name].readOnly, false);
    assert.deepEqual(calls.at(-1), [name === "create_project" ? "createProject" : "updateProject", [input]]);
  }
  for (const [name, input] of [
    ["create_project", { name: " " }],
    ["create_project", { name: "Bracket", description: " " }],
    ["update_project", { projectId: "demo", description: "" }],
    ["create_project", { ownerId: "other" }],
    ["create_project", { description: "x".repeat(4001) }],
    ["update_project", { projectId: "demo" }],
    ["update_project", { projectId: "../demo", name: "New" }],
    ["update_project", { projectId: "demo", name: null }],
  ]) assert.equal((await invokeCadTool(registry, name, input)).error.code, "INVALID_TOOL_INPUT");
});
