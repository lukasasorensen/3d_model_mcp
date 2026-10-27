import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { runtimeAssetReference } from "../../../tooling/architecture/runtimeAssets.policy.mjs";
const expression = (text) =>
  ts.createSourceFile("asset.ts", text, 99, true).statements[0].expression;
test("only the declared OpenSCAD runtime resource can resolve outside the module graph", () => {
  const valid = expression(
    'new URL("/vendor/openscad/openscad.js", origin).href',
  );
  assert.equal(
    runtimeAssetReference(valid, "@theoryfoundry/browser-renderer"),
    true,
  );
  assert.equal(runtimeAssetReference(valid, "@theoryfoundry/runtime"), false);
  for (const value of [
    "moduleUrl",
    "new URL(path, origin).href",
    'new URL("/vendor/other.js", origin).href',
    'new URL("/vendor/openscad/openscad.js").href',
  ]) {
    assert.equal(
      runtimeAssetReference(
        expression(value),
        "@theoryfoundry/browser-renderer",
      ),
      false,
      value,
    );
  }
});
