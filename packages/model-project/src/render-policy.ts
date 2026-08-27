import {
  CAD_LIMITS,
  boundingBoxSchema,
  candidateRecordSchema,
  diagnosticSchema,
  isBrowserRendererProvenance,
  rendererProvenanceSchema,
  type ArtifactManifest,
  type CandidateRecord,
  type Diagnostic,
  type RendererProvenance,
} from "@rjls/contracts";
import * as z from "zod/v4";

import { CadDomainError } from "./cad-domain-error.js";

const renderedArtifactSchema = z
  .object({
    format: z.enum(["stl", "3mf"]),
    bytes: z.instanceof(Uint8Array),
    mimeType: z.enum(["model/stl", "model/3mf"]),
    triangleCount: z.number().int().nonnegative(),
    boundingBox: boundingBoxSchema,
    tessellation: z
      .record(z.string().max(80), z.union([z.string().max(200), z.number().finite(), z.boolean()]))
      .refine((value) => Object.keys(value).length <= 32),
  })
  .strict();

export const renderValidationResultSchema = z
  .object({
    outcome: z.enum(["VALID", "REJECTED"]),
    diagnostics: z.array(diagnosticSchema).max(CAD_LIMITS.diagnosticCount),
    provenance: rendererProvenanceSchema,
    validationPolicyVersion: z.string().min(1).max(100),
    artifacts: z.array(renderedArtifactSchema).max(8).default([]),
  })
  .strict();

export interface PreparedRenderArtifact {
  filename: "preview.stl" | "export.3mf";
  bytes: Uint8Array;
  manifest: CandidateRecord["artifacts"][number];
}

export type RenderPolicyDecision =
  | { outcome: "REJECTED"; diagnostics: Diagnostic[] }
  | {
    outcome: "VALID";
    diagnostics: Diagnostic[];
    provenance: RendererProvenance;
    validationPolicyVersion: string;
    artifacts: PreparedRenderArtifact[];
  };

function rejection(code: string, message: string): RenderPolicyDecision {
  return { outcome: "REJECTED", diagnostics: [{ code, severity: "error", message }] };
}

export function evaluateRenderResult(input: {
  rawResult: unknown;
  sourceHash: string;
  validationPolicyVersion: string;
  acceptRendererProvenance: (provenance: RendererProvenance) => boolean;
  hashBytes: (bytes: Uint8Array) => string;
}): RenderPolicyDecision {
  const parsedResult = renderValidationResultSchema.safeParse(input.rawResult);
  if (!parsedResult.success) return rejection("RENDER_FAILED", "Renderer returned invalid bounded metadata.");
  const result = parsedResult.data;
  if (result.outcome === "REJECTED") return { outcome: "REJECTED", diagnostics: result.diagnostics };
  if (result.validationPolicyVersion !== input.validationPolicyVersion || result.provenance.validationPolicyVersion !== input.validationPolicyVersion) {
    return rejection("POLICY_MISMATCH", "Renderer validation policy does not match the repository policy.");
  }
  if (!input.acceptRendererProvenance(result.provenance)) {
    return rejection("PROVENANCE_MISMATCH", "Renderer provenance is not approved.");
  }

  const formats = new Set<string>();
  const artifacts: PreparedRenderArtifact[] = [];
  for (const artifact of result.artifacts) {
    if (formats.has(artifact.format)) return rejection("INVALID_RENDER_RESULT", "Renderer returned duplicate artifact content.");
    formats.add(artifact.format);
    const byteLimit = artifact.format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
    if (artifact.bytes.byteLength > byteLimit || (artifact.format === "stl" && artifact.triangleCount > CAD_LIMITS.previewTriangles)) {
      return rejection("ARTIFACT_LIMIT_EXCEEDED", "Rendered artifact exceeds configured limits.");
    }
    const expectedMimeType = artifact.format === "stl" ? "model/stl" : "model/3mf";
    if (artifact.mimeType !== expectedMimeType) return rejection("ARTIFACT_TYPE_MISMATCH", "Rendered artifact format and MIME type disagree.");
    const hash = input.hashBytes(artifact.bytes);
    const manifest = candidateRecordSchema.shape.artifacts.unwrap().element.safeParse({
      artifactId: hash.slice(0, 32),
      format: artifact.format,
      mimeType: artifact.mimeType,
      hash,
      byteSize: artifact.bytes.byteLength,
      triangleCount: artifact.triangleCount,
      units: "mm",
      axisConvention: "right-handed-z-up",
      boundingBox: artifact.boundingBox,
      sourceHash: input.sourceHash,
      renderer: result.provenance,
      tessellation: artifact.tessellation,
    });
    if (!manifest.success) return rejection("INVALID_RENDER_RESULT", "Renderer returned invalid artifact metadata.");
    artifacts.push({
      filename: artifact.format === "stl" ? "preview.stl" : "export.3mf",
      bytes: artifact.bytes,
      manifest: manifest.data,
    });
  }
  if (!formats.has("stl") && !isBrowserRendererProvenance(result.provenance)) {
    return rejection("MISSING_PREVIEW", "Renderer did not produce a validated STL preview.");
  }
  return {
    outcome: "VALID",
    diagnostics: result.diagnostics,
    provenance: result.provenance,
    validationPolicyVersion: result.validationPolicyVersion,
    artifacts,
  };
}

export function assertArtifactSet(
  artifacts: ReadonlyArray<Omit<ArtifactManifest, "sourceRevision"> & { sourceRevision?: string }>,
  sourceHash: string,
  renderer: RendererProvenance,
  sourceRevision?: string,
): void {
  const formats = new Set<string>();
  for (const artifact of artifacts) {
    const byteLimit = artifact.format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
    const expectedMimeType = artifact.format === "stl" ? "model/stl" : "model/3mf";
    if (
      formats.has(artifact.format)
      || artifact.mimeType !== expectedMimeType
      || artifact.byteSize > byteLimit
      || (artifact.format === "stl" && artifact.triangleCount > CAD_LIMITS.previewTriangles)
      || artifact.sourceHash !== sourceHash
      || (sourceRevision !== undefined && artifact.sourceRevision !== sourceRevision)
    ) {
      throw new CadDomainError("ARTIFACT_HASH_MISMATCH", "Artifact metadata failed binding or limit validation.");
    }
    if (JSON.stringify(artifact.renderer) !== JSON.stringify(renderer)) {
      throw new CadDomainError("PROVENANCE_MISMATCH", "Artifact renderer provenance does not match the revision.");
    }
    formats.add(artifact.format);
  }
  if (!formats.has("stl") && !isBrowserRendererProvenance(renderer)) {
    throw new CadDomainError("ARTIFACT_NOT_FOUND", "Validated STL preview metadata is missing.");
  }
}
