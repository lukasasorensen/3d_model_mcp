import * as z from "zod/v4";
import {
  projectIdSchema,
  opaqueIdSchema,
  CAD_LIMITS,
  rendererProvenanceSchema,
} from "../cad/index.js";

export const workerPreviewSourceInputSchema = z
  .object({
    version: z.literal("1"),
    projectId: projectIdSchema,
    revisionId: opaqueIdSchema.optional(),
    candidateId: opaqueIdSchema.optional(),
  })
  .strict()
  .refine(
    (input) => !(input.revisionId && input.candidateId),
    "Choose a revision or candidate, not both.",
  );

const sourceBinding = {
  version: z.literal("1"),
  projectId: projectIdSchema,
  source: z.string().max(CAD_LIMITS.sourceBytes),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  renderer: rendererProvenanceSchema,
};

/** Every response pins exactly one immutable source target, including current-revision requests. */
export const workerPreviewSourceSchema = z.union([
  z.object({ ...sourceBinding, revisionId: opaqueIdSchema }).strict(),
  z.object({ ...sourceBinding, candidateId: opaqueIdSchema }).strict(),
]);
