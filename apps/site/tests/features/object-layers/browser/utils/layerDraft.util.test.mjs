import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_FILE_LIMITS } from "@theoryfoundry/contracts";
import {
  layerDraft,
  layerOperations,
  layerDraftProblem,
} from "../../../../../src/features/object-layers/browser/utils/layerDraft.util.ts";
import {
  applyObjectLayersSchema,
  layerNameSchema,
} from "../../../../../src/features/object-layers/objectLayers.schema.ts";

test("combined layer drafts enforce the MCP operation limit before submission", () => {
  const objects = Array.from({ length: MODEL_FILE_LIMITS.objects }, (_, i) => ({
    id: `obj-${i}`,
    name: `Object ${i}`,
    fileId: i === 0 ? "base" : "parts",
  }));
  const order = objects.map((o) => o.id);
  const snapshot = {
    revision: "r1",
    state: {
      objects,
      files: [{ id: "base" }, { id: "parts" }],
      composition: { operation: "difference", objectIds: order },
      presentation: {
        objectOrder: order,
        hiddenObjectIds: [],
        hiddenFileIds: ["parts"],
      },
    },
  };
  const draft = layerDraft(snapshot);
  draft.order.reverse();
  draft.names = new Map(objects.map((o) => [o.id, o.name + " renamed"]));
  draft.hidden = order.slice(1);
  draft.hiddenFiles = [];
  const operations = layerOperations(snapshot, draft);
  const payload = {
    requestId: "request",
    sessionId: "session",
    parentRevision: "r1",
    operations,
  };
  assert.equal(operations.length, MODEL_FILE_LIMITS.operations + 1);
  assert.ok(
    layerDraftProblem(snapshot, draft, operations.length).includes(
      "at most 200",
    ),
  );
  assert.equal(applyObjectLayersSchema.safeParse(payload).success, false);
  draft.hidden.pop();
  const withinLimit = layerOperations(snapshot, draft);
  assert.equal(layerDraftProblem(snapshot, draft, withinLimit.length), "");
  assert.equal(
    applyObjectLayersSchema.safeParse({ ...payload, operations: withinLimit })
      .success,
    true,
  );
  draft.hidden = [order[0]];
  assert.ok(
    layerDraftProblem(
      snapshot,
      draft,
      layerOperations(snapshot, draft).length,
    ).includes("first difference operand"),
  );
});

test("trim names before enforcing the object label and storage constraints", () => {
  assert.equal(layerNameSchema.parse("  Parts bin  "), "Parts bin");
  assert.equal(layerNameSchema.parse("🧰"), "🧰");
  for (const invalid of [" ", "a".repeat(101), "A\0B", "\ud800"])
    assert.equal(layerNameSchema.safeParse(invalid).success, false);
});
