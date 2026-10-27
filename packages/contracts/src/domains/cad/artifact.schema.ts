import * as z from "zod/v4";
import { artifactIdSchema, revisionIdSchema } from "./identity.schema.js";
import { rendererProvenanceSchema } from "./rendererProvenance.schema.js";

export const boundingBoxSchema = z
  .object({
    min: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
    max: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
  })
  .strict();

export const artifactFormatSchema = z.enum(["stl", "3mf"]);

export const artifactManifestSchema = z
  .object({
    artifactId: artifactIdSchema,
    format: artifactFormatSchema,
    mimeType: z.enum(["model/stl", "model/3mf"]),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    units: z.literal("mm"),
    axisConvention: z.literal("right-handed-z-up"),
    boundingBox: boundingBoxSchema,
    sourceRevision: revisionIdSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    renderer: rendererProvenanceSchema,
    tessellation: z
      .record(
        z.string().max(80),
        z.union([z.string().max(200), z.number().finite(), z.boolean()]),
      )
      .refine(
        (value) => Object.keys(value).length <= 32,
        "too many tessellation settings",
      ),
  })
  .strict();
