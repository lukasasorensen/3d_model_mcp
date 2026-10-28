import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PostgresModelProjectRepository,
  ModelExportsRepository,
  sha256,
} from "@theoryfoundry/model-project";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createCadMcpServer } from "@theoryfoundry/mcp";
import { createRemoteMcpHandler } from "../dist/remote-mcp-http.js";
import { createPostgresFixture } from "../src/test-support/postgres-fixture.mjs";
import { expectedBrowserProvenance } from "../dist/browser-renderer.js";
import { RuntimeCadWorkflowService } from "../dist/cadWorkflow.composition.js";
import { ModelExportService } from "../dist/modelExport.composition.js";
import { DirectoryExportFileStore } from "../dist/export-file-store.js";
const provenance = expectedBrowserProvenance("cad-validation-v1");
const valid = {
  outcome: "VALID",
  diagnostics: [],
  provenance,
  validationPolicyVersion: "cad-validation-v1",
  artifacts: [],
};
async function setup(renderer = { validateAndRender: async () => valid }) {
  const fixture = await createPostgresFixture();
  await fixture.pool.query(
    `INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.com'),('other','Other','other@example.com')`,
  );
  const repository = new PostgresModelProjectRepository({
    pool: fixture.pool,
    ownerId: "owner",
    renderer,
    acceptRendererProvenance: () => true,
  });
  const project = await repository.createProject({
    name: "Cup holder",
    description: "Test",
  });
  const candidate = await repository.proposeModelSource({
    projectId: project.projectId,
    parentRevision: null,
    source: "cube(10);",
    requestId: "request",
    toolCallId: "tool",
  });
  return {
    ...fixture,
    repository,
    project,
    candidate,
    input: {
      projectId: project.projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    },
  };
}
function stl() {
  const points = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ],
    triangles = [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
      [1, 2, 3],
    ];
  const bytes = new Uint8Array(84 + 50 * 4),
    v = new DataView(bytes.buffer);
  v.setUint32(80, 4, true);
  triangles.forEach((t, i) =>
    t
      .flatMap((n) => points[n])
      .forEach((n, j) => v.setFloat32(96 + i * 50 + j * 4, n, true)),
  );
  return bytes;
}
test("exports bind ownership and revision, verify bytes, reuse files and expire bearer tokens", async () => {
  const f = await setup(),
    directory = await mkdtemp(join(tmpdir(), "cad-export-"));
  try {
    await f.repository.validateAndRender(f.input);
    const revision = await f.repository.promoteCandidate({
      ...f.input,
      expectedParentRevision: null,
    });
    const repository = new ModelExportsRepository(f.pool, "owner"),
      files = new DirectoryExportFileStore(directory),
      service = new ModelExportService(f, files);
    const row = await repository.accept(
      f.project.projectId,
      revision.revisionId,
      "stl",
      "local-mcp",
    );
    assert.equal(
      (
        await repository.accept(
          f.project.projectId,
          revision.revisionId,
          "stl",
          "local-mcp",
        )
      ).id,
      row.id,
    );
    assert.equal(
      await new ModelExportsRepository(f.pool, "other").claim(
        f.project.projectId,
        "other",
        ["local-mcp"],
      ),
      undefined,
    );
    const job = await repository.claim(f.project.projectId, "session", [
      "local-mcp",
    ]);
    assert.equal(
      await repository.claim(f.project.projectId, "session", ["local-mcp"]),
      undefined,
    );
    const bytes = stl();
    await assert.rejects(
      service.complete(
        "other",
        f.project.projectId,
        row.id,
        "session",
        job.token,
        job.sourceHash,
        bytes,
      ),
    );
    await assert.rejects(
      service.complete(
        "owner",
        f.project.projectId,
        row.id,
        "session",
        job.token,
        "0".repeat(64),
        bytes,
      ),
    );
    await assert.rejects(
      service.complete(
        "owner",
        f.project.projectId,
        row.id,
        "session",
        job.token,
        job.sourceHash,
        new Uint8Array(5),
      ),
    );
    await assert.rejects(
      service.complete(
        "owner",
        f.project.projectId,
        row.id,
        "session",
        job.token,
        job.sourceHash,
        new Uint8Array(10 * 1024 ** 2 + 1),
      ),
      { code: "ARTIFACT_LIMIT_EXCEEDED" },
    );
    await service.complete(
      "owner",
      f.project.projectId,
      row.id,
      "session",
      job.token,
      job.sourceHash,
      bytes,
    );
    await assert.rejects(
      service.complete(
        "owner",
        f.project.projectId,
        row.id,
        "session",
        job.token,
        job.sourceHash,
        bytes,
      ),
    );
    const receipt = await repository.receipt(
      await repository.get(row.id),
      "https://cad.example.com",
    );
    assert.equal(receipt.hash, sha256(bytes));
    assert.equal(receipt.byteSize, bytes.length);
    assert.match(receipt.filename, /^cup-holder-/);
    const token = new URL(receipt.downloadUrl).searchParams.get("token");
    assert.deepEqual(
      (await service.download(row.id, token)).bytes,
      Buffer.from(bytes),
    );
    const stored = (
      await f.pool.query("SELECT hash FROM export_download_tokens")
    ).rows[0].hash;
    assert.equal(stored, sha256(token));
    assert.equal(
      (
        await repository.accept(
          f.project.projectId,
          revision.revisionId,
          "stl",
          "local-mcp",
        )
      ).id,
      row.id,
    );
    await f.pool.query(
      "UPDATE export_download_tokens SET expires_at=now()-interval '1 second'",
    );
    await assert.rejects(service.download(row.id, token));
    await f.pool.query(
      "UPDATE model_exports SET expires_at=now()-interval '1 second'",
    );
    await service.cleanup();
    await assert.rejects(files.read(row.id));
  } finally {
    await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("filesystem reconciliation removes old orphan uploads and keeps retained files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad-orphans-"));
  try {
    const files = new DirectoryExportFileStore(directory),
      kept = crypto.randomUUID(),
      orphan = crypto.randomUUID();
    await files.put(kept, stl());
    await files.put(orphan, stl());
    const old = new Date(Date.now() - 180000);
    await utimes(join(directory, orphan), old, old);
    await files.reconcile(new Set([kept]));
    assert.equal((await files.read(kept)).length, stl().length);
    await assert.rejects(files.read(orphan));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTTP MCP exposes readiness and retrieves verified exports without another browser render", async () => {
  const f = await setup(),
    directory = await mkdtemp(join(tmpdir(), "cad-http-export-"));
  const previous = process.env.THEORYFOUNDRY_REMOTE_MCP_ENABLED;
  process.env.THEORYFOUNDRY_REMOTE_MCP_ENABLED = "1";
  const client = new Client({ name: "workflow-http", version: "1" });
  try {
    const service = new ModelExportService(
      f,
      new DirectoryExportFileStore(directory),
    );
    const workflow = new RuntimeCadWorkflowService(
      f,
      f.repository,
      "owner",
      "remote-mcp",
      "http://localhost:3000",
      service,
    );
    const handler = createRemoteMcpHandler({
      authenticate: async () => "owner",
      createServer: async (_owner, signal) =>
        createCadMcpServer(f.repository, { signal, workflowService: workflow }),
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), {
        fetch: (url, init) => handler(new Request(url, init)),
      }),
    );
    const closed = await client.callTool({
      name: "validate_and_render",
      arguments: f.input,
    });
    assert.equal(
      JSON.parse(closed.content[0].text).error.code,
      "BROWSER_REQUIRED",
    );
    await f.repository.validateAndRender(f.input);
    const revision = await f.repository.promoteCandidate({
      ...f.input,
      expectedParentRevision: null,
    });
    const exports = new ModelExportsRepository(f.pool, "owner"),
      row = await exports.accept(
        f.project.projectId,
        revision.revisionId,
        "stl",
        "remote-mcp",
      );
    const job = await exports.claim(f.project.projectId, "session", [
      "remote-mcp",
    ]);
    await service.complete(
      "owner",
      f.project.projectId,
      row.id,
      "session",
      job.token,
      job.sourceHash,
      stl(),
    );
    const response = await client.callTool({
      name: "export_model",
      arguments: {
        projectId: f.project.projectId,
        revision: revision.revisionId,
        format: "stl",
      },
    });
    assert.equal(response.isError, undefined);
    const receipt = response.structuredContent.export;
    const downloaded = await service.download(
      receipt.exportId,
      new URL(receipt.downloadUrl).searchParams.get("token"),
    );
    assert.equal(sha256(downloaded.bytes), receipt.hash);
    assert.equal(
      (
        await client.callTool({
          name: "get_project_state",
          arguments: { projectId: f.project.projectId },
        })
      ).structuredContent.state.exports.length,
      1,
    );
  } finally {
    await client.close();
    await f.close();
    await rm(directory, { recursive: true, force: true });
    if (previous === undefined)
      delete process.env.THEORYFOUNDRY_REMOTE_MCP_ENABLED;
    else process.env.THEORYFOUNDRY_REMOTE_MCP_ENABLED = previous;
  }
});
test("export reservations enforce owner and global capacity and pin accepted revisions", async () => {
  const f = await setup(),
    directory = await mkdtemp(join(tmpdir(), "cad-quota-"));
  try {
    await f.repository.validateAndRender(f.input);
    const first = await f.repository.promoteCandidate({
      ...f.input,
      expectedParentRevision: null,
    });
    const exports = new ModelExportsRepository(f.pool, "owner"),
      service = new ModelExportService(
        f,
        new DirectoryExportFileStore(directory),
      );
    const row = await exports.accept(
      f.project.projectId,
      first.revisionId,
      "stl",
      "local-mcp",
    );
    const job = await exports.claim(f.project.projectId, "session", [
      "local-mcp",
    ]);
    await f.pool.query(
      "UPDATE model_exports SET reserved_bytes=$1 WHERE id=$2",
      [250 * 1024 ** 2, row.id],
    );
    await assert.rejects(
      exports.accept(f.project.projectId, first.revisionId, "3mf", "local-mcp"),
      { code: "EXPORT_CAPACITY" },
    );
    await f.pool.query(
      "UPDATE model_exports SET reserved_bytes=$1,owner_id='other' WHERE id=$2",
      [2 * 1024 ** 3 - 1, row.id],
    );
    await assert.rejects(
      exports.accept(f.project.projectId, first.revisionId, "3mf", "local-mcp"),
      { code: "EXPORT_CAPACITY" },
    );
    await f.pool.query(
      "UPDATE model_exports SET reserved_bytes=$1,owner_id='owner' WHERE id=$2",
      [10 * 1024 ** 2, row.id],
    );
    const next = await f.repository.proposeModelSource({
      projectId: f.project.projectId,
      parentRevision: first.revisionId,
      source: "cube(20);",
      requestId: "next",
      toolCallId: "next",
    });
    await f.repository.validateAndRender({
      ...f.input,
      candidateId: next.candidateId,
    });
    await f.repository.promoteCandidate({
      ...f.input,
      candidateId: next.candidateId,
      expectedParentRevision: first.revisionId,
    });
    await service.complete(
      "owner",
      f.project.projectId,
      row.id,
      "session",
      job.token,
      job.sourceHash,
      stl(),
    );
    assert.equal(
      (
        await exports.receipt(
          await exports.get(row.id),
          "https://cad.example.com",
        )
      ).revision,
      first.revisionId,
    );
    await assert.rejects(
      exports.accept(f.project.projectId, first.revisionId, "stl", "local-mcp"),
      { code: "STALE_REVISION" },
    );
  } finally {
    await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});
