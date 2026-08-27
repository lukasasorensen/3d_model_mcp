import { projectIdSchema, revisionIdSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";
import { authenticatedUser, isAuthResponse, isCadDomainError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request, context: { params: Promise<{ projectId: string; revisionId: string }> }): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const revisionId = revisionIdSchema.safeParse(params.revisionId);
  if (!projectId.success || !revisionId.success) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers: errorHeaders });
  try {
    const configured = await getConfiguredCadRuntime(user.id);
    const model = await configured.repository.readModelSource(projectId.data, revisionId.data);
    return new Response(model.source, { headers: {
      ...errorHeaders,
      "content-type": "text/plain; charset=utf-8",
      "x-rjls-source-hash": model.sourceHash,
      "x-rjls-source-revision": model.revision,
    } });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND") || isCadDomainError(error, "REVISION_NOT_FOUND")) {
      return Response.json({ error: { code: "REVISION_NOT_FOUND" } }, { status: 404, headers: errorHeaders });
    }
    return Response.json({ error: { code: "REVISION_READ_FAILED" } }, { status: 500, headers: errorHeaders });
  }
}
