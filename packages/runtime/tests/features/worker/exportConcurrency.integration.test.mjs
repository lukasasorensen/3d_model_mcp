import { PostgresProjectNotifications } from "@theoryfoundry/model-project";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import {
  capability,
  completion,
  createWorkerExportFixture,
  stl,
} from "../../fixtures/workerExport.fixture.mjs";
// Only a disposable, empty database: this test applies all committed migrations.
const connectionString = process.env.THEORYFOUNDRY_TEST_EXPORT_DATABASE_URL;
test(
  "real PostgreSQL serializes worker capacity, shared quota and terminal races",
  { skip: !connectionString },
  async () => {
    const pool = new pg.Pool({ connectionString, max: 8 });
    const notifications = new PostgresProjectNotifications(pool);
    try {
      assert.equal(
        (
          await pool.query(
            "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].n,
        "0",
        "Use an empty disposable database",
      );
      const journal = JSON.parse(
        await readFile(
          new URL(
            "../../../model-project/drizzle/meta/_journal.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const { tag } of journal.entries) {
        if (tag === "0013_project_lifecycle") {
          await pool.query(
            "INSERT INTO \"user\" (id,name,email) VALUES ('legacy','Legacy','legacy@example.com')",
          );
          await pool.query(
            "INSERT INTO projects (id,owner_id) VALUES ('existing-project','legacy')",
          );
        }
        await pool.query(
          await readFile(
            new URL(
              `../../../model-project/drizzle/${tag}.sql`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      }
      assert.deepEqual(
        (
          await pool.query(
            "SELECT is_archived,is_deleted FROM projects WHERE id='existing-project'",
          )
        ).rows,
        [{ is_archived: false, is_deleted: false }],
      );
      const f = await createWorkerExportFixture({ pool, notifications });
      const targets = await Promise.all([f.target(), f.target(), f.target()]);
      const admissions = await Promise.allSettled(
        targets.map((target) => f.service.begin(target)),
      );
      const leases = admissions
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
      assert.equal(leases.length, 2);
      assert.equal(
        admissions.find((result) => result.status === "rejected").reason.code,
        "WORKER_CAPACITY",
      );
      const [a, b] = await Promise.all([
        f.service.complete(completion(leases[0]), stl()),
        f.service.complete(completion(leases[0]), stl()),
      ]);
      assert.deepEqual(a.metadata, b.metadata);
      assert.equal(f.writes(), 1);
      const race = await Promise.all([
        f.service.complete(completion(leases[1]), stl()),
        f.service.cancel(capability(leases[1])),
      ]);
      assert.equal(race[0].state, race[1].state);
      for (let i = 0; i < 8; i++) {
        const lease = await f.service.begin(await f.target());
        const operations = [
          () => f.service.complete(completion(lease), stl()),
          () => f.service.cancel(capability(lease)),
        ];
        if (i % 2) operations.reverse();
        const results = await Promise.all(operations.map((run) => run()));
        assert.equal(results[0].state, results[1].state);
        assert.equal(
          (await f.service.status(capability(lease))).state,
          results[0].state,
        );
      }
      // Queue completion behind an uncommitted deletion, then release the project lock.
      const retiring = await f.target();
      const late = await f.service.begin(retiring);
      const deletion = await pool.connect();
      try {
        await deletion.query("BEGIN");
        await deletion.query(
          "UPDATE projects SET is_deleted=true WHERE id=$1 AND owner_id=$2",
          [retiring.projectId, f.ownerId],
        );
        const before = f.writes();
        const rejected = assert.rejects(
          f.service.complete(completion(late), stl()),
          { code: "EXPORT_UNAVAILABLE" },
        );
        let blocked = false;
        for (let poll = 0; poll < 100 && !blocked; poll++) {
          const waits = await deletion.query(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))) AS blocked",
          );
          blocked = waits.rows[0].blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(blocked, "completion must wait on the project row");
        await deletion.query("COMMIT");
        await rejected;
        assert.equal(f.writes(), before);
      } finally {
        await deletion.query("ROLLBACK");
        deletion.release();
      }
      // Fill to 235 MiB: two simultaneous 10 MiB browser/worker admissions must allow exactly one.
      await pool.query("UPDATE model_exports SET reserved_bytes=0");
      await pool.query(
        "UPDATE model_exports SET reserved_bytes=$2 WHERE id=$1",
        [leases[0].exportId, 235 * 1024 ** 2],
      );
      const left = await f.target(),
        right = await f.target();
      const quota = await Promise.allSettled([
        f.service.begin(left),
        f.exports.accept(right.projectId, right.revisionId, "stl", "local-mcp"),
      ]);
      assert.equal(
        quota.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        quota.find((result) => result.status === "rejected").reason.code,
        "EXPORT_CAPACITY",
      );
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT sum(reserved_bytes) AS n FROM model_exports",
            )
          ).rows[0].n,
        ),
        245 * 1024 ** 2,
      );
    } finally {
      notifications.close();
      await pool.end();
    }
  },
);
