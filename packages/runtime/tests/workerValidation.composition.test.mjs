import { WORKER_VALIDATION_LIMITS } from "@theoryfoundry/contracts";
import {
  PostgresModelProjectRepository,
  WorkerValidationService,
} from "@theoryfoundry/model-project";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { expectedBrowserProvenance } from "../dist/features/browser-rendering/utils/browserProvenance.util.js";
import { createPostgresFixture } from "./fixtures/postgres.fixture.mjs";
const geometry = {
  units: "mm",
  triangleCount: 12,
  bounds: { min: [0, 0, 0], max: [10, 10, 10] },
  dimensions: [10, 10, 10],
  checks: ["binary-stl-length", "finite-coordinates", "nonempty-mesh"],
  scope: "geometry-only",
};
const valid = () => ({
  outcome: "VALID",
  diagnostics: [],
  geometry,
  provenance: expectedBrowserProvenance("cad-validation-v1"),
});
const capability = (lease) => ({
  projectId: lease.projectId,
  candidateId: lease.candidateId,
  jobId: lease.jobId,
  token: lease.token,
});
const completion = (lease) => ({
  ...capability(lease),
  sourceHash: lease.sourceHash,
  result: valid(),
});

async function fixture() {
  const database = await createPostgresFixture();
  // PGlite has one physical connection; model a size-one pool for concurrent callers.
  const connect = database.pool.connect;
  let queue = Promise.resolve();
  database.pool.connect = async () => {
    const previous = queue;
    let unlock;
    queue = new Promise((resolve) => {
      unlock = resolve;
    });
    await previous;
    try {
      const client = await connect();
      const release = client.release;
      client.release = () => {
        try {
          release();
        } finally {
          unlock();
        }
      };
      return client;
    } catch (error) {
      unlock();
      throw error;
    }
  };
  await database.pool.query(
    `INSERT INTO "user" (id,name,email) VALUES ('worker-owner','Owner','worker@example.com'),('worker-other','Other','other-worker@example.com')`,
  );
  const repository = new PostgresModelProjectRepository({
    pool: database.pool,
    ownerId: "worker-owner",
    acceptRendererProvenance: () => true,
    renderer: {
      validateAndRender() {
        throw new Error(
          "Browser renderer must not execute in a worker attempt.",
        );
      },
    },
  });
  const project = await repository.createProject({
    name: "Worker fixture",
    description: "Local worker validation fixture",
  });
  let now = Date.now();
  const service = new WorkerValidationService(
    database.pool,
    "worker-owner",
    () => new Date(now),
  );
  async function begin() {
    const candidate = await repository.proposeModelSource({
      projectId: project.projectId,
      parentRevision: null,
      source: "cube(10);",
      requestId: randomUUID(),
      toolCallId: randomUUID(),
    });
    return service.begin({
      version: "1",
      projectId: project.projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
  }
  return {
    ...database,
    repository,
    service,
    begin,
    advance: (ms) => {
      now += ms;
    },
  };
}

test("worker leases bind source, store only a capability hash, and replay the original completion after promotion", async () => {
  const f = await fixture();
  try {
    const lease = await f.begin();
    assert.equal(lease.executionOrigin, "local-worker");
    assert.equal(lease.source, "cube(10);");
    const stored = (
      await f.pool.query(
        "SELECT token_hash,completion FROM worker_validation_jobs WHERE id=$1",
        [lease.jobId],
      )
    ).rows[0];
    assert.equal(stored.token_hash.length, 64);
    assert.notEqual(stored.token_hash, lease.token);
    await assert.rejects(
      f.repository.validateAndRender({
        projectId: lease.projectId,
        candidateId: lease.candidateId,
        previewProfile: "standard",
      }),
      (error) => error.code === "VALIDATION_RUNNING",
    );
    const result = await f.service.complete(completion(lease));
    assert.equal(result.state, "COMPLETED");
    assert.equal(result.candidate.state, "VALID");
    await f.repository.promoteCandidate({
      projectId: lease.projectId,
      candidateId: lease.candidateId,
      expectedParentRevision: null,
    });
    assert.deepEqual(await f.service.complete(completion(lease)), result);
    assert.equal(
      (await f.repository.getCandidate(lease.projectId, lease.candidateId))
        .state,
      "PROMOTED",
    );
    await assert.rejects(
      f.service.complete({
        ...completion(lease),
        result: { ...valid(), outcome: "REJECTED" },
      }),
      (error) => error.code === "STALE_REVISION",
    );
  } finally {
    await f.close();
  }
});

test("ownership, capability, source and provenance mismatches cannot complete a candidate", async () => {
  const f = await fixture();
  try {
    const lease = await f.begin();
    const other = new WorkerValidationService(f.pool, "worker-other");
    await assert.rejects(
      other.status(capability(lease)),
      (error) => error.code === "CANDIDATE_NOT_FOUND",
    );
    await assert.rejects(
      f.service.status({ ...capability(lease), token: "0".repeat(64) }),
      (error) => error.code === "CANDIDATE_NOT_FOUND",
    );
    await assert.rejects(
      f.service.complete({ ...completion(lease), sourceHash: "0".repeat(64) }),
      (error) => error.code === "SOURCE_HASH_MISMATCH",
    );
    const wrongProvenance = {
      ...valid(),
      provenance: {
        ...valid().provenance,
        validationPolicyVersion: "obsolete",
      },
    };
    await assert.rejects(
      f.service.complete({ ...completion(lease), result: wrongProvenance }),
      (error) => error.code === "PROVENANCE_MISMATCH",
    );
    const wrongHash = {
      ...valid(),
      provenance: {
        ...valid().provenance,
        openscadWasmHash: `sha256:${"0".repeat(64)}`,
      },
    };
    await assert.rejects(
      f.service.complete({ ...completion(lease), result: wrongHash }),
      (error) => error.code === "PROVENANCE_MISMATCH",
    );
    const missingGeometry = valid();
    delete missingGeometry.geometry;
    await assert.rejects(
      f.service.complete({ ...completion(lease), result: missingGeometry }),
      (error) => error.code === "INVALID_PREVIEW",
    );
    assert.equal(
      (await f.repository.getCandidate(lease.projectId, lease.candidateId))
        .state,
      "RUNNING",
    );
  } finally {
    await f.close();
  }
});

test("worker operational failure and cancellation remain retryable; late results cannot replace a new attempt", async () => {
  const f = await fixture();
  try {
    const lease = await f.begin();
    const failed = await f.service.complete({
      ...completion(lease),
      result: { ...valid(), outcome: "FAILED" },
    });
    assert.equal(failed.candidate.state, "CREATED");
    const retry = await f.service.begin({
      version: "1",
      projectId: lease.projectId,
      candidateId: lease.candidateId,
      previewProfile: "standard",
    });
    assert.notEqual(retry.attemptId, lease.attemptId);
    await assert.rejects(
      f.service.complete(completion(lease)),
      (error) => error.code === "STALE_REVISION",
    );
    const cancelled = await f.service.cancel(capability(retry));
    assert.equal(cancelled.state, "CANCELLED");
    assert.deepEqual(await f.service.cancel(capability(retry)), cancelled);
    assert.equal(
      (await f.repository.getCandidate(lease.projectId, lease.candidateId))
        .state,
      "CREATED",
    );
    assert.equal(
      (await f.service.complete(completion(retry))).state,
      "CANCELLED",
    );
  } finally {
    await f.close();
  }
});

test("expiry recovers candidates and admission is bounded per owner", async () => {
  const f = await fixture();
  try {
    const first = await f.begin();
    await f.begin();
    await assert.rejects(
      f.begin(),
      (error) => error.code === "WORKER_CAPACITY",
    );
    f.advance(WORKER_VALIDATION_LIMITS.leaseMs + 1);
    assert.equal((await f.service.status(capability(first))).state, "EXPIRED");
    assert.equal(
      (await f.repository.getCandidate(first.projectId, first.candidateId))
        .state,
      "CREATED",
    );
    const retry = await f.service.begin({
      version: "1",
      projectId: first.projectId,
      candidateId: first.candidateId,
      previewProfile: "standard",
    });
    assert.equal(
      (await f.service.complete(completion(first))).state,
      "EXPIRED",
    );
    assert.equal(
      (await f.repository.getCandidate(retry.projectId, retry.candidateId))
        .activeAttemptId,
      retry.attemptId,
    );
  } finally {
    await f.close();
  }
});

test("model rejection stays terminal and an incompatible protocol is rejected before persistence", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.service.begin({
        version: "2",
        projectId: "unused",
        candidateId: "unused",
        previewProfile: "standard",
      }),
    );
    const lease = await f.begin();
    const rejected = await f.service.complete({
      ...completion(lease),
      result: { ...valid(), outcome: "REJECTED" },
    });
    assert.equal(rejected.candidate.state, "REJECTED");
    await assert.rejects(
      f.service.begin({
        version: "1",
        projectId: lease.projectId,
        candidateId: lease.candidateId,
        previewProfile: "standard",
      }),
      (error) => error.code === "INVALID_CANDIDATE_STATE",
    );
  } finally {
    await f.close();
  }
});

