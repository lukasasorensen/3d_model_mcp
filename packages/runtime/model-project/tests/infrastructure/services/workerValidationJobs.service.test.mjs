import assert from "node:assert/strict";
import test from "node:test";
import { WorkerValidationJobsRepository } from "../../../dist/infrastructure/services/workerValidationJobs.service.js";

function connection() {
  const events = [];
  const client = {
    query: async (sql) => {
      events.push(sql);
    },
    release: () => events.push("release"),
  };
  return { events, client, pool: { connect: async () => client } };
}

test("validation locks the owner and gives every operation the same transaction client", async () => {
  const { pool, client, events } = connection();
  const transaction = { lockOwner: async () => events.push("owner-lock") };
  const jobs = new WorkerValidationJobsRepository(pool, (value) => {
    assert.equal(value, client);
    return transaction;
  });
  const result = await jobs.transaction(async (value) => {
    assert.equal(value, transaction);
    events.push("operation");
    return "saved";
  });
  assert.equal(result, "saved");
  assert.deepEqual(events, [
    "BEGIN",
    "owner-lock",
    "operation",
    "COMMIT",
    "release",
  ]);
});

test("validation rolls back and releases on lock or operation failure", async () => {
  for (const step of ["lock", "operation"]) {
    const { pool, events } = connection();
    const failure = new Error(step);
    const jobs = new WorkerValidationJobsRepository(pool, () => ({
      lockOwner: async () => {
        if (step === "lock") throw failure;
      },
    }));
    await assert.rejects(
      jobs.transaction(async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.deepEqual(events, ["BEGIN", "ROLLBACK", "release"]);
  }
});
