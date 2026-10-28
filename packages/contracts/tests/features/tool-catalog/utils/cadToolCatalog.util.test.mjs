import test from "node:test";
import assert from "node:assert/strict";
import {
  createCadToolCatalog,
  cadToolInstructions,
} from "../../../../dist/index.js";
void test("hosted and local modes share schemas while describing their actual renderer", () => {
  const browser = createCadToolCatalog();
  const local = createCadToolCatalog("local-worker");
  assert.deepEqual(Object.keys(browser), Object.keys(local));
  for (const name of Object.keys(browser)) {
    assert.equal(browser[name].inputSchema, local[name].inputSchema);
    assert.equal(browser[name].outputSchema, local[name].outputSchema);
  }
  assert.match(
    browser.validate_and_render.description,
    /visible project browser/,
  );
  assert.match(local.validate_and_render.description, /locally/);
  assert.match(cadToolInstructions(), /visible browser tab/);
  assert.match(cadToolInstructions("local-worker"), /no visible project tab/);
  assert.equal(
    createCadToolCatalog().validate_and_render.description,
    browser.validate_and_render.description,
  );
});
