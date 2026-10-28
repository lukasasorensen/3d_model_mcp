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
  revisionLabel,
  validatedArtifactFor,
} from "@/features/workspace/browser/utils/workspaceRevision.util";

import { event, provenance } from "../fixtures/workspace.fixture";
test("only authoritative promoted/current events advance current revision", () => {
  const submitted = workspaceReducer(initialWorkspaceState, {
    type: "submit",
    id: "turn-1",
    text: "make a bracket",
  });
  const candidate = workspaceReducer(submitted, {
    type: "event",
    event: event({
      type: "revision",
      status: "candidate_validated",
      candidateId: "candidate-1",
      toolCallId: "tool-1",
    }),
  });
  assert.equal(candidate.currentRevision, null);
  assert.equal(candidate.candidateStatus, "validated");
  const promoted = workspaceReducer(candidate, {
    type: "event",
    event: event({
      type: "revision",
      status: "candidate_promoted",
      candidateId: "candidate-1",
      revisionId: "revision-1",
      toolCallId: "tool-1",
    }),
  });
  assert.equal(promoted.currentRevision, "revision-1");
  assert.equal(promoted.selectedRevision, null);
  assert.equal(promoted.pendingCurrentRevision, "revision-1");
  assert.equal(promoted.announcement, null);
});

test("viewer/export gating requires a manifest linked to revision and source hash", () => {
  const artifact = {
    artifactId: "artifact-1",
    format: "3mf",
    mimeType: "model/3mf",
    hash: "e".repeat(64),
    byteSize: 100,
    triangleCount: 1,
    units: "mm",
    axisConvention: "right-handed-z-up",
    boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
    sourceRevision: "revision-1",
    sourceHash: "f".repeat(64),
    renderer: provenance,
    tessellation: {},
  } satisfies ArtifactManifest;
  const revision = {
    version: "1",
    projectId: "demo-project",
    revisionId: "revision-1",
    parentRevision: null,
    sourceHash: "a".repeat(64),
    sourceBytes: 10,
    createdAt: "2026-08-05T00:00:00.000Z",
    requestId: "request-1",
    toolCallId: "tool-1",
    candidateId: "candidate-1",
    validationPolicyVersion: "1",
    validationResult: "VALID",
    diagnostics: [],
    artifacts: [artifact],
    renderer: provenance,
  } satisfies RevisionManifest;
  assert.equal(
    validatedArtifactFor(
      { [artifactKey(artifact.sourceRevision, artifact.artifactId)]: artifact },
      [revision],
      revision.revisionId,
      "3mf",
    ),
    undefined,
  );
});

test("promotion preserves the last-known-valid display and announces only after stable hydration", () => {
  const prior = {
    version: "1",
    projectId: "demo-project",
    revisionId: "revision-1",
    parentRevision: null,
    sourceHash: "a".repeat(64),
    sourceBytes: 10,
    createdAt: "2026-08-05T00:00:00.000Z",
    requestId: "request-1",
    toolCallId: "tool-1",
    candidateId: "candidate-1",
    validationPolicyVersion: "1",
    validationResult: "VALID",
    diagnostics: [],
    artifacts: [],
    renderer: provenance,
  } satisfies RevisionManifest;
  const next = {
    ...prior,
    revisionId: "revision-2",
    parentRevision: "revision-1",
    requestId: "request-2",
    toolCallId: "tool-2",
    candidateId: "candidate-2",
  } satisfies RevisionManifest;
  const hydratedPrior = workspaceReducer(initialWorkspaceState, {
    type: "hydrate",
    revisions: [prior],
    currentRevision: prior.revisionId,
  });
  const promoted = workspaceReducer(hydratedPrior, {
    type: "event",
    event: event({
      type: "revision",
      status: "candidate_promoted",
      candidateId: "candidate-2",
      revisionId: "revision-2",
      toolCallId: "tool-2",
    }),
  });
  assert.equal(promoted.currentRevision, "revision-2");
  assert.equal(promoted.selectedRevision, "revision-1");
  assert.equal(promoted.announcement, null);
  assert.equal(
    revisionLabel(promoted.revisions, promoted.currentRevision),
    "Revision",
  );

  const hydrated = workspaceReducer(promoted, {
    type: "hydrate",
    revisions: [next, prior],
    currentRevision: next.revisionId,
  });
  assert.equal(hydrated.pendingCurrentRevision, null);
  assert.equal(hydrated.selectedRevision, "revision-2");
  assert.deepEqual(hydrated.announcement, {
    key: "revision:revision-2:hydrated",
    text: "R2 is now current.",
  });
  const duplicateCurrent = workspaceReducer(hydrated, {
    type: "event",
    event: event({
      type: "revision",
      status: "current",
      revisionId: "revision-2",
      toolCallId: "tool-3",
    }),
  });
  assert.equal(
    duplicateCurrent.announcedKeys.filter(
      (key) => key === "revision:revision-2:hydrated",
    ).length,
    1,
  );
  assert.equal(duplicateCurrent.announcement, hydrated.announcement);
});

test("external hydration follows the prior current but preserves historical inspection", () => {
  const makeRevision = (
    revisionId: string,
    parentRevision: string | null,
  ): RevisionManifest => ({
    version: "1",
    projectId: "demo-project",
    revisionId,
    parentRevision,
    sourceHash: revisionId === "revision-1" ? "a".repeat(64) : "b".repeat(64),
    sourceBytes: 10,
    createdAt: "2026-08-18T00:00:00.000Z",
    requestId: `request-${revisionId}`,
    toolCallId: `tool-${revisionId}`,
    candidateId: `candidate-${revisionId}`,
    validationPolicyVersion: "1",
    validationResult: "VALID",
    diagnostics: [],
    artifacts: [],
    renderer: provenance,
  });
  const first = makeRevision("revision-1", null);
  const second = makeRevision("revision-2", first.revisionId);
  const current = workspaceReducer(initialWorkspaceState, {
    type: "hydrate",
    revisions: [first],
    currentRevision: first.revisionId,
  });
  const followed = workspaceReducer(current, {
    type: "hydrate",
    revisions: [second, first],
    currentRevision: second.revisionId,
  });
  assert.equal(followed.selectedRevision, second.revisionId);
  assert.deepEqual(followed.announcement, {
    key: "revision:revision-2:hydrated",
    text: "R2 is now current.",
  });

  const historical = workspaceReducer(
    { ...current, selectedRevision: "historical-revision" },
    {
      type: "hydrate",
      revisions: [second, first],
      currentRevision: second.revisionId,
    },
  );
  assert.equal(historical.selectedRevision, "historical-revision");
});
