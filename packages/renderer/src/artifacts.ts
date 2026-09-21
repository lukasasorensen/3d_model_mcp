import { zipDirectory, zipEntrySizes } from "./zip64.js";
import { inflateRawSync } from "node:zlib";
import { CAD_LIMITS } from "@rjls/contracts";
import { RendererError } from "./diagnostics.js";

export interface ParsedMesh {
  triangleCount: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
}

function checkedBounds(vertices: Array<[number, number, number]>): ParsedMesh["boundingBox"] {
  if (vertices.length === 0) throw new RendererError("INVALID_ARTIFACT", "Artifact contains no vertices.");
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = vertex[axis];
      if (value === undefined || !Number.isFinite(value)) throw new RendererError("INVALID_ARTIFACT", "Artifact contains a non-finite coordinate.");
      min[axis] = Math.min(min[axis] ?? Infinity, value);
      max[axis] = Math.max(max[axis] ?? -Infinity, value);
    }
  }
  return { min, max };
}

type Triangle = readonly [number, number, number];

function coordinateKey(vertex: readonly [number, number, number]): string {
  return vertex.map((value) => Object.is(value, -0) ? "0" : value.toString()).join(",");
}

/** Bounded exact-topology audit: every triangle has area and every edge is shared twice with opposite orientation. */
function assertClosedOrientedManifold(vertices: Array<[number, number, number]>, triangles: readonly Triangle[]): void {
  const edges = new Map<string, { count: number; balance: number }>();
  for (const [aIndex, bIndex, cIndex] of triangles) {
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    const c = vertices[cIndex];
    if (!a || !b || !c) throw new RendererError("INVALID_ARTIFACT", "Mesh triangle references an invalid vertex.");
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
    if (!cross.every(Number.isFinite) || cross.every((value) => value === 0)) throw new RendererError("INVALID_ARTIFACT", "Mesh contains a degenerate triangle.");
    for (const [fromIndex, toIndex] of [[aIndex, bIndex], [bIndex, cIndex], [cIndex, aIndex]] as const) {
      const from = coordinateKey(vertices[fromIndex]!);
      const to = coordinateKey(vertices[toIndex]!);
      if (from === to) throw new RendererError("INVALID_ARTIFACT", "Mesh contains a collapsed edge.");
      const forward = from < to;
      const key = forward ? `${from}|${to}` : `${to}|${from}`;
      const edge = edges.get(key) ?? { count: 0, balance: 0 };
      edge.count += 1;
      edge.balance += forward ? 1 : -1;
      if (edge.count > 2) throw new RendererError("INVALID_ARTIFACT", "Mesh contains a non-manifold edge.");
      edges.set(key, edge);
    }
  }
  if ([...edges.values()].some((edge) => edge.count !== 2 || edge.balance !== 0)) throw new RendererError("INVALID_ARTIFACT", "Mesh is open, non-manifold, or inconsistently oriented.");
}

export function parseBinaryStl(bytes: Uint8Array): ParsedMesh {
  if (bytes.byteLength > CAD_LIMITS.previewBytes) throw new RendererError("RESOURCE_LIMIT", "Preview exceeds the byte budget.");
  if (bytes.byteLength < 84) throw new RendererError("INVALID_ARTIFACT", "Binary STL is truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  if (triangleCount === 0 || triangleCount > CAD_LIMITS.previewTriangles) throw new RendererError("RESOURCE_LIMIT", "Preview triangle budget is invalid or exceeded.");
  if (84 + triangleCount * 50 !== bytes.byteLength) throw new RendererError("INVALID_ARTIFACT", "Binary STL length does not match its triangle table.");
  const vertices: Array<[number, number, number]> = [];
  const triangles: Triangle[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = base + vertex * 12;
      vertices.push([view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)]);
    }
    const first = triangle * 3;
    triangles.push([first, first + 1, first + 2]);
  }
  const boundingBox = checkedBounds(vertices);
  assertClosedOrientedManifold(vertices, triangles);
  return { triangleCount, boundingBox };
}

