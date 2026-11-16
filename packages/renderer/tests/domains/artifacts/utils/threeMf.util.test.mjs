import { parseThreeMf } from "../../../../dist/index.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

test("3MF vertex tables do not depend on the JavaScript function argument limit", async () => {
  const entries = unzipSync(
    await readFile(
      new URL("../../../fixtures/openscad-cube.3mf", import.meta.url),
    ),
  );
  const modelPath = Object.keys(entries).find((path) =>
    path.endsWith(".model"),
  );
  assert.ok(modelPath);
  // Extra unused vertices are valid and leave the cube's triangle indices and geometry unchanged.
  const xml = strFromU8(entries[modelPath]);
  assert.ok(xml.includes("</vertices>"));
  entries[modelPath] = strToU8(
    xml.replace(
      "</vertices>",
      `${'<vertex x="0" y="0" z="0"/>'.repeat(140_000)}</vertices>`,
    ),
  );
  const parserUrl = new URL("../../../../dist/index.js", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--stack-size=512",
      "--input-type=module",
      "-e",
      `
    import { readFileSync } from "node:fs";
    import { parseThreeMf } from ${JSON.stringify(parserUrl)};
    console.log(JSON.stringify(parseThreeMf(readFileSync(0))));
  `,
    ],
    { input: zipSync(entries), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    triangleCount: 12,
    boundingBox: { min: [0, 0, 0], max: [20, 30, 10] },
  });
});

test("pinned browser OpenSCAD ZIP64 3MF exports retain geometry and reject corrupt directory metadata", async () => {
  const bytes = await readFile(
    new URL("../../../fixtures/openscad-cube.3mf", import.meta.url),
  );
  assert.deepEqual(parseThreeMf(bytes), {
    triangleCount: 12,
    boundingBox: { min: [0, 0, 0], max: [20, 30, 10] },
  });
  const corrupt = Buffer.from(bytes),
    end = corrupt.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
  corrupt.writeBigUInt64LE(2n ** 53n, end + 48);
  assert.throws(() => parseThreeMf(corrupt));
  assert.throws(() => parseThreeMf(bytes.subarray(0, bytes.length - 1)));
});

test("repeated 3MF build items do not multiply the vertex table in memory", async () => {
  const entries = unzipSync(
    await readFile(
      new URL("../../../fixtures/openscad-cube.3mf", import.meta.url),
    ),
  );
  const modelPath = Object.keys(entries).find((path) =>
    path.endsWith(".model"),
  );
  const xml = strFromU8(entries[modelPath]);
  entries[modelPath] = strToU8(
    xml
      .replace(
        "</vertices>",
        `${'<vertex x="0" y="0" z="0"/>'.repeat(10_000)}</vertices>`,
      )
      .replace(/<item\b[^>]*\/>/, (item) => item.repeat(2_000)),
  );
  const parserUrl = new URL("../../../../dist/index.js", import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=96",
      "--input-type=module",
      "-e",
      `
    import { readFileSync } from "node:fs";
    import { parseThreeMf } from ${JSON.stringify(parserUrl)};
    console.log(JSON.stringify(parseThreeMf(readFileSync(0))));
  `,
    ],
    {
      input: zipSync(entries),
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    triangleCount: 24_000,
    boundingBox: { min: [0, 0, 0], max: [20, 30, 10] },
  });
});

