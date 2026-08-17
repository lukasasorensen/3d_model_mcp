import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  IsolatedOpenScadRenderer,
  RendererError,
  TrustedLocalOpenScadRuntime,
  attestBosl2Tree,
  assertStartedOperationEvidence,
  finalizeAttestedRuntimeResult,
  buildOciCreateArguments,
  bindPolicyEvidence,
  buildOciProbeArguments,
  boundedRedactedText,
  parseBinaryStl,
  parseCgroupV2Evidence,
  parseSameContainerIsolationEvidence,
  parseThreeMf,
  inspectEffectiveContainerPolicy,
  runBoundedCommand,
  settleCleanupWithinDeadline,
} from "../dist/index.js";

const digest = `sha256:${"a".repeat(64)}`;

const tetrahedron = [
  [[0, 0, 0], [0, 20, 0], [10, 0, 0]],
  [[0, 0, 0], [10, 0, 0], [0, 0, 5]],
  [[0, 0, 0], [0, 0, 5], [0, 20, 0]],
  [[10, 0, 0], [0, 20, 0], [0, 0, 5]],
];

function binaryStl(triangles = tetrahedron) {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  for (let triangle = 0; triangle < triangles.length; triangle += 1) {
    let offset = 84 + triangle * 50 + 12;
    for (const vertex of triangles[triangle]) {
      for (const value of vertex) { view.setFloat32(offset, value, true); offset += 4; }
    }
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
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(contents);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(data), true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    localChunks.push(header, nameBytes, data);
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc32(data), true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centralChunks.push(central);
    localOffset += header.length + nameBytes.length + data.length;
  }
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  const chunks = [...localChunks, ...centralChunks, end];
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function meshModel(sourceHash, triangles = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]], vertices = [[0, 0, 0], [10, 0, 0], [0, 20, 0], [0, 0, 5]]) {
  const metadata = sourceHash ? `<metadata name="rjls:sourceHash">${sourceHash}</metadata>` : "";
  return `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">${metadata}<resources><object id="1" type="model"><mesh><vertices>${vertices.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("")}</vertices><triangles>${triangles.map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join("")}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
}

function threeMf(sourceHash, options = {}) {
  const model = options.model ?? meshModel(sourceHash);
  return zip([
    ["[Content_Types].xml", `<Types><Override PartName="/3D/3dmodel.model" ContentType="${options.contentType ?? "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"}"/></Types>`],
    ["_rels/.rels", `<Relationships><Relationship Target="/3D/3dmodel.model" Type="${options.relationshipType ?? "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"}"/></Relationships>`],
    ["3D/3dmodel.model", model],
  ]);
}

const attestation = {
  engine: "fake-oci",
  mode: "rootless",
  effectiveUid: 65532,
  imageDigest: digest,
  network: "none",
  readOnlyRoot: true,
  capabilitiesDropped: true,
  noNewPrivileges: true,
  inputReadOnly: true,
  outputIsolated: true,
  resourceLimitsEnforced: true,
  seccompEnforced: true,
  memoryBytes: 512 * 1024 * 1024,
  nanoCpus: 1_000_000_000,
  pids: 128,
  openscadVersion: "2025.01.01",
  openscadBinaryHash: `sha256:${"b".repeat(64)}`,
  openscadHelpHash: `sha256:${"c".repeat(64)}`,
  bosl2Version: "v2.0.741",
  bosl2Digest: `sha256:${"d".repeat(64)}`,
  policyEvidenceHash: `sha256:${"e".repeat(64)}`,
  cgroupV2Evidence: { version: "v2", controllers: ["cpu", "memory", "pids"], memoryMax: "536870912", pidsMax: "128", cpuMax: "100000 100000" },
  containerEvidence: [{ containerId: "a".repeat(64), hostname: "a".repeat(12), cgroupPath: `/docker/${"a".repeat(64)}`, effectiveUid: 65532, cgroupV2Evidence: { version: "v2", controllers: ["cpu", "memory", "pids"], memoryMax: "536870912", pidsMax: "128", cpuMax: "100000 100000" } }],
};

function renderer(runtime) {
  const productionRuntime = { profile: "production-oci", configuredLimits: { memoryBytes: 512 * 1024 * 1024, nanoCpus: 1_000_000_000, pids: 128 }, ...runtime };
  return new IsolatedOpenScadRenderer({ runtime: productionRuntime, image: `ghcr.io/openscad/openscad@${digest}`, imageDigest: digest, openscadVersion: "2025.01.01", openscadBinaryHash: `sha256:${"b".repeat(64)}`, openscadHelpHash: `sha256:${"c".repeat(64)}`, bosl2Path: "/trusted/BOSL2", bosl2Version: "v2.0.741", bosl2Digest: `sha256:${"d".repeat(64)}` });
}

test("independently parses exact binary STL metadata and rejects corruption", () => {
  assert.deepEqual(parseBinaryStl(binaryStl()), { triangleCount: 4, boundingBox: { min: [0, 0, 0], max: [10, 20, 5] } });
  const truncated = binaryStl();
  assert.throws(() => parseBinaryStl(truncated.subarray(0, truncated.length - 1)), (error) => error instanceof RendererError && error.code === "INVALID_ARTIFACT");
  const nonfinite = binaryStl();
  new DataView(nonfinite.buffer).setFloat32(96, Number.NaN, true);
  assert.throws(() => parseBinaryStl(nonfinite), (error) => error instanceof RendererError && error.code === "INVALID_ARTIFACT");
});

test("independently validates 3MF ZIP, units, mesh, checksums, and source linkage", () => {
  const hash = "1".repeat(64);
  assert.deepEqual(parseThreeMf(threeMf(hash), hash), { triangleCount: 4, boundingBox: { min: [0, 0, 0], max: [10, 20, 5] } });
  assert.throws(() => parseThreeMf(threeMf(hash), "2".repeat(64)), (error) => error instanceof RendererError && error.code === "INTEGRITY_FAILURE");
  const corrupted = threeMf(hash);
  corrupted[50] ^= 1;
  assert.throws(() => parseThreeMf(corrupted, hash), (error) => error instanceof RendererError && error.code === "INTEGRITY_FAILURE");
});

test("rejects degenerate, open, non-manifold, and inconsistently oriented meshes", () => {
  const hash = "1".repeat(64);
  assert.throws(() => parseBinaryStl(binaryStl([[[0, 0, 0], [1, 0, 0], [2, 0, 0]]])), /degenerate/);
  assert.throws(() => parseBinaryStl(binaryStl([tetrahedron[0]])), /open|non-manifold/);
  assert.throws(() => parseBinaryStl(binaryStl([...tetrahedron.slice(0, 3), [...tetrahedron[3]].reverse()])), /oriented/);
  assert.throws(() => parseBinaryStl(binaryStl([...tetrahedron, tetrahedron[0]])), /non-manifold/);
  for (const [model, message] of [
    [meshModel(hash, [[0, 1, 2]], [[0, 0, 0], [1, 0, 0], [2, 0, 0]]), /degenerate/],
    [meshModel(hash, [[0, 1, 2]], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]), /open|non-manifold/],
    [meshModel(hash, [[0, 2, 1], [0, 1, 3], [0, 3, 2], [3, 2, 1]]), /oriented/],
    [meshModel(hash, [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3], [0, 2, 1]]), /non-manifold/],
  ]) assert.throws(() => parseThreeMf(threeMf(hash, { model }), hash), message);
});

test("rejects inconsistent ZIP metadata and invalid 3MF package semantics", () => {
  const hash = "1".repeat(64);
  const inconsistent = threeMf(hash);
  const eocd = inconsistent.length - 22;
  const centralOffset = new DataView(inconsistent.buffer).getUint32(eocd + 16, true);
  new DataView(inconsistent.buffer).setUint32(centralOffset + 20, 7, true);
  assert.throws(() => parseThreeMf(inconsistent, hash), (error) => error instanceof RendererError && error.code === "INVALID_ARTIFACT");

  assert.throws(() => parseThreeMf(threeMf(hash, { contentType: "application/xml" }), hash), (error) => error instanceof RendererError && /content types/.test(error.message));
  assert.throws(() => parseThreeMf(threeMf(hash, { relationshipType: "https://example.invalid/looks-like-3dmodel" }), hash), (error) => error instanceof RendererError && /relationship/.test(error.message));

  const transformedModel = `<?xml version="1.0"?><model unit="millimeter"><metadata name="rjls:sourceHash">${hash}</metadata><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></build></model>`;
  const transformed = zip([
    ["[Content_Types].xml", `<Types><Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`],
    ["_rels/.rels", `<Relationships><Relationship Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`],
    ["3D/3dmodel.model", transformedModel],
  ]);
  assert.throws(() => parseThreeMf(transformed, hash), (error) => error instanceof RendererError && error.code === "INVALID_ARTIFACT" && /transform/.test(error.message));
});

test("requires a complete 3MF build graph referencing every validated mesh object", () => {
  const hash = "1".repeat(64);
  const mesh = `<resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object></resources>`;
  const model = (build, extra = "") => `<model unit="millimeter"><metadata name="rjls:sourceHash">${hash}</metadata>${mesh}${extra}${build}</model>`;
  for (const invalid of [
    model(""),
    model("<build></build>"),
    model('<build><item objectid="2"/></build>'),
    model('<build><item objectid="1"/></build>', mesh.replace('id="1"', 'id="2"')),
  ]) {
    assert.throws(() => parseThreeMf(threeMf(hash, { model: invalid }), hash), (error) => error instanceof RendererError && /build|object/.test(error.message));
  }
});

test("production renderer uses only server-owned configuration and recomputes artifact metadata", async () => {
  const source = "cube([10,20,5]);";
  const sourceHash = createHash("sha256").update(source).digest("hex");
  let observed;
  const runtime = { async execute(job) { observed = job; return { exitCode: 0, stdout: "", stderr: "", artifacts: new Map([["stl", binaryStl()], ["3mf", threeMf()]]), attestation }; } };
  const result = await renderer(runtime).validateAndRender({ projectId: "ignored", candidateId: "ignored", source, sourceHash, previewProfile: "standard" });
  assert.equal(result.outcome, "VALID");
  assert.equal(result.artifacts.length, 2);
  assert.equal(result.provenance.attestation.engine, `fake-oci;policy=${attestation.policyEvidenceHash}`);
  assert.deepEqual(observed.formats, ["stl", "3mf"]);
  assert.equal(observed.image, `ghcr.io/openscad/openscad@${digest}`);
  assert.equal(Object.hasOwn(observed, "args"), false);
  assert.equal(Object.hasOwn(observed, "env"), false);
  assert.equal(Object.hasOwn(observed, "mounts"), false);
});

test("OCI argv is deterministic and contains no model-controlled flags, env, or paths", () => {
  const plan = { inputPath: "/controller/input", bosl2Path: "/controller/BOSL2", image: `ghcr.io/openscad/openscad@${digest}`, format: "stl" };
  const first = buildOciCreateArguments(plan);
  assert.deepEqual(first, buildOciCreateArguments(plan));
  assert.equal(first.includes("-m"), false);
  assert.deepEqual(first.filter((argument) => argument.startsWith("--env=")), ["--env=OPENSCADPATH=/opt/openscad/libraries"]);
  assert.equal(first.at(-1), "/job/input/model.scad");
  assert.ok(first.includes("--mount=type=tmpfs,dst=/job/output,tmpfs-size=26214400,tmpfs-mode=0777"));
  assert.equal(first.some((argument) => argument.includes("projectId") || argument.includes("candidateId")), false);
  const probe = buildOciProbeArguments({ inputPath: plan.inputPath, bosl2Path: plan.bosl2Path, image: plan.image });
  assert.deepEqual(probe.slice(-4, -3), ["/bin/sh"]);
  assert.equal(probe.includes("/usr/bin/openscad"), false);
  assert.equal(probe.includes("/job/input/model.scad"), false);
  assert.match(probe.join("\n"), /cgroup\.controllers.*memory\.max.*pids\.max.*cpu\.max/s);
  assert.ok(probe.includes("--memory=536870912"));
});

test("effective OCI policy rejects hostile security, mount, and resource inspect responses", () => {
  const expected = { image: `ghcr.io/openscad/openscad@${digest}`, inputPath: "/controller/input", bosl2Path: "/controller/BOSL2" };
  const valid = {
    Id: "a".repeat(64),
    Config: { Image: expected.image, User: "65532:65532" },
    HostConfig: {
      NetworkMode: "none", ReadonlyRootfs: true, Memory: 512 * 1024 * 1024, NanoCpus: 1_000_000_000, PidsLimit: 128,
      CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true", "seccomp=builtin"],
      Mounts: [
        { Type: "bind", Source: expected.inputPath, Target: "/job/input", ReadOnly: true },
        { Type: "tmpfs", Target: "/job/output", ReadOnly: false, TmpfsOptions: { SizeBytes: 26214400, Mode: 0o777 } },
        { Type: "bind", Source: expected.bosl2Path, Target: "/opt/openscad/libraries/BOSL2", ReadOnly: true },
      ],
    },
    Mounts: [
      { Type: "bind", Source: expected.inputPath, Destination: "/job/input", RW: false },
      { Type: "tmpfs", Source: "", Destination: "/job/output", RW: true },
      { Type: "bind", Source: expected.bosl2Path, Destination: "/opt/openscad/libraries/BOSL2", RW: false },
    ],
  };
  const evidence = inspectEffectiveContainerPolicy(valid, expected);
  assert.match(evidence.policyEvidenceHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(evidence, inspectEffectiveContainerPolicy(structuredClone(valid), expected));
  const supportedEngine = structuredClone(valid);
  delete supportedEngine.HostConfig.Mounts;
  supportedEngine.Mounts[1] = { Type: "tmpfs", Source: "tmpfs", Destination: "/job/output", RW: true, Options: ["rw", "size=26214400", "mode=0777"] };
  assert.match(inspectEffectiveContainerPolicy(supportedEngine, expected).policyEvidenceHash, /^sha256:/);
  const mutations = [
    (value) => value.HostConfig.SecurityOpt.splice(1, 1, "seccomp=unconfined"),
    (value) => value.HostConfig.SecurityOpt.splice(0, 1, "no-new-privileges:false"),
    (value) => value.HostConfig.SecurityOpt.push("seccomp=disabled"),
    (value) => value.Mounts.push({ Type: "bind", Source: "/host", Destination: "/unexpected", RW: true }),
    (value) => { value.Mounts[0].Source = "/wrong"; },
    (value) => { value.Mounts[2].RW = true; },
    (value) => { value.HostConfig.Mounts[1].TmpfsOptions.SizeBytes = 1; },
    (value) => { delete value.HostConfig.Mounts; },
    (value) => { value.HostConfig.Memory -= 1; },
    (value) => { value.HostConfig.NanoCpus = 0; },
    (value) => { value.HostConfig.PidsLimit = 0; },
  ];
  for (const mutate of mutations) {
    const hostile = structuredClone(valid);
    mutate(hostile);
    assert.throws(() => inspectEffectiveContainerPolicy(hostile, expected), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
  }
  for (const options of [[], ["rw", "size=1", "mode=0777"], ["rw", "size=26214400", "mode=0777", "exec"]]) {
    const hostile = structuredClone(supportedEngine);
    hostile.Mounts[1].Options = options;
    assert.throws(() => inspectEffectiveContainerPolicy(hostile, expected), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
  }
});

test("cgroup v2 evidence requires exact effective controllers and values", () => {
  const valid = { controllers: "pids io memory cpu\n", memoryMax: "536870912\n", pidsMax: "128\n", cpuMax: "100000 100000\n" };
  const evidence = parseCgroupV2Evidence(valid);
  assert.deepEqual(evidence, { version: "v2", controllers: ["cpu", "io", "memory", "pids"], memoryMax: "536870912", pidsMax: "128", cpuMax: "100000 100000" });
  const inspectHash = `sha256:${"f".repeat(64)}`;
  const container = { containerId: "a".repeat(64), hostname: "a".repeat(12), cgroupPath: `/docker/${"a".repeat(64)}`, effectiveUid: 65532, cgroupV2Evidence: evidence };
  assert.notEqual(bindPolicyEvidence(inspectHash, container), bindPolicyEvidence(inspectHash, { ...container, cgroupV2Evidence: { ...evidence, controllers: ["cpu", "memory", "pids"] } }));
  for (const mutation of [
    { controllers: "cpu memory" },
    { controllers: "cpu memory pids pids" },
    { controllers: "cpu memory pids INVALID!" },
    { memoryMax: "max" },
    { memoryMax: "536870911" },
    { pidsMax: "max" },
    { pidsMax: "127" },
    { cpuMax: "max 100000" },
    { cpuMax: "50000 100000" },
    { cpuMax: "100000" },
  ]) assert.throws(() => parseCgroupV2Evidence({ ...valid, ...mutation }), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
});

test("same-container evidence rejects a valid sibling container identity", () => {
  const id = "a".repeat(64);
  const sibling = "b".repeat(64);
  const text = `uid=65532\nhostname=${id.slice(0, 12)}\ncgroup=0::/docker/${id}\ncontrollers=cpu io memory pids\nmemory_max=536870912\npids_max=128\ncpu_max=100000 100000\n`;
  assert.deepEqual(parseSameContainerIsolationEvidence(text, id), { containerId: id, hostname: id.slice(0, 12), cgroupPath: `/docker/${id}`, effectiveUid: 65532, cgroupV2Evidence: { version: "v2", controllers: ["cpu", "io", "memory", "pids"], memoryMax: "536870912", pidsMax: "128", cpuMax: "100000 100000" } });
  assert.throws(() => parseSameContainerIsolationEvidence(text, sibling), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
});

test("evidence cardinality follows started formats rather than final exit code", () => {
  // STL succeeded and the started 3MF container emitted valid evidence before its ordinary render failure.
  assert.doesNotThrow(() => assertStartedOperationEvidence(2, 2));
  const secondFormatFailure = finalizeAttestedRuntimeResult({ exitCode: 7, stdout: "", stderr: "ERROR: 3MF export failed", artifacts: new Map([["stl", binaryStl()]]), attestation }, 2, 2);
  assert.equal(secondFormatFailure.exitCode, 7);
  assert.match(secondFormatFailure.stderr, /3MF export failed/);
  assert.equal(secondFormatFailure.artifacts.has("stl"), true);
  // A first-format failure starts and attests only the STL container.
  assert.doesNotThrow(() => assertStartedOperationEvidence(1, 1));
  assert.equal(finalizeAttestedRuntimeResult({ ...secondFormatFailure, artifacts: new Map() }, 1, 1).exitCode, 7);
  assert.throws(() => assertStartedOperationEvidence(2, 1), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
  assert.throws(() => assertStartedOperationEvidence(1, 2), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
});

test("fails closed on non-production modes, inexact limits, and mismatched toolchain evidence", async () => {
  const source = "cube(1);";
  const sourceHash = createHash("sha256").update(source).digest("hex");
  for (const mutation of [
    { mode: "trusted-local", network: "host", memoryBytes: 0, nanoCpus: 0, pids: 0 },
    { memoryBytes: attestation.memoryBytes - 1 },
    { nanoCpus: 0 },
    { pids: 0 },
    { policyEvidenceHash: undefined },
    { cgroupV2Evidence: undefined },
    { cgroupV2Evidence: { ...attestation.cgroupV2Evidence, memoryMax: "max" } },
    { containerEvidence: undefined },
    { containerEvidence: [{ ...attestation.containerEvidence[0], hostname: "b".repeat(12) }] },
  ]) {
    const runtime = { async execute() { return { exitCode: 0, stdout: "", stderr: "", artifacts: new Map([["stl", binaryStl()]]), attestation: { ...attestation, ...mutation } }; } };
    await assert.rejects(renderer(runtime).validateAndRender({ projectId: "p", candidateId: "c", source, sourceHash, previewProfile: "standard" }), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
  }
  const mismatchedEvidence = { async execute() { return { exitCode: 0, stdout: "", stderr: "", artifacts: new Map([["stl", binaryStl()]]), attestation: { ...attestation, openscadBinaryHash: `sha256:${"9".repeat(64)}` } }; } };
  await assert.rejects(renderer(mismatchedEvidence).validateAndRender({ projectId: "p", candidateId: "c", source, sourceHash, previewProfile: "standard" }), (error) => error instanceof RendererError && error.code === "INTEGRITY_FAILURE");
});

test("production renderer rejects local profiles and inexact configured limits before execution", () => {
  let executions = 0;
  const execute = async () => { executions += 1; throw new Error("must not execute"); };
  for (const runtime of [
    { profile: "trusted-local-development", configuredLimits: { memoryBytes: 0, nanoCpus: 0, pids: 0 }, execute },
    { profile: "production-oci", configuredLimits: { memoryBytes: 0, nanoCpus: 1_000_000_000, pids: 128 }, execute },
  ]) {
    assert.throws(() => new IsolatedOpenScadRenderer({ runtime, image: `ghcr.io/openscad/openscad@${digest}`, imageDigest: digest, openscadVersion: "2025.01.01", openscadBinaryHash: `sha256:${"b".repeat(64)}`, openscadHelpHash: `sha256:${"c".repeat(64)}`, bosl2Path: "/trusted/BOSL2", bosl2Version: "v2.0.741", bosl2Digest: `sha256:${"d".repeat(64)}` }), (error) => error instanceof RendererError && error.code === "ISOLATION_UNAVAILABLE");
  }
  assert.equal(executions, 0);
});

test("BOSL2 tree attestation is deterministic and binds version and content", async () => {
  const root = await mkdtemp(join(tmpdir(), "rjls-bosl2-attestation-"));
  try {
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "version.scad"), "BOSL_VERSION = [2, 0, 741];\n");
    await writeFile(join(root, "sub", "module.scad"), "module example() {}\n");
    const first = await attestBosl2Tree(root, "v2.0.741");
    assert.deepEqual(first, await attestBosl2Tree(root, "v2.0.741"));
    await writeFile(join(root, "sub", "module.scad"), "module changed() {}\n");
    assert.notEqual((await attestBosl2Tree(root, "v2.0.741")).digest, first.digest);
    await assert.rejects(attestBosl2Tree(root, "v2.0.742"), (error) => error instanceof RendererError && error.code === "INTEGRITY_FAILURE");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("BOSL2 attestation observes the operation deadline during traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "rjls-bosl2-deadline-"));
  try {
    await writeFile(join(root, "version.scad"), "BOSL_VERSION = [2, 0, 741];\n");
    await Promise.all(Array.from({ length: 750 }, (_, index) => writeFile(join(root, `module-${index}.scad`), `module m${index}() {}\n`)));
    const controller = new AbortController();
    const timeout = new RendererError("TIMEOUT", "test deadline");
    const pending = attestBosl2Tree(root, "v2.0.741", controller.signal);
    setTimeout(() => controller.abort(timeout), 1);
    await assert.rejects(pending, (error) => error === timeout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup cannot extend the public deadline or replace the primary error", async () => {
  let cleaned = false;
  const slowCleanup = new Promise((resolve) => setTimeout(() => { cleaned = true; resolve(); }, 80));
  const primary = new RendererError("TIMEOUT", "primary timeout");
  const started = Date.now();
  const operation = async () => {
    try { throw primary; }
    finally { await settleCleanupWithinDeadline(slowCleanup, Date.now() + 10); }
  };
  await assert.rejects(operation(), (error) => error === primary);
  assert.ok(Date.now() - started < 60);
  assert.equal(cleaned, false);
  await slowCleanup;
  assert.equal(cleaned, true);
});

test("classifies hard warnings as rejection and bounds/redacts diagnostics", async () => {
  const source = "cube(1);";
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const runtime = { async execute() { return { exitCode: 0, stdout: "", stderr: "WARNING: token=abc at /Users/person/private/file.scad", artifacts: new Map(), attestation }; } };
  const result = await renderer(runtime).validateAndRender({ projectId: "p", candidateId: "c", source, sourceHash, previewProfile: "standard" });
  assert.equal(result.outcome, "REJECTED");
  assert.doesNotMatch(JSON.stringify(result), /abc|Users|private/);
  assert.match(boundedRedactedText("x".repeat(30), 20), /TRUNCATED/);
});

test("bounded commands mark stdout and stderr truncated at one MiB", async () => {
  const script = `process.stdout.write("o".repeat(1049000)); process.stderr.write("e".repeat(1049000));`;
  const result = await runBoundedCommand(process.execPath, ["-e", script], undefined, 5_000);
  assert.equal(result.code, 0);
  assert.ok(Buffer.byteLength(result.stdout) <= 1_048_576);
  assert.ok(Buffer.byteLength(result.stderr) <= 1_048_576);
  assert.match(result.stdout, /\n\[TRUNCATED\]$/);
  assert.match(result.stderr, /\n\[TRUNCATED\]$/);
});

test("diagnostic truncation caps multibyte UTF-8 without splitting a code point", () => {
  const result = boundedRedactedText("🙂".repeat(400_000));
  assert.ok(Buffer.byteLength(result, "utf8") <= 1_048_576);
  assert.match(result, /\n\[TRUNCATED\]$/);
  assert.doesNotMatch(result, /�/);
  assert.equal((result.match(/\[TRUNCATED\]/g) ?? []).length, 1);
});

test("timeout and cancellation kill the spawned process tree", async () => {
  for (const mode of ["timeout", "cancel"]) {
    const root = await mkdtemp(join(tmpdir(), "rjls-process-tree-test-"));
    const sentinel = join(root, `${mode}.txt`);
    const grandchild = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "escaped"), 400)`;
    const parent = `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], {stdio:"ignore"}); setInterval(() => {}, 1000)`;
    const controller = new AbortController();
    if (mode === "cancel") setTimeout(() => controller.abort(), 75);
    await assert.rejects(runBoundedCommand(process.execPath, ["-e", parent], controller.signal, mode === "timeout" ? 75 : 5_000), (error) => error instanceof RendererError && error.code === (mode === "timeout" ? "TIMEOUT" : "CANCELLED"));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await assert.rejects(access(sentinel));
    await rm(root, { recursive: true, force: true });
  }
});

