import * as z from "zod/v4";
import {
  sessionIdSchema,
  opaqueIdSchema,
  projectIdSchema,
  candidateIdSchema,
} from "./identity.schema.js";
import { geometrySummarySchema } from "./geometry.schema.js";
import { diagnosticSchema } from "./diagnostic.schema.js";
import { CAD_LIMITS } from "./cad.constants.js";
import { rendererProvenanceSchema } from "./rendererProvenance.schema.js";
import { CONTRACT_VERSION } from "../../shared/version.constants.js";

export const browserRenderCompletionSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    sessionId: sessionIdSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    outcome: z.enum(["VALID", "REJECTED", "FAILED"]),
    geometry: geometrySummarySchema.optional(),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
    provenance: rendererProvenanceSchema.refine(
      (value) => value.profile === "browser-wasm",
      "browser WASM provenance required",
    ),
  })
  .strict();

/** Local-only handoff from the standalone MCP process to an open browser tab. */
export const localMcpBrowserRenderJobSchema = z
  .object({
    version: z.literal(CONTRACT_VERSION),
    jobId: opaqueIdSchema,
    projectId: projectIdSchema,
    candidateId: candidateIdSchema,
    token: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.string().min(1).max(CAD_LIMITS.sourceBytes),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.literal("stl"),
    createdAt: z.string().datetime({ offset: true }),
    deadline: z.string().datetime({ offset: true }),
  })
  .strict();

export const remoteMcpBrowserRenderJobSchema = localMcpBrowserRenderJobSchema
  .omit({ version: true, projectId: true, createdAt: true })
  .extend({ purpose: z.literal("candidate") });
