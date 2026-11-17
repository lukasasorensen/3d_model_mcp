import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
  CadDomainError,
} from "../dist/index.js";
import { renderer, withWorkspace } from "./fixtures/fileProject.fixture.mjs";
import {
  memoryPool,
  accept,
  width,
} from "./fixtures/parameterSnapshots.fixture.mjs";

const snapshot = () => ({
  version: 1,
  files: [
    {
      id: "base-file",
      name: "base.scad",
      body: "cube([width, 10, 5]); // preserved",
    },
    {
      id: "cut-file",
      name: "cut.scad",
      body: "translate([5, 2, -1]) cube([5, 6, 7]);",
    },
  ],
  objects: [
    { id: "base", name: "Base", fileId: "base-file" },
    { id: "cut", name: "Cutout", fileId: "cut-file" },
  ],
  composition: { operation: "difference", objectIds: ["base", "cut"] },
});

for (const adapter of ["filesystem", "postgres"])
  test(`${adapter}: immutable multi-file snapshots preserve identities, composition, retries, restore and atomic state`, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const pool = adapter === "postgres" ? await memoryPool() : undefined;
      let renderFailure;
      const controlledRenderer = {
        async validateAndRender(input) {
          if (renderFailure)
            throw new CadDomainError(renderFailure, "Injected render failure");
          return renderer.validateAndRender(input);
        },
      };
      if (pool)
        await pool.query(
          `INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.test'),('foreign','Foreign','foreign@example.test')`,
        );
      const make = (extra = {}) =>
        pool
          ? new PostgresModelProjectRepository({
              pool,
              ownerId: "owner",
              renderer: controlledRenderer,
              acceptRendererProvenance: () => true,
              ...extra,
            })
          : new ModelProjectRepository({
              workspaceRoot,
              renderer: controlledRenderer,
              acceptRendererProvenance: () => true,
              ...extra,
            });
      try {
        let repository = make();
        const { projectId } = await repository.createProject({
          name: "Multi-file",
          description: "Multi-file regression",
        });
        const legacy = await repository.proposeModelSource({
          projectId,
          parentRevision: null,
          source: "cube(1);",
          requestId: "legacy",
          toolCallId: "legacy",
        });
        const legacyRevision = await accept(repository, legacy);
        const proposal = {
          projectId,
          parentRevision: legacyRevision.revisionId,
          modelFiles: snapshot(),
          parameters: [width],
          requestId: "files",
          toolCallId: "files",
        };
        const candidate = await repository.proposeModelSource(proposal);
        assert.deepEqual(candidate.modelFiles, snapshot());
        const reordered = structuredClone(proposal);
        reordered.modelFiles.files.reverse();
        reordered.modelFiles.objects.reverse();
        assert.equal(
          (await repository.proposeModelSource(reordered)).candidateId,
          candidate.candidateId,
        );
        const relabeled = structuredClone(proposal);
        relabeled.modelFiles.files[0].name = "renamed.scad";
        const other = await repository.proposeModelSource(relabeled);
        assert.notEqual(other.candidateId, candidate.candidateId);
        assert.equal(other.sourceHash, candidate.sourceHash);
        const composed = structuredClone(proposal);
        composed.modelFiles.composition.objectIds.reverse();
        assert.notEqual(
          (await repository.proposeModelSource(composed)).sourceHash,
          candidate.sourceHash,
        );
        const first = await accept(repository, candidate);
        repository = make();
        const read = await repository.readModelSource(projectId);
        assert.deepEqual(read.modelFiles, snapshot());
        assert.equal(read.sourceHash, candidate.sourceHash);
        assert.ok(read.source.includes("difference() {\nunion() {"));
        assert.ok(read.source.includes("// preserved\n}"));
        assert.equal(
          (await repository.proposeModelSource(proposal)).candidateId,
          candidate.candidateId,
        );
        assert.equal(
          (
            await repository.readModelSource(
              projectId,
              legacyRevision.revisionId,
            )
          ).source,
          "cube(1);",
        );
        assert.equal(
          (
            await repository.readModelSource(
              projectId,
              legacyRevision.revisionId,
            )
          ).modelFiles,
          undefined,
        );
        const update = {
          ...proposal,
          parentRevision: first.revisionId,
          parameters: [{ ...width, value: 30 }],
          requestId: "update",
        };
        const next = await repository.proposeModelSource(update);
        renderFailure = "CANCELLED";
        await assert.rejects(accept(repository, next), { code: "CANCELLED" });
        assert.deepEqual(
          (await repository.readModelSource(projectId)).modelFiles,
          snapshot(),
        );
        assert.equal(
          (await repository.getProjectState(projectId)).currentRevision,
          first.revisionId,
        );
        renderFailure = undefined;
        const second = await accept(repository, next);
        assert.deepEqual(second.modelFiles, first.modelFiles);
        assert.notEqual(second.sourceHash, first.sourceHash);
        await assert.rejects(accept(repository, other), {
          code: "STALE_REVISION",
        });
        const restored = await repository.restoreRevision({
          projectId,
          revision: first.revisionId,
          requestId: "restore",
          toolCallId: "restore",
        });
        assert.equal(restored.sourceHash, first.sourceHash);
        assert.deepEqual(restored.modelFiles, snapshot());
        assert.deepEqual(
          (await make().listRevisions(projectId))[0].modelFiles,
          snapshot(),
        );
        if (pool) {
          const foreign = make({ ownerId: "foreign" });
          for (const operation of [
            () => foreign.readModelSource(projectId, first.revisionId),
            () => foreign.getCandidate(projectId, candidate.candidateId),
            () => foreign.proposeModelSource(proposal),
            () =>
              foreign.restoreRevision({
                projectId,
                revision: first.revisionId,
                requestId: "foreign",
                toolCallId: "foreign",
              }),
          ])
            await assert.rejects(operation, { code: "PROJECT_NOT_FOUND" });
        }
        // A failed publication must not accept only part of the document.
        const pending = await repository.proposeModelSource({
          ...update,
          parentRevision: restored.revisionId,
          requestId: "rollback",
        });
        const brokenPool = pool && {
          query: pool.query,
          connect: async () => {
            const client = await pool.connect();
            return {
              release: client.release,
              query: (sql, params) => {
                if (sql.startsWith("UPDATE projects SET current_revision_id"))
                  throw new Error("injected publication failure");
                return client.query(sql, params);
              },
            };
          },
        };
        const failing = make(
          pool
            ? { pool: brokenPool }
            : {
                failpoint: (step) => {
                  if (step === "revision-manifest-durable")
                    throw new Error("injected publication failure");
                },
              },
        );
        await assert.rejects(accept(failing, pending), {
          message: "injected publication failure",
        });
        assert.deepEqual(
          await make().readModelSource(projectId),
          await repository.readModelSource(projectId),
        );
        assert.equal(
          (await make().getProjectState(projectId)).currentRevision,
          restored.revisionId,
        );
        // Corrupt a body without updating the immutable assembled source.
        const corrupted = snapshot();
        corrupted.files[0].body = "cube(999);";
        if (pool)
          await pool.query("UPDATE revisions SET model_files=$1 WHERE id=$2", [
            JSON.stringify(corrupted),
            first.revisionId,
          ]);
        else {
          const path = join(
            workspaceRoot,
            projectId,
            ".theoryfoundry",
            "versions",
            first.revisionId,
            "manifest.json",
          );
          const manifest = JSON.parse(await readFile(path, "utf8"));
          manifest.modelFiles = corrupted;
          await writeFile(path, JSON.stringify(manifest));
        }
        await assert.rejects(
          make().readModelSource(projectId, first.revisionId),
          { code: "CORRUPT_PROJECT" },
        );
      } finally {
        await pool?.end();
      }
    });
  });

