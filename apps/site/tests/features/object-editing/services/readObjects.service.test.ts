import test from "node:test";
import assert from "node:assert/strict";
import type { CadMcpClient } from "@theoryfoundry/gateway";
import { readObjects } from "../../../../src/features/object-editing/services/readObjects.service";

void test("legacy source reads become one stable editable object without rewriting saved source", async () => {
  const calls: string[] = [];
  const client: CadMcpClient = {
    listTools: async () => [],
    async callTool(name, args) {
      calls.push(name);
      assert.equal(name, "read_model_source");
      assert.deepEqual(args, { projectId: "project", revision: "r1" });
      return {
        isError: false,
        structuredContent: {
          model: {
            revision: "r1",
            source: "// legacy\ncube(5);",
            sourceHash: "a".repeat(64),
          },
        },
      };
    },
  };
  const snapshot = await readObjects(
    client,
    "project",
    "r1",
    new AbortController().signal,
  );
  assert.equal(snapshot.modelFiles?.files[0]?.body, "// legacy\ncube(5);");
  assert.equal(snapshot.modelFiles?.objects[0]?.fileId, "main-file");
  assert.deepEqual(snapshot.modelFiles?.composition.objectIds, ["main-object"]);
  assert.deepEqual(calls, ["read_model_source"]);
});
