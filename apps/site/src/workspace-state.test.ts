import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Box3, BufferGeometry, MeshStandardMaterial, Texture, Vector3 } from "three";
import type { ArtifactManifest, ChatEvent, RevisionManifest } from "@rjls/contracts";
import { assertGeometryBounds, commitGeometryResource, disposeGeometry, disposeMaterialResources, fetchValidatedStl, isCurrentArtifactLoad, PREVIEW_BOUNDS_TOLERANCE_MM, shouldAutoFit } from "./components/ModelViewer";
import { chatStatusLabel, isSubmitShortcut, starterPrompts } from "./components/ChatPane";
import { previewStatusLabel, promotionStatusLabel, readinessFromProbe, releaseObjectUrl, shouldRestoreComposerFocus, trackObjectUrl } from "./components/ModelWorkspace";
import { artifactKey, initialWorkspaceState, revisionLabel, validatedArtifactFor, workspaceReducer } from "./lib/workspace-state";

const provenance = {
  profile: "trusted-local-development" as const,
  renderer: "fixture", rendererVersion: "1", openscadVersion: "1", openscadBinaryHash: `sha256:${"a".repeat(64)}`,
  openscadHelpHash: `sha256:${"b".repeat(64)}`, bosl2Version: "1", bosl2Digest: `sha256:${"c".repeat(64)}`,
  imageDigest: `sha256:${"d".repeat(64)}`, commandPolicyVersion: "1", validationPolicyVersion: "1",
  attestation: { engine: "trusted-local-openscad" as const, mode: "trusted-local" as const, effectiveUid: 501, network: "host" as const, readOnlyRoot: false as const, capabilitiesDropped: false as const, noNewPrivileges: false as const, inputReadOnly: false as const, outputIsolated: false as const, resourceLimitsEnforced: false as const, seccompEnforced: false as const, memoryBytes: 0 as const, nanoCpus: 0 as const, pidsLimit: 0 as const },
};

function event(partial: Record<string, unknown>): ChatEvent {
  return { ...partial, version: "3", requestId: "request-1", sessionId: "session-1", sequence: 0, timestamp: "2026-08-05T00:00:00.000Z" } as ChatEvent;
}

test("only authoritative promoted/current events advance current revision", () => {
  const submitted = workspaceReducer(initialWorkspaceState, { type: "submit", id: "turn-1", text: "make a bracket" });
  const candidate = workspaceReducer(submitted, { type: "event", event: event({ type: "revision", status: "candidate_validated", candidateId: "candidate-1", toolCallId: "tool-1" }) });
  assert.equal(candidate.currentRevision, null);
  assert.equal(candidate.candidateStatus, "validated");
  const promoted = workspaceReducer(candidate, { type: "event", event: event({ type: "revision", status: "candidate_promoted", candidateId: "candidate-1", revisionId: "revision-1", toolCallId: "tool-1" }) });
  assert.equal(promoted.currentRevision, "revision-1");
  assert.equal(promoted.selectedRevision, null);
  assert.equal(promoted.pendingCurrentRevision, "revision-1");
  assert.equal(promoted.announcement, null);
});

test("viewer/export gating requires a manifest linked to revision and source hash", () => {
  const artifact = { artifactId: "artifact-1", format: "3mf", mimeType: "model/3mf", hash: "e".repeat(64), byteSize: 100, triangleCount: 1, units: "mm", axisConvention: "right-handed-z-up", boundingBox: { min: [0, 0, 0], max: [1, 1, 1] }, sourceRevision: "revision-1", sourceHash: "f".repeat(64), renderer: provenance, tessellation: {} } satisfies ArtifactManifest;
  const revision = { version: "1", projectId: "demo-project", revisionId: "revision-1", parentRevision: null, sourceHash: "a".repeat(64), sourceBytes: 10, createdAt: "2026-08-05T00:00:00.000Z", requestId: "request-1", toolCallId: "tool-1", candidateId: "candidate-1", validationPolicyVersion: "1", validationResult: "VALID", diagnostics: [], artifacts: [artifact], renderer: provenance } satisfies RevisionManifest;
  assert.equal(validatedArtifactFor({ [artifactKey(artifact.sourceRevision, artifact.artifactId)]: artifact }, [revision], revision.revisionId, "3mf"), undefined);
});

