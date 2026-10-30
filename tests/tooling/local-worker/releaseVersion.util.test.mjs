import test from "node:test";
import assert from "node:assert/strict";
import { releaseVersion } from "../../../tooling/local-worker/releaseVersion.util.mjs";
test("release candidates cannot change the base version or use moving ranges/tags", () => {
  assert.equal(releaseVersion("0.1.0"), "0.1.0");
  assert.equal(releaseVersion("0.1.0", "0.1.0-rc.1"), "0.1.0-rc.1");
  for (const value of [
    "latest",
    "^0.1.0",
    "0.2.0",
    "0.1.0-rc.01",
    "0.1.0-rc.1+other",
    "0.1.0\n",
  ]) {
    assert.throws(() => releaseVersion("0.1.0", value));
  }
});
