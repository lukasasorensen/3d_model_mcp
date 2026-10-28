import {
  initialWorkspaceState,
  workspaceReducer,
} from "@/features/workspace/browser/utils/workspaceState.util";
import type {
  ArtifactManifest,
  RevisionManifest,
} from "@theoryfoundry/contracts";
import assert from "node:assert/strict";
import test from "node:test";

import {
  artifactKey,
  validatedArtifactFor,
} from "@/features/workspace/browser/utils/workspaceRevision.util";

import { event, provenance } from "../fixtures/workspace.fixture";
test("canonical R1-R2-R3 stream keeps artifact/export gates causal and rejected edits preserve R3", () => {
  const makeRevision = (
    revisionId: string,
    parentRevision: string | null,
    index: number,
  ): RevisionManifest => {
    const sourceHash = String(index).repeat(64);
    const artifact = (format: "stl" | "3mf"): ArtifactManifest => ({
      artifactId: `${format}-${index}`,
      format,
      mimeType: format === "stl" ? "model/stl" : "model/3mf",
      hash: String(index + 3).repeat(64),
      byteSize: 134,
      triangleCount: 12,
      units: "mm",
      axisConvention: "right-handed-z-up",
      boundingBox: { min: [-50, -20, 0], max: [50, 20, 46] },
      sourceRevision: revisionId,
      sourceHash,
      renderer: provenance,
      tessellation: { fixture: true },
    });
    return {
      version: "1",
      projectId: "canonical-project",
      revisionId,
      parentRevision,
      sourceHash,
      sourceBytes: 100,
      createdAt: `2026-08-05T00:00:0${index}.000Z`,
      requestId: `request-${index}`,
      toolCallId: `request-${index}-t4`,
      candidateId: `candidate-${index}`,
      validationPolicyVersion: "1",
      validationResult: "VALID",
      diagnostics: [],
      artifacts: [artifact("stl"), artifact("3mf")],
      renderer: provenance,
    };
  };
  const r1 = makeRevision("revision-r1", null, 1);
  const r2 = makeRevision("revision-r2", r1.revisionId, 2);
  const r3 = makeRevision("revision-r3", r2.revisionId, 3);
  let state = workspaceReducer(initialWorkspaceState, {
    type: "hydrate",
    revisions: [],
    currentRevision: null,
  });
  for (const [revision, revisions] of [
    [r1, [r1]],
    [r2, [r2, r1]],
    [r3, [r3, r2, r1]],
  ] as const) {
    state = workspaceReducer(state, {
      type: "event",
      event: event({
        type: "revision",
        status: "candidate_validated",
        candidateId: revision.candidateId,
        toolCallId: revision.toolCallId,
      }),
    });
    assert.notEqual(state.selectedRevision, revision.revisionId);
    state = workspaceReducer(state, {
      type: "event",
      event: event({
        type: "revision",
        status: "candidate_promoted",
        candidateId: revision.candidateId,
        revisionId: revision.revisionId,
        toolCallId: revision.toolCallId,
      }),
    });
    assert.equal(state.pendingCurrentRevision, revision.revisionId);
    state = workspaceReducer(state, {
      type: "hydrate",
      revisions: [...revisions],
      currentRevision: revision.revisionId,
    });
    assert.equal(state.selectedRevision, revision.revisionId);
    assert.ok(
      validatedArtifactFor(
        state.artifacts,
        state.revisions,
        revision.revisionId,
        "stl",
      ),
    );
    assert.ok(
      validatedArtifactFor(
        state.artifacts,
        state.revisions,
        revision.revisionId,
        "3mf",
      ),
    );
  }
  const rejected = workspaceReducer(state, {
    type: "event",
    event: event({
      type: "revision",
      status: "candidate_rejected",
      candidateId: "candidate-bad",
      toolCallId: "tool-bad",
    }),
  });
  assert.equal(rejected.currentRevision, r3.revisionId);
  assert.equal(rejected.selectedRevision, r3.revisionId);
  assert.match(rejected.notice, /current revision is unchanged/i);
  const substituted = { ...r3.artifacts[0], sourceHash: "f".repeat(64) };
  assert.equal(
    validatedArtifactFor(
      {
        ...rejected.artifacts,
        [artifactKey(substituted.sourceRevision, substituted.artifactId)]:
          substituted,
      },
      rejected.revisions,
      r3.revisionId,
      "stl",
    ),
    undefined,
  );
});

test("restore hydration keeps identical artifact bytes linked to both historical and restored-current revisions", () => {
  const sourceHash = "a".repeat(64);
  const shared = {
    artifactId: "shared-artifact",
    format: "3mf",
    mimeType: "model/3mf",
    hash: "b".repeat(64),
    byteSize: 128,
    triangleCount: 4,
    units: "mm",
    axisConvention: "right-handed-z-up",
    boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
    sourceRevision: "revision-old",
    sourceHash,
    renderer: provenance,
    tessellation: {},
  } satisfies ArtifactManifest;
  const old = {
    version: "1",
    projectId: "demo-project",
    revisionId: "revision-old",
    parentRevision: null,
    sourceHash,
    sourceBytes: 10,
    createdAt: "2026-08-05T00:00:00.000Z",
    requestId: "request-1",
    toolCallId: "tool-1",
    candidateId: "candidate-1",
    validationPolicyVersion: "1",
    validationResult: "VALID",
    diagnostics: [],
    artifacts: [shared],
    renderer: provenance,
  } satisfies RevisionManifest;
  const restoredArtifact = { ...shared, sourceRevision: "revision-restored" };
  const restored = {
    ...old,
    revisionId: "revision-restored",
    parentRevision: "revision-old",
    restoredFrom: "revision-old",
    requestId: "request-2",
    toolCallId: "tool-2",
    candidateId: "candidate-2",
    artifacts: [restoredArtifact],
  } satisfies RevisionManifest;
  const state = workspaceReducer(
    workspaceReducer(initialWorkspaceState, {
      type: "restored",
      revision: restored,
    }),
    {
      type: "hydrate",
      revisions: [restored, old],
      currentRevision: restored.revisionId,
    },
  );
  assert.equal(state.currentRevision, restored.revisionId);
  assert.equal(
    validatedArtifactFor(
      state.artifacts,
      state.revisions,
      restored.revisionId,
      "3mf",
    )?.sourceRevision,
    restored.revisionId,
  );
  assert.equal(
    validatedArtifactFor(
      state.artifacts,
      state.revisions,
      old.revisionId,
      "3mf",
    )?.sourceRevision,
    old.revisionId,
  );
});
