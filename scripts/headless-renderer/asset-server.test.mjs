import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { request } from "node:http";
import { startAssetServer } from "./asset-server.mjs";

test("proof server serves only fixed assets and rejects cross-origin or mutating requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad-proof-assets-"));
  let server;
  try {
    await mkdir(join(directory, "vendor/openscad"), { recursive: true });
    for (const file of ["index.html", "proof.js", "openscad-worker.js", ...["openscad.js", "openscad.wasm", "bosl2.zip", "manifest.json"].map(name => `vendor/openscad/${name}`)]) await writeFile(join(directory, file), file);
    server = await startAssetServer(pathToFileURL(`${directory}/`));
    const asset = await fetch(`${server.origin}/vendor/openscad/openscad.wasm`);
    assert.equal(asset.status, 200); assert.equal(asset.headers.get("content-type"), "application/wasm");
    assert.equal(await asset.text(), "vendor/openscad/openscad.wasm");
    for (const route of ["/package.json", "/vendor/openscad/../../package.json", "/proof.js?path=/etc/passwd"]) assert.equal((await fetch(`${server.origin}${route}`)).status, 404);
    assert.equal((await fetch(server.origin, { method: "POST", body: "source" })).status, 405);
    assert.equal((await fetch(server.origin, { headers: { origin: "https://other.example" } })).status, 403);
    const reboundStatus = await new Promise((resolve, reject) => {
      const req = request(server.origin, { headers: { host: "rebound.example" } }, response => { response.resume(); response.on("end", () => resolve(response.statusCode)); });
      req.on("error", reject); req.end();
    });
    assert.equal(reboundStatus, 403);
    const origin = server.origin;
    await server.close(); server = undefined;
    await assert.rejects(fetch(origin));
  } finally { await server?.close(); await rm(directory, { recursive: true, force: true }); }
});

test("missing packaged assets fail before opening a listener", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad-proof-missing-"));
  try { await assert.rejects(startAssetServer(pathToFileURL(`${directory}/`)), { code: "ENOENT" }); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
