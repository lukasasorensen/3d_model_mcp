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

function legacyClient(source: string, modelBody?: string): CadMcpClient {
  return {
    listTools: async () => [],
    async callTool(name): ReturnType<CadMcpClient["callTool"]> {
      assert.equal(
        name,
        "read_model_source",
        "Compatibility checks must not mutate the model.",
      );
      return {
        isError: false,
        structuredContent: {
          model: {
            revision: "r1",
            sourceHash: "a".repeat(64),
            ...(modelBody ? { modelBody, parameters: [] } : { source }),
          },
        },
      };
    },
  };
}

for (const body of [
  "include <BOSL2/std.scad>; cuboid([2,4,6]);",
  "use <BOSL2/shapes3d.scad>; cube(5);",
  "include /* existing library */ <BOSL2/std.scad>; cuboid(5);",
]) {
  void test(`legacy object adoption explains unsupported library directives: ${body}`, async () => {
    for (const modelBody of [undefined, body]) {
      const snapshot = await readObjects(
        legacyClient(body, modelBody),
        "project",
        "r1",
        new AbortController().signal,
      );
      assert.equal(snapshot.modelFiles, null);
      assert.equal(snapshot.revision, "r1");
      assert.equal(snapshot.sourceHash, "a".repeat(64));
      assert.ok(snapshot.unsupportedReason?.includes("BOSL2"));
      assert.ok(
        snapshot.unsupportedReason?.includes("downloads remain available"),
      );
    }
  });
}

void test("comments and strings mentioning library imports remain editable", async () => {
  const body =
    '// include <BOSL2/std.scad>;\n/* use <BOSL2/math.scad>; */\necho("include <BOSL2/std.scad>"); cube(5);';
  const snapshot = await readObjects(
    legacyClient(body),
    "project",
    "r1",
    new AbortController().signal,
  );
  assert.equal(snapshot.modelFiles?.files[0]?.body, body);
  assert.equal(snapshot.unsupportedReason, undefined);
});

void test("other incompatible legacy scopes report their actual reason", async () => {
  const snapshot = await readObjects(
    legacyClient("} cube(5); {"),
    "project",
    "r1",
    new AbortController().signal,
  );
  assert.equal(snapshot.modelFiles, null);
  assert.ok(snapshot.unsupportedReason?.includes("Unbalanced file delimiters"));
});
