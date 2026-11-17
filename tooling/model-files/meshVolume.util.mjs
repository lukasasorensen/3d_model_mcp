import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";

function signedTetrahedron(a, b, c) {
  return (
    (a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])) /
    6
  );
}

/** Independent volume check detects internal cuts even when outer bounds agree. */
export function stlVolume(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  assert.equal(bytes.byteLength, 84 + 50 * count);
  let signedVolume = 0;
  for (let triangle = 0; triangle < count; triangle++) {
    const vertices = Array.from({ length: 3 }, (_, vertex) =>
      Array.from({ length: 3 }, (_, axis) =>
        view.getFloat32(96 + triangle * 50 + vertex * 12 + axis * 4, true),
      ),
    );
    signedVolume += signedTetrahedron(...vertices);
  }
  return Math.abs(signedVolume);
}

function xmlElements(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(
    (match) => match[0],
  );
}

function numberAttribute(element, name) {
  const match = new RegExp(`\\b${name}="([^"]+)"`).exec(element);
  assert.ok(match, `Missing ${name} in 3MF mesh`);
  const value = Number(match[1]);
  assert.ok(Number.isFinite(value));
  return value;
}

/** The pinned OpenSCAD fixture exporter emits a single untransformed mesh. */
export function threeMfVolume(bytes) {
  const entries = unzipSync(bytes);
  const models = Object.entries(entries).filter(([name]) =>
    name.endsWith(".model"),
  );
  assert.equal(models.length, 1);
  const xml = strFromU8(models[0][1]);
  assert.equal(xmlElements(xml, "mesh").length, 1);
  assert.equal(xmlElements(xml, "item").length, 1);
  assert.equal(xml.includes("transform="), false);
  const vertices = xmlElements(xml, "vertex").map((element) =>
    ["x", "y", "z"].map((axis) => numberAttribute(element, axis)),
  );
  let signedVolume = 0;
  for (const element of xmlElements(xml, "triangle")) {
    const triangle = ["v1", "v2", "v3"].map((index) => {
      const vertex = vertices[numberAttribute(element, index)];
      assert.ok(vertex);
      return vertex;
    });
    signedVolume += signedTetrahedron(...triangle);
  }
  return Math.abs(signedVolume);
}
