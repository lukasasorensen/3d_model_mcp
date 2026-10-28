import {
  CAD_LIMITS,
  isProductionRendererProvenance,
} from "@theoryfoundry/contracts";
import {
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { cpus, type as osType, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ObservabilityEvidence,
  createInMemoryCadMcpClient,
} from "../dist/index.js";
import { chat } from "./fixtures/canonicalChat.fixture.mjs";
import { provenance, sha256 } from "./fixtures/canonicalDemo.fixture.mjs";
import { TestOnlyDeterministicProductionRenderer } from "./fixtures/productionRenderer.fixture.mjs";
test.skip(
  "20-run deterministic fixture and complete scripted journeys meet frozen p95 budgets",
  { timeout: 60_000 },
  async () => {
    const renderDurations = [];
    const renderer = new TestOnlyDeterministicProductionRenderer();
    for (let run = 0; run < 20; run += 1) {
      const source = `width = 100; gusset(-35); gusset(35); // ${run}`,
        sourceHash = sha256(source),
        started = performance.now();
      const result = await renderer.validateAndRender({
        projectId: `render-${run}`,
        candidateId: `candidate-${run}`,
        source,
        sourceHash,
        previewProfile: "standard",
      });
      renderDurations.push(performance.now() - started);
      assert.equal(result.outcome, "VALID");
      assert.ok(
        result.artifacts[0].bytes.byteLength <= CAD_LIMITS.previewBytes,
      );
      assert.ok(
        result.artifacts[0].triangleCount <= CAD_LIMITS.previewTriangles,
      );
      assert.ok(result.artifacts[1].bytes.byteLength <= CAD_LIMITS.exportBytes);
    }
    const journeyDurations = [];
    for (let run = 0; run < 20; run += 1) {
      const root = await mkdtemp(
        join(tmpdir(), `theoryfoundry-g006-budget-${run}-`),
      );
      let id = 0;
      const repository = new ModelProjectRepository({
        workspaceRoot: root,
        renderer: new TestOnlyDeterministicProductionRenderer(),
        acceptRendererProvenance: isProductionRendererProvenance,
        createId: () => `run-${run}-${++id}`,
      });
      const client = await createInMemoryCadMcpClient(repository);
      const started = performance.now();
      try {
        const evidence = new ObservabilityEvidence(),
          projectId = `project-${run}`,
          sessionId = `session-${run}`;
        await chat(
          client,
          projectId,
          sessionId,
          "Create the canonical bracket.",
          [`${projectId}-r1`],
          evidence,
        );
        await chat(
          client,
          projectId,
          sessionId,
          "Widen it to 100 mm and use 70 mm hole spacing.",
          [`${projectId}-r2`],
          evidence,
        );
        await chat(
          client,
          projectId,
          sessionId,
          "Add symmetric 6 mm gussets with 20 mm legs.",
          [`${projectId}-r3`],
          evidence,
        );
        await chat(
          client,
          projectId,
          sessionId,
          "Export 3MF.",
          [`${projectId}-export`],
          evidence,
        );
        const revisions = await repository.listRevisions(projectId);
        assert.equal(revisions.length, 3);
        assert.equal(revisions[0].parentRevision, revisions[1].revisionId);
        assert.equal(revisions[1].parentRevision, revisions[2].revisionId);
        journeyDurations.push(performance.now() - started);
      } finally {
        await client.close();
      }
    }
    const p95 = (values) =>
      [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
    assert.ok(
      p95(renderDurations) <= 10_000,
      `renderer p95 ${p95(renderDurations)} ms exceeded 10 s`,
    );
    assert.ok(
      p95(journeyDurations) <= 30_000,
      `journey p95 ${p95(journeyDurations)} ms exceeded 30 s`,
    );
    const performanceEvidence = {
      schemaVersion: 1,
      kind: "g006-performance-evidence",
      durations: {
        rendererMs: renderDurations.map((value) => Number(value.toFixed(3))),
        journeyMs: journeyDurations.map((value) => Number(value.toFixed(3))),
        rendererP95Ms: Number(p95(renderDurations).toFixed(3)),
        journeyP95Ms: Number(p95(journeyDurations).toFixed(3)),
      },
      environment: {
        cpu: cpus()[0]?.model ?? "unknown",
        logicalCpuCount: cpus().length,
        ramBytes: totalmem(),
        os: `${osType()} ${release()}`,
        runtime: `node ${process.version}`,
        browser: "unavailable in this execution environment",
        filesystem: "temporary local filesystem",
        containerEngine:
          "test-only deterministic fixture; production OCI not exercised",
        openscadImageDigest: provenance.imageDigest,
        openscadVersion: provenance.openscadVersion,
        openscadBinaryHash: provenance.openscadBinaryHash,
        bosl2Version: provenance.bosl2Version,
        bosl2Digest: provenance.bosl2Digest,
        dependencyLockHash: sha256(
          await readFile(new URL("../../../pnpm-lock.yaml", import.meta.url)),
        ),
        validationPolicyHash: sha256(VALIDATION_POLICY_VERSION),
        runTimestamp: new Date().toISOString(),
      },
    };
    console.log(
      `G006_PERFORMANCE_EVIDENCE ${JSON.stringify(performanceEvidence)}`,
    );
  },
);
