import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { WorkerExportService } from "@theoryfoundry/model-project";
import {
  createWorkerExportFixture,
  capability,
  completion,
  stl,
  provenance,
} from "../test-support/worker-export.fixture.mjs";

test("worker exports persist only hashes, complete STL/3MF, download and replay without rewriting", async () => {
  const f = await createWorkerExportFixture();
  try {
    const target = await f.target();
    for (const format of ["stl", "3mf"]) {
      const lease = await f.service.begin({ ...target, format });
      const bytes =
        format === "stl"
          ? stl()
          : await readFile(
              new URL(
                "../../../renderer/tests/fixtures/openscad-cube.3mf",
                import.meta.url,
              ),
            );
      assert.equal(lease.source, "cube(10);");
      const saved = (
        await f.pool.query(
          "SELECT token_hash FROM worker_export_jobs WHERE id=$1",
          [lease.jobId],
        )
      ).rows[0];
      assert.notEqual(saved.token_hash, lease.token);
      assert.equal(saved.token_hash.length, 64);
      const result = await f.service.complete(completion(lease), bytes),
        writes = f.writes();
      assert.equal(result.state, "COMPLETED");
      assert.equal(result.artifactAvailable, true);
      const token = new URL(result.receipt.downloadUrl).searchParams.get(
        "token",
      );
      assert.deepEqual(
        Buffer.from((await f.browser.download(lease.exportId, token)).bytes),
        bytes,
      );
      f.advance(120001); // Exact terminal replay remains valid after the original lease deadline.
      const replay = await f.service.complete(completion(lease), bytes);
      assert.deepEqual(replay.metadata, result.metadata);
      assert.equal(f.writes(), writes);
      assert.notEqual(replay.receipt.downloadUrl, result.receipt.downloadUrl);
      assert.equal((await f.service.begin({ ...target, format })).reused, true);
      const conflict = Buffer.from(bytes);
      conflict[0] ^= 1;
      await assert.rejects(f.service.complete(completion(lease), conflict), {
        code: "EXPORT_UNAVAILABLE",
      });
      assert.ok(
        new Date(replay.receipt.downloadExpiresAt) <=
          new Date(replay.metadata.expiresAt),
      );
      await f.pool.query(
        "UPDATE model_exports SET expires_at=now()-interval '1 second' WHERE id=$1",
        [lease.exportId],
      );
      await f.browser.cleanup();
      assert.equal(f.stored.has(lease.exportId), false);
      const removed = await f.service.status(capability(lease));
      assert.equal(removed.artifactAvailable, false);
      assert.deepEqual(removed.metadata, result.metadata);
    }
  } finally {
    await f.close();
  }
});

