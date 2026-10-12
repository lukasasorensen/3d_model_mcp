import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

test("3MF vertex tables do not depend on the JavaScript function argument limit", async () => {
  const entries = unzipSync(await readFile(new URL("./fixtures/openscad-cube.3mf", import.meta.url)));
  const modelPath = Object.keys(entries).find(path => path.endsWith(".model"));
  assert.ok(modelPath);
  // Extra unused vertices are valid and leave the cube's triangle indices and geometry unchanged.
  const xml = strFromU8(entries[modelPath]);
  assert.ok(xml.includes("</vertices>"));
  entries[modelPath] = strToU8(xml.replace("</vertices>", `${'<vertex x="0" y="0" z="0"/>'.repeat(140_000)}</vertices>`));
  const parserUrl = new URL("../dist/index.js", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--stack-size=512", "--input-type=module", "-e", `
    import { readFileSync } from "node:fs";
    import { parseThreeMf } from ${JSON.stringify(parserUrl)};
    console.log(JSON.stringify(parseThreeMf(readFileSync(0))));
  `], { input: zipSync(entries), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    triangleCount: 12,
    boundingBox: { min: [0, 0, 0], max: [20, 30, 10] },
  });
});
