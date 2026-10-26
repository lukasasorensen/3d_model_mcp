import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PostgresProjectNotifications } from "@theoryfoundry/model-project";
import { createWorkerExportFixture, capability, completion, stl } from "../test-support/worker-export.fixture.mjs";

// Only a disposable, empty database: this test applies all committed migrations.
const connectionString = process.env.THEORYFOUNDRY_TEST_EXPORT_DATABASE_URL;
test("real PostgreSQL serializes worker capacity, shared quota and terminal races", { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 8 });
  const notifications = new PostgresProjectNotifications(pool);
  try {
    assert.equal((await pool.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, "0", "Use an empty disposable database");
    const journal = JSON.parse(await readFile(new URL("../../model-project/drizzle/meta/_journal.json", import.meta.url), "utf8"));
    for (const { tag } of journal.entries) await pool.query(await readFile(new URL(`../../model-project/drizzle/${tag}.sql`, import.meta.url), "utf8"));
    const f = await createWorkerExportFixture({ pool, notifications });
    const targets = await Promise.all([f.target(), f.target(), f.target()]);
    const admissions = await Promise.allSettled(targets.map(target => f.service.begin(target)));
    const leases = admissions.filter(result => result.status === "fulfilled").map(result => result.value);
    assert.equal(leases.length, 2);
    assert.equal(admissions.find(result => result.status === "rejected").reason.code, "WORKER_CAPACITY");
    const [a, b] = await Promise.all([f.service.complete(completion(leases[0]), stl()), f.service.complete(completion(leases[0]), stl())]);
    assert.deepEqual(a.metadata, b.metadata); assert.equal(f.writes(), 1);
    const race = await Promise.all([f.service.complete(completion(leases[1]), stl()), f.service.cancel(capability(leases[1]))]);
    assert.equal(race[0].state, race[1].state);
    for (let i = 0; i < 8; i++) {
      const lease = await f.service.begin(await f.target());
      const operations = [() => f.service.complete(completion(lease), stl()), () => f.service.cancel(capability(lease))];
      if (i % 2) operations.reverse();
      const results = await Promise.all(operations.map(run => run()));
      assert.equal(results[0].state, results[1].state);
      assert.equal((await f.service.status(capability(lease))).state, results[0].state);
    }
    // Fill to 235 MiB: two simultaneous 10 MiB browser/worker admissions must allow exactly one.
    await pool.query("UPDATE model_exports SET reserved_bytes=0");
    await pool.query("UPDATE model_exports SET reserved_bytes=$2 WHERE id=$1", [leases[0].exportId, 235 * 1024 ** 2]);
    const left = await f.target(), right = await f.target();
    const quota = await Promise.allSettled([f.service.begin(left), f.exports.accept(right.projectId, right.revisionId, "stl", "local-mcp")]);
    assert.equal(quota.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(quota.find(result => result.status === "rejected").reason.code, "EXPORT_CAPACITY");
    assert.equal(Number((await pool.query("SELECT sum(reserved_bytes) AS n FROM model_exports")).rows[0].n), 245 * 1024 ** 2);
  } finally { notifications.close(); await pool.end(); }
});
