import assert from "node:assert/strict";
import test from "node:test";
import { authenticateRequest } from "../../../../src/features/authentication/services/authenticateRequest.service";

test("authentication distinguishes anonymous sessions from infrastructure failures", async () => {
  const request = new Request("http://localhost/v1/projects");
  const anonymous = await authenticateRequest(request, async () => null);
  assert.ok(anonymous instanceof Response);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "UNAUTHENTICATED");
  const unavailable = await authenticateRequest(request, async () => {
    throw new Error("database unavailable");
  });
  assert.ok(unavailable instanceof Response);
  assert.equal(unavailable.status, 503);
  assert.equal(
    (await unavailable.json()).error.code,
    "AUTHENTICATION_UNAVAILABLE",
  );
});