test("a failed completion transaction leaves both candidate and lease retryable", async () => {
  const f = await fixture();
  try {
    const lease = await f.begin();
    const connect = f.pool.connect;
    let shouldFail = true;
    f.pool.connect = async () => {
      const client = await connect();
      const query = client.query;
      client.query = async (sql, parameters) => {
        if (shouldFail && sql.startsWith("UPDATE worker_validation_jobs")) {
          shouldFail = false;
          throw new Error("Injected storage failure");
        }
        return query(sql, parameters);
      };
      return client;
    };
    await assert.rejects(
      f.service.complete(completion(lease)),
      /Injected storage failure/,
    );
    assert.equal(
      (await f.repository.getCandidate(lease.projectId, lease.candidateId))
        .state,
      "RUNNING",
    );
    assert.equal((await f.service.status(capability(lease))).state, "PENDING");
    assert.equal(
      (await f.service.complete(completion(lease))).candidate.state,
      "VALID",
    );
  } finally {
    await f.close();
  }
});

test("concurrent callers respect capacity and duplicate completions return the same saved result", async () => {
  const f = await fixture();
  try {
    const attempts = await Promise.allSettled([
      f.begin(),
      f.begin(),
      f.begin(),
    ]);
    const leases = attempts
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    assert.equal(leases.length, 2);
    assert.equal(
      attempts.find((result) => result.status === "rejected").reason.code,
      "WORKER_CAPACITY",
    );
    const [first, second] = await Promise.all([
      f.service.complete(completion(leases[0])),
      f.service.complete(completion(leases[0])),
    ]);
    assert.deepEqual(first, second);
    assert.equal(first.candidate.state, "VALID");
  } finally {
    await f.close();
  }
});
