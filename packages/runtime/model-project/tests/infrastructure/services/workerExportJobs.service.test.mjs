import assert from "node:assert/strict";
import test from "node:test";
import { WorkerExportJobsRepository } from "../../../dist/infrastructure/services/workerExportJobs.service.js";
import { CadDomainError } from "../../../dist/index.js";

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

function exportConnection() {
  const context = connection();
  const now = new Date("2026-01-01T00:00:00Z");
  const transaction = {};
  const jobs = new WorkerExportJobsRepository(
    context.pool,
    "owner",
    (client) => {
      assert.equal(client, context.client);
      return transaction;
    },
    async (client) => {
      assert.equal(client, context.client);
      context.events.push("capacity-lock");
    },
    async (client, observed, owner) => {
      assert.equal(client, context.client);
      assert.equal(observed, now);
      assert.equal(owner, "owner");
      context.events.push("recover");
    },
  );
  const clock = () => {
    context.events.push("clock");
    return now;
  };
  return { ...context, jobs, clock, transaction, now };
}

test("exports evaluate deadlines after locking and isolate the operation after recovery", async () => {
  const f = exportConnection();
  assert.equal(
    await f.jobs.transaction(f.clock, async (tx, now) => {
      assert.equal(tx, f.transaction);
      assert.equal(now, f.now);
      f.events.push("operation");
      return "saved";
    }),
    "saved",
  );
  assert.deepEqual(f.events, [
    "BEGIN",
    "capacity-lock",
    "clock",
    "recover",
    "SAVEPOINT worker_export_operation",
    "operation",
    "COMMIT",
    "release",
  ]);
});

test("expected export rejection commits recovery but unexpected failure rolls everything back", async () => {
  for (const expected of [true, false]) {
    const f = exportConnection();
    const failure = expected
      ? new CadDomainError("WORKER_CAPACITY", "busy")
      : new Error("database unavailable");
    await assert.rejects(
      f.jobs.transaction(f.clock, async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
    assert.equal(
      f.events.includes("ROLLBACK TO SAVEPOINT worker_export_operation"),
      expected,
    );
    assert.equal(f.events.includes("COMMIT"), expected);
    assert.equal(f.events.at(-1), "release");
    assert.ok(f.events.includes("ROLLBACK"));
  }
});
