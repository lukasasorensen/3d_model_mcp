import * as z from "zod/v4";

export const exportMetadataSchema = z
  .object({
    exportId: z.string(),
    projectId: z.string(),
    revision: z.string(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.enum(["stl", "3mf"]),
    mimeType: z.enum(["model/stl", "model/3mf"]),
    filename: z.string(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const exportReceiptSchema = exportMetadataSchema.extend({
  downloadUrl: z.string().url(),
  downloadExpiresAt: z.string().datetime(),
});

export const exportJobSchema = z
  .object({
    jobId: z.string(),
    projectId: z.string(),
    revision: z.string(),
    source: z.string().max(256 * 1024),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.enum(["stl", "3mf"]),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    deadline: z.string().datetime(),
  })
  .strict();
