import { artifactIdSchema, projectIdSchema, revisionIdSchema } from "@rjls/contracts";
import type { getConfiguredCadRuntime } from "@rjls/runtime";

const errorHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
type ArtifactRuntime = Awaited<ReturnType<typeof getConfiguredCadRuntime>>;

export function createArtifactGetHandler(getRuntime: () => Promise<Pick<ArtifactRuntime, "repository"> | undefined>) {
  return async function artifactGet(
    _request: Request,
    context: { params: Promise<{ projectId: string; revisionId: string; artifactId: string }> },
  ): Promise<Response> {
    const params = await context.params;
    const projectId = projectIdSchema.safeParse(params.projectId);
    const revisionId = revisionIdSchema.safeParse(params.revisionId);
    const artifactId = artifactIdSchema.safeParse(params.artifactId);
    if (!projectId.success || !revisionId.success || !artifactId.success) {
      return Response.json({ error: { code: "INVALID_REQUEST", message: "The artifact request is invalid." } }, { status: 400, headers: errorHeaders });
    }
    const configured = await getRuntime();
    if (!configured) return Response.json({ error: { code: "RUNTIME_UNAVAILABLE", message: "The local CAD runtime is unavailable." } }, { status: 503, headers: errorHeaders });
    try {
      const artifact = await configured.repository.readArtifact(projectId.data, revisionId.data, artifactId.data);
      const disposition = artifact.manifest.format === "3mf" ? `attachment; filename="RJLS-${revisionId.data}.3mf"` : "inline";
      const body = Uint8Array.from(artifact.bytes).buffer;
      return new Response(body, {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": disposition,
          "content-length": String(artifact.manifest.byteSize),
          "content-type": artifact.manifest.mimeType,
          "x-content-type-options": "nosniff",
          "x-rjls-artifact-hash": artifact.manifest.hash,
          "x-rjls-artifact-revision": artifact.manifest.sourceRevision,
        },
      });
    } catch {
      return Response.json({ error: { code: "ARTIFACT_NOT_FOUND", message: "The validated artifact is unavailable." } }, { status: 404, headers: errorHeaders });
    }
  };
}
