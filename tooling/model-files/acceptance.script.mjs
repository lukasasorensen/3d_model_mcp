import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const workspaceRoot = await mkdtemp(join(tmpdir(), "model-files-acceptance-"));
const evidence = [];
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
  });
  const { projectId } = await repository.createProject({
    name: "Multi-file acceptance",
    description: "Pinned renderer CSG and revision snapshots",
  });
  const files = [
    {
      id: "base",
      name: "base.scad",
      body: "size = width; cube([size,10,5]); // end comment",
    },
    {
      id: "tool",
      name: "tool.scad",
      body: "size = 10; translate([15,0,-1]) cube([size,10,7]);",
    },
  ];
  const objects = [
    { id: "body", name: "Body", fileId: "base" },
    { id: "cut", name: "Cut", fileId: "tool" },
  ];
  let parentRevision = null;
  let first;
  for (const [operation, value, min, max] of [
    ["union", 20, [0, 0, -1], [25, 10, 6]],
    ["difference", 20, [0, 0, 0], [15, 10, 5]],
    ["intersection", 20, [15, 0, 0], [20, 10, 5]],
    ["union", 30, [0, 0, -1], [30, 10, 6]],
  ]) {
    const candidate = await repository.proposeModelSource({
      projectId,
      parentRevision,
      modelFiles: {
        version: 1,
        files,
        objects,
        composition: { operation, objectIds: ["body", "cut"] },
      },
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
      requestId: `${operation}-${value}`,
      toolCallId: `${operation}-${value}`,
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
    const read = await repository.readModelSource(projectId);
    assert.deepEqual(read.modelFiles.files, files);
    evidence.push({
      operation,
      value,
      sourceHash: revision.sourceHash,
      formats: valid.artifacts.map((artifact) => ({
        format: artifact.format,
        boundingBox: artifact.boundingBox,
      })),
    });
  }
  const restored = await repository.restoreRevision({
    projectId,
    revision: first.revisionId,
    requestId: "restore",
    toolCallId: "restore",
  });
  assert.equal(restored.sourceHash, first.sourceHash);
  assert.deepEqual(
    (await repository.readModelSource(projectId)).modelFiles,
    first.modelFiles,
  );
  await mkdir(new URL("dist/model-files-acceptance/", root), {
    recursive: true,
  });
  await writeFile(
    new URL("dist/model-files-acceptance/report.json", root),
    JSON.stringify(
      { provenance: renderer.info, evidence, restore: "passed" },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      cases: evidence.length,
      formats: ["stl", "3mf"],
      restore: "passed",
    }),
  );
} finally {
  await renderer.close();
  await rm(workspaceRoot, { recursive: true, force: true });
}