test("malformed 3MF XML cannot repeatedly scan the remaining document", async () => {
  const original = unzipSync(
    await readFile(
      new URL("../../../fixtures/openscad-cube.3mf", import.meta.url),
    ),
  );
  const modelPath = Object.keys(original).find((path) =>
    path.endsWith(".model"),
  );
  const xml = strFromU8(original[modelPath]);
  const parserUrl = new URL("../../../../dist/index.js", import.meta.url).href;
  const cases = [
    [
      modelPath,
      xml.replace(
        /<resources\b[^>]*>[\s\S]*?<\/resources>/,
        `<resources>${'<object id="1">'.repeat(80_000)}</resources>`,
      ),
    ],
    [
      modelPath,
      xml.replace(/<build\b[^>]*>[\s\S]*?<\/build>/, "<build>".repeat(80_000)),
    ],
    [modelPath, "<model ".repeat(80_000)],
    [
      modelPath,
      xml.replace(
        /<mesh>[\s\S]*?<\/mesh>/,
        `<mesh>${"<vertex ".repeat(80_000)}`,
      ),
    ],
    [
      modelPath,
      xml.replace(/<triangles>[\s\S]*?<\/mesh>/, "<triangle ".repeat(80_000)),
    ],
    [
      modelPath,
      xml.replace(
        /<build\b[^>]*>[\s\S]*?<\/build>/,
        `<build>${"<item ".repeat(80_000)}</build>`,
      ),
    ],
    ["_rels/.rels", "<Relationship ".repeat(80_000)],
    ["[Content_Types].xml", '<Default Extension="model" '.repeat(80_000)],
  ];
  for (const [path, text] of cases) {
    const archive = zipSync({ ...original, [path]: strToU8(text) });
    assert.ok(archive.byteLength < 16 * 1024);
    const result = spawnSync(
      process.execPath,
      [
        "--max-old-space-size=128",
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      import {readFileSync} from "node:fs";
      import {parseThreeMf} from ${JSON.stringify(parserUrl)};
      assert.throws(() => parseThreeMf(readFileSync(0)), {code: "INVALID_ARTIFACT"});
    `,
      ],
      {
        input: archive,
        timeout: 5_000,
        encoding: "utf8",
        maxBuffer: 64 * 1024,
      },
    );
    assert.equal(
      result.status,
      0,
      `${path}: ${result.stderr || result.error?.message}`,
    );
  }
});

test("nested 3MF object/build sections are rejected while sibling objects retain their geometry", async () => {
  const entries = unzipSync(
    await readFile(
      new URL("../../../fixtures/openscad-cube.3mf", import.meta.url),
    ),
  );
  const modelPath = Object.keys(entries).find((path) =>
    path.endsWith(".model"),
  );
  const xml = strFromU8(entries[modelPath]);
  for (const malformed of [
    xml
      .replace(/(<object\b[^>]*>)/, '$1<object id="2">')
      .replace("</object>", "</object></object>"),
    xml
      .replace(/(<build\b[^>]*>)/, "$1<build>")
      .replace("</build>", "</build></build>"),
  ])
    assert.throws(
      () =>
        parseThreeMf(zipSync({ ...entries, [modelPath]: strToU8(malformed) })),
      { code: "INVALID_ARTIFACT" },
    );
  const object = xml.match(/<object\b[\s\S]*?<\/object>/)[0];
  const id = object.match(/\bid="([^"]+)"/)[1];
  const sibling = object.replace(`id="${id}"`, 'id="987654"');
  const combined = xml
    .replace("</resources>", `${sibling}</resources>`)
    .replace("</build>", '<item objectid="987654"/></build>');
  assert.deepEqual(
    parseThreeMf(zipSync({ ...entries, [modelPath]: strToU8(combined) })),
    {
      triangleCount: 24,
      boundingBox: { min: [0, 0, 0], max: [20, 30, 10] },
    },
  );
});

test("3MF accepts a matching content-type override and rejects a mismatched part", async () => {
  const entries = unzipSync(
    await readFile(
      new URL("../../../fixtures/openscad-cube.3mf", import.meta.url),
    ),
  );
  const modelPath = Object.keys(entries).find((path) =>
    path.endsWith(".model"),
  );
  for (const target of [modelPath, "missing.model"]) {
    const archive = zipSync({
      ...entries,
      "[Content_Types].xml": strToU8(
        `<Types><Override ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" PartName="/${target}"/></Types>`,
      ),
    });
    if (target === modelPath)
      assert.equal(parseThreeMf(archive).triangleCount, 12);
    else
      assert.throws(() => parseThreeMf(archive), { code: "INVALID_ARTIFACT" });
  }
});
