import assert from "node:assert/strict";
import test from "node:test";
import { WorkerExportWorkflow } from "../../../../dist/domains/worker/workflows/workerExport.workflow.js";
import { sha256 } from "../../../../dist/index.js";
const capability = {
  version: "1",
  projectId: "project",
  revisionId: "revision",
  format: "stl",
  jobId: "job",
  exportId: "export",
  token: "a".repeat(64),
  sourceHash: "b".repeat(64),
};

test("export status hashes the capability and preserves terminal state without issuing a receipt", async () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const workflow = new WorkerExportWorkflow(
    {
      transaction: async (clock, operation) => {
        assert.equal(clock(), now);
        return operation(
          {
            find: async (input, tokenHash, observed) => {
              assert.deepEqual(input, capability);
              assert.equal(tokenHash, sha256(capability.token));
              assert.equal(observed, now);
              return {
                id: "job",
                export_id: "export",
                project_id: "project",
                revision_id: "revision",
                format: "stl",
                source_hash: capability.sourceHash,
                state: "CANCELLED",
                deadline: now,
              };
            },
            receipt: () => assert.fail("cancelled jobs have no receipt"),
          },
          now,
        );
      },
    },
    {},
    () => now,
  );
  const result = await workflow.status(capability);
  assert.equal(result.state, "CANCELLED");
  assert.equal(result.artifactAvailable, false);
  assert.equal(result.receipt, undefined);
});

test("export rejects invalid input before persistence and propagates storage failures unchanged", async () => {
  let called = false;
  const failure = new Error("storage disconnected");
  const workflow = new WorkerExportWorkflow(
    {
      transaction: async () => {
        called = true;
        throw failure;
      },
    },
    {},
  );
  await assert.rejects(workflow.status({}), { name: "ZodError" });
  assert.equal(called, false);
  await assert.rejects(
    workflow.status(capability),
    (error) => error === failure,
  );
});
