import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ModelProjectRepository } from "../../../dist/index.js";
import {
  renderer,
  withWorkspace,
} from "../../fixtures/fileProject.fixture.mjs";
import {
  exerciseSnapshots,
  width,
  source,
  accept,
} from "../../fixtures/parameterSnapshots.fixture.mjs";

test("filesystem candidates and revisions retain parameter snapshots across reopen/restore", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const make = () =>
      new ModelProjectRepository({
        workspaceRoot,
        renderer,
        acceptRendererProvenance: () => true,
      });
    const { projectId, first } = await exerciseSnapshots(make);
    const manifestPath = join(
      workspaceRoot,
      projectId,
      ".theoryfoundry",
      "versions",
      first.revisionId,
      "manifest.json",
    );
    // Verify persisted values rather than only the in-memory return value.
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.deepEqual(manifest.parameters, [width]);
    const state = await make().getProjectState(projectId);
    const proposal = await make().proposeModelSource({
      projectId,
      parentRevision: state.currentRevision,
      source: source(50),
      parameters: [{ ...width, value: 50 }],
      requestId: "durability",
      toolCallId: "durability",
    });
    const failing = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance: () => true,
      failpoint: (step) => {
        if (step === "revision-manifest-durable")
          throw new Error("injected durability failure");
      },
    });
    await assert.rejects(
      accept(failing, proposal),
      /injected durability failure/,
    );
    assert.deepEqual(await make().getProjectState(projectId), state);
    manifest.parameters[0].value = 99;
    await writeFile(manifestPath, JSON.stringify(manifest));
    await assert.rejects(
      make().restoreRevision({
        projectId,
        revision: first.revisionId,
        requestId: "corrupt",
        toolCallId: "corrupt",
      }),
      { code: "INVALID_PARAMETERS" },
    );
  });
});
