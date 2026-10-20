import { z } from "zod";
import { browserRenderCompletionSchema, candidateRecordSchema, opaqueIdSchema, projectIdSchema } from "../cad-contracts.js";

export const WORKER_VALIDATION_LIMITS = Object.freeze({ protocolVersion: "1", leaseMs: 120_000, activePerOwner: 2, requestBytes: 128 * 1024 });
const binding = { projectId: projectIdSchema, candidateId: opaqueIdSchema };
export const beginWorkerValidationSchema = z.object({ version: z.literal("1"), ...binding, previewProfile: z.literal("standard") }).strict();
export const workerValidationCapabilitySchema = z.object({ ...binding, jobId: opaqueIdSchema, token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const resultSchema = browserRenderCompletionSchema.pick({ outcome: true, diagnostics: true, geometry: true, provenance: true });
export const completeWorkerValidationSchema = workerValidationCapabilitySchema.extend({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), result: resultSchema }).strict();
export const workerValidationLeaseSchema = z.object({ version: z.literal("1"), ...binding, jobId: opaqueIdSchema, attemptId: opaqueIdSchema,
  token: z.string().regex(/^[a-f0-9]{64}$/), source: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  deadline: z.string().datetime(), validationPolicyVersion: z.string(), executionOrigin: z.literal("local-worker"),
}).strict();
export const workerValidationStatusSchema = z.object({ version: z.literal("1"), jobId: opaqueIdSchema,
  state: z.enum(["PENDING", "COMPLETED", "CANCELLED", "EXPIRED"]), deadline: z.string().datetime(),
  candidate: candidateRecordSchema.optional(), executionOrigin: z.literal("local-worker"),
}).strict();
export type BeginWorkerValidation = z.infer<typeof beginWorkerValidationSchema>;
export type WorkerValidationCapability = z.infer<typeof workerValidationCapabilitySchema>;
export type CompleteWorkerValidation = z.infer<typeof completeWorkerValidationSchema>;
