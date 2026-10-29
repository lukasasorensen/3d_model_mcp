import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createAssetCache } from "../../../src/infrastructure/installation/index.js";
const files = [
  "index.html",
  "proof.js",
  "openscad-worker.js",
  "vendor/openscad/openscad.js",
  "vendor/openscad/openscad.wasm",
  "vendor/openscad/bosl2.zip",
  "vendor/openscad/manifest.json",
];
void test("cache is explicitly installed, independently verified, repaired and cleaned without symlink traversal", async () => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "worker-cache-")),
  );
  const signal = new AbortController().signal;
  try {
    const packaged = join(directory, "packaged");
    const root = join(directory, "cache");
    await mkdir(join(packaged, "vendor/openscad"), { recursive: true });
    const hashes: Record<string, string> = {};
    for (const file of files) {
      await writeFile(join(packaged, file), file);
      hashes[file] = createHash("sha256").update(file).digest("hex");
    }
    await writeFile(join(packaged, "integrity.json"), JSON.stringify(hashes));
    const cache = createAssetCache(pathToFileURL(packaged + sep), root);
    assert.equal(cache.available(), false);
    await assert.rejects(cache.verify(signal), /Run setup/);
    await cache.prepare(signal);
    const url = await cache.verify(signal);
    assert.ok(fileURLToPath(url).startsWith(root));
    await cache.prepare(signal);
    await writeFile(new URL("proof.js", url), "corrupted");
    await assert.rejects(cache.verify(signal), /corrupt/);
    await cache.prepare(signal);
    assert.equal(await readFile(new URL("proof.js", url), "utf8"), "proof.js");
    await rm(new URL("proof.js", url));
    await symlink(join(packaged, "proof.js"), new URL("proof.js", url));
    await assert.rejects(cache.verify(signal), /corrupt/);
    await cache.prepare(signal);
    assert.equal(
      await readFile(join(packaged, "proof.js"), "utf8"),
      "proof.js",
    );
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(cache.prepare(abort.signal));
    assert.equal((await readdir(root)).length, 1);
    await writeFile(join(packaged, "proof.js"), "bad package");
    await writeFile(new URL("proof.js", url), "bad cache");
    await assert.rejects(cache.prepare(signal), /integrity failed/);
    assert.equal((await readdir(root)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
