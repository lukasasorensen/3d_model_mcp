import {
  CAD_LIMITS,
  isProductionRendererProvenance,
} from "@theoryfoundry/contracts";
import {
  CadDomainError,
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ObservabilityEvidence,
  createInMemoryCadMcpClient,
} from "../dist/index.js";
import { chat } from "./fixtures/canonicalChat.fixture.mjs";
import { provenance } from "./fixtures/canonicalDemo.fixture.mjs";
import { FixtureClassifyingRenderer } from "./fixtures/productionRenderer.fixture.mjs";
test("hostile cross-layer candidates and stale promotion never corrupt current", async () => {
  const root = await mkdtemp(join(tmpdir(), "theoryfoundry-g006-hostile-"));
  let id = 0;
  const repository = new ModelProjectRepository({
    workspaceRoot: root,
    renderer: new FixtureClassifyingRenderer(),
    acceptRendererProvenance: isProductionRendererProvenance,
    createId: () => `hostile-${++id}`,
  });
  const client = await createInMemoryCadMcpClient(repository);
  try {
    await chat(
      client,
      "hostile-project",
      "hostile-session",
      "Create a bracket.",
      ["request-base"],
      new ObservabilityEvidence(),
    );
    const current = (await repository.getProjectState("hostile-project"))
      .currentRevision;
    const fixtureRoot = new URL("../../../fixtures/scad/", import.meta.url);
    const names = (await readdir(fixtureRoot))
      .filter((name) => name.endsWith(".scad"))
      .sort();
    assert.deepEqual(names, [
      "forbidden-import.scad",
      "forbidden-include.scad",
      "oversized-output.scad",
      "resource-exhaustion.scad",
      "syntax-error.scad",
      "valid-bosl2.scad",
      "warning.scad",
    ]);
    const classifications = {};
    for (const [fixtureIndex, name] of names.entries()) {
      const source = await readFile(new URL(name, fixtureRoot), "utf8");
      try {
        const candidate = await repository.proposeModelSource({
          projectId: "hostile-project",
          parentRevision: current,
          source,
          requestId: `hostile-${fixtureIndex}`,
          toolCallId: `tool-${fixtureIndex}`,
        });
        const result = await repository.validateAndRender({
          projectId: "hostile-project",
          candidateId: candidate.candidateId,
          previewProfile: "standard",
        });
        classifications[name] = result.state;
      } catch (error) {
        assert.ok(error instanceof CadDomainError);
        classifications[name] = error.code;
      }
      assert.equal(
        (await repository.getProjectState("hostile-project")).currentRevision,
        current,
      );
    }
    assert.deepEqual(classifications, {
      "forbidden-import.scad": "FORBIDDEN_SOURCE_REFERENCE",
      "forbidden-include.scad": "FORBIDDEN_SOURCE_REFERENCE",
      "oversized-output.scad": "REJECTED",
      "resource-exhaustion.scad": "REJECTED",
      "syntax-error.scad": "REJECTED",
      "valid-bosl2.scad": "VALID",
      "warning.scad": "REJECTED",
    });
    await assert.rejects(
      repository.proposeModelSource({
        projectId: "hostile-project",
        parentRevision: current,
        source: `cube(1);${" ".repeat(CAD_LIMITS.sourceBytes)}`,
        requestId: "hostile-request",
        toolCallId: "hostile-tool",
      }),
      CadDomainError,
    );
    const malformed = new ModelProjectRepository({
      workspaceRoot: await mkdtemp(
        join(tmpdir(), "theoryfoundry-g006-malformed-"),
      ),
      renderer: {
        async validateAndRender() {
          return {
            outcome: "VALID",
            diagnostics: [],
            provenance,
            validationPolicyVersion: VALIDATION_POLICY_VERSION,
            artifacts: [
              {
                format: "stl",
                bytes: { malformed: true },
                mimeType: "model/stl",
                triangleCount: 1,
                boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
                tessellation: {},
              },
            ],
          };
        },
      },
      acceptRendererProvenance: isProductionRendererProvenance,
    });
    const bad = await malformed.proposeModelSource({
      projectId: "bad-project",
      parentRevision: null,
      source: "cube(1);",
      requestId: "bad-request",
      toolCallId: "bad-tool",
    });
    const rejected = await malformed.validateAndRender({
      projectId: "bad-project",
      candidateId: bad.candidateId,
      previewProfile: "standard",
    });
    assert.equal(rejected.state, "REJECTED");
    await assert.rejects(
      malformed.promoteCandidate({
        projectId: "bad-project",
        candidateId: bad.candidateId,
        expectedParentRevision: null,
      }),
    );
    assert.equal(
      (await malformed.getProjectState("bad-project")).currentRevision,
      null,
    );
    const oversized = new ModelProjectRepository({
      workspaceRoot: await mkdtemp(
        join(tmpdir(), "theoryfoundry-g006-oversized-"),
      ),
      renderer: {
        async validateAndRender() {
          return {
            outcome: "VALID",
            diagnostics: [],
            provenance,
            validationPolicyVersion: VALIDATION_POLICY_VERSION,
            artifacts: [
              {
                format: "stl",
                bytes: new Uint8Array(CAD_LIMITS.previewBytes + 1),
                mimeType: "model/stl",
                triangleCount: 1,
                boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
                tessellation: {},
              },
            ],
          };
        },
      },
      acceptRendererProvenance: isProductionRendererProvenance,
    });
    const huge = await oversized.proposeModelSource({
      projectId: "huge-project",
      parentRevision: null,
      source: "cube(1);",
      requestId: "huge-request",
      toolCallId: "huge-tool",
    });
    assert.equal(
      (
        await oversized.validateAndRender({
          projectId: "huge-project",
          candidateId: huge.candidateId,
          previewProfile: "standard",
        })
      ).state,
      "REJECTED",
    );
    assert.equal(
      (await oversized.getProjectState("huge-project")).currentRevision,
      null,
    );
    const a = await repository.proposeModelSource({
      projectId: "hostile-project",
      parentRevision: current,
      source: "cube([1,1,1]);",
      requestId: "request-a",
      toolCallId: "tool-a",
    });
    const b = await repository.proposeModelSource({
      projectId: "hostile-project",
      parentRevision: current,
      source: "cube([2,2,2]);",
      requestId: "request-b",
      toolCallId: "tool-b",
    });
    await repository.validateAndRender({
      projectId: "hostile-project",
      candidateId: a.candidateId,
      previewProfile: "standard",
    });
    await repository.validateAndRender({
      projectId: "hostile-project",
      candidateId: b.candidateId,
      previewProfile: "standard",
    });
    const winner = await repository.promoteCandidate({
      projectId: "hostile-project",
      candidateId: a.candidateId,
      expectedParentRevision: current,
    });
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "hostile-project",
        candidateId: b.candidateId,
        expectedParentRevision: current,
      }),
      (error) => error.code === "STALE_REVISION",
    );
    assert.equal(
      (await repository.getProjectState("hostile-project")).currentRevision,
      winner.revisionId,
    );
    const abort = new AbortController();
    abort.abort();
    const cancelled = await client
      .callTool(
        "validate_and_render",
        {
          projectId: "hostile-project",
          candidateId: "missing",
          previewProfile: "standard",
        },
        { signal: abort.signal },
      )
      .catch(() => ({ isError: true }));
    assert.equal(cancelled.isError, true);
    assert.equal(
      (await repository.getProjectState("hostile-project")).currentRevision,
      winner.revisionId,
    );
    const invalid = await client.callTool(
      "get_project_state",
      { projectId: "../escape" },
      {},
    );
    assert.equal(invalid.isError, true);
    assert.equal(
      (await repository.getProjectState("hostile-project")).currentRevision,
      winner.revisionId,
    );
  } finally {
    await client.close();
  }
});
