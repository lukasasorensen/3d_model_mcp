import { projectIdSchema, sessionIdSchema } from "@rjls/contracts";
import { claimConfiguredRemoteRender, remoteMcpEnabled, withConfiguredCadRuntime } from "@rjls/runtime";
import { authenticateRequest, isPolicyResponse, jsonError, requireSameOrigin, NO_STORE_HEADERS } from "@/lib/route-policy";
import { isCadDomainError } from "@/lib/cad-errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const projectId = projectIdSchema.safeParse((await context.params).projectId);
  const sessionId = sessionIdSchema.safeParse(request.headers.get("x-rjls-session-id"));
  if (!projectId.success || !sessionId.success) return jsonError("INVALID_REQUEST", 400);
  try {
    await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.getProjectState(projectId.data));
    const job = await claimConfiguredRemoteRender(user.id, projectId.data, sessionId.data);
    return job ? Response.json({ job }, { headers: NO_STORE_HEADERS }) : new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    return isCadDomainError(error, "PROJECT_NOT_FOUND") ? jsonError("PROJECT_NOT_FOUND", 404) : jsonError("RENDER_SERVICE_UNAVAILABLE", 503);
  }
}
