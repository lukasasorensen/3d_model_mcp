import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDataErasure } from "@theoryfoundry/model-project";
import {
  createWorkerExportFixture,
  completion,
  capability,
  stl,
} from "./fixtures/workerExport.fixture.mjs";

test("account erasure revokes access, removes files, and replays against a pre-deletion database", async () => {
  const root = await mkdtemp(join(tmpdir(), "tf-erasure-"));
  const journal = join(root, "journal"),
    exports = join(root, "exports");
  const environment = { ...process.env };
  Object.assign(process.env, {
    THEORYFOUNDRY_EXPORT_DIRECTORY: exports,
    THEORYFOUNDRY_ERASURE_DIRECTORY: journal,
  });
  const f = await createWorkerExportFixture();
  try {
    await mkdir(exports);
    const target = await f.target();
    const lease = await f.service.begin(target);
    const result = await f.service.complete(completion(lease), stl());
    const token = new URL(result.receipt.downloadUrl).searchParams.get("token");
    const pending = await f.service.begin({ ...target, format: "3mf" });
    const file = join(exports, lease.exportId);
    await writeFile(file, stl());
    await f.pool.query(
      "INSERT INTO projects(id,owner_id) VALUES ('survivor',$1)",
      [f.otherId],
    );
    const invite = randomUUID();
    await f.pool.query(
      "INSERT INTO platform_invitation(id,email,created_by,token_digest,expires_at) VALUES ($1,$2,$3,'hash',now())",
      [invite, f.ownerId + "@example.com", f.otherId],
    );
    await f.pool.query(
      "INSERT INTO verification(id,identifier,value,expires_at) VALUES ('code','digest',$1,now()),('other-code','other',$2,now())",
      [
        JSON.stringify({ type: "authorization_code", userId: f.ownerId }),
        JSON.stringify({ type: "authorization_code", userId: f.otherId }),
      ],
    );
    const dbBackup = await f.database.dumpDataDir();
    const erasure = createDataErasure(f.pool);
    await assert.rejects(
      erasure.erase({ ownerId: f.otherId, projectId: target.projectId }),
      { code: "PROJECT_NOT_FOUND" },
    );
    await erasure.erase({ ownerId: f.ownerId, projectId: null });
    await assert.rejects(readFile(file), { code: "ENOENT" });
    await assert.rejects(f.browser.download(lease.exportId, token), {
      code: "EXPORT_UNAVAILABLE",
    });
    await assert.rejects(f.service.complete(completion(pending), stl()), {
      code: "EXPORT_UNAVAILABLE",
    });
    await assert.rejects(f.service.status(capability(pending)), {
      code: "EXPORT_UNAVAILABLE",
    });
    await assert.rejects(
      f.pool.query(
        "INSERT INTO verification(id,identifier,value,expires_at) VALUES ('late','late',$1,now())",
        [JSON.stringify({ type: "authorization_code", userId: f.ownerId })],
      ),
      { code: "23503" },
    );
    const { PGlite } = await import("@electric-sql/pglite");
    const restored = new PGlite({ loadDataDir: dbBackup });
    try {
      const query = (...args) => restored.query(...args);
      const recovery = createDataErasure({
        query,
        connect: async () => ({ query, release: () => {} }),
      });
      await writeFile(file, stl());
      assert.equal(
        (await query('SELECT id FROM "user" WHERE id=$1', [f.ownerId])).rows
          .length,
        1,
      );
      await recovery.replay();
      await recovery.replay();
      await assert.rejects(readFile(file), { code: "ENOENT" });
      for (const table of [
        "revisions",
        "candidates",
        "model_exports",
        "worker_export_jobs",
        "export_download_tokens",
        "platform_invitation",
      ]) {
        assert.equal(
          (await query("SELECT count(*)::int AS n FROM " + table)).rows[0].n,
          0,
          table,
        );
      }
      assert.deepEqual((await query('SELECT id FROM "user"')).rows, [
        { id: f.otherId },
      ]);
      assert.deepEqual((await query("SELECT id FROM projects")).rows, [
        { id: "survivor" },
      ]);
      assert.deepEqual((await query("SELECT id FROM verification")).rows, [
        { id: "other-code" },
      ]);
      await query(
        "INSERT INTO projects(id,owner_id,is_deleted) VALUES ('legacy-deleted',$1,true)",
        [f.otherId],
      );
      await recovery.replay();
      assert.deepEqual((await query("SELECT id FROM projects")).rows, [
        { id: "survivor" },
      ]);
      // Restore an old invitation without the accepted account. Replay must revoke that link too.
      await query(
        "INSERT INTO platform_invitation(id,email,created_by,token_digest,expires_at) VALUES ($1,'test@example.com',$2,'restore',now())",
        [invite, f.otherId],
      );
      await recovery.replay();
      assert.deepEqual(
        (await query("SELECT id FROM platform_invitation")).rows,
        [],
      );
    } finally {
      await restored.close();
    }
  } finally {
    for (const name of [
      "THEORYFOUNDRY_EXPORT_DIRECTORY",
      "THEORYFOUNDRY_ERASURE_DIRECTORY",
    ]) {
      if (environment[name] === undefined) delete process.env[name];
      else process.env[name] = environment[name];
    }
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("an unavailable production journal prevents deletion and corrupt records stop recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "tf-erasure-unavailable-"));
  const f = await createWorkerExportFixture();
  const before = process.env.THEORYFOUNDRY_ERASURE_DIRECTORY;
  const mode = process.env.NODE_ENV;
  Object.assign(process.env, {
    THEORYFOUNDRY_ERASURE_DIRECTORY: root,
    NODE_ENV: "production",
  });
  try {
    const { projectId } = await f.target();
    process.env.NODE_ENV = "development";
    await assert.rejects(
      createDataErasure(f.pool, { requireManagedJournal: true }).replay(),
      { code: "ENOENT" },
    );
    process.env.NODE_ENV = "production";
    const erasure = createDataErasure(f.pool);
    await assert.rejects(
      erasure.erase({ ownerId: f.ownerId, projectId: null }),
      { code: "ENOENT" },
    );
    assert.equal(
      (await f.repository.getProjectState(projectId)).projectId,
      projectId,
    );
    await writeFile(join(root, "JOURNAL"), "theoryfoundry-erasure-v1\n");
    await writeFile(join(root, "0".repeat(64) + ".json"), "{}");
    await assert.rejects(erasure.replay());
    assert.equal(
      (await f.repository.getProjectState(projectId)).projectId,
      projectId,
    );
  } finally {
    if (before === undefined)
      delete process.env.THEORYFOUNDRY_ERASURE_DIRECTORY;
    else process.env.THEORYFOUNDRY_ERASURE_DIRECTORY = before;
    if (mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = mode;
    await f.close();
    await rm(root, { recursive: true, force: true });
  }
});