interface ZipEntry { name: string; bytes: Uint8Array }

interface CentralZipEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function unzip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 22) throw new RendererError("INVALID_ARTIFACT", "3MF is not a complete ZIP package.");
  let eocd = -1;
  for (let cursor = bytes.byteLength - 22; cursor >= Math.max(0, bytes.byteLength - 65_557); cursor -= 1) {
    if (view.getUint32(cursor, true) === 0x06054b50) { eocd = cursor; break; }
  }
  if (eocd < 0 || eocd + 22 + view.getUint16(eocd + 20, true) !== bytes.byteLength) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP end record is missing or inconsistent.");
  const {count:entryCount,offset:centralOffset,end:centralEnd} = zipDirectory(view,eocd);
  const central: CentralZipEntry[] = [];
  let centralCursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (centralCursor + 46 > centralEnd || view.getUint32(centralCursor, true) !== 0x02014b50) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP central directory is malformed.");
    const nameLength = view.getUint16(centralCursor + 28, true);
    const extraLength = view.getUint16(centralCursor + 30, true);
    const commentLength = view.getUint16(centralCursor + 32, true);
    const end = centralCursor + 46 + nameLength + extraLength + commentLength;
    if (end > centralEnd) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP central directory is truncated.");
    const sizes = zipEntrySizes(view, centralCursor + 46 + nameLength, extraLength, {
      compressedSize:view.getUint32(centralCursor+20,true),uncompressedSize:view.getUint32(centralCursor+24,true),localOffset:view.getUint32(centralCursor+42,true),
    });
    central.push({
      name: new TextDecoder().decode(bytes.subarray(centralCursor + 46, centralCursor + 46 + nameLength)),
      flags: view.getUint16(centralCursor + 8, true), method: view.getUint16(centralCursor + 10, true),
      crc: view.getUint32(centralCursor + 16, true), compressedSize: sizes.compressedSize,
      uncompressedSize: sizes.uncompressedSize, localOffset: sizes.localOffset!,
    });
    centralCursor = end;
  }
  if (centralCursor !== centralEnd || new Set(central.map((entry) => entry.name)).size !== central.length) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP central directory has trailing or duplicate entries.");
  const entries: ZipEntry[] = [];
  let offset = 0;
  let expanded = 0;
  for (const expected of central) {
    if (expected.localOffset !== offset || offset + 30 > centralOffset || view.getUint32(offset, true) !== 0x04034b50) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP local headers do not match the central directory.");
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    let compressedSize = view.getUint32(offset + 18, true);
    let uncompressedSize = view.getUint32(offset + 22, true);
    const expectedCrc = view.getUint32(offset + 14, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    ({compressedSize,uncompressedSize} = zipEntrySizes(view,offset+30+nameLength,extraLength,{compressedSize,uncompressedSize}));
    if ((flags & 0x09) !== 0 || (method !== 0 && method !== 8)) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP uses an unsupported streaming or compression mode.");
    const dataOffset = offset + 30 + nameLength + extraLength;
    const end = dataOffset + compressedSize;
    if (end > bytes.byteLength || uncompressedSize > CAD_LIMITS.exportBytes) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP entry is truncated or oversized.");
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    if (name !== expected.name || flags !== expected.flags || method !== expected.method || compressedSize !== expected.compressedSize || uncompressedSize !== expected.uncompressedSize || expectedCrc !== expected.crc) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP local and central metadata disagree.");
    if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP contains an unsafe entry path.");
    const compressed = bytes.subarray(dataOffset, end);
    const output = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: CAD_LIMITS.exportBytes });
    if (output.byteLength !== uncompressedSize) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP entry size is inconsistent.");
    if (crc32(output) !== expectedCrc) throw new RendererError("INTEGRITY_FAILURE", "3MF ZIP entry checksum is invalid.");
    expanded += output.byteLength;
    if (expanded > CAD_LIMITS.exportBytes) throw new RendererError("RESOURCE_LIMIT", "Expanded 3MF exceeds the byte budget.");
    entries.push({ name, bytes: output });
    offset = end;
  }
  if (entries.length === 0 || offset !== centralOffset) throw new RendererError("INVALID_ARTIFACT", "3MF ZIP local entry table is inconsistent.");
  return entries;
}

