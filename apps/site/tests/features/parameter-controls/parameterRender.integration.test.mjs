import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import {
  createInMemoryCadMcpClient,
  BrowserRenderCoordinator,
  expectedBrowserProvenance,
} from "@theoryfoundry/runtime";
import { createParameterControlsHandlers } from "../../../src/features/parameter-controls/controllers/parameterControls.controller.ts";
import { renderer as fixtureRenderer } from "../../../../../packages/runtime/model-project/tests/fixtures/fileProject.fixture.mjs";

test("Apply streams a session-bound browser handoff, cancels without promotion and releases the next render", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "parameter-browser-"));
  const browserRenderer = new BrowserRenderCoordinator(
    VALIDATION_POLICY_VERSION,
  );
  let browser = false;
  const repository = new ModelProjectRepository({
    workspaceRoot,
    acceptRendererProvenance: () => true,
    renderer: {
      validateAndRender: (request) =>
        (browser ? browserRenderer : fixtureRenderer).validateAndRender(
          request,
        ),
    },
  });
  const client = await createInMemoryCadMcpClient(repository);
  const handlers = createParameterControlsHandlers({
    authenticate: async () => ({ id: "owner" }),
    withRuntime: async (_, run) => run({ client, browserRenderer }),
  });
  const { projectId } = await repository.createProject({
    name: "Browser controls",
    description: "Stream binding",
  });
  const firstCandidate = await repository.proposeModelSource({
    projectId,
    parentRevision: null,
    modelBody: "cube([width,10,5]);",
    parameters: [
      {
        id: "width",
        binding: "width",
        label: "Width",
        type: "number",
        value: 20,
        defaultValue: 10,
      },
    ],
    requestId: "first",
    toolCallId: "first",
  });
  await repository.validateAndRender({
    projectId,
    candidateId: firstCandidate.candidateId,
    previewProfile: "standard",
  });
  const first = await repository.promoteCandidate({
    projectId,
    candidateId: firstCandidate.candidateId,
    expectedParentRevision: null,
  });
  browser = true;
  const origin =
    process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
  const run = async (cancel) => {
    const controller = new AbortController();
    const response = await handlers.POST(
      new Request(`${origin}/v1/projects/${projectId}/parameters`, {
        method: "POST",
        signal: controller.signal,
        headers: { origin, "x-theoryfoundry-session-id": "session" },
        body: JSON.stringify({
          parentRevision: first.revisionId,
          sessionId: "session",
          requestId: cancel ? "cancelled" : "saved",
          operations: [{ op: "set_value", id: "width", value: 30 }],
        }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    const events = [];
    let buffer = "";
    for await (const bytes of response.body) {
      buffer += new TextDecoder().decode(bytes);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = JSON.parse(line);
        events.push(event);
        if (event.type !== "render") continue;
        assert.equal(event.sessionId, "session");
        assert.match(event.job.source, /width = 30;/);
        if (cancel) {
          controller.abort();
          continue;
        }
        const completion = {
          token: event.job.token,
          sessionId: "session",
          sourceHash: event.job.sourceHash,
          outcome: "VALID",
          diagnostics: [],
          provenance: expectedBrowserProvenance(VALIDATION_POLICY_VERSION),
          geometry: {
            units: "mm",
            triangleCount: 12,
            bounds: { min: [0, 0, 0], max: [30, 10, 5] },
            dimensions: [30, 10, 5],
            checks: ["finite-coordinates", "nonempty-mesh"],
            scope: "geometry-only",
          },
        };
        assert.throws(() =>
          browserRenderer.complete(event.job.jobId, {
            ...completion,
            sessionId: "other",
          }),
        );
        browserRenderer.complete(event.job.jobId, completion);
      }
    }
    return events;
  };
  try {
    const cancelled = await run(true);
    assert.equal(cancelled.filter((e) => e.type === "render").length, 1);
    assert.equal(
      cancelled.some((e) => e.type === "saved"),
      false,
    );
    assert.equal(
      (await repository.getProjectState(projectId)).currentRevision,
      first.revisionId,
    );
    const saved = await run(false);
    assert.equal(saved.at(-1).type, "saved");
    assert.equal(
      (await repository.readModelSource(projectId)).parameters[0].value,
      30,
    );
  } finally {
    await client.close();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
