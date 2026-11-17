import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyModelObject, pasteModelObject } from "@theoryfoundry/contracts";
import {
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import { startChromiumRenderer } from "../headless-renderer/node/renderer/chromium.renderer.mjs";

const root = new URL("../../", import.meta.url);
const renderer = await startChromiumRenderer(
  new URL("dist/headless-renderer-proof/public/", root),
);
const workspaceRoot = await mkdtemp(
  join(tmpdir(), "object-editing-acceptance-"),
);
const evidence = [];
const options = {
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
        assert.equal(result.ok, true, JSON.stringify(result));
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
};
try {
  let repository = new ModelProjectRepository(options);
  const { projectId } = await repository.createProject({
    name: "Object transform acceptance",
    description: "Pinned STL/3MF transform, copy and history parity",
  });
  const base = {
    version: 1,
    files: [{ id: "file", name: "box.scad", body: "cube([2,4,6]);" }],
    objects: [{ id: "box", name: "Box", fileId: "file" }],
    composition: { operation: "union", objectIds: ["box"] },
  };
  let parentRevision = null;
  let sequence = 0;
  async function accept(label, modelFiles, expected) {
    const requestId = `accept-${++sequence}`;
    const candidate = await repository.proposeModelSource({
      projectId,
      parentRevision,
      modelFiles,
      parameters: [],
      requestId,
      toolCallId: requestId,
    });
    const validated = await repository.validateAndRender({
      projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    assert.equal(validated.state, "VALID");
    for (const artifact of validated.artifacts) {
      for (const side of ["min", "max"]) {
        artifact.boundingBox[side].forEach((value, axis) =>
          assert.ok(
            Math.abs(value - expected[side][axis]) < 0.0001,
            `${label} ${artifact.format} ${side}[${axis}]: ${value} != ${expected[side][axis]}`,
          ),
        );
      }
    }
    const revision = await repository.promoteCandidate({
      projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: parentRevision,
    });
    parentRevision = revision.revisionId;
    repository = new ModelProjectRepository(options);
    const reloaded = await repository.readModelSource(projectId);
    assert.deepEqual(reloaded.modelFiles, revision.modelFiles);
    assert.equal(reloaded.sourceHash, revision.sourceHash);
    evidence.push({
      label,
      revision: parentRevision,
      sourceHash: revision.sourceHash,
      formats: validated.artifacts.map(({ format, boundingBox }) => ({
        format,
        boundingBox,
      })),
      reload: "passed",
    });
    return revision;
  }
  const identity = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  const initial = await accept("original", base, {
    min: [0, 0, 0],
    max: [2, 4, 6],
  });
  const transformed = (transform) => ({
    ...structuredClone(base),
    objects: [{ ...base.objects[0], transform }],
  });
  await accept("move", transformed({ ...identity, position: [10, 20, 30] }), {
    min: [10, 20, 30],
    max: [12, 24, 36],
  });
  await accept("rotate", transformed({ ...identity, rotation: [0, 0, 90] }), {
    min: [-4, 0, 0],
    max: [0, 2, 6],
  });
  await accept(
    "uniform scale",
    transformed({ ...identity, scale: [2, 2, 2] }),
    { min: [0, 0, 0], max: [4, 8, 12] },
  );
  await accept("axis scale", transformed({ ...identity, scale: [2, 3, 4] }), {
    min: [0, 0, 0],
    max: [4, 12, 24],
  });
  const combined = transformed({
    position: [10, 20, 30],
    rotation: [90, 0, 90],
    scale: [2, 3, 4],
  });
  const transformedRevision = await accept(
    "combined XYZ convention",
    combined,
    { min: [10, 20, 30], max: [34, 24, 42] },
  );
  const clipboard = copyModelObject({
    projectId,
    modelFiles: combined,
    objectId: "box",
    parameters: [],
  });
  assert.equal(
    (await repository.getProjectState(projectId)).currentRevision,
    parentRevision,
  );
  const pasted = pasteModelObject({
    projectId,
    modelFiles: combined,
    clipboard,
    objectId: "copy",
    fileId: "copy-file",
    parameters: [],
  });
  pasted.objects.find((object) => object.id === "copy").transform.position = [
    50, 20, 30,
  ];
  assert.deepEqual(
    pasted.objects.find((object) => object.id === "box"),
    combined.objects[0],
  );
  assert.notEqual(pasted.objects[0].fileId, pasted.objects[1].fileId);
  const pastedRevision = await accept("independent paste", pasted, {
    min: [10, 20, 30],
    max: [74, 24, 42],
  });
  const undo = await accept("undo paste", transformedRevision.modelFiles, {
    min: [10, 20, 30],
    max: [34, 24, 42],
  });
  assert.equal(undo.sourceHash, transformedRevision.sourceHash);
  const redo = await accept("redo paste", pastedRevision.modelFiles, {
    min: [10, 20, 30],
    max: [74, 24, 42],
  });
  assert.equal(redo.sourceHash, pastedRevision.sourceHash);
  const reset = await accept("undo consecutive edits", initial.modelFiles, {
    min: [0, 0, 0],
    max: [2, 4, 6],
  });
  assert.equal(reset.sourceHash, initial.sourceHash);
  await mkdir(new URL("dist/object-editing-acceptance/", root), {
    recursive: true,
  });
  await writeFile(
    new URL("dist/object-editing-acceptance/report.json", root),
    JSON.stringify({ provenance: renderer.info, evidence }, null, 2),
  );
  console.log(
    JSON.stringify({
      cases: evidence.length,
      formats: ["stl", "3mf"],
      reload: "passed",
      history: "passed",
      clipboard: "independent",
    }),
  );
} finally {
  await renderer.close();
  await rm(workspaceRoot, { recursive: true, force: true });
}