test("owner, capability, target and provenance fences reject uploads; promotion preserves a pinned lease", async () => {
  const f = await createWorkerExportFixture();
  try {
    const target = await f.target(),
      lease = await f.service.begin(target);
    const other = new WorkerExportService(
      f.pool,
      f.otherId,
      "https://cad.example",
      f.dependencies,
    );
    await assert.rejects(other.complete(completion(lease), stl()), {
      code: "EXPORT_UNAVAILABLE",
    });
    for (const patch of [
      { token: "0".repeat(64) },
      { sourceHash: "0".repeat(64) },
      { revisionId: "wrong" },
      { format: "3mf" },
      { exportId: "wrong" },
      { projectId: "wrong" },
    ]) {
      await assert.rejects(
        f.service.complete({ ...completion(lease), ...patch }, stl()),
      );
    }
    await assert.rejects(
      f.service.complete(
        {
          ...completion(lease),
          provenance: { ...provenance, validationPolicyVersion: "old" },
        },
        stl(),
      ),
      { code: "PROVENANCE_MISMATCH" },
    );
    await assert.rejects(
      f.service.complete(completion(lease), Buffer.alloc(5)),
      { code: "EXPORT_UNAVAILABLE" },
    );
    assert.equal(f.writes(), 0);
    const candidate = await f.repository.proposeModelSource({
      projectId: target.projectId,
      parentRevision: target.revisionId,
      source: "cube(20);",
      requestId: "next",
      toolCallId: "next",
    });
    await f.repository.validateAndRender({
      projectId: target.projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    await f.repository.promoteCandidate({
      projectId: target.projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: target.revisionId,
    });
    await assert.rejects(f.service.begin(target), { code: "STALE_REVISION" });
    assert.equal(
      (await f.service.complete(completion(lease), stl())).state,
      "COMPLETED",
    );
  } finally {
    await f.close();
  }
});

test("pending modes are isolated, browser cannot claim workers, ready artifacts are shared", async () => {
  const f = await createWorkerExportFixture();
  try {
    const target = await f.target();
    const browser = await f.exports.accept(
      target.projectId,
      target.revisionId,
      "stl",
      "local-mcp",
    );
    const worker = await f.service.begin(target);
    assert.notEqual(worker.exportId, browser.id);
    assert.equal(
      (
        await f.exports.accept(
          target.projectId,
          target.revisionId,
          "stl",
          "local-mcp",
        )
      ).id,
      browser.id,
    );
    assert.equal(
      await f.exports.claim(target.projectId, "session", ["local-worker"]),
      undefined,
    );
    await f.service.complete(completion(worker), stl());
    assert.equal(
      (
        await f.exports.accept(
          target.projectId,
          target.revisionId,
          "stl",
          "local-mcp",
        )
      ).id,
      worker.exportId,
    );
  } finally {
    await f.close();
  }
});

test("capacity, cancellation, failure, expiry and terminal retention release reservations", async () => {
  const f = await createWorkerExportFixture();
  try {
    const targets = await Promise.all([f.target(), f.target(), f.target()]);
    const first = await f.service.begin(targets[0]),
      second = await f.service.begin(targets[1]);
    await assert.rejects(f.service.begin(targets[0]), {
      code: "WORKER_CAPACITY",
    });
    await assert.rejects(f.service.begin(targets[2]), {
      code: "WORKER_CAPACITY",
    });
    assert.equal(
      (await f.service.cancel(capability(first))).state,
      "CANCELLED",
    );
    assert.equal(
      (await f.service.complete(completion(first), stl())).state,
      "CANCELLED",
    );
    const third = await f.service.begin(targets[2]);
    const failed = { ...completion(third), outcome: "FAILED" };
    assert.equal((await f.service.complete(failed)).state, "FAILED");
    assert.equal((await f.service.complete(failed)).state, "FAILED");
    await assert.rejects(f.service.complete(completion(third), stl()), {
      code: "EXPORT_UNAVAILABLE",
    });
    f.advance(120001);
    assert.equal((await f.service.status(capability(second))).state, "EXPIRED");
    assert.equal(
      (await f.service.complete(completion(second), stl())).state,
      "EXPIRED",
    );
    assert.equal(
      Number(
        (
          await f.pool.query(
            "SELECT sum(reserved_bytes) AS n FROM model_exports",
          )
        ).rows[0].n,
      ),
      0,
    );
    assert.notEqual((await f.service.begin(targets[1])).jobId, second.jobId);
    f.advance(3600001);
    await assert.rejects(f.service.status(capability(first)), {
      code: "EXPORT_UNAVAILABLE",
    });
  } finally {
    await f.close();
  }
});

test("file and database failures leave retryable leases; uncertain commit preserves committed artifacts", async () => {
  const f = await createWorkerExportFixture();
  try {
    const lease = await f.service.begin(await f.target());
    const put = f.files.put;
    f.files.put = async () => {
      throw new Error("Disk unavailable");
    };
    await assert.rejects(
      f.service.complete(completion(lease), stl()),
      /Disk unavailable/,
    );
    f.files.put = put;
    const connect = f.pool.connect;
    let fault = "update";
    f.pool.connect = async () => {
      const client = await connect(),
        query = client.query;
      client.query = async (sql, params) => {
        if (
          fault === "update" &&
          sql.startsWith("UPDATE worker_export_jobs SET state=")
        ) {
          fault = undefined;
          throw new Error("Database write failed");
        }
        const result = await query(sql, params);
        if (fault === "commit" && sql === "COMMIT") {
          fault = undefined;
          throw new Error("Commit acknowledgement lost");
        }
        return result;
      };
      return client;
    };
    await assert.rejects(
      f.service.complete(completion(lease), stl()),
      /Database write failed/,
    );
    assert.equal((await f.service.status(capability(lease))).state, "PENDING");
    assert.ok(f.stored.has(lease.exportId)); // Orphan bytes are retained conservatively until retry/cleanup.
    fault = "commit";
    await assert.rejects(
      f.service.complete(completion(lease), stl()),
      /Commit acknowledgement lost/,
    );
    const writes = f.writes();
    assert.equal(
      (await f.service.complete(completion(lease), stl())).state,
      "COMPLETED",
    );
    assert.equal(f.writes(), writes);
    assert.ok(f.stored.has(lease.exportId));
  } finally {
    await f.close();
  }
});
