import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseThreeMf} from "../dist/index.js";
test("pinned browser OpenSCAD ZIP64 3MF exports retain geometry and reject corrupt directory metadata",async()=>{
  const bytes=await readFile(new URL("./fixtures/openscad-cube.3mf",import.meta.url));
  assert.deepEqual(parseThreeMf(bytes),{triangleCount:12,boundingBox:{min:[0,0,0],max:[20,30,10]}});
  const corrupt=Buffer.from(bytes),end=corrupt.lastIndexOf(Buffer.from([0x50,0x4b,0x06,0x06]));
  corrupt.writeBigUInt64LE(2n**53n,end+48);
  assert.throws(()=>parseThreeMf(corrupt));
  assert.throws(()=>parseThreeMf(bytes.subarray(0,bytes.length-1)));
});
