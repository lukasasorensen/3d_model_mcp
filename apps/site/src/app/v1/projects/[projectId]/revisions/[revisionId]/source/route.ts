import { projectIdSchema, revisionIdSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; revisionId: string }> }): Promise<Response> {
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const revisionId = revisionIdSchema.safeParse(params.revisionId);
  if (!projectId.success || !revisionId.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: errorHeaders });
  try {
    const configured = await getConfiguredCadRuntime();
    const model = await configured.repository.readModelSource(projectId.data, revisionId.data);
    return new Response(model.source, { headers: {
      ...errorHeaders,
      "content-type": "text/plain; charset=utf-8",
      "x-rjls-source-hash": model.sourceHash,
      "x-rjls-source-revision": model.revision,
    } });
  } catch {
    return Response.json({ error: { code: "REVISION_NOT_FOUND" } }, { status: 404, headers: errorHeaders });
  }
}
