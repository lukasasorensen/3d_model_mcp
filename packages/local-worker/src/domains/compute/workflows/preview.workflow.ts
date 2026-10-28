import {
  getModelPreviewInputSchema,
  workerPreviewSourceSchema,
  PREVIEW_LIMITS,
  previewMetadataSchema,
  type PreviewMetadata,
} from "@theoryfoundry/contracts";
import type { ComputeDependencies } from "../compute.port.js";
import {
  verifySource,
  requireBinding,
  sha256,
} from "../utils/sourceBinding.util.js";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
export async function previewLocally(
  raw: unknown,
  { api, renderer }: ComputeDependencies,
  signal: AbortSignal,
): Promise<{ metadata: PreviewMetadata; png: string }> {
  const { view, ...input } = getModelPreviewInputSchema.parse(raw);
  const target = workerPreviewSourceSchema.parse(
    await api.json("preview/source", { version: "1", ...input }, signal),
  );
  requireBinding(
    target.projectId === input.projectId &&
      (!input.candidateId ||
        ("candidateId" in target &&
          target.candidateId === input.candidateId)) &&
      (!input.revisionId ||
        ("revisionId" in target && target.revisionId === input.revisionId)),
  );
  verifySource(
    target.source,
    target.sourceHash,
    target.renderer,
    renderer.provenance,
  );
  const rendered = await renderer.render(
    {
      source: target.source,
      sourceHash: target.sourceHash,
      format: "png",
      view,
    },
    signal,
  );
  if (!rendered.ok)
    throw new LocalWorkerError(
      "RENDER_FAILED",
      "Local PNG rendering failed; retry the same target.",
    );
  const bytes = Buffer.from(rendered.encoded, "base64");
  if (
    bytes.length > PREVIEW_LIMITS.pngBytes ||
    bytes.length < 33 ||
    bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) !== 768 ||
    bytes.readUInt32BE(20) !== 768 ||
    bytes.toString("base64") !== rendered.encoded
  )
    throw new LocalWorkerError(
      "ARTIFACT_LIMIT_EXCEEDED",
      "Renderer PNG failed format, dimension or size checks.",
    );
  const metadata = previewMetadataSchema.parse({
    projectId: input.projectId,
    ...("candidateId" in target
      ? { candidateId: target.candidateId }
      : { revisionId: target.revisionId }),
    sourceHash: target.sourceHash,
    view,
    width: 768,
    height: 768,
    imageHash: sha256(bytes),
  });
  return { metadata, png: rendered.encoded };
}
