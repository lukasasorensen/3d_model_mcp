import assert from "node:assert/strict";
import test from "node:test";

import { PROJECT_CREATE_BODY_BYTES, ProjectCreateBodyTooLargeError, readProjectCreateBody } from "./project-create-request";

test("project creation JSON is bounded with and without Content-Length", async () => {
  const valid = new Request("http://localhost/v1/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Bracket", description: "Mounting bracket" }),
  });
  assert.deepEqual(await readProjectCreateBody(valid), { name: "Bracket", description: "Mounting bracket" });

  const declaredOversize = new Request("http://localhost/v1/projects", {
    method: "POST",
    headers: { "content-length": String(PROJECT_CREATE_BODY_BYTES + 1) },
    body: "{}",
  });
  await assert.rejects(readProjectCreateBody(declaredOversize), ProjectCreateBodyTooLargeError);

  const streamedOversize = new Request("http://localhost/v1/projects", {
    method: "POST",
    body: "x".repeat(PROJECT_CREATE_BODY_BYTES + 1),
  });
  await assert.rejects(readProjectCreateBody(streamedOversize), ProjectCreateBodyTooLargeError);
});
