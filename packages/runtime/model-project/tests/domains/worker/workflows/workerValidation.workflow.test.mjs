import assert from "node:assert/strict";
import test from "node:test";
import { WorkerValidationWorkflow } from "../../../../dist/domains/worker/workflows/workerValidation.workflow.js";
import { CadDomainError } from "../../../../dist/index.js";

const capability = {
  projectId: "project",
  candidateId: "candidate",
  jobId: "job",
  token: "a".repeat(64),
};

test("validation rejects unknown input before opening a transaction", async () => {
  const workflow = new WorkerValidationWorkflow(
    {
      transaction: () => {
        assert.fail("invalid input reached persistence");
      },
    },
    {},
  );
  await assert.rejects(workflow.begin({}), { name: "ZodError" });
});

test("lease recovery commits before an expected capability rejection and uses transaction-bound candidates", async () => {
  const events = [];
  const candidates = {};
  const now = new Date("2026-01-01T00:00:00Z");
  const failure = new CadDomainError("PROJECT_NOT_FOUND", "not found");
  const transaction = {
    candidates,
    expired: async (observed) => {
      assert.equal(observed, now);
      return [
        {
          id: "expired",
          project_id: "project",
          candidate_id: "candidate",
          attempt_id: "attempt",
          source_hash: "hash",
        },
      ];
    },
    finish: async (id, state) => events.push([id, state]),
    find: async () => {
      throw failure;
    },
  };
  const workflow = new WorkerValidationWorkflow(
    {
      transaction: async (operation) => {
        const result = await operation(transaction);
        events.push("commit");
        return result;
      },
    },
    {
      complete: async (persistence, input) => {
        assert.equal(persistence, candidates);
        assert.equal(input.attemptId, "attempt");
        assert.equal(input.error.code, "RENDER_FAILED");
        events.push("restore-candidate");
      },
    },
    () => now,
  );
  await assert.rejects(
    workflow.status(capability),
    (error) => error === failure,
  );
  assert.deepEqual(events, [
    "restore-candidate",
    ["expired", "EXPIRED"],
    "commit",
  ]);
});

test("operational failure escapes the transaction rather than becoming a committed domain rejection", async () => {
  const failure = new Error("database disconnected");
  let committed = false;
  const workflow = new WorkerValidationWorkflow(
    {
      transaction: async (operation) => {
        const result = await operation({
          expired: async () => [],
          find: async () => {
            throw failure;
          },
        });
        committed = true;
        return result;
      },
    },
    {},
  );
  await assert.rejects(
    workflow.status(capability),
    (error) => error === failure,
  );
  assert.equal(committed, false);
});
