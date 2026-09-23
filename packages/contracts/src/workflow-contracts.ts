import * as z from "zod/v4";
export const geometrySummarySchema = z.object({
    units: z.literal("mm"), triangleCount: z.number().int().positive().max(250000),
    bounds: z.object({ min: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]), max: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]) }).strict(),
    dimensions: z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative(), z.number().finite().nonnegative()]),
    checks: z.array(z.enum(["binary-stl-length", "finite-coordinates", "nonempty-mesh"])),
    scope: z.literal("geometry-only"),
}).strict();
export type GeometrySummary = z.infer<typeof geometrySummarySchema>;
export const exportMetadataSchema = z.object({
    exportId: z.string(), projectId: z.string(), revision: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.enum(["stl", "3mf"]), mimeType: z.enum(["model/stl", "model/3mf"]), filename: z.string(),
    hash: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().positive().max(25 * 1024 * 1024), expiresAt: z.string().datetime(),
}).strict();
export const exportReceiptSchema = exportMetadataSchema.extend({ downloadUrl: z.string().url(), downloadExpiresAt: z.string().datetime() });
export type ExportReceipt = z.infer<typeof exportReceiptSchema>;
export const exportJobSchema = z.object({ jobId: z.string(), projectId: z.string(), revision: z.string(), source: z.string().max(256 * 1024), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), format: z.enum(["stl", "3mf"]), token: z.string().regex(/^[a-f0-9]{64}$/), deadline: z.string().datetime() }).strict();
export interface CadWorkflowService {
    projectUrl(projectId: string): string;
    inspect(projectId: string): Promise<{
        rendererAvailability: "ready" | "busy" | "unavailable";
        exports: z.infer<typeof exportMetadataSchema>[];
    }>;
    requireReady(projectId: string): Promise<void>;
    exportModel(input: {
        projectId: string;
        revision: string;
        format: "stl" | "3mf";
        signal?: AbortSignal;
    }): Promise<ExportReceipt>;
}
export function exportFilename(name: string, projectId: string, revision: string, hash: string, format: "stl" | "3mf" | "glb"): string {
    const slug = name.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "model";
    return `${slug}-${projectId.slice(0, 8)}-${revision.slice(0, 8)}-${hash.slice(0, 12)}.${format}`;
}
