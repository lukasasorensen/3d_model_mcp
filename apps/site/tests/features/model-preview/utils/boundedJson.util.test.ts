import assert from "node:assert/strict";
import test from "node:test";
import { boundedJson } from "../../../../src/features/model-preview/utils/boundedJson.util";

void test("bounded JSON counts UTF-8 bytes and releases readers on success and rejection", async () => {
  const valid = new Request("http://localhost", {
    method: "POST",
    body: '"é"',
  });
  assert.equal(await boundedJson(valid, 4), "é");
  assert.equal(valid.body?.locked, false);
  const oversized = new Request("http://localhost", {
    method: "POST",
    body: '"é"',
  });
  await assert.rejects(boundedJson(oversized, 3), RangeError);
  assert.equal(oversized.body?.locked, false);
  const malformed = new Request("http://localhost", {
    method: "POST",
    body: "{",
  });
  await assert.rejects(boundedJson(malformed, 10), SyntaxError);
  assert.equal(malformed.body?.locked, false);
});
