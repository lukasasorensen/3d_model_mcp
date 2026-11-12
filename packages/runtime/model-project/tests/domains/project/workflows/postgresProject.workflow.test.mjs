import test from "node:test";
import assert from "node:assert/strict";
import { PostgresModelProjectRepository } from "../../../../dist/index.js";
import { renderer } from "../../../fixtures/fileProject.fixture.mjs";
import {
  memoryPool,
  exerciseSnapshots,
  width,
  source,
  accept,
} from "../../../fixtures/parameterSnapshots.fixture.mjs";

test("PostgreSQL persists and atomically restores owner-scoped header parameter snapshots", async () => {
  const pool = await memoryPool();
  try {
    await pool.query(
      `INSERT INTO "user" (id,name,email) VALUES ('owner-a','A','a@example.test'),('owner-b','B','b@example.test')`,
    );
    const make = (ownerId = "owner-a") =>
      new PostgresModelProjectRepository({
        pool,
        ownerId,
        renderer,
        acceptRendererProvenance: () => true,
      });
    const { projectId, first, candidate } = await exerciseSnapshots(make);
    const other = make("owner-b");
    for (const operation of [
      () => other.getProjectState(projectId),
      () => other.listRevisions(projectId),
      () => other.getCandidate(projectId, candidate.candidateId),
      () =>
        other.proposeModelSource({
          projectId,
          parentRevision: first.revisionId,
          source: source(),
          parameters: [width],
          requestId: "foreign",
          toolCallId: "foreign",
        }),
      () =>
        other.restoreRevision({
          projectId,
          revision: first.revisionId,
          requestId: "foreign",
          toolCallId: "foreign",
        }),
    ])
      await assert.rejects(operation, { code: "PROJECT_NOT_FOUND" });
    assert.deepEqual(
      (
        await pool.query(
          "SELECT parameter_snapshot FROM revisions WHERE id=$1",
          [first.revisionId],
        )
      ).rows[0].parameter_snapshot,
      [width],
    );
    // A failed transaction after insertion must not advance source or parameters.
    const state = await make().getProjectState(projectId);
    const candidate2 = await make().proposeModelSource({
      projectId,
      parentRevision: state.currentRevision,
      source: source(40),
      parameters: [{ ...width, value: 40 }],
      requestId: "rollback",
      toolCallId: "rollback",
    });
    const brokenPool = {
      query: pool.query,
      connect: async () => {
        const client = await pool.connect();
        return {
          release: client.release,
          query: (sql, params) => {
            if (sql.startsWith("UPDATE projects SET current_revision_id"))
              throw new Error("injected failure");
            return client.query(sql, params);
          },
        };
      },
    };
    const broken = new PostgresModelProjectRepository({
      pool: brokenPool,
      ownerId: "owner-a",
      renderer,
      acceptRendererProvenance: () => true,
    });
    await assert.rejects(accept(broken, candidate2), /injected failure/);
    assert.deepEqual(await make().getProjectState(projectId), state);
    assert.equal(
      (await make().getCandidate(projectId, candidate2.candidateId)).state,
      "VALID",
    );
  } finally {
    await pool.end();
  }
});

test("additive migration preserves legacy candidate rows and defaults snapshots to empty", async () => {
  const pool = await memoryPool(async (database) => {
    await database.exec(`INSERT INTO "user" (id,name,email) VALUES ('legacy','Legacy','legacy@example.test');
      INSERT INTO projects (id,owner_id) VALUES ('legacy-project','legacy');
      INSERT INTO candidates (id,project_id,source,source_hash,source_bytes,state,request_id,tool_call_id)
      VALUES ('legacy-candidate','legacy-project','cube(1);','${"1".repeat(64)}',8,'CREATED','legacy','legacy');`);
  });
  try {
    const result = await pool.query(
      "SELECT source, parameter_snapshot FROM candidates WHERE id='legacy-candidate'",
    );
    assert.equal(result.rows[0].source, "cube(1);");
    assert.deepEqual(result.rows[0].parameter_snapshot, []);
  } finally {
    await pool.end();
  }
});
