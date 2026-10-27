import assert from "node:assert/strict";
import test from "node:test";
import {
  PostgresModelProjectRepository,
  CadDomainError,
  BrowserPresenceRepository,
  RemoteRenderJobsRepository,
} from "@theoryfoundry/model-project";
import { createPostgresFixture } from "../src/test-support/postgres-fixture.mjs";
import { expectedBrowserProvenance } from "../dist/browser-renderer.js";
import { RuntimeCadWorkflowService } from "../dist/cadWorkflow.composition.js";
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
test("same candidate retries operational errors and validates only once", async () => {
  let calls = 0;
  const f = await setup({
    validateAndRender: async () => {
      if (++calls === 1)
        throw new CadDomainError("BROWSER_REQUIRED", "Open browser.", {
          retryable: true,
        });
      return valid;
    },
  });
  try {
    await assert.rejects(f.repository.validateAndRender(f.input), {
      code: "BROWSER_REQUIRED",
    });
    assert.equal(
      (
        await f.pool.query("SELECT state FROM candidates WHERE id=$1", [
          f.candidate.candidateId,
        ])
      ).rows[0].state,
      "CREATED",
    );
    assert.equal(
      (await f.repository.validateAndRender(f.input)).state,
      "VALID",
    );
    assert.equal(
      (await f.repository.validateAndRender(f.input)).state,
      "VALID",
    );
    assert.equal(calls, 2);
    assert.deepEqual(
      (
        await f.pool.query(
          "SELECT state FROM validation_attempts ORDER BY created_at",
        )
      ).rows.map((r) => r.state),
      ["FAILED", "VALID"],
    );
  } finally {
    await f.close();
  }
});
test("readiness returns trusted URL for closed, hidden and busy browsers", async () => {
  const f = await setup();
  try {
    const workflow = new RuntimeCadWorkflowService(
      f,
      f.repository,
      "owner",
      "local-mcp",
      "https://cad.example.com",
    );
    const presence = new BrowserPresenceRepository(f.pool, "owner");
    await assert.rejects(
      workflow.requireReady(f.project.projectId),
      (e) =>
        e.code === "BROWSER_REQUIRED" &&
        e.details.projectUrl ===
          `https://cad.example.com/projects/${f.project.projectId}`,
    );
    const status = {
      sessionId: "session",
      tabId: "tab",
      visible: false,
      ready: true,
      busy: false,
      localEnabled: true,
      remoteEnabled: false,
    };
    await presence.update(f.project.projectId, status);
    await assert.rejects(workflow.requireReady(f.project.projectId), {
      code: "BROWSER_REQUIRED",
    });
    await presence.update(f.project.projectId, {
      ...status,
      visible: true,
      busy: true,
    });
    await assert.rejects(workflow.requireReady(f.project.projectId), {
      code: "BROWSER_BUSY",
    });
    await presence.update(f.project.projectId, { ...status, visible: true });
    await workflow.requireReady(f.project.projectId);
    await assert.rejects(
      new RuntimeCadWorkflowService(
        f,
        f.repository,
        "other",
        "local-mcp",
        "https://cad.example.com",
      ).requireReady(f.project.projectId),
      { code: "BROWSER_REQUIRED" },
    );
  } finally {
    await f.close();
  }
});
test("attempt recovery fences late completion and allows another attempt", async () => {
  let finish;
  const f = await setup({
    validateAndRender: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  try {
    const pending = f.repository.validateAndRender(f.input);
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(
      f.repository.validateAndRender(f.input),
      (e) =>
        e.code === "VALIDATION_RUNNING" &&
        e.details.attemptId.startsWith("attempt-"),
    );
    await f.pool.query(
      "UPDATE validation_attempts SET deadline=now()-interval '1 second'",
    );
    await new RemoteRenderJobsRepository(f.pool, "owner").recover();
    finish(valid);
    assert.equal((await pending).state, "CREATED");
    assert.equal(
      (await f.pool.query("SELECT state FROM validation_attempts")).rows[0]
        .state,
      "FAILED",
    );
  } finally {
    await f.close();
  }
});

test("source rejection remains terminal while initialization and cancellation can retry", async () => {
  let calls = 0;
  const f = await setup({
    validateAndRender: async () => {
      calls++;
      if (calls === 1)
        throw new CadDomainError(
          "RENDER_FAILED",
          "Worker initialization failed.",
          { retryable: true },
        );
      if (calls === 2)
        throw new CadDomainError("CANCELLED", "Request cancelled.", {
          retryable: true,
        });
      return {
        ...valid,
        outcome: "REJECTED",
        diagnostics: [
          {
            code: "COMPILE_ERROR",
            severity: "error",
            message: "Invalid source.",
          },
        ],
      };
    },
  });
  try {
    await assert.rejects(f.repository.validateAndRender(f.input), {
      code: "RENDER_FAILED",
    });
    assert.equal(
      (
        await f.repository.getCandidate(
          f.project.projectId,
          f.candidate.candidateId,
        )
      ).state,
      "CREATED",
    );
    await assert.rejects(f.repository.validateAndRender(f.input), {
      code: "CANCELLED",
    });
    assert.equal(
      (await f.repository.validateAndRender(f.input)).state,
      "REJECTED",
    );
    await assert.rejects(f.repository.validateAndRender(f.input));
    assert.equal(calls, 3);
  } finally {
    await f.close();
  }
});
