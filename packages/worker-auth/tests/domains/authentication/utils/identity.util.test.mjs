import test from "node:test";
import assert from "node:assert/strict";
import { workerIdentity } from "../../../../dist/domains/authentication/index.js";
test("canonical origins explicitly bind audience and reject implicit insecure deployments", () => {
  assert.equal(
    workerIdentity("https://cad.example").resource,
    "https://cad.example/mcp",
  );
  for (const origin of [
    "http://cad.example",
    "http://localhost:3000",
    "https://cad.example/",
    "https://cad.example/path",
    "https://user:password@cad.example",
    "https://CAD.example",
    "https://cad.example?x=1",
  ])
    assert.throws(() => workerIdentity(origin));
  assert.equal(
    workerIdentity("http://127.0.0.1:3000", true).issuer,
    "http://127.0.0.1:3000/api/auth",
  );
  assert.throws(() => workerIdentity("http://cad.example", true));
});
