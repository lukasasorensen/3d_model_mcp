import {
  CAD_LIMITS,
  OBSERVABILITY_LIMITS,
  isProductionRendererProvenance,
  observabilityEnvelopeSchema,
} from "@theoryfoundry/contracts";
import {
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import {
  cpus,
  freemem,
  type as osType,
  release,
  tmpdir,
  totalmem,
} from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ObservabilityEvidence,
  createInMemoryCadMcpClient,
} from "../dist/index.js";
import { chat } from "./fixtures/canonicalChat.fixture.mjs";
import {
  canonical,
  provenance,
  sha256,
} from "./fixtures/canonicalDemo.fixture.mjs";
import {
  assertThroughHoles,
  hasGussetMesh,
  meshConnectedComponents,
  signedVolume,
} from "./fixtures/meshAssertions.fixture.mjs";
import { TestOnlyDeterministicProductionRenderer } from "./fixtures/productionRenderer.fixture.mjs";
test("frozen blank to R3 to 3MF journey crosses LangChain, official MCP, repository, and artifact gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "theoryfoundry-g006-"));
  let id = 0;
  const repository = new ModelProjectRepository({
    workspaceRoot: root,
    renderer: new TestOnlyDeterministicProductionRenderer(),
    acceptRendererProvenance: isProductionRendererProvenance,
    createId: () => `domain-${++id}`,
    clock: () => new Date("2026-08-06T06:00:00.000Z"),
  });
  const client = await createInMemoryCadMcpClient(repository),
    evidence = new ObservabilityEvidence(),
    projectId = "canonical-project",
    sessionId = "canonical-session";
  try {
    const r1Events = await chat(
      client,
      projectId,
      sessionId,
      "Create an 80 x 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes.",
      ["request-r1"],
      evidence,
    );
    const r1 = (await repository.listRevisions(projectId))[0],
      r1Stl = await repository.readArtifact(
        projectId,
        r1.revisionId,
        r1.artifacts.find((a) => a.format === "stl").artifactId,
      );
    assert.equal(r1.parentRevision, null);
    assert.equal(meshConnectedComponents(r1Stl.bytes), 1);
    assertThroughHoles(r1Stl.bytes, [-25, 25]);
    assert.deepEqual(
      parseBinaryStl(r1Stl.bytes).boundingBox,
      canonical.r1.bounds,
    );
    assert.ok(
      r1Events.some(
        (e) =>
          e.type === "revision" &&
          e.status === "candidate_promoted" &&
          e.revisionId === r1.revisionId,
      ),
    );

    const r2Events = await chat(
      client,
      projectId,
      sessionId,
      "Widen the current bracket to 100 mm and move the holes to 70 mm spacing.",
      ["request-r2"],
      evidence,
    );
    const r2 = (await repository.listRevisions(projectId))[0],
      r2Stl = await repository.readArtifact(
        projectId,
        r2.revisionId,
        r2.artifacts.find((a) => a.format === "stl").artifactId,
      );
    assert.equal(r2.parentRevision, r1.revisionId);
    assert.equal(meshConnectedComponents(r2Stl.bytes), 1);
    assertThroughHoles(r2Stl.bytes, [-35, 35]);
    assert.deepEqual(
      parseBinaryStl(r2Stl.bytes).boundingBox,
      canonical.r2.bounds,
    );
    assert.equal(
      (await repository.readModelSource(projectId, r1.revisionId)).sourceHash,
      r1.sourceHash,
    );
    assert.ok(
      r2Events.some(
        (e) => e.type === "artifact" && e.revisionId === r2.revisionId,
      ),
    );

    const r3Events = await chat(
      client,
      projectId,
      sessionId,
      "Add two symmetric 6 mm gussets with 20 mm forward and upward legs.",
      ["request-r3"],
      evidence,
    );
    assert.ok(
      r3Events.some(
        (event) =>
          event.type === "revision" && event.status === "candidate_promoted",
      ),
      JSON.stringify(r3Events.filter((event) => event.type === "error")),
    );
    const r3 = (await repository.listRevisions(projectId))[0],
      r3Stl = await repository.readArtifact(
        projectId,
        r3.revisionId,
        r3.artifacts.find((a) => a.format === "stl").artifactId,
      );
    assert.equal(r3.parentRevision, r2.revisionId);
    assert.equal(meshConnectedComponents(r3Stl.bytes), 1);
    assert.equal(hasGussetMesh(r2Stl.bytes, -35), false);
    assert.equal(hasGussetMesh(r2Stl.bytes, 35), false);
    assert.equal(
      hasGussetMesh(r3Stl.bytes, -35),
      true,
      "left gusset mesh signature",
    );
    assert.equal(
      hasGussetMesh(r3Stl.bytes, 35),
      true,
      "right gusset mesh signature",
    );
    assert.deepEqual(
      parseBinaryStl(r3Stl.bytes).boundingBox,
      canonical.r3.bounds,
    );
    assert.ok(signedVolume(r3Stl.bytes) > signedVolume(r2Stl.bytes));

    const exportEvents = await chat(
        client,
        projectId,
        sessionId,
        "Export the current R3 as 3MF.",
        ["request-export"],
        evidence,
      ),
      exportManifest = r3.artifacts.find((a) => a.format === "3mf"),
      exportBytes = await repository.readArtifact(
        projectId,
        r3.revisionId,
        exportManifest.artifactId,
      );
    assert.equal(exportManifest.mimeType, canonical.export.mimeType);
    assert.equal(exportManifest.units, "mm");
    assert.equal(exportManifest.sourceRevision, r3.revisionId);
    assert.equal(exportManifest.sourceHash, r3.sourceHash);
    assert.equal(sha256(exportBytes.bytes), exportManifest.hash);
    assert.ok(parseThreeMf(exportBytes.bytes, r3.sourceHash).triangleCount > 0);
    assert.ok(
      exportEvents.some(
        (e) =>
          e.type === "artifact" &&
          e.format === "3mf" &&
          e.revisionId === r3.revisionId,
      ),
    );
    for (const revision of [r1, r2, r3]) {
      assert.equal(
        revision.requestId,
        `request-${revision === r1 ? "r1" : revision === r2 ? "r2" : "r3"}`,
      );
      assert.ok(revision.toolCallId.startsWith(revision.requestId));
      assert.equal(revision.candidateId.startsWith("domain-"), true);
      for (const artifact of revision.artifacts) {
        assert.equal(artifact.sourceRevision, revision.revisionId);
        assert.equal(artifact.sourceHash, revision.sourceHash);
        assert.ok(
          artifact.byteSize <=
            (artifact.format === "stl"
              ? CAD_LIMITS.previewBytes
              : CAD_LIMITS.exportBytes),
        );
      }
    }
    const restartedRepository = new ModelProjectRepository({
      workspaceRoot: root,
      renderer: new TestOnlyDeterministicProductionRenderer(),
      acceptRendererProvenance: isProductionRendererProvenance,
      createId: () => `restart-${++id}`,
    });
    const recovered = await restartedRepository.getProjectState(projectId);
    assert.equal(recovered.currentRevision, r3.revisionId);
    assert.equal(recovered.source.hash, r3.sourceHash);
    assert.deepEqual(
      recovered.artifacts.map((a) => a.hash),
      r3.artifacts.map((a) => a.hash),
    );
    const restored = await restartedRepository.restoreRevision({
      projectId,
      revision: r1.revisionId,
      requestId: "request-restore",
      toolCallId: "tool-restore",
    });
    assert.equal(restored.parentRevision, r3.revisionId);
    assert.equal(restored.restoredFrom, r1.revisionId);
    assert.notEqual(restored.revisionId, r1.revisionId);
    assert.equal(
      (await restartedRepository.getProjectState(projectId)).currentRevision,
      restored.revisionId,
    );

    evidence.record({
      version: "1",
      timestamp: "2026-08-06T06:00:00.000Z",
      level: "info",
      service: "runtime",
      event: "canary.redacted",
      requestId: "request-evidence",
      outcome: "success",
      metadata: {
        detail: "token=supersecret /Users/example/private/model.scad",
      },
    });
    assert.equal(
      evidence.probeDependency({
        available: false,
        requestId: "readiness-1",
        timestamp: "2026-08-06T06:00:01.000Z",
      }),
      "unavailable",
    );
    assert.equal(
      evidence.probeDependency({
        available: true,
        requestId: "readiness-2",
        timestamp: "2026-08-06T06:00:02.000Z",
      }),
      "unavailable",
    );
    assert.equal(
      evidence.probeDependency({
        available: true,
        requestId: "readiness-3",
        timestamp: "2026-08-06T06:00:03.000Z",
      }),
      "ready",
    );
    const bundle = evidence.bundle({
      cpu: cpus()[0]?.model ?? "unknown",
      ramBytes: totalmem() - freemem(),
      os: `${osType()} ${release()}`,
      filesystem: "temporary local filesystem",
      containerEngine: "test-only injected fixture; real OCI unavailable",
      containerContext: "not exercised",
      containerMode: "fixture metadata only",
      cgroup: "not exercised",
      browser: "unavailable",
      openscadImageDigest: provenance.imageDigest,
      bosl2Pin: provenance.bosl2Digest,
      dependencyLockHash: sha256(
        await readFile(new URL("../../../pnpm-lock.yaml", import.meta.url)),
      ),
      validationPolicyHash: sha256(VALIDATION_POLICY_VERSION),
      runTimestamp: "2026-08-06T06:00:04.000Z",
    });
    assert.equal(bundle.redactionScan.matches, 0);
    assert.deepEqual(
      bundle.readinessTransitions.map((e) => e.event),
      ["readiness.unavailable", "readiness.ready"],
    );
    assert.ok(
      bundle.records.every(
        (record) => observabilityEnvelopeSchema.safeParse(record).success,
      ),
    );
    assert.ok(
      bundle.records.every(
        (record) =>
          !JSON.stringify(record).includes(projectId) &&
          !JSON.stringify(record).includes("model.scad"),
      ),
    );
    assert.ok(
      bundle.records
        .filter((record) => record.event === "chat.artifact")
        .every(
          (record) =>
            record.toolCallId && record.revisionId && record.artifactId,
        ),
    );
    assert.ok(
      bundle.records
        .filter((record) => record.candidateId)
        .every((record) => record.toolCallId),
    );
    assert.equal(
      bundle.records.filter((record) => record.event === "agent.turn").length,
      4,
    );
    assert.equal(
      bundle.records.filter((record) => record.event === "render.completed")
        .length,
      3,
    );
    assert.ok(
      bundle.records
        .filter((record) => record.event === "render.completed")
        .every(
          (record) => record.jobId && record.candidateId && record.toolCallId,
        ),
    );
    assert.equal(
      bundle.metrics.filter((metric) => metric.name === "request_count").length,
      4,
    );
    assert.equal(
      bundle.metrics.filter((metric) => metric.name === "render_duration_ms")
        .length,
      3,
    );
    assert.ok(
      bundle.metrics.some((metric) => metric.name === "artifact_bytes"),
    );
    assert.ok(
      bundle.metrics.some((metric) => metric.name === "artifact_triangles"),
    );
    assert.ok(bundle.volume.records <= OBSERVABILITY_LIMITS.recordsPerRequest);
    assert.ok(
      bundle.volume.serializedBytes <=
        OBSERVABILITY_LIMITS.serializedBytesPerRequest,
    );
  } finally {
    await client.close();
  }
});
