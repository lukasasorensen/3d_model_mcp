export const BROWSER_RENDERER = Object.freeze({
  openscadVersion: "2026.07.20",
  openscadArchiveSha256:
    "8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd",
  openscadGlueSha256:
    "e458673d46d506d77b780c526d6e5492250f353d582057c6f912724a9586d86e",
  openscadWasmSha256:
    "c19a3a868991e86f76f22f254e04002db45f00c91f24e4c672cf93c859e80e19",
  bosl2Version: "v2.0.741",
  bosl2ArchiveSha256:
    "4fb7b58cbeadfe5f8c5a037d9e1392d774117d48423f95f4203aa367d8b1ea88",
  backend: "manifold",
  timeoutMs: 60_000,
});

export const CAD_LIMITS = Object.freeze({
  sourceBytes: 256 * 1024,
  previewBytes: 10 * 1024 * 1024,
  previewTriangles: 250_000,
  exportBytes: 25 * 1024 * 1024,
  diagnosticCount: 50,
  diagnosticMessageCharacters: 2_000,
  toolResultBytes: 512 * 1024,
});

export const RENDERER_ISOLATION_LIMITS = Object.freeze({
  memoryBytes: 512 * 1024 * 1024,
  nanoCpus: 1_000_000_000,
  pidsLimit: 128,
});
