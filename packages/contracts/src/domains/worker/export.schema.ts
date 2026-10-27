import * as z from "zod/v4";
import {
  CAD_LIMITS,
  projectIdSchema,
  opaqueIdSchema,
  rendererProvenanceSchema,
  exportMetadataSchema,
  exportReceiptSchema,
} from "../cad/index.js";

export const WORKER_EXPORT_LIMITS = Object.freeze({
  leaseMs: 120_000,
  activePerOwner: 2,
  retentionMs: 3_600_000,
  metadataBytes: 128 * 1024,
  requestBytes: CAD_LIMITS.exportBytes + 256 * 1024,
  readMs: 30_000,
});

const sourceHash = z.string().regex(/^[a-f0-9]{64}$/);

const target = {
  version: z.literal("1"),
  projectId: projectIdSchema,
  revisionId: opaqueIdSchema,
  format: z.enum(["stl", "3mf"]),
};

export const beginWorkerExportSchema = z
  .object({ ...target, previewProfile: z.literal("standard") })
  .strict();

export const workerExportCapabilitySchema = z
  .object({
    ...target,
    jobId: opaqueIdSchema,
    exportId: opaqueIdSchema,
    token: z.string().regex(/^[a-f0-9]{64}$/),
    sourceHash,
  })
  .strict();

export const completeWorkerExportSchema = workerExportCapabilitySchema
  .extend({
    outcome: z.enum(["COMPLETED", "FAILED"]),
    provenance: rendererProvenanceSchema,
  })
  .strict();

export const workerExportUploadSchema = z
  .object({
    metadata: completeWorkerExportSchema,
    bytes: z.instanceof(Uint8Array).optional(),
  })
  .strict()
  .refine(
    (upload) =>
      (upload.metadata.outcome === "COMPLETED") ===
      (upload.bytes !== undefined),
    "Success requires one artifact; failure requires none.",
  );

export const workerExportLeaseSchema = workerExportCapabilitySchema
  .extend({
    state: z.literal("PENDING"),
    source: z.string().max(CAD_LIMITS.sourceBytes),
    deadline: z.string().datetime(),
    renderer: rendererProvenanceSchema,
    executionOrigin: z.literal("local-worker"),
  })
  .strict();

export const workerExportStatusSchema = z
  .object({
    ...target,
    jobId: opaqueIdSchema,
    exportId: opaqueIdSchema,
    sourceHash,
    state: z.enum(["PENDING", "COMPLETED", "CANCELLED", "FAILED", "EXPIRED"]),
    deadline: z.string().datetime(),
    metadata: exportMetadataSchema.optional(),
    receipt: exportReceiptSchema.optional(),
    artifactAvailable: z.boolean(),
    executionOrigin: z.literal("local-worker"),
  })
  .strict();

export const reusedWorkerExportSchema = z
  .object({
    version: z.literal("1"),
    state: z.literal("COMPLETED"),
    reused: z.literal(true),
    metadata: exportMetadataSchema,
    receipt: exportReceiptSchema,
  })
  .strict();
