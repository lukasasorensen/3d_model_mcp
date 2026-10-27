import * as z from "zod/v4";
import { CONTRACT_VERSION } from "../../shared/version.constants.js";
import {
  projectIdSchema,
  revisionIdSchema,
  opaqueIdSchema,
  candidateIdSchema,
} from "./identity.schema.js";
import { CAD_LIMITS } from "./cad.constants.js";
import { diagnosticSchema } from "./diagnostic.schema.js";
import { artifactManifestSchema } from "./artifact.schema.js";
import { rendererProvenanceSchema } from "./rendererProvenance.schema.js";
import { geometrySummarySchema } from "./geometry.schema.js";

export const revisionManifestSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    projectId: projectIdSchema,
    revisionId: revisionIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    restoredFrom: revisionIdSchema.optional(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceBytes: z.number().int().nonnegative().max(CAD_LIMITS.sourceBytes),
    createdAt: z.string().datetime({ offset: true }),
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
    candidateId: candidateIdSchema,
    validationPolicyVersion: z.string().min(1).max(100),
    validationResult: z.literal("VALID"),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
    artifacts: z.array(artifactManifestSchema).max(8),
    renderer: rendererProvenanceSchema,
    geometry: geometrySummarySchema.optional(),
  })
  .strict();
