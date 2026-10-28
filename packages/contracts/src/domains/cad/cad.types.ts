import type * as z from "zod/v4";
import { type candidateStateSchema } from "./candidateState.enum.js";
import { type diagnosticSchema } from "./diagnostic.schema.js";
import { type cadErrorSchema } from "./cadError.schema.js";
import { type rendererProvenanceSchema } from "./rendererProvenance.schema.js";
import { type artifactManifestSchema } from "./artifact.schema.js";
import { type revisionManifestSchema } from "./revision.schema.js";
import { type candidateRecordSchema } from "./candidate.schema.js";
import {
  type createProjectInputSchema,
  type updateProjectInputSchema,
  type projectSummarySchema,
} from "./project.schema.js";
import {
  type browserRenderCompletionSchema,
  type localMcpBrowserRenderJobSchema,
  type remoteMcpBrowserRenderJobSchema,
} from "./browserRender.schema.js";
import { type geometrySummarySchema } from "./geometry.schema.js";
import { type exportReceiptSchema } from "./export.schema.js";

export type CandidateState = z.infer<typeof candidateStateSchema>;

export type Diagnostic = z.infer<typeof diagnosticSchema>;

export type CadError = z.infer<typeof cadErrorSchema>;

export type RendererProvenance = z.infer<typeof rendererProvenanceSchema>;

export interface RenderedArtifact {
  format: "stl" | "3mf";
  bytes: Uint8Array;
  mimeType: "model/stl" | "model/3mf";
  triangleCount: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  tessellation: Record<string, string | number | boolean>;
}

export interface RenderValidationResult {
  outcome: "VALID" | "REJECTED";
  geometry?: GeometrySummary | undefined;
  diagnostics: Diagnostic[];
  provenance: RendererProvenance;
  validationPolicyVersion: string;
  artifacts: RenderedArtifact[];
}

export interface CandidateRenderRequest {
  projectId: string;
  candidateId: string;
  attemptId?: string;
  source: string;
  sourceHash: string;
  previewProfile: "standard";
  signal?: AbortSignal | undefined;
}

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export type RevisionManifest = z.infer<typeof revisionManifestSchema>;

export type CandidateRecord = z.infer<typeof candidateRecordSchema>;

export type CreateProjectInput = z.input<typeof createProjectInputSchema>;

export type UpdateProjectInput = z.input<typeof updateProjectInputSchema>;

export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export type BrowserRenderCompletion = z.infer<
  typeof browserRenderCompletionSchema
>;

export type LocalMcpBrowserRenderJob = z.infer<
  typeof localMcpBrowserRenderJobSchema
>;

export type RemoteMcpBrowserRenderJob = z.infer<
  typeof remoteMcpBrowserRenderJobSchema
>;

export type GeometrySummary = z.infer<typeof geometrySummarySchema>;

export type ExportReceipt = z.infer<typeof exportReceiptSchema>;