function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    localChunks.push(local);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralChunks.push(central);
    localOffset += local.length;
  }
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  const all = [...localChunks, ...centralChunks, end];
  const output = new Uint8Array(all.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of all) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

/** Adds controller-owned linkage; model source cannot choose or forge this value. */
export function bindThreeMfSource(bytes: Uint8Array, sourceHash: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) throw new RendererError("INTEGRITY_FAILURE", "Source linkage hash is invalid.");
  const entries = unzip(bytes);
  const model = entries.find((entry) => entry.name.toLowerCase().endsWith(".model"));
  if (!model) throw new RendererError("INVALID_ARTIFACT", "3MF package has no model part.");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(model.bytes);
  if (/<metadata\s+name=["']rjls:sourceHash["']/i.test(xml)) throw new RendererError("INTEGRITY_FAILURE", "Renderer output attempted to supply trusted source linkage.");
  const linked = xml.replace(/(<model\b[^>]*>)/i, `$1<metadata name="rjls:sourceHash">${sourceHash}</metadata>`);
  if (linked === xml) throw new RendererError("INVALID_ARTIFACT", "3MF model root is malformed.");
  model.bytes = new TextEncoder().encode(linked);
  return writeZip(entries);
}

export function parseThreeMf(bytes: Uint8Array, expectedSourceHash?: string): ParsedMesh {
  if (bytes.byteLength > CAD_LIMITS.exportBytes) throw new RendererError("RESOURCE_LIMIT", "3MF exceeds the byte budget.");
  const entries = unzip(bytes);
  const contentTypes = entries.find((entry) => entry.name === "[Content_Types].xml");
  const relationships = entries.find((entry) => entry.name === "_rels/.rels");
  if (!contentTypes || !relationships) throw new RendererError("INVALID_ARTIFACT", "3MF package relationships are incomplete.");
  const contentTypesXml = new TextDecoder("utf-8", { fatal: true }).decode(contentTypes.bytes);
  const relationshipsXml = new TextDecoder("utf-8", { fatal: true }).decode(relationships.bytes);
  const relationshipsMatches = [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)].filter((match) => /\bType\s*=\s*["']http:\/\/schemas\.microsoft\.com\/3dmanufacturing\/2013\/01\/3dmodel["']/i.test(match[1] ?? ""));
  if (relationshipsMatches.length !== 1) throw new RendererError("INVALID_ARTIFACT", "3MF package must declare exactly one root model relationship.");
  const targetValue = relationshipsMatches[0]?.[1]?.match(/\bTarget\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!targetValue || targetValue.includes("\\") || targetValue.split("/").includes("..")) throw new RendererError("INVALID_ARTIFACT", "3MF model relationship target is unsafe or missing.");
  const target = targetValue.replace(/^\//, "");
  const escapedTarget = `/${target}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!/<Default\b(?=[^>]*\bExtension=["']model["'])(?=[^>]*\bContentType=["']application\/vnd\.ms-package\.3dmanufacturing-3dmodel\+xml["'])[^>]*\/?>/i.test(contentTypesXml) && !new RegExp(`<Override\\b(?=[^>]*\\bPartName=["']${escapedTarget}["'])(?=[^>]*\\bContentType=["']application/vnd\\.ms-package\\.3dmanufacturing-3dmodel\\+xml["'])[^>]*/?>`, "i").test(contentTypesXml)) throw new RendererError("INVALID_ARTIFACT", "3MF content types do not declare the related model part.");
  const model = target ? entries.find((entry) => entry.name === target) : undefined;
  if (!model) throw new RendererError("INVALID_ARTIFACT", "3MF package has no model part.");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(model.bytes);
  const root = xml.match(/<model\b([^>]*)>/i)?.[1] ?? "";
  if (!/\bunit\s*=\s*["']millimeter["']/i.test(root)) throw new RendererError("INVALID_ARTIFACT", "3MF units must be millimeters.");
  for (const match of xml.matchAll(/\btransform\s*=\s*["']([^"']+)["']/gi)) {
    const values = (match[1] ?? "").trim().split(/\s+/).map(Number);
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    if (values.length !== 12 || values.some((value, index) => !Number.isFinite(value) || value !== identity[index])) throw new RendererError("INVALID_ARTIFACT", "3MF contains an unsupported non-identity transform.");
  }
  if (expectedSourceHash) {
    const escaped = expectedSourceHash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`<metadata\\s+name=["']rjls:sourceHash["']\\s*>\\s*${escaped}\\s*</metadata>`, "i").test(xml)) {
      throw new RendererError("INTEGRITY_FAILURE", "3MF source linkage is missing or mismatched.");
    }
  }
  const objects = new Map<number, { vertices: Array<[number, number, number]>; triangleCount: number }>();
  for (const objectMatch of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object\s*>/gi)) {
    const attributes = objectMatch[1] ?? "";
    const body = objectMatch[2] ?? "";
    const id = Number(attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1]);
    if (!Number.isInteger(id) || id <= 0 || objects.has(id) || !/<mesh\b/i.test(body) || /<components\b/i.test(body)) throw new RendererError("INVALID_ARTIFACT", "3MF contains an invalid or unsupported object graph.");
    const vertices: Array<[number, number, number]> = [];
    for (const match of body.matchAll(/<vertex\b([^>]*)\/?\s*>/gi)) {
      const vertexAttributes = match[1] ?? "";
      const coordinate = (name: string) => Number(vertexAttributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]);
      vertices.push([coordinate("x"), coordinate("y"), coordinate("z")]);
    }
    checkedBounds(vertices);
    const triangles: Triangle[] = [];
    for (const match of body.matchAll(/<triangle\b([^>]*)\/?\s*>/gi)) {
      const triangleAttributes = match[1] ?? "";
      const indices = ["v1", "v2", "v3"].map((name) => {
        const index = Number(triangleAttributes.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]);
        if (!Number.isInteger(index) || index < 0 || index >= vertices.length) throw new RendererError("INVALID_ARTIFACT", "3MF triangle references an invalid vertex.");
        return index;
      }) as [number, number, number];
      triangles.push(indices);
    }
    if (triangles.length === 0) throw new RendererError("INVALID_ARTIFACT", "3MF object contains no triangles.");
    assertClosedOrientedManifold(vertices, triangles);
    objects.set(id, { vertices, triangleCount: triangles.length });
  }
  if (objects.size === 0) throw new RendererError("INVALID_ARTIFACT", "3MF contains no validated mesh objects.");
  const buildMatches = [...xml.matchAll(/<build\b[^>]*>([\s\S]*?)<\/build\s*>/gi)];
  if (buildMatches.length !== 1) throw new RendererError("INVALID_ARTIFACT", "3MF must contain exactly one build graph.");
  const itemMatches = [...(buildMatches[0]?.[1] ?? "").matchAll(/<item\b([^>]*)\/?\s*>/gi)];
  if (itemMatches.length === 0) throw new RendererError("INVALID_ARTIFACT", "3MF build graph is empty.");
  const builtVertices: Array<[number, number, number]> = [];
  let triangleCount = 0;
  const referenced = new Set<number>();
  for (const item of itemMatches) {
    const objectId = Number((item[1] ?? "").match(/\bobjectid\s*=\s*["']([^"']+)["']/i)?.[1]);
    const object = objects.get(objectId);
    if (!object) throw new RendererError("INVALID_ARTIFACT", "3MF build item references an invalid object.");
    referenced.add(objectId);
    builtVertices.push(...object.vertices);
    triangleCount += object.triangleCount;
  }
  if (referenced.size !== objects.size) throw new RendererError("INVALID_ARTIFACT", "3MF contains mesh objects that are not referenced by the build graph.");
  return { triangleCount, boundingBox: checkedBounds(builtVertices) };
}
