import * as z from "zod/v4";
import { CONTRACT_VERSION } from "../../shared/version.constants.js";
import {
  projectIdSchema,
  candidateIdSchema,
  revisionIdSchema,
  opaqueIdSchema,
} from "./identity.schema.js";
import { CAD_LIMITS } from "./cad.constants.js";
import { candidateStateSchema } from "./candidateState.enum.js";
import { geometrySummarySchema } from "./geometry.schema.js";
import { diagnosticSchema } from "./diagnostic.schema.js";
import { rendererProvenanceSchema } from "./rendererProvenance.schema.js";
import { artifactManifestSchema } from "./artifact.schema.js";

export const candidateRecordSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceBytes: z.number().int().positive().max(CAD_LIMITS.sourceBytes),
    state: candidateStateSchema,
    activeAttemptId: opaqueIdSchema.optional(),
    geometry: geometrySummarySchema.optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
    validationPolicyVersion: z.string().min(1).max(100).optional(),
    diagnostics: z
      .array(diagnosticSchema)
      .max(CAD_LIMITS.diagnosticCount)
      .default([]),
    renderer: rendererProvenanceSchema.optional(),
    artifacts: z
      .array(artifactManifestSchema.omit({ sourceRevision: true }))
      .max(8)
      .default([]),
  })
  .strict();
