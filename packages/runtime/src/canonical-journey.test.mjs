import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { cpus, freemem, totalmem, type as osType, release } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CAD_LIMITS, CHAT_LIMITS, OBSERVABILITY_LIMITS, chatEventSchema, isProductionRendererProvenance, observabilityEnvelopeSchema } from "@rjls/contracts";
import { streamCadChat } from "@rjls/gateway";
import { CadDomainError, ModelProjectRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { parseBinaryStl, parseThreeMf } from "@rjls/renderer";
import { ObservabilityEvidence, createInMemoryCadMcpClient } from "../dist/index.js";

const fixtureUrl = (name) => new URL(`../../../fixtures/canonical-demo/${name}`, import.meta.url);
const canonical = {
  r1: JSON.parse(await readFile(fixtureUrl("create.json"), "utf8")),
  r2: JSON.parse(await readFile(fixtureUrl("edit-1.json"), "utf8")),
  r3: JSON.parse(await readFile(fixtureUrl("edit-2.json"), "utf8")),
  export: JSON.parse(await readFile(fixtureUrl("export.json"), "utf8")),
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = (character) => `sha256:${character.repeat(64)}`;
const provenance = {
  profile: "production-oci", renderer: "g006-test-only-deterministic-fixture", rendererVersion: "1",
  openscadVersion: "fixture-openscad-2025.03.25", openscadBinaryHash: digest("a"), openscadHelpHash: digest("b"),
  bosl2Version: "fixture-bosl2-v2.0.741", bosl2Digest: digest("c"), imageDigest: digest("d"),
  commandPolicyVersion: "oci-command-v1", validationPolicyVersion: VALIDATION_POLICY_VERSION,
  attestation: { engine: "fixture-vm", mode: "vm-backed", effectiveUid: 1000, network: "none", readOnlyRoot: true,
    capabilitiesDropped: true, noNewPrivileges: true, inputReadOnly: true, outputIsolated: true,
    resourceLimitsEnforced: true, seccompEnforced: true, memoryBytes: 512 * 1024 * 1024,
    nanoCpus: 1_000_000_000, pidsLimit: 128, openscadVersion: "fixture-openscad-2025.03.25",
    openscadBinaryHash: digest("a"), openscadHelpHash: digest("b"), bosl2Version: "fixture-bosl2-v2.0.741", bosl2Digest: digest("c") },
};
const deterministicRenderCache = new Map();

function quad(triangles, a, b, c, d) {
  triangles.push([a, b, c], [a, c, d]);
}

function horizontalAxis(min, max) {
  const values = [min, min + 0.5];
  for (let value = min + 1.5; value < max; value += 1) values.push(value);
  values.push(max);
  return values;
}

function geometry(source) {
  const width = /width\s*=\s*100\s*;/.test(source) ? 100 : 80;
  const holeX = width === 100 ? 35 : 25;
  const xs = [...new Set([...horizontalAxis(-width / 2, width / 2), -38, -32, 32, 38])]
    .filter((value) => value >= -width / 2 && value <= width / 2)
    .sort((a, b) => a - b);
  const ys = horizontalAxis(-20, 20);
  const zs = [0, 6, ...Array.from({ length: 40 }, (_, index) => index + 7)];
  const occupied = new Set();
  const key = (x, y, z) => `${x}:${y}:${z}`;
  const hasGussets = /gusset\(-35\).*gusset\(35\)/s.test(source);

  for (let x = 0; x < xs.length - 1; x += 1) {
    for (let y = 0; y < ys.length - 1; y += 1) {
      for (let z = 0; z < zs.length - 1; z += 1) {
        const centerX = (xs[x] + xs[x + 1]) / 2;
        const centerY = (ys[y] + ys[y + 1]) / 2;
        const inHole = [-holeX, holeX].some((center) => Math.hypot(centerX - center, centerY) < 2.5);
        const base = zs[z + 1] <= 6 && !inHole;
        const upright = zs[z] >= 6 && centerY >= 14;
        const gusset = hasGussets
          && [-35, 35].some((center) => Math.abs(centerX - center) < 3)
          && zs[z] >= 6
          && zs[z] < 26
          && ys[y] < 14
          && ys[y + 1] > zs[z] - 12;
        if (base || upright || gusset) occupied.add(key(x, y, z));
      }
    }
  }

  const triangles = [];
  for (const entry of occupied) {
    const [x, y, z] = entry.split(":").map(Number);
    const [x0, x1] = [xs[x], xs[x + 1]];
    const [y0, y1] = [ys[y], ys[y + 1]];
    const [z0, z1] = [zs[z], zs[z + 1]];
    if (!occupied.has(key(x - 1, y, z))) quad(triangles, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (!occupied.has(key(x + 1, y, z))) quad(triangles, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
    if (!occupied.has(key(x, y - 1, z))) quad(triangles, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!occupied.has(key(x, y + 1, z))) quad(triangles, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
    if (!occupied.has(key(x, y, z - 1))) quad(triangles, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
    if (!occupied.has(key(x, y, z + 1))) quad(triangles, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  }
  return triangles;
}
function meshVertices(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const vertices = [];
  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + vertex * 12;
      vertices.push([
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true),
      ]);
    }
  }
  return vertices;
}

function meshConnectedComponents(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const edgeTriangles = new Map();
  const neighbors = Array.from({ length: count }, () => new Set());
  const point = (offset) => `${view.getFloat32(offset, true)},${view.getFloat32(offset + 4, true)},${view.getFloat32(offset + 8, true)}`;

  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    const vertices = [point(offset), point(offset + 12), point(offset + 24)];
    for (let edge = 0; edge < 3; edge += 1) {
      const pair = [vertices[edge], vertices[(edge + 1) % 3]].sort().join("|");
      const prior = edgeTriangles.get(pair);
      if (prior === undefined) {
        edgeTriangles.set(pair, triangle);
      } else {
        neighbors[triangle].add(prior);
        neighbors[prior].add(triangle);
      }
    }
  }

  let components = 0;
  const seen = new Set();
  for (let start = 0; start < count; start += 1) {
    if (seen.has(start)) continue;
    components += 1;
    const pending = [start];
    seen.add(start);
    while (pending.length > 0) {
      const current = pending.pop();
      for (const next of neighbors[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return components;
}

function assertThroughHoles(bytes, expectedCenters) {
  const vertices = meshVertices(bytes);
  for (const centerX of expectedCenters) {
    const wall = vertices.filter(([x, y, z]) => (
      Math.abs(x - centerX) <= 2.5
      && Math.abs(y) <= 2.5
      && (Math.abs(z) < 0.001 || Math.abs(z - 6) < 0.001)
    ));
    assert.equal(Math.max(...wall.map(([x]) => x)) - Math.min(...wall.map(([x]) => x)), 5);
    assert.equal(Math.max(...wall.map(([, y]) => y)) - Math.min(...wall.map(([, y]) => y)), 5);
  }
  assert.equal(expectedCenters[1] - expectedCenters[0], Math.abs(expectedCenters[0]) * 2);
}

function meshContainsPoint(bytes, origin) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(80, true);
  const direction = [1, 0.123, 0.057];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  let intersections = 0;

  for (let triangle = 0; triangle < count; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    const points = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + vertex * 12;
      points.push([
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true),
      ]);
    }
    const edge1 = subtract(points[1], points[0]);
    const edge2 = subtract(points[2], points[0]);
    const h = cross(direction, edge2);
    const determinant = dot(edge1, h);
    if (Math.abs(determinant) < 1e-9) continue;
    const inverse = 1 / determinant;
    const offsetFromVertex = subtract(origin, points[0]);
    const u = inverse * dot(offsetFromVertex, h);
    if (u < 0 || u > 1) continue;
    const q = cross(offsetFromVertex, edge1);
    const v = inverse * dot(direction, q);
    if (v < 0 || u + v > 1) continue;
    if (inverse * dot(edge2, q) > 1e-7) intersections += 1;
  }
  return intersections % 2 === 1;
}

function hasGussetMesh(bytes, centerX) {
  return meshContainsPoint(bytes, [centerX, -5, 6.5])
    && meshContainsPoint(bytes, [centerX, 13, 25])
    && meshContainsPoint(bytes, [centerX, 8, 15])
    && !meshContainsPoint(bytes, [centerX, 0, 20])
    && !meshContainsPoint(bytes, [centerX + 3.1, 8, 15]);
}
function binaryStl(triangles) {
  const edges = new Map();
  const key = (point) => point.map((value) => Math.fround(value)).join(",");
  for (const triangle of triangles) {
    for (let index = 0; index < 3; index += 1) {
      const from = key(triangle[index]);
      const to = key(triangle[(index + 1) % 3]);
      const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
      const edge = edges.get(edgeKey) ?? { count: 0, balance: 0 };
      edge.count += 1;
      edge.balance += from < to ? 1 : -1;
      edges.set(edgeKey, edge);
    }
  }
  const invalid = [...edges].filter(([, edge]) => edge.count !== 2 || edge.balance !== 0);
  if (invalid.length > 0) throw new Error(`fixture topology invalid: ${JSON.stringify(invalid.slice(0, 3))}`);

  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  new TextEncoder().encodeInto("RJLS G006 TEST-ONLY DETERMINISTIC FIXTURE", bytes.subarray(0, 80));
  view.setUint32(80, triangles.length, true);
  let offset = 84;
  for (const triangle of triangles) {
    offset += 12;
    for (const vertex of triangle) {
      for (const value of vertex) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    offset += 2;
  }
  return bytes;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const [name, bytes] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const localEntry = new Uint8Array(30 + nameBytes.length + bytes.length);
    const localView = new DataView(localEntry.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc32(bytes), true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localEntry.set(nameBytes, 30);
    localEntry.set(bytes, 30 + nameBytes.length);
    local.push(localEntry);

    const centralEntry = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc32(bytes), true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    centralEntry.set(nameBytes, 46);
    central.push(centralEntry);
    localOffset += localEntry.length;
  }
  const centralSize = central.reduce((size, entry) => size + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);

  const chunks = [...local, ...central, end];
  const output = new Uint8Array(chunks.reduce((size, entry) => size + entry.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
function threeMf(triangles, sourceHash) {
  const vertices=triangles.flat();
  const vertexXml=vertices.map(([x,y,z])=>`<vertex x="${x}" y="${y}" z="${z}"/>`).join("");
  const triangleXml=triangles.map((_,i)=>`<triangle v1="${i*3}" v2="${i*3+1}" v3="${i*3+2}"/>`).join("");
  const model=`<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="rjls:sourceHash">${sourceHash}</metadata><resources><object id="1" type="model"><mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return zip([["[Content_Types].xml",new TextEncoder().encode(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>` )],["_rels/.rels",new TextEncoder().encode(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`)],["3D/3dmodel.model",new TextEncoder().encode(model)]]);
}
function signedVolume(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), count=view.getUint32(80,true); let volume=0;
  for(let i=0;i<count;i+=1){const o=84+i*50+12, p=[]; for(let v=0;v<3;v+=1)p.push([view.getFloat32(o+v*12,true),view.getFloat32(o+v*12+4,true),view.getFloat32(o+v*12+8,true)]); volume += (p[0][0]*(p[1][1]*p[2][2]-p[1][2]*p[2][1])-p[0][1]*(p[1][0]*p[2][2]-p[1][2]*p[2][0])+p[0][2]*(p[1][0]*p[2][1]-p[1][1]*p[2][0]))/6; }
  return Math.abs(volume);
}

class TestOnlyDeterministicProductionRenderer {
  async validateAndRender(request) {
    const cached=deterministicRenderCache.get(request.sourceHash);if(cached)return cached;
    const triangles=geometry(request.source), stl=binaryStl(triangles), mf=threeMf(triangles,request.sourceHash), parsed=parseBinaryStl(stl);
    parseThreeMf(mf,request.sourceHash);
    const result={ outcome:"VALID", diagnostics:[], provenance, validationPolicyVersion:VALIDATION_POLICY_VERSION, artifacts:[
      { format:"stl",bytes:stl,mimeType:"model/stl",triangleCount:parsed.triangleCount,boundingBox:parsed.boundingBox,tessellation:{fixture:true,$fn:48} },
      { format:"3mf",bytes:mf,mimeType:"model/3mf",triangleCount:parsed.triangleCount,boundingBox:parsed.boundingBox,tessellation:{fixture:true,$fn:48} },
    ]};deterministicRenderCache.set(request.sourceHash,result);return result;
  }
}

class FixtureClassifyingRenderer extends TestOnlyDeterministicProductionRenderer {
  async validateAndRender(request) {
    const rejection = /difference\(\s*\{|1000000000|\$fn\s*=\s*800|WARNING:/.test(request.source);
    if (rejection) return { outcome:"REJECTED", diagnostics:[{ code:"FIXTURE_REJECTED", severity:"error", message:"Hostile fixture rejected by deterministic policy." }], provenance, validationPolicyVersion:VALIDATION_POLICY_VERSION, artifacts:[] };
    return super.validateAndRender(request);
  }
}

async function chat(client, projectId, sessionId, message, ids, evidence) {
  const events=[]; const started=performance.now();
  for await (const event of streamCadChat({version:"3",projectId,sessionId,message},{client,createId:()=>ids.shift(),clock:()=>new Date("2026-08-06T06:00:00.000Z"),createObservabilitySink:()=>evidence})) {
    events.push(chatEventSchema.parse(event));
  }
  assert.ok(performance.now()-started < CHAT_LIMITS.requestTimeoutMs); return events;
}

test("frozen blank to R3 to 3MF journey crosses LangChain, official MCP, repository, and artifact gates", async () => {
  const root=await mkdtemp(join(tmpdir(),"rjls-g006-")); let id=0;
  const repository=new ModelProjectRepository({workspaceRoot:root,renderer:new TestOnlyDeterministicProductionRenderer(),acceptRendererProvenance:isProductionRendererProvenance,createId:()=>`domain-${++id}`,clock:()=>new Date("2026-08-06T06:00:00.000Z")});
  const client=await createInMemoryCadMcpClient(repository), evidence=new ObservabilityEvidence(), projectId="canonical-project", sessionId="canonical-session";
  try {
    const r1Events=await chat(client,projectId,sessionId,"Create an 80 x 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes.",["request-r1"],evidence);
    const r1=(await repository.listRevisions(projectId))[0], r1Stl=await repository.readArtifact(projectId,r1.revisionId,r1.artifacts.find(a=>a.format==="stl").artifactId);
    assert.equal(r1.parentRevision,null); assert.equal(meshConnectedComponents(r1Stl.bytes),1); assertThroughHoles(r1Stl.bytes,[-25,25]); assert.deepEqual(parseBinaryStl(r1Stl.bytes).boundingBox,canonical.r1.bounds); assert.ok(r1Events.some(e=>e.type==="revision"&&e.status==="candidate_promoted"&&e.revisionId===r1.revisionId));

    const r2Events=await chat(client,projectId,sessionId,"Widen the current bracket to 100 mm and move the holes to 70 mm spacing.",["request-r2"],evidence);
    const r2=(await repository.listRevisions(projectId))[0], r2Stl=await repository.readArtifact(projectId,r2.revisionId,r2.artifacts.find(a=>a.format==="stl").artifactId);
    assert.equal(r2.parentRevision,r1.revisionId); assert.equal(meshConnectedComponents(r2Stl.bytes),1); assertThroughHoles(r2Stl.bytes,[-35,35]); assert.deepEqual(parseBinaryStl(r2Stl.bytes).boundingBox,canonical.r2.bounds); assert.equal((await repository.readModelSource(projectId,r1.revisionId)).sourceHash,r1.sourceHash); assert.ok(r2Events.some(e=>e.type==="artifact"&&e.revisionId===r2.revisionId));

    await chat(client,projectId,sessionId,"Add two symmetric 6 mm gussets with 20 mm forward and upward legs.",["request-r3"],evidence);
    const r3=(await repository.listRevisions(projectId))[0], r3Stl=await repository.readArtifact(projectId,r3.revisionId,r3.artifacts.find(a=>a.format==="stl").artifactId);
    assert.equal(r3.parentRevision,r2.revisionId);
    assert.equal(meshConnectedComponents(r3Stl.bytes),1);
    assert.equal(hasGussetMesh(r2Stl.bytes,-35),false);
    assert.equal(hasGussetMesh(r2Stl.bytes,35),false);
    assert.equal(hasGussetMesh(r3Stl.bytes,-35),true,"left gusset mesh signature");
    assert.equal(hasGussetMesh(r3Stl.bytes,35),true,"right gusset mesh signature");
    assert.deepEqual(parseBinaryStl(r3Stl.bytes).boundingBox,canonical.r3.bounds);
    assert.ok(signedVolume(r3Stl.bytes)>signedVolume(r2Stl.bytes));

    const exportEvents=await chat(client,projectId,sessionId,"Export the current R3 as 3MF.",["request-export"],evidence), exportManifest=r3.artifacts.find(a=>a.format==="3mf"), exportBytes=await repository.readArtifact(projectId,r3.revisionId,exportManifest.artifactId);
    assert.equal(exportManifest.mimeType,canonical.export.mimeType); assert.equal(exportManifest.units,"mm"); assert.equal(exportManifest.sourceRevision,r3.revisionId); assert.equal(exportManifest.sourceHash,r3.sourceHash); assert.equal(sha256(exportBytes.bytes),exportManifest.hash); assert.ok(parseThreeMf(exportBytes.bytes,r3.sourceHash).triangleCount>0); assert.ok(exportEvents.some(e=>e.type==="artifact"&&e.format==="3mf"&&e.revisionId===r3.revisionId));
    for (const revision of [r1,r2,r3]) { assert.equal(revision.requestId,`request-${revision===r1?"r1":revision===r2?"r2":"r3"}`); assert.ok(revision.toolCallId.startsWith(revision.requestId)); assert.equal(revision.candidateId.startsWith("domain-"),true); for(const artifact of revision.artifacts){assert.equal(artifact.sourceRevision,revision.revisionId);assert.equal(artifact.sourceHash,revision.sourceHash);assert.ok(artifact.byteSize<=(artifact.format==="stl"?CAD_LIMITS.previewBytes:CAD_LIMITS.exportBytes));} }
    const restartedRepository=new ModelProjectRepository({workspaceRoot:root,renderer:new TestOnlyDeterministicProductionRenderer(),acceptRendererProvenance:isProductionRendererProvenance,createId:()=>`restart-${++id}`}); const recovered=await restartedRepository.getProjectState(projectId); assert.equal(recovered.currentRevision,r3.revisionId); assert.equal(recovered.source.hash,r3.sourceHash); assert.deepEqual(recovered.artifacts.map(a=>a.hash),r3.artifacts.map(a=>a.hash));
    const restored=await restartedRepository.restoreRevision({projectId,revision:r1.revisionId,requestId:"request-restore",toolCallId:"tool-restore"}); assert.equal(restored.parentRevision,r3.revisionId); assert.equal(restored.restoredFrom,r1.revisionId); assert.notEqual(restored.revisionId,r1.revisionId); assert.equal((await restartedRepository.getProjectState(projectId)).currentRevision,restored.revisionId);

    evidence.record({version:"1",timestamp:"2026-08-06T06:00:00.000Z",level:"info",service:"runtime",event:"canary.redacted",requestId:"request-evidence",outcome:"success",metadata:{detail:"token=supersecret /Users/example/private/model.scad"}});
    assert.equal(evidence.probeDependency({available:false,requestId:"readiness-1",timestamp:"2026-08-06T06:00:01.000Z"}),"unavailable"); assert.equal(evidence.probeDependency({available:true,requestId:"readiness-2",timestamp:"2026-08-06T06:00:02.000Z"}),"unavailable"); assert.equal(evidence.probeDependency({available:true,requestId:"readiness-3",timestamp:"2026-08-06T06:00:03.000Z"}),"ready");
    const bundle=evidence.bundle({cpu:cpus()[0]?.model??"unknown",ramBytes:totalmem()-freemem(),os:`${osType()} ${release()}`,filesystem:"temporary local filesystem",containerEngine:"test-only injected fixture; real OCI unavailable",containerContext:"not exercised",containerMode:"fixture metadata only",cgroup:"not exercised",browser:"unavailable",openscadImageDigest:provenance.imageDigest,bosl2Pin:provenance.bosl2Digest,dependencyLockHash:sha256(await readFile(new URL("../../../pnpm-lock.yaml",import.meta.url))),validationPolicyHash:sha256(VALIDATION_POLICY_VERSION),runTimestamp:"2026-08-06T06:00:04.000Z"});
    assert.equal(bundle.redactionScan.matches,0); assert.deepEqual(bundle.readinessTransitions.map(e=>e.event),["readiness.unavailable","readiness.ready"]); assert.ok(bundle.records.every(record=>observabilityEnvelopeSchema.safeParse(record).success)); assert.ok(bundle.records.every(record=>!JSON.stringify(record).includes(projectId)&&!JSON.stringify(record).includes("model.scad"))); assert.ok(bundle.records.filter(record=>record.event==="chat.artifact").every(record=>record.toolCallId&&record.revisionId&&record.artifactId)); assert.ok(bundle.records.filter(record=>record.candidateId).every(record=>record.toolCallId)); assert.equal(bundle.records.filter(record=>record.event==="agent.turn").length,4); assert.equal(bundle.records.filter(record=>record.event==="render.completed").length,3); assert.ok(bundle.records.filter(record=>record.event==="render.completed").every(record=>record.jobId&&record.candidateId&&record.toolCallId)); assert.equal(bundle.metrics.filter(metric=>metric.name==="request_count").length,4); assert.equal(bundle.metrics.filter(metric=>metric.name==="render_duration_ms").length,3); assert.ok(bundle.metrics.some(metric=>metric.name==="artifact_bytes")); assert.ok(bundle.metrics.some(metric=>metric.name==="artifact_triangles")); assert.ok(bundle.volume.records<=OBSERVABILITY_LIMITS.recordsPerRequest); assert.ok(bundle.volume.serializedBytes<=OBSERVABILITY_LIMITS.serializedBytesPerRequest);
  } finally { await client.close(); }
});

test("hostile cross-layer candidates and stale promotion never corrupt current", async () => {
  const root=await mkdtemp(join(tmpdir(),"rjls-g006-hostile-")); let id=0;
  const repository=new ModelProjectRepository({workspaceRoot:root,renderer:new FixtureClassifyingRenderer(),acceptRendererProvenance:isProductionRendererProvenance,createId:()=>`hostile-${++id}`}); const client=await createInMemoryCadMcpClient(repository);
  try {
    await chat(client,"hostile-project","hostile-session","Create a bracket.",["request-base"],new ObservabilityEvidence()); const current=(await repository.getProjectState("hostile-project")).currentRevision;
    const fixtureRoot=new URL("../../../fixtures/scad/",import.meta.url);
    const names=(await readdir(fixtureRoot)).filter(name=>name.endsWith(".scad")).sort();
    assert.deepEqual(names,["forbidden-import.scad","forbidden-include.scad","oversized-output.scad","resource-exhaustion.scad","syntax-error.scad","valid-bosl2.scad","warning.scad"]);
    const classifications={};
    for(const [fixtureIndex,name] of names.entries()){
      const source=await readFile(new URL(name,fixtureRoot),"utf8");
      try {
        const candidate=await repository.proposeModelSource({projectId:"hostile-project",parentRevision:current,source,requestId:`hostile-${fixtureIndex}`,toolCallId:`tool-${fixtureIndex}`});
        const result=await repository.validateAndRender({projectId:"hostile-project",candidateId:candidate.candidateId,previewProfile:"standard"});
        classifications[name]=result.state;
      } catch(error) {
        assert.ok(error instanceof CadDomainError);
        classifications[name]=error.code;
      }
      assert.equal((await repository.getProjectState("hostile-project")).currentRevision,current);
    }
    assert.deepEqual(classifications,{"forbidden-import.scad":"FORBIDDEN_SOURCE_REFERENCE","forbidden-include.scad":"FORBIDDEN_SOURCE_REFERENCE","oversized-output.scad":"REJECTED","resource-exhaustion.scad":"REJECTED","syntax-error.scad":"REJECTED","valid-bosl2.scad":"VALID","warning.scad":"REJECTED"});
    await assert.rejects(repository.proposeModelSource({projectId:"hostile-project",parentRevision:current,source:`cube(1);${" ".repeat(CAD_LIMITS.sourceBytes)}`,requestId:"hostile-request",toolCallId:"hostile-tool"}),CadDomainError);
    const malformed=new ModelProjectRepository({workspaceRoot:await mkdtemp(join(tmpdir(),"rjls-g006-malformed-")),renderer:{async validateAndRender(){return {outcome:"VALID",diagnostics:[],provenance,validationPolicyVersion:VALIDATION_POLICY_VERSION,artifacts:[{format:"stl",bytes:{malformed:true},mimeType:"model/stl",triangleCount:1,boundingBox:{min:[0,0,0],max:[1,1,1]},tessellation:{}}]};}},acceptRendererProvenance:isProductionRendererProvenance}); const bad=await malformed.proposeModelSource({projectId:"bad-project",parentRevision:null,source:"cube(1);",requestId:"bad-request",toolCallId:"bad-tool"}); const rejected=await malformed.validateAndRender({projectId:"bad-project",candidateId:bad.candidateId,previewProfile:"standard"}); assert.equal(rejected.state,"REJECTED"); await assert.rejects(malformed.promoteCandidate({projectId:"bad-project",candidateId:bad.candidateId,expectedParentRevision:null})); assert.equal((await malformed.getProjectState("bad-project")).currentRevision,null);
    const oversized=new ModelProjectRepository({workspaceRoot:await mkdtemp(join(tmpdir(),"rjls-g006-oversized-")),renderer:{async validateAndRender(){return {outcome:"VALID",diagnostics:[],provenance,validationPolicyVersion:VALIDATION_POLICY_VERSION,artifacts:[{format:"stl",bytes:new Uint8Array(CAD_LIMITS.previewBytes+1),mimeType:"model/stl",triangleCount:1,boundingBox:{min:[0,0,0],max:[1,1,1]},tessellation:{}}]};}},acceptRendererProvenance:isProductionRendererProvenance}); const huge=await oversized.proposeModelSource({projectId:"huge-project",parentRevision:null,source:"cube(1);",requestId:"huge-request",toolCallId:"huge-tool"}); assert.equal((await oversized.validateAndRender({projectId:"huge-project",candidateId:huge.candidateId,previewProfile:"standard"})).state,"REJECTED"); assert.equal((await oversized.getProjectState("huge-project")).currentRevision,null);
    const a=await repository.proposeModelSource({projectId:"hostile-project",parentRevision:current,source:"cube([1,1,1]);",requestId:"request-a",toolCallId:"tool-a"}); const b=await repository.proposeModelSource({projectId:"hostile-project",parentRevision:current,source:"cube([2,2,2]);",requestId:"request-b",toolCallId:"tool-b"}); await repository.validateAndRender({projectId:"hostile-project",candidateId:a.candidateId,previewProfile:"standard"}); await repository.validateAndRender({projectId:"hostile-project",candidateId:b.candidateId,previewProfile:"standard"}); const winner=await repository.promoteCandidate({projectId:"hostile-project",candidateId:a.candidateId,expectedParentRevision:current}); await assert.rejects(repository.promoteCandidate({projectId:"hostile-project",candidateId:b.candidateId,expectedParentRevision:current}),error=>error.code==="STALE_REVISION"); assert.equal((await repository.getProjectState("hostile-project")).currentRevision,winner.revisionId);
    const abort=new AbortController(); abort.abort(); const cancelled=await client.callTool("validate_and_render",{projectId:"hostile-project",candidateId:"missing",previewProfile:"standard"},{signal:abort.signal}).catch(()=>({isError:true})); assert.equal(cancelled.isError,true); assert.equal((await repository.getProjectState("hostile-project")).currentRevision,winner.revisionId);
    const invalid=await client.callTool("get_project_state",{projectId:"../escape"},{}); assert.equal(invalid.isError,true); assert.equal((await repository.getProjectState("hostile-project")).currentRevision,winner.revisionId);
  } finally { await client.close(); }
});

test("observability schemas reject cardinality and volume overflow emits one bounded marker", () => {
  assert.equal(observabilityEnvelopeSchema.safeParse({version:"1",timestamp:new Date().toISOString(),level:"info",service:"runtime",event:"bad",requestId:"request",outcome:"success",metadata:Object.fromEntries(Array.from({length:25},(_,i)=>[`key${i}`,i]))}).success,false);
  const evidence=new ObservabilityEvidence(); for(let i=0;i<OBSERVABILITY_LIMITS.recordsPerRequest+20;i+=1){if(i%2===0)evidence.metric({name:"request_count",value:1,labels:{service:"runtime",operation:"volume.test",outcome:"success"}});else evidence.record({version:"1",timestamp:"2026-08-06T06:00:00.000Z",level:"info",service:"runtime",event:"volume.test",requestId:"volume-request",outcome:"success",metadata:{index:i}});}
  const bundle=evidence.bundle({cpu:"fixture",ramBytes:1,os:"fixture",filesystem:"fixture",containerEngine:"fixture",containerContext:"fixture",containerMode:"fixture",cgroup:"fixture",browser:"fixture",openscadImageDigest:digest("d"),bosl2Pin:digest("c"),dependencyLockHash:"a".repeat(64),validationPolicyHash:"b".repeat(64),runTimestamp:"2026-08-06T06:00:00.000Z"}); const snapshot=evidence.snapshot(); assert.equal(bundle.records.filter(record=>record.event==="observability.truncated").length,1); assert.equal(bundle.metrics.filter(metric=>metric.name==="observability_truncated_count").length,1); assert.ok(snapshot.volume.records+snapshot.volume.metrics<=OBSERVABILITY_LIMITS.recordsPerRequest); assert.ok(snapshot.volume.serializedBytes<=OBSERVABILITY_LIMITS.serializedBytesPerRequest); assert.ok(bundle.volume.serializedBytes<=OBSERVABILITY_LIMITS.serializedBytesPerRequest);
});

test("20-run deterministic fixture and complete scripted journeys meet frozen p95 budgets", { timeout: 60_000 }, async () => {
  const renderDurations=[]; const renderer=new TestOnlyDeterministicProductionRenderer();
  for(let run=0;run<20;run+=1){const source=`width = 100; gusset(-35); gusset(35); // ${run}`,sourceHash=sha256(source),started=performance.now(); const result=await renderer.validateAndRender({projectId:`render-${run}`,candidateId:`candidate-${run}`,source,sourceHash,previewProfile:"standard"}); renderDurations.push(performance.now()-started); assert.equal(result.outcome,"VALID"); assert.ok(result.artifacts[0].bytes.byteLength<=CAD_LIMITS.previewBytes); assert.ok(result.artifacts[0].triangleCount<=CAD_LIMITS.previewTriangles); assert.ok(result.artifacts[1].bytes.byteLength<=CAD_LIMITS.exportBytes);}
  const journeyDurations=[];
  for(let run=0;run<20;run+=1){const root=await mkdtemp(join(tmpdir(),`rjls-g006-budget-${run}-`));let id=0;const repository=new ModelProjectRepository({workspaceRoot:root,renderer:new TestOnlyDeterministicProductionRenderer(),acceptRendererProvenance:isProductionRendererProvenance,createId:()=>`run-${run}-${++id}`});const client=await createInMemoryCadMcpClient(repository);const started=performance.now();try{const evidence=new ObservabilityEvidence(),projectId=`project-${run}`,sessionId=`session-${run}`;await chat(client,projectId,sessionId,"Create the canonical bracket.",[`${projectId}-r1`],evidence);await chat(client,projectId,sessionId,"Widen it to 100 mm and use 70 mm hole spacing.",[`${projectId}-r2`],evidence);await chat(client,projectId,sessionId,"Add symmetric 6 mm gussets with 20 mm legs.",[`${projectId}-r3`],evidence);await chat(client,projectId,sessionId,"Export 3MF.",[`${projectId}-export`],evidence);const revisions=await repository.listRevisions(projectId);assert.equal(revisions.length,3);assert.equal(revisions[0].parentRevision,revisions[1].revisionId);assert.equal(revisions[1].parentRevision,revisions[2].revisionId);journeyDurations.push(performance.now()-started);}finally{await client.close();}}
  const p95=(values)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1];
  assert.ok(p95(renderDurations)<=10_000,`renderer p95 ${p95(renderDurations)} ms exceeded 10 s`);
  assert.ok(p95(journeyDurations)<=30_000,`journey p95 ${p95(journeyDurations)} ms exceeded 30 s`);
  const performanceEvidence={schemaVersion:1,kind:"g006-performance-evidence",durations:{rendererMs:renderDurations.map(value=>Number(value.toFixed(3))),journeyMs:journeyDurations.map(value=>Number(value.toFixed(3))),rendererP95Ms:Number(p95(renderDurations).toFixed(3)),journeyP95Ms:Number(p95(journeyDurations).toFixed(3))},environment:{cpu:cpus()[0]?.model??"unknown",logicalCpuCount:cpus().length,ramBytes:totalmem(),os:`${osType()} ${release()}`,runtime:`node ${process.version}`,browser:"unavailable in this execution environment",filesystem:"temporary local filesystem",containerEngine:"test-only deterministic fixture; production OCI not exercised",openscadImageDigest:provenance.imageDigest,openscadVersion:provenance.openscadVersion,openscadBinaryHash:provenance.openscadBinaryHash,bosl2Version:provenance.bosl2Version,bosl2Digest:provenance.bosl2Digest,dependencyLockHash:sha256(await readFile(new URL("../../../pnpm-lock.yaml",import.meta.url))),validationPolicyHash:sha256(VALIDATION_POLICY_VERSION),runTimestamp:new Date().toISOString()}};
  console.log(`G006_PERFORMANCE_EVIDENCE ${JSON.stringify(performanceEvidence)}`);
});