test("trusted-local STL and 3MF rendering share one absolute deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "rjls-whole-job-timeout-"));
  const executable = join(root, "slow-openscad.cjs");
  await writeFile(executable, `#!/usr/bin/env node\nconst fs=require("node:fs");const args=process.argv.slice(2);const output=args[args.indexOf("-o")+1];setTimeout(()=>{fs.writeFileSync(output,"artifact");},70);\n`);
  await chmod(executable, 0o700);
  try {
    const runtime = new TrustedLocalOpenScadRuntime(executable, () => undefined);
    const started = Date.now();
    await assert.rejects(runtime.execute({ source: "cube(1);", image: "trusted-local", imageDigest: `sha256:${"0".repeat(64)}`, bosl2HostPath: "/trusted/local/BOSL2", openscadVersion: "local", openscadBinaryHash: `sha256:${"1".repeat(64)}`, openscadHelpHash: `sha256:${"2".repeat(64)}`, bosl2Version: "local", bosl2Digest: `sha256:${"3".repeat(64)}`, formats: ["stl", "3mf"], timeoutMs: 110 }), (error) => error instanceof RendererError && error.code === "TIMEOUT");
    assert.ok(Date.now() - started < 180, "timeout must not restart for the second output");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("trusted-local runtime is explicit, loud, and truthfully non-isolated", async () => {
  const warnings = [];
  const runtime = new TrustedLocalOpenScadRuntime(process.execPath, (message) => warnings.push(message));
  const result = await runtime.execute({ source: "cube(1);", image: "trusted-local", imageDigest: `sha256:${"0".repeat(64)}`, bosl2HostPath: "/trusted/local/BOSL2", openscadVersion: "local", openscadBinaryHash: `sha256:${"1".repeat(64)}`, openscadHelpHash: `sha256:${"2".repeat(64)}`, bosl2Version: "local", bosl2Digest: `sha256:${"3".repeat(64)}`, formats: ["stl"], timeoutMs: 2_000 });
  assert.equal(result.exitCode === 0, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /NON-ISOLATED.*production/i);
  assert.deepEqual(result.attestation, {
    engine: "trusted-local-openscad", mode: "trusted-local", effectiveUid: process.getuid(), imageDigest: `sha256:${"0".repeat(64)}`,
    network: "host", readOnlyRoot: false, capabilitiesDropped: false, noNewPrivileges: false, inputReadOnly: false,
    outputIsolated: false, resourceLimitsEnforced: false, seccompEnforced: false, memoryBytes: 0, nanoCpus: 0, pids: 0,
    openscadVersion: "local", openscadBinaryHash: `sha256:${"1".repeat(64)}`, openscadHelpHash: `sha256:${"2".repeat(64)}`, bosl2Version: "local", bosl2Digest: `sha256:${"3".repeat(64)}`,
  });
});
