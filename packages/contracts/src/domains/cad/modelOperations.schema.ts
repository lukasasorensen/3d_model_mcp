import * as z from "zod/v4";
import { modelFilesSchema } from "./modelFiles.schema.js";
import { parameterSnapshotSchema } from "./parameter.schema.js";
import {
  projectIdSchema,
  revisionIdSchema,
  opaqueIdSchema,
  candidateIdSchema,
} from "./identity.schema.js";
import { CAD_LIMITS } from "./cad.constants.js";
import { exportMetadataSchema, exportReceiptSchema } from "./export.schema.js";
import { artifactManifestSchema } from "./artifact.schema.js";
import { diagnosticSchema } from "./diagnostic.schema.js";
import { candidateRecordSchema } from "./candidate.schema.js";
import { revisionManifestSchema } from "./revision.schema.js";

export const getProjectStateInputSchema = z
  .object({ projectId: projectIdSchema })
  .strict();

export const readModelSourceInputSchema = z
  .object({ projectId: projectIdSchema, revision: revisionIdSchema.optional() })
  .strict();

export const modelProposalContentSchema = z
  .object({
    projectId: projectIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    source: z.string().min(1).max(CAD_LIMITS.sourceBytes).optional(),
    modelFiles: modelFilesSchema.optional(),
    modelBody: z.string().min(1).max(CAD_LIMITS.sourceBytes).optional(),
    parameters: parameterSnapshotSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      [input.source, input.modelBody, input.modelFiles].filter(
        (value) => value !== undefined,
      ).length === 1,
    {
      message: "Supply exactly one of source, modelBody or modelFiles.",
    },
  );

export const proposeModelSourceInputSchema =
  modelProposalContentSchema.safeExtend({
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
  });

export const validateAndRenderInputSchema = z
  .object({
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    previewProfile: z.literal("standard"),
  })
  .strict();

export const promoteCandidateInputSchema = z
  .object({
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    expectedParentRevision: revisionIdSchema.nullable(),
  })
  .strict();

export const exportModelInputSchema = z
  .object({
    projectId: projectIdSchema,
    revision: revisionIdSchema,
    format: z.enum(["stl", "3mf"]),
  })
  .strict();

export const listRevisionsInputSchema = z
  .object({ projectId: projectIdSchema })
  .strict();

export const restoreRevisionInputSchema = z
  .object({
    projectId: projectIdSchema,
    revision: revisionIdSchema,
    requestId: opaqueIdSchema,
    toolCallId: opaqueIdSchema,
  })
  .strict();

export const projectStateSchema = z
  .object({
    projectId: projectIdSchema,
    currentRevision: revisionIdSchema.nullable(),
    projectUrl: z.string().url().optional(),
    rendererAvailability: z.enum(["ready", "busy", "unavailable"]).optional(),
    exports: z.array(exportMetadataSchema).optional(),
    source: z
      .object({
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        byteSize: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    artifacts: z.array(artifactManifestSchema).max(8),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
    parameters: parameterSnapshotSchema.optional(),
  })
  .strict();

export const getProjectStateOutputSchema = z
  .object({ state: projectStateSchema })
  .strict();

export const readModelSourceOutputSchema = z
  .object({
    model: z
      .object({
        revision: revisionIdSchema,
        source: z.string().optional(),
        modelBody: z.string().optional(),
        modelFiles: modelFilesSchema.optional(),
        parameters: parameterSnapshotSchema.optional(),
        sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .refine(
        (model) =>
          [model.source, model.modelBody, model.modelFiles].filter(
            (value) => value !== undefined,
          ).length === 1,
        {
          message:
            "Model reads contain exactly one of source, modelBody or modelFiles.",
        },
      ),
  })
  .strict();

export const proposeModelSourceOutputSchema = z
  .object({
    candidate: candidateRecordSchema.omit({
      modelBody: true,
      modelFiles: true,
    }),
  })
  .strict();

export const validateAndRenderOutputSchema = z
  .object({
    candidate: candidateRecordSchema.omit({
      modelBody: true,
      modelFiles: true,
    }),
  })
  .strict();

export const promoteCandidateOutputSchema = z
  .object({
    revision: revisionManifestSchema.omit({
      modelBody: true,
      modelFiles: true,
    }),
  })
  .strict();

export const exportModelOutputSchema = z
  .object({
    export: exportReceiptSchema,
  })
  .strict();

export const listRevisionsOutputSchema = z
  .object({ revisions: z.array(revisionManifestSchema) })
  .strict();

export const restoreRevisionOutputSchema = z
  .object({
    revision: revisionManifestSchema.omit({
      modelBody: true,
      modelFiles: true,
    }),
  })
  .strict();
