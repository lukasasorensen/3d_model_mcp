import { projectIdSchema, revisionIdSchema } from "@rjls/contracts";
import { withConfiguredCadRuntime } from "@rjls/runtime";
import { isCadDomainError } from "@/lib/cad-errors";
import { NO_STORE_HEADERS, authenticateRequest, isPolicyResponse, jsonError } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string; revisionId: string }> }): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const revisionId = revisionIdSchema.safeParse(params.revisionId);
  if (!projectId.success || !revisionId.success) return jsonError("INVALID_REQUEST", 400);
  try {
    const model = await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.readModelSource(projectId.data, revisionId.data));
    return new Response(model.source, { headers: {
      ...NO_STORE_HEADERS,
      "content-type": "text/plain; charset=utf-8",
      "x-rjls-source-hash": model.sourceHash,
      "x-rjls-source-revision": model.revision,
    } });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND") || isCadDomainError(error, "REVISION_NOT_FOUND")) {
      return jsonError("REVISION_NOT_FOUND", 404);
    }
    return jsonError("REVISION_READ_FAILED", 500);
  }
}