test("real binary STL fixture loads and stale generations cannot commit", async () => {
  const base64 = (await readFile(new URL("./fixtures/triangle.stl.base64", import.meta.url), "utf8")).trim();
  const bytes = Buffer.from(base64, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const artifact = { artifactId: "artifact-stl", format: "stl", mimeType: "model/stl", hash, byteSize: bytes.byteLength, triangleCount: 1, units: "mm", axisConvention: "right-handed-z-up", boundingBox: { min: [0, 0, 0], max: [10, 10, 0] }, sourceRevision: "revision-1", sourceHash: "f".repeat(64), renderer: provenance, tessellation: {} } satisfies ArtifactManifest;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(bytes, { headers: { "content-type": "model/stl", "x-rjls-artifact-revision": "revision-1", "x-rjls-artifact-hash": hash } });
  try {
    const geometry = await fetchValidatedStl("demo-project", artifact, new AbortController().signal);
    assert.equal(geometry.getAttribute("position").count, 3);
    disposeGeometry(geometry);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(isCurrentArtifactLoad(1, 2, false), false);
  assert.equal(isCurrentArtifactLoad(2, 2, true), false);
  assert.equal(isCurrentArtifactLoad(2, 2, false), true);
});

test("viewer rejects and disposes STL bounds outside the approved tolerance", async () => {
  const base64 = (await readFile(new URL("./fixtures/triangle.stl.base64", import.meta.url), "utf8")).trim();
  const bytes = Buffer.from(base64, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const artifact = { artifactId: "artifact-stl", format: "stl", mimeType: "model/stl", hash, byteSize: bytes.byteLength, triangleCount: 1, units: "mm", axisConvention: "right-handed-z-up", boundingBox: { min: [0, 0, 0], max: [10 + PREVIEW_BOUNDS_TOLERANCE_MM * 2, 10, 0] }, sourceRevision: "revision-1", sourceHash: "f".repeat(64), renderer: provenance, tessellation: {} } satisfies ArtifactManifest;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(bytes, { headers: { "content-type": "model/stl", "x-rjls-artifact-revision": "revision-1", "x-rjls-artifact-hash": hash } });
  try {
    await assert.rejects(fetchValidatedStl("demo-project", artifact, new AbortController().signal), /bounding box/i);
  } finally { globalThis.fetch = originalFetch; }
  const rejected = new BufferGeometry();
  rejected.boundingBox = new Box3(new Vector3(0, 0, 0), new Vector3(11, 10, 0));
  let disposals = 0;
  rejected.dispose = () => { disposals += 1; };
  assert.throws(() => assertGeometryBounds(rejected, artifact), /bounding box/i);
  assert.equal(disposals, 1);
});

test("camera auto-fit occurs only for the first model in each project", () => {
  assert.equal(shouldAutoFit(undefined, "project-a"), true);
  assert.equal(shouldAutoFit("project-a", "project-a"), false);
  assert.equal(shouldAutoFit("project-a", "project-b"), true);
});

test("geometry disposal is exact-once", () => {
  const geometry = new BufferGeometry();
  let calls = 0;
  geometry.dispose = () => { calls += 1; };
  disposeGeometry(geometry);
  disposeGeometry(geometry);
  assert.equal(calls, 1);
});

test("committed viewer swap keeps the previous geometry alive until commit", () => {
  const previous = new BufferGeometry();
  const next = new BufferGeometry();
  let previousDisposals = 0;
  previous.dispose = () => { previousDisposals += 1; };
  assert.equal(previousDisposals, 0);
  assert.equal(commitGeometryResource(previous, next), next);
  assert.equal(previousDisposals, 1);
  commitGeometryResource(previous, next);
  assert.equal(previousDisposals, 1);
});

test("materials, textures, and object URLs dispose exactly once", () => {
  const material = new MeshStandardMaterial();
  const texture = new Texture();
  material.map = texture;
  let materialDisposals = 0;
  let textureDisposals = 0;
  material.dispose = () => { materialDisposals += 1; };
  texture.dispose = () => { textureDisposals += 1; };
  disposeMaterialResources(material);
  disposeMaterialResources(material);
  assert.deepEqual([materialDisposals, textureDisposals], [1, 1]);

  const originalRevoke = URL.revokeObjectURL;
  let revocations = 0;
  URL.revokeObjectURL = () => { revocations += 1; };
  try {
    trackObjectUrl("blob:rjls-test");
    releaseObjectUrl("blob:rjls-test");
    releaseObjectUrl("blob:rjls-test");
    assert.equal(revocations, 1);
  } finally { URL.revokeObjectURL = originalRevoke; }
});

test("composer sends only with Ctrl/Command+Enter and selected history remains distinct from current", () => {
  assert.equal(isSubmitShortcut({ key: "Enter", ctrlKey: false, metaKey: false }), false);
  assert.equal(isSubmitShortcut({ key: "Enter", ctrlKey: true, metaKey: false }), true);
  assert.equal(isSubmitShortcut({ key: "Enter", ctrlKey: false, metaKey: true }), true);
  const selected = workspaceReducer({ ...initialWorkspaceState, currentRevision: "revision-2" }, { type: "select_revision", revisionId: "revision-1" });
  assert.equal(selected.currentRevision, "revision-2");
  assert.equal(selected.selectedRevision, "revision-1");
  assert.equal(shouldRestoreComposerFocus(true, false, true), true);
  assert.equal(shouldRestoreComposerFocus(true, false, false), false);
  assert.equal(shouldRestoreComposerFocus(false, false, true), false);
  assert.equal(readinessFromProbe({ ok: false }), "unavailable");
  assert.equal(readinessFromProbe({ ok: true }), "ready");
  assert.equal(chatStatusLabel(false, false), "Unavailable");
  assert.equal(chatStatusLabel(false, true), "Ready");
  assert.equal(previewStatusLabel(true, "loading"), "Verifying preview");
  assert.equal(previewStatusLabel(true, "error"), "Preview unavailable");
  assert.equal(previewStatusLabel(true, "ready"), "Preview validated");
  assert.equal(promotionStatusLabel("R2", true), "Updating—showing last-known-valid R2 until the promoted revision is verified for display.");
});

test("starter prompts are state-aware and match deterministic CAD actions", () => {
  assert.deepEqual(starterPrompts(false), ["Create an 80 × 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes."]);
  assert.deepEqual(starterPrompts(true), [
    "Widen the current bracket to 100 mm and move the holes to 70 mm spacing.",
    "Widen the current bracket to 100 mm, move the holes to 70 mm spacing, and add two 6 mm gussets with 20 mm legs.",
  ]);
  assert.ok(starterPrompts(false).every((prompt) => !/current|gusset|widen/i.test(prompt)));
  assert.ok(starterPrompts(true).every((prompt) => /100 mm/.test(prompt) && /70 mm spacing/.test(prompt)));
});

test("promotion preserves the last-known-valid display and announces only after stable hydration", () => {
  const prior = { version: "1", projectId: "demo-project", revisionId: "revision-1", parentRevision: null, sourceHash: "a".repeat(64), sourceBytes: 10, createdAt: "2026-08-05T00:00:00.000Z", requestId: "request-1", toolCallId: "tool-1", candidateId: "candidate-1", validationPolicyVersion: "1", validationResult: "VALID", diagnostics: [], artifacts: [], renderer: provenance } satisfies RevisionManifest;
  const next = { ...prior, revisionId: "revision-2", parentRevision: "revision-1", requestId: "request-2", toolCallId: "tool-2", candidateId: "candidate-2" } satisfies RevisionManifest;
  const hydratedPrior = workspaceReducer(initialWorkspaceState, { type: "hydrate", revisions: [prior], currentRevision: prior.revisionId });
  const promoted = workspaceReducer(hydratedPrior, { type: "event", event: event({ type: "revision", status: "candidate_promoted", candidateId: "candidate-2", revisionId: "revision-2", toolCallId: "tool-2" }) });
  assert.equal(promoted.currentRevision, "revision-2");
  assert.equal(promoted.selectedRevision, "revision-1");
  assert.equal(promoted.announcement, null);
  assert.equal(revisionLabel(promoted.revisions, promoted.currentRevision), "Revision");

  const hydrated = workspaceReducer(promoted, { type: "hydrate", revisions: [next, prior], currentRevision: next.revisionId });
  assert.equal(hydrated.pendingCurrentRevision, null);
  assert.equal(hydrated.selectedRevision, "revision-2");
  assert.deepEqual(hydrated.announcement, { key: "revision:revision-2:hydrated", text: "R2 is now current." });
  const duplicateCurrent = workspaceReducer(hydrated, { type: "event", event: event({ type: "revision", status: "current", revisionId: "revision-2", toolCallId: "tool-3" }) });
  assert.equal(duplicateCurrent.announcedKeys.filter((key) => key === "revision:revision-2:hydrated").length, 1);
  assert.equal(duplicateCurrent.announcement, hydrated.announcement);
});

test("canonical R1-R2-R3 stream keeps artifact/export gates causal and rejected edits preserve R3", () => {
  const makeRevision = (revisionId: string, parentRevision: string | null, index: number): RevisionManifest => {
    const sourceHash = String(index).repeat(64);
    const artifact = (format: "stl" | "3mf"): ArtifactManifest => ({
      artifactId: `${format}-${index}`, format, mimeType: format === "stl" ? "model/stl" : "model/3mf",
      hash: String(index + 3).repeat(64), byteSize: 134, triangleCount: 12, units: "mm",
      axisConvention: "right-handed-z-up", boundingBox: { min: [-50, -20, 0], max: [50, 20, 46] },
      sourceRevision: revisionId, sourceHash, renderer: provenance, tessellation: { fixture: true },
    });
    return { version: "1", projectId: "canonical-project", revisionId, parentRevision, sourceHash,
      sourceBytes: 100, createdAt: `2026-08-05T00:00:0${index}.000Z`, requestId: `request-${index}`,
      toolCallId: `request-${index}-t4`, candidateId: `candidate-${index}`, validationPolicyVersion: "1",
      validationResult: "VALID", diagnostics: [], artifacts: [artifact("stl"), artifact("3mf")], renderer: provenance };
  };
  const r1 = makeRevision("revision-r1", null, 1);
  const r2 = makeRevision("revision-r2", r1.revisionId, 2);
  const r3 = makeRevision("revision-r3", r2.revisionId, 3);
  let state = workspaceReducer(initialWorkspaceState, { type: "hydrate", revisions: [], currentRevision: null });
  for (const [revision, revisions] of [[r1, [r1]], [r2, [r2, r1]], [r3, [r3, r2, r1]]] as const) {
    state = workspaceReducer(state, { type: "event", event: event({ type: "revision", status: "candidate_validated", candidateId: revision.candidateId, toolCallId: revision.toolCallId }) });
    assert.notEqual(state.selectedRevision, revision.revisionId);
    state = workspaceReducer(state, { type: "event", event: event({ type: "revision", status: "candidate_promoted", candidateId: revision.candidateId, revisionId: revision.revisionId, toolCallId: revision.toolCallId }) });
    assert.equal(state.pendingCurrentRevision, revision.revisionId);
    state = workspaceReducer(state, { type: "hydrate", revisions: [...revisions], currentRevision: revision.revisionId });
    assert.equal(state.selectedRevision, revision.revisionId);
    assert.ok(validatedArtifactFor(state.artifacts, state.revisions, revision.revisionId, "stl"));
    assert.ok(validatedArtifactFor(state.artifacts, state.revisions, revision.revisionId, "3mf"));
  }
  const rejected = workspaceReducer(state, { type: "event", event: event({ type: "revision", status: "candidate_rejected", candidateId: "candidate-bad", toolCallId: "tool-bad" }) });
  assert.equal(rejected.currentRevision, r3.revisionId);
  assert.equal(rejected.selectedRevision, r3.revisionId);
  assert.match(rejected.notice, /current revision is unchanged/i);
  const substituted = { ...r3.artifacts[0], sourceHash: "f".repeat(64) };
  assert.equal(validatedArtifactFor({ ...rejected.artifacts, [artifactKey(substituted.sourceRevision, substituted.artifactId)]: substituted }, rejected.revisions, r3.revisionId, "stl"), undefined);
});

test("restore hydration keeps identical artifact bytes linked to both historical and restored-current revisions", () => {
  const sourceHash = "a".repeat(64);
  const shared = { artifactId: "shared-artifact", format: "3mf", mimeType: "model/3mf", hash: "b".repeat(64), byteSize: 128, triangleCount: 4, units: "mm", axisConvention: "right-handed-z-up", boundingBox: { min: [0, 0, 0], max: [10, 10, 10] }, sourceRevision: "revision-old", sourceHash, renderer: provenance, tessellation: {} } satisfies ArtifactManifest;
  const old = { version: "1", projectId: "demo-project", revisionId: "revision-old", parentRevision: null, sourceHash, sourceBytes: 10, createdAt: "2026-08-05T00:00:00.000Z", requestId: "request-1", toolCallId: "tool-1", candidateId: "candidate-1", validationPolicyVersion: "1", validationResult: "VALID", diagnostics: [], artifacts: [shared], renderer: provenance } satisfies RevisionManifest;
  const restoredArtifact = { ...shared, sourceRevision: "revision-restored" };
  const restored = { ...old, revisionId: "revision-restored", parentRevision: "revision-old", restoredFrom: "revision-old", requestId: "request-2", toolCallId: "tool-2", candidateId: "candidate-2", artifacts: [restoredArtifact] } satisfies RevisionManifest;
  const state = workspaceReducer(workspaceReducer(initialWorkspaceState, { type: "restored", revision: restored }), { type: "hydrate", revisions: [restored, old], currentRevision: restored.revisionId });
  assert.equal(state.currentRevision, restored.revisionId);
  assert.equal(validatedArtifactFor(state.artifacts, state.revisions, restored.revisionId, "3mf")?.sourceRevision, restored.revisionId);
  assert.equal(validatedArtifactFor(state.artifacts, state.revisions, old.revisionId, "3mf")?.sourceRevision, old.revisionId);
});
