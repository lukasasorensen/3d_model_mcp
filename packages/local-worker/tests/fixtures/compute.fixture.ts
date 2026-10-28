import { createHash } from "node:crypto";
import { browserRendererProvenance } from "@theoryfoundry/browser-renderer";
import {
  candidateRecordSchema,
  geometrySummarySchema,
  workerValidationLeaseSchema,
  workerExportLeaseSchema,
  exportReceiptSchema,
  type HeadlessRenderResult,
} from "@theoryfoundry/contracts";
import type { ComputeDependencies } from "../../src/domains/compute/index.js";
export const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export const source = "cube([3,4,5]);";
export const geometry = geometrySummarySchema.parse({
  units: "mm",
  triangleCount: 12,
  bounds: { min: [0, 0, 0], max: [3, 4, 5] },
  dimensions: [3, 4, 5],
  checks: ["binary-stl-length", "finite-coordinates", "nonempty-mesh"],
  scope: "geometry-only",
});
export const provenance = browserRendererProvenance;
export function fixture(): {
  deps: ComputeDependencies;
  calls: { path: string; body: unknown; signal: AbortSignal }[];
  lease: ReturnType<typeof workerValidationLeaseSchema.parse>;
  exportLease: ReturnType<typeof workerExportLeaseSchema.parse>;
  candidate: ReturnType<typeof candidateRecordSchema.parse>;
  receipt: ReturnType<typeof exportReceiptSchema.parse>;
  bytes: Buffer;
  setRender(value: HeadlessRenderResult): void;
} {
  const deadline = new Date(Date.now() + 110_000).toISOString();
  const lease = workerValidationLeaseSchema.parse({
    version: "1",
    projectId: "project",
    candidateId: "candidate",
    jobId: "job",
    attemptId: "attempt",
    token: "a".repeat(64),
    source,
    sourceHash: hash(source),
    deadline,
    validationPolicyVersion: provenance.validationPolicyVersion,
    executionOrigin: "local-worker",
  });
  const candidate = candidateRecordSchema.parse({
    version: "1",
    projectId: "project",
    candidateId: "candidate",
    parentRevision: null,
    sourceHash: hash(source),
    sourceBytes: Buffer.byteLength(source),
    state: "VALID",
    geometry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requestId: "request",
    toolCallId: "call",
    renderer: provenance,
  });
  const exportLease = workerExportLeaseSchema.parse({
    version: "1",
    projectId: "project",
    revisionId: "revision",
    format: "stl",
    jobId: "export-job",
    exportId: "export",
    token: "b".repeat(64),
    sourceHash: hash(source),
    state: "PENDING",
    source,
    deadline,
    renderer: provenance,
    executionOrigin: "local-worker",
  });
  const bytes = Buffer.from("fixture-artifact");
  const receipt = exportReceiptSchema.parse({
    exportId: "export",
    projectId: "project",
    revision: "revision",
    sourceHash: hash(source),
    format: "stl",
    mimeType: "model/stl",
    filename: "model.stl",
    hash: hash(bytes),
    byteSize: bytes.length,
    expiresAt: deadline,
    downloadUrl: "https://cad.example/download/opaque",
    downloadExpiresAt: deadline,
  });
  let rendered: HeadlessRenderResult = {
    ok: true,
    encoded: bytes.toString("base64"),
    geometry,
    diagnostics: [],
  };
  const calls: { path: string; body: unknown; signal: AbortSignal }[] = [];
  const status = (): unknown => {
    const {
      token: _token,
      source: _source,
      renderer: _renderer,
      ...binding
    } = exportLease;
    void _token;
    void _source;
    void _renderer;
    return { ...binding, state: "COMPLETED", receipt, artifactAvailable: true };
  };
  const deps: ComputeDependencies = {
    renderer: {
      provenance,
      available: () => true,
      render: async () => rendered,
      close: async () => undefined,
    },
    api: {
      json: async (path, body, signal) => {
        calls.push({ path, body, signal });
        if (path === "validation/begin") return lease;
        if (path === "validation/complete" || path === "validation/status")
          return {
            version: "1",
            jobId: lease.jobId,
            state: "COMPLETED",
            deadline,
            candidate,
            executionOrigin: "local-worker",
          };
        if (path === "exports/begin") return exportLease;
        if (path === "exports/status") return status();
        if (path === "preview/source")
          return {
            version: "1",
            projectId: "project",
            revisionId: "revision",
            source,
            sourceHash: hash(source),
            renderer: provenance,
          };
        return {};
      },
      upload: async (body, _bytes, signal) => {
        calls.push({ path: "exports/complete", body, signal });
        return status();
      },
    },
  };
  return {
    deps,
    calls,
    lease,
    exportLease,
    candidate,
    receipt,
    bytes,
    setRender: (value): void => {
      rendered = value;
    },
  };
}
export const validationInput = {
  projectId: "project",
  candidateId: "candidate",
  previewProfile: "standard",
};
export const exportInput = {
  projectId: "project",
  revision: "revision",
  format: "stl",
};
export const signal = (): AbortSignal => new AbortController().signal;
