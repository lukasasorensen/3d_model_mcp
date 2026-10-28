import test from "node:test";
import assert from "node:assert/strict";
import { createMeshCache } from "../../../../dist/features/rendering/services/meshCache.service.js";
void test("mesh cache evicts least recently used entries by count and bytes", () => {
  const cache = createMeshCache(2, 6);
  cache.set("a", new Uint8Array(2));
  cache.set("b", new Uint8Array(2));
  assert.ok(cache.get("a"));
  cache.set("c", new Uint8Array(2));
  assert.equal(cache.get("b"), undefined);
  cache.set("d", new Uint8Array(5));
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("d").length, 5);
  cache.set("d", new Uint8Array(7));
  assert.equal(cache.get("d"), undefined);
  cache.set("e", new Uint8Array(6));
  assert.equal(cache.get("e").length, 6);
});
