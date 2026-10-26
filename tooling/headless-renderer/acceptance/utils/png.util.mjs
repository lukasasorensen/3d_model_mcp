import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

export function inspectPng(bytes) {
  assert.deepEqual(
    bytes.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.equal(bytes.readUInt32BE(16), 768);
  assert.equal(bytes.readUInt32BE(20), 768);
  assert.ok(bytes.length <= 2 * 1024 * 1024);
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    assert.ok(offset + length + 12 <= bytes.length);
    if (bytes.toString("ascii", offset + 4, offset + 8) === "IDAT")
      compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const channels = bytes[25] === 6 ? 4 : 3;
  const decoded = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: (768 * channels + 1) * 768,
  });
  assert.equal(decoded.length, (768 * channels + 1) * 768);
  assert.ok(new Set(decoded).size > 16, "PNG must contain rendered image data");
}
