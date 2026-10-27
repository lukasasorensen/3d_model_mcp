import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CadDomainError, ModelProjectRepository } from "../../../dist/index.js";
import {
  acceptRendererProvenance,
  provenance,
  renderer,
  validCandidate,
  withWorkspace,
} from "../../fixtures/fileProject.fixture.mjs";
test("checks UTF-8 bytes and rejects escaping source references before persistence", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    await assert.rejects(
      repository.proposeModelSource({
        projectId: "demo",
        parentRevision: null,
        source: `//${"🙂".repeat(70_000)}`,
        requestId: "request-1",
        toolCallId: "tool-1",
      }),
      (error) =>
        error instanceof CadDomainError && error.code === "SOURCE_TOO_LARGE",
    );
    for (const source of [
      "include <../secret.scad>",
      "include </etc/secret.scad>",
      'import("/etc/passwd")',
      'import(file="/etc/passwd")',
      'import(file="../secret.stl")',
      'surface("/etc/passwd")',
      'surface(file="../heightmap.dat")',
    ]) {
      await assert.rejects(
        repository.proposeModelSource({
          projectId: "demo",
          parentRevision: null,
          source,
          requestId: "request-1",
          toolCallId: "tool-1",
        }),
        (error) =>
          error instanceof CadDomainError &&
          error.code === "FORBIDDEN_SOURCE_REFERENCE",
      );
    }
    const allowed = await repository.proposeModelSource({
      projectId: "demo",
      parentRevision: null,
      source: "include <BOSL2/std.scad>\ncube(1);",
      requestId: "request-ok",
      toolCallId: "tool-ok",
    });
    assert.equal(allowed.state, "CREATED");
  });
});
test("source tampering after proposal becomes terminal REJECTED and survives reopen", async () => {
  await withWorkspace(async (workspaceRoot) => {
    let rendererCalls = 0;
    const countingRenderer = {
      async validateAndRender(request) {
        rendererCalls += 1;
        return renderer.validateAndRender(request);
      },
    };
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer: countingRenderer,
      acceptRendererProvenance,
    });
    const candidate = await repository.proposeModelSource({
      projectId: "demo",
      parentRevision: null,
      source: "cube(1);",
      requestId: "request-tamper",
      toolCallId: "tool-tamper",
    });
    const candidateRoot = join(
      workspaceRoot,
      "demo",
      ".theoryfoundry",
      "candidates",
      candidate.candidateId,
    );
    await writeFile(join(candidateRoot, "model.scad"), "sphere(9);");
    const rejected = await repository.validateAndRender({
      projectId: "demo",
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    assert.equal(rejected.state, "REJECTED");
    assert.equal(rejected.diagnostics[0].code, "SOURCE_HASH_MISMATCH");
    assert.equal(rendererCalls, 0);
    const reopened = new ModelProjectRepository({
      workspaceRoot,
      renderer: countingRenderer,
      acceptRendererProvenance,
    });
    await assert.rejects(
      reopened.validateAndRender({
        projectId: "demo",
        candidateId: candidate.candidateId,
        previewProfile: "standard",
      }),
      (error) =>
        error instanceof CadDomainError &&
        error.code === "INVALID_CANDIDATE_STATE",
    );
    assert.equal(
      JSON.parse(await readFile(join(candidateRoot, "candidate.json"), "utf8"))
        .state,
      "REJECTED",
    );
  });
});
test("malformed renderer outcomes and nested metadata are rejected at the trust boundary", async () => {
  for (const mutate of [
    (value) => ({ ...value, outcome: "NOT_VALID" }),
    (value) => ({ ...value, unexpected: true }),
    (value) => ({
      ...value,
      artifacts: [{ ...value.artifacts[0], hostPath: "/tmp/leak" }],
    }),
    (value) => ({
      ...value,
      provenance: {
        ...value.provenance,
        attestation: { ...value.provenance.attestation, unexpected: true },
      },
    }),
  ]) {
    await withWorkspace(async (workspaceRoot) => {
      const malformedRenderer = {
        async validateAndRender(request) {
          return mutate(await renderer.validateAndRender(request));
        },
      };
      const repository = new ModelProjectRepository({
        workspaceRoot,
        renderer: malformedRenderer,
        acceptRendererProvenance,
      });
      const candidate = await repository.proposeModelSource({
        projectId: "demo",
        parentRevision: null,
        source: "cube(1);",
        requestId: "request-malformed",
        toolCallId: "tool-malformed",
      });
      const rejected = await repository.validateAndRender({
        projectId: "demo",
        candidateId: candidate.candidateId,
        previewProfile: "standard",
      });
      assert.equal(rejected.state, "REJECTED");
      assert.equal(
        (await repository.getProjectState("demo")).currentRevision,
        null,
      );
      await assert.rejects(
        repository.promoteCandidate({
          projectId: "demo",
          candidateId: candidate.candidateId,
          expectedParentRevision: null,
        }),
        (error) =>
          error instanceof CadDomainError &&
          error.code === "INVALID_CANDIDATE_STATE",
      );
    });
  }
});
test("production UID zero provenance cannot become VALID or promote even when caller approval returns true", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const rootRenderer = {
      async validateAndRender(request) {
        const result = await renderer.validateAndRender(request);
        return {
          ...result,
          provenance: {
            ...result.provenance,
            attestation: { ...result.provenance.attestation, effectiveUid: 0 },
          },
        };
      },
    };
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer: rootRenderer,
      acceptRendererProvenance: () => true,
    });
    const candidate = await repository.proposeModelSource({
      projectId: "demo",
      parentRevision: null,
      source: "cube(1);",
      requestId: "request-root",
      toolCallId: "tool-root",
    });
    const rejected = await repository.validateAndRender({
      projectId: "demo",
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    assert.equal(rejected.state, "REJECTED");
    assert.equal(rejected.diagnostics[0].code, "RENDER_FAILED");
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "demo",
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
      }),
      (error) =>
        error instanceof CadDomainError &&
        error.code === "INVALID_CANDIDATE_STATE",
    );
    assert.equal(
      (await repository.getProjectState("demo")).currentRevision,
      null,
    );
  });
});
test("concurrent validation serializes CREATED to one terminal transition without renderer replay", async () => {
  await withWorkspace(async (workspaceRoot) => {
    let calls = 0;
    let releaseRender;
    let announceStarted;
    const renderGate = new Promise((resolve) => {
      releaseRender = resolve;
    });
    const renderStarted = new Promise((resolve) => {
      announceStarted = resolve;
    });
    const blockingRenderer = {
      async validateAndRender(request) {
        calls += 1;
        announceStarted();
        await renderGate;
        return renderer.validateAndRender(request);
      },
    };
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer: blockingRenderer,
      acceptRendererProvenance,
    });
    const candidate = await repository.proposeModelSource({
      projectId: "demo",
      parentRevision: null,
      source: "cube(1);",
      requestId: "request-concurrent",
      toolCallId: "tool-concurrent",
    });
    const first = repository.validateAndRender({
      projectId: "demo",
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    await renderStarted;
    const second = repository.validateAndRender({
      projectId: "demo",
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    releaseRender();
    const outcomes = await Promise.allSettled([first, second]);
    assert.equal(calls, 1);
    assert.equal(
      outcomes.filter(
        (outcome) =>
          outcome.status === "fulfilled" && outcome.value.state === "VALID",
      ).length,
      1,
    );
    const conflict = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(conflict);
    assert.equal(conflict.reason.code, "VALIDATION_RUNNING");
    const persisted = JSON.parse(
      await readFile(
        join(
          workspaceRoot,
          "demo",
          ".theoryfoundry",
          "candidates",
          candidate.candidateId,
          "candidate.json",
        ),
        "utf8",
      ),
    );
    assert.equal(persisted.state, "VALID");
  });
});
test("trusted-local development provenance can validate but can never be promoted", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const localProvenance = {
      ...provenance,
      profile: "trusted-local-development",
      renderer: "trusted-local-openscad-bosl2",
      attestation: {
        engine: "trusted-local-openscad",
        mode: "trusted-local",
        effectiveUid: 501,
        network: "host",
        readOnlyRoot: false,
        capabilitiesDropped: false,
        noNewPrivileges: false,
        inputReadOnly: false,
        outputIsolated: false,
        resourceLimitsEnforced: false,
        seccompEnforced: false,
        memoryBytes: 0,
        nanoCpus: 0,
        pidsLimit: 0,
      },
    };
    const localRenderer = {
      async validateAndRender(request) {
        return {
          ...(await renderer.validateAndRender(request)),
          provenance: localProvenance,
        };
      },
    };
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer: localRenderer,
      acceptRendererProvenance: () => true,
    });
    const candidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "demo",
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
      }),
      (error) =>
        error instanceof CadDomainError && error.code === "PROVENANCE_MISMATCH",
    );
    assert.equal(
      (await repository.getProjectState("demo")).currentRevision,
      null,
    );
  });
});
