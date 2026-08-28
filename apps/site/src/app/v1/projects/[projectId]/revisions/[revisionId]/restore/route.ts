import { projectIdSchema, revisionIdSchema } from "@rjls/contracts";
import { withConfiguredCadRuntime } from "@rjls/runtime";
import { randomUUID } from "node:crypto";
import { NO_STORE_HEADERS, authenticateRequest, isPolicyResponse, jsonError, requireSameOrigin } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ projectId: string; revisionId: string }> }): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const revisionId = revisionIdSchema.safeParse(params.revisionId);
  if (!projectId.success || !revisionId.success) return jsonError("INVALID_REQUEST", 400, "The restore request is invalid.");
  try {
    const revision = await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.restoreRevision({
      projectId: projectId.data,
      revision: revisionId.data,
      requestId: randomUUID(),
      toolCallId: randomUUID(),
      signal: request.signal,
    }));
    return Response.json({ revision }, { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return jsonError("RESTORE_FAILED", 409, "The revision could not be restored safely.");
  }
}
