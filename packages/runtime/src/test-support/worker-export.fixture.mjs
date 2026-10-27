import { randomUUID } from "node:crypto";
import {
  PostgresModelProjectRepository,
  WorkerExportService,
  ModelExportsRepository,
} from "@theoryfoundry/model-project";
import { expectedBrowserProvenance } from "../../dist/browser-renderer.js";
import { ExportArtifactFinalizationService } from "../../dist/exports/artifact-finalization.service.js";
import { ModelExportService } from "../../dist/modelExport.composition.js";
import { createPostgresFixture } from "./postgres-fixture.mjs";
export const provenance = expectedBrowserProvenance("cad-validation-v1");
export const capability = ({
  version,
  projectId,
  revisionId,
  format,
  jobId,
  exportId,
  token,
  sourceHash,
}) => ({
  version,
  projectId,
  revisionId,
  format,
  jobId,
  exportId,
  token,
  sourceHash,
});
export const completion = (lease) => ({
  ...capability(lease),
  outcome: "COMPLETED",
  provenance,
});
export function stl() {
  const points = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ],
    triangles = [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
      [1, 2, 3],
    ];
  const bytes = Buffer.alloc(284);
  bytes.writeUInt32LE(4, 80);
  triangles.forEach((triangle, i) =>
    triangle
      .flatMap((n) => points[n])
      .forEach((value, j) => bytes.writeFloatLE(value, 96 + i * 50 + j * 4)),
  );
  return bytes;
}
export async function createWorkerExportFixture(database) {
  const f = database ?? (await createPostgresFixture());
  if (!database) {
    const connect = f.pool.connect;
    let queue = Promise.resolve();
    f.pool.connect = async () => {
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
  }
  const ownerId = randomUUID(),
    otherId = randomUUID();
  await f.pool.query(
    "INSERT INTO \"user\" (id,name,email) VALUES ($1,'Owner',$2),($3,'Other',$4)",
    [ownerId, `${ownerId}@example.com`, otherId, `${otherId}@example.com`],
  );
  const repository = new PostgresModelProjectRepository({
    pool: f.pool,
    ownerId,
    acceptRendererProvenance: () => true,
    renderer: {
      validateAndRender: async () => ({
        outcome: "VALID",
        diagnostics: [],
        artifacts: [],
        provenance,
        validationPolicyVersion: "cad-validation-v1",
      }),
    },
  });
  async function target() {
    const project = await repository.createProject({
      name: "Worker export",
      description: "Test",
    });
    const candidate = await repository.proposeModelSource({
      projectId: project.projectId,
      parentRevision: null,
      source: "cube(10);",
      requestId: randomUUID(),
      toolCallId: randomUUID(),
    });
    await repository.validateAndRender({
      projectId: project.projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    const revision = await repository.promoteCandidate({
      projectId: project.projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: null,
    });
    return {
      version: "1",
      projectId: project.projectId,
      revisionId: revision.revisionId,
      format: "stl",
      previewProfile: "standard",
    };
  }
  let now = Date.now(),
    writes = 0;
  const stored = new Map();
  const files = {
    put: async (id, bytes) => {
      writes++;
      stored.set(id, Buffer.from(bytes));
    },
    read: async (id) => {
      if (!stored.has(id)) throw new Error("Missing file");
      return stored.get(id);
    },
    remove: async (id) => {
      stored.delete(id);
    },
    reconcile: async () => {},
  };
  const finalizer = new ExportArtifactFinalizationService(files);
  const dependencies = {
    renderer: provenance,
    clock: () => new Date(now),
    finalize: (...args) => finalizer.finalize(...args),
  };
  return {
    ...f,
    ownerId,
    otherId,
    repository,
    target,
    files,
    stored,
    dependencies,
    service: new WorkerExportService(
      f.pool,
      ownerId,
      "https://cad.example",
      dependencies,
    ),
    exports: new ModelExportsRepository(f.pool, ownerId),
    browser: new ModelExportService(f, files),
    advance: (ms) => {
      now += ms;
    },
    writes: () => writes,
  };
}