test("multi-file proposals reject missing identities, escaping scopes, external imports and invalid unused files before persistence", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance: () => true,
    });
    const { projectId } = await repository.createProject({
      name: "Invalid files",
      description: "Multi-file regression",
    });
    const cases = [
      (value) => {
        value.objects[0].fileId = "missing";
      },
      (value) => {
        value.composition.objectIds[0] = "missing";
      },
      (value) => {
        value.composition.objectIds.push("base");
      },
      (value) => {
        value.files.push(value.files[0]);
      },
      (value) => {
        value.objects.push(value.objects[0]);
      },
      (value) => {
        value.files[0].body = "} cube(999); {";
      },
      (value) => {
        value.files[0].body = "cube(1); /*";
      },
      (value) => {
        value.files[0].body = "use <BOSL2/std.scad> cube(1);";
      },
      (value) => {
        value.files.push({ id: "unused", name: "Unused", body: "}" });
      },
    ];
    for (const change of cases) {
      const modelFiles = snapshot();
      change(modelFiles);
      await assert.rejects(
        repository.proposeModelSource({
          projectId,
          parentRevision: null,
          modelFiles,
          requestId: "invalid",
          toolCallId: "invalid",
        }),
        { code: "INVALID_MODEL_FILES" },
      );
    }
    const external = snapshot();
    external.files[0].body = 'import("/etc/passwd");';
    await assert.rejects(
      repository.proposeModelSource({
        projectId,
        parentRevision: null,
        modelFiles: external,
        requestId: "external",
        toolCallId: "external",
      }),
      { code: "FORBIDDEN_SOURCE_REFERENCE" },
    );
    const huge = snapshot();
    huge.files[0].body = "雪".repeat(100_000);
    await assert.rejects(
      repository.proposeModelSource({
        projectId,
        parentRevision: null,
        modelFiles: huge,
        requestId: "huge",
        toolCallId: "huge",
      }),
      { code: "INVALID_MODEL_FILES" },
    );
    assert.equal(
      (await repository.getProjectState(projectId)).currentRevision,
      null,
    );
  });
});
