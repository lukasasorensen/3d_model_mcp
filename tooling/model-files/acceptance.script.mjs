import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import { startChromiumRenderer } from "../headless-renderer/node/renderer/chromium.renderer.mjs";
import {
  compositionCases,
  compositionSnapshot,
  invalidCompositions,
  presentation,
  expectedVolumes,
} from "./compositionCases.fixture.mjs";
import { stlVolume, threeMfVolume } from "./meshVolume.util.mjs";

const root = new URL("../../", import.meta.url);
const renderer = await startChromiumRenderer(
  new URL("dist/headless-renderer-proof/public/", root),
);
const workspaceRoot = await mkdtemp(join(tmpdir(), "model-files-acceptance-"));
const evidence = [];
const output = new URL("dist/model-files-acceptance/", root);
await mkdir(output, { recursive: true });

async function exportAccepted(repository, projectId, revision, name, bounds) {
  const read = await repository.readModelSource(projectId, revision.revisionId);
  assert.equal(read.sourceHash, revision.sourceHash);
  assert.equal(
    createHash("sha256").update(read.source).digest("hex"),
    read.sourceHash,
  );
  const exports = [];
  for (const format of ["stl", "3mf"]) {
    const artifact = revision.artifacts.find((item) => item.format === format);
    const stored = await repository.readArtifact(
      projectId,
      revision.revisionId,
      artifact.artifactId,
    );
    assert.equal(stored.manifest.sourceRevision, revision.revisionId);
    assert.equal(stored.manifest.sourceHash, revision.sourceHash);
    const storedVolume =
      format === "stl" ? stlVolume(stored.bytes) : threeMfVolume(stored.bytes);
    assert.ok(Math.abs(storedVolume - expectedVolumes[name]) < 0.001);
    const result = await renderer.render({
      source: read.source,
      sourceHash: read.sourceHash,
      format,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const bytes = Buffer.from(result.encoded, "base64");
    const mesh = format === "stl" ? parseBinaryStl(bytes) : parseThreeMf(bytes);
    assert.deepEqual(mesh.boundingBox, bounds);
    const volume = format === "stl" ? stlVolume(bytes) : threeMfVolume(bytes);
    assert.ok(
      Math.abs(volume - expectedVolumes[name]) < 0.001,
      `${name} ${format}: unexpected volume ${volume}`,
    );
    const filename = `${name}.${format}`;
    await writeFile(new URL(filename, output), bytes);
    exports.push({
      format,
      filename,
      byteSize: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex"),
      triangleCount: mesh.triangleCount,
      boundingBox: mesh.boundingBox,
      volume,
      storedArtifactHash: stored.manifest.hash,
    });
  }
  return {
    revision: revision.revisionId,
    sourceHash: read.sourceHash,
    exports,
  };
}
try {
  const repository = new ModelProjectRepository({
    workspaceRoot,
    acceptRendererProvenance: (value) =>
      JSON.stringify(value) === JSON.stringify(renderer.info.provenance),
    renderer: {
      async validateAndRender(request) {
        const artifacts = [];
        for (const format of ["stl", "3mf"]) {
          const result = await renderer.render({
            source: request.source,
            sourceHash: request.sourceHash,
            format,
          });
          if (!result.ok)
            return {
              outcome: "REJECTED",
              diagnostics: [
                {
                  code: "OPENSCAD_FAILED",
                  severity: "error",
                  message: "OpenSCAD rejected the composed model.",
                },
              ],
              provenance: renderer.info.provenance,
              validationPolicyVersion: VALIDATION_POLICY_VERSION,
              artifacts: [],
            };
          const bytes = Buffer.from(result.encoded, "base64");
          const mesh =
            format === "stl" ? parseBinaryStl(bytes) : parseThreeMf(bytes);
          artifacts.push({
            format,
            mimeType: `model/${format}`,
            bytes,
            triangleCount: mesh.triangleCount,
            boundingBox: mesh.boundingBox,
            tessellation: { profile: "standard" },
          });
        }
        return {
          outcome: "VALID",
          diagnostics: [],
          provenance: renderer.info.provenance,
          validationPolicyVersion: VALIDATION_POLICY_VERSION,
          artifacts,
        };
      },
    },
  });
  const { projectId } = await repository.createProject({
    name: "Multi-file acceptance",
    description: "Pinned renderer CSG and revision snapshots",
  });
  let parentRevision = null;
  let first;
  let visibleSnapshot;
  for (const [
    name,
    operation,
    value,
    min,
    max,
    display,
    toolBody,
  ] of compositionCases) {
    const modelFiles = compositionSnapshot(operation, display);
    if (toolBody) modelFiles.files[1].body = toolBody;
    const candidate = await repository.proposeModelSource({
      projectId,
      parentRevision,
      modelFiles,
      parameters: [
        {
          id: "width",
          binding: "width",
          type: "number",
          label: "Width",
          value,
          defaultValue: 20,
        },
      ],
      requestId: name,
      toolCallId: name,
    });
    const valid = await repository.validateAndRender({
      projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    assert.equal(valid.state, "VALID");
    for (const artifact of valid.artifacts)
      assert.deepEqual(artifact.boundingBox, { min, max });
    const revision = await repository.promoteCandidate({
      projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: parentRevision,
    });
    parentRevision = revision.revisionId;
    first ??= revision;
    if (name === "hidden-subtractor") visibleSnapshot = revision;
    const read = await repository.readModelSource(projectId);
    assert.deepEqual(read.modelFiles, modelFiles);
    evidence.push({
      name,
      operation,
      value,
      ...(await exportAccepted(repository, projectId, revision, name, {
        min,
        max,
      })),
      formats: valid.artifacts.map((artifact) => ({
        format: artifact.format,
        boundingBox: artifact.boundingBox,
      })),
    });
  }
  assert.equal(
    evidence.find((item) => item.name === "display-order").sourceHash,
    evidence.find((item) => item.name === "legacy-difference").sourceHash,
  );
  const accepted = await repository.readModelSource(projectId);
  for (const [index, modelFiles] of invalidCompositions.entries()) {
    await assert.rejects(
      repository.proposeModelSource({
        projectId,
        parentRevision,
        modelFiles,
        requestId: `invalid-${index}`,
        toolCallId: `invalid-${index}`,
      }),
      { code: "INVALID_MODEL_FILES" },
    );
    assert.deepEqual(await repository.readModelSource(projectId), accepted);
  }
  const invalidSyntax = compositionSnapshot("union", presentation());
  invalidSyntax.files[0].body = "cube(,);";
  const bad = await repository.proposeModelSource({
    projectId,
    parentRevision,
    modelFiles: invalidSyntax,
    requestId: "invalid-syntax",
    toolCallId: "invalid-syntax",
  });
  const rejected = await repository.validateAndRender({
    projectId,
    candidateId: bad.candidateId,
    previewProfile: "standard",
  });
  assert.equal(rejected.state, "REJECTED");
  await assert.rejects(
    repository.promoteCandidate({
      projectId,
      candidateId: bad.candidateId,
      expectedParentRevision: parentRevision,
    }),
  );
  assert.deepEqual(await repository.readModelSource(projectId), accepted);
  const restores = [];
  for (const [name, historical, bounds] of [
    ["restore-v1", first, { min: [0, 0, -1], max: [25, 10, 6] }],
    ["restore-v2", visibleSnapshot, { min: [0, 0, 0], max: [20, 10, 5] }],
  ]) {
    const restored = await repository.restoreRevision({
      projectId,
      revision: historical.revisionId,
      requestId: name,
      toolCallId: name,
    });
    assert.equal(restored.sourceHash, historical.sourceHash);
    assert.deepEqual(
      (await repository.readModelSource(projectId)).modelFiles,
      historical.modelFiles,
    );
    assert.deepEqual(restored.parameters, historical.parameters);
    assert.deepEqual(
      restored.artifacts.map((item) => item.hash),
      historical.artifacts.map((item) => item.hash),
    );
    assert.equal(
      (await repository.readModelSource(projectId)).source,
      (await repository.readModelSource(projectId, historical.revisionId))
        .source,
    );
    restores.push({
      name,
      ...(await exportAccepted(repository, projectId, restored, name, bounds)),
    });
  }
  await writeFile(
    new URL("dist/model-files-acceptance/report.json", root),
    JSON.stringify(
      {
        provenance: renderer.info,
        evidence,
        restores,
        rejectedCompositions: invalidCompositions.length,
        rejectedSyntax: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      cases: evidence.length,
      formats: ["stl", "3mf"],
      restore: "passed",
      rejectedCompositions: invalidCompositions.length,
      rejectedSyntax: true,
    }),
  );
} finally {
  await renderer.close();
  await rm(workspaceRoot, { recursive: true, force: true });
}
