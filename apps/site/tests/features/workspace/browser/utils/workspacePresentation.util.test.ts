import {
  chatStatusLabel,
  isSubmitShortcut,
  starterPrompts,
} from "@/features/chat/browser/components/chatPane.component";
import {
  previewStatusLabel,
  promotionStatusLabel,
  readinessFromProbe,
  shouldRestoreComposerFocus,
} from "@/features/workspace/browser/utils/workspacePresentation.util";
import {
  initialWorkspaceState,
  workspaceReducer,
} from "@/features/workspace/browser/utils/workspaceState.util";
import assert from "node:assert/strict";
import test from "node:test";

void test("composer sends only with Ctrl/Command+Enter and selected history remains distinct from current", () => {
  assert.equal(
    isSubmitShortcut({ key: "Enter", ctrlKey: false, metaKey: false }),
    false,
  );
  assert.equal(
    isSubmitShortcut({ key: "Enter", ctrlKey: true, metaKey: false }),
    true,
  );
  assert.equal(
    isSubmitShortcut({ key: "Enter", ctrlKey: false, metaKey: true }),
    true,
  );
  const selected = workspaceReducer(
    { ...initialWorkspaceState, currentRevision: "revision-2" },
    { type: "select_revision", revisionId: "revision-1" },
  );
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
  assert.equal(
    promotionStatusLabel("R2", true),
    "Updating—showing last-known-valid R2 until the promoted revision is verified for display.",
  );
});

void test("starter prompts are state-aware and match deterministic CAD actions", () => {
  assert.deepEqual(starterPrompts(false), [
    "Create an 80 × 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes.",
  ]);
  assert.deepEqual(starterPrompts(true), [
    "Widen the current bracket to 100 mm and move the holes to 70 mm spacing.",
    "Widen the current bracket to 100 mm, move the holes to 70 mm spacing, and add two 6 mm gussets with 20 mm legs.",
  ]);
  assert.ok(
    starterPrompts(false).every(
      (prompt) => !/current|gusset|widen/i.test(prompt),
    ),
  );
  assert.ok(
    starterPrompts(true).every(
      (prompt) => /100 mm/.test(prompt) && /70 mm spacing/.test(prompt),
    ),
  );
});
