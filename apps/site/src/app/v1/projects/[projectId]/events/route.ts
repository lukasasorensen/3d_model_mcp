import { projectIdSchema } from "@rjls/contracts";
import { getProjectDatabase, withConfiguredCadRuntime } from "@rjls/runtime";
import { authenticateRequest, configuredOrigin, isPolicyResponse, jsonError } from "@/lib/route-policy";
import { createProjectEventStream } from "@/lib/project-event-stream";
import { isCadDomainError } from "@/lib/cad-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const origin = request.headers.get("origin");
  if ((origin && origin !== configuredOrigin()) || request.headers.get("sec-fetch-site") === "cross-site") return jsonError("ORIGIN_DENIED", 403);
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const projectId = projectIdSchema.safeParse((await context.params).projectId);
  if (!projectId.success) return jsonError("INVALID_REQUEST", 400);
  const authorize = async () => {
    const current = await authenticateRequest(request);
    if (isPolicyResponse(current) || current.id !== user.id) throw new Error("Project subscription authorization expired.");
    await withConfiguredCadRuntime(user.id, (runtime) => runtime.repository.assertProjectAccess(projectId.data));
  };
  try {
    await authorize();
    return await createProjectEventStream({ request, ownerId: user.id, projectId: projectId.data, changes: getProjectDatabase().notifications, authorize });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND")) return jsonError("PROJECT_NOT_FOUND", 404);
    return jsonError("PROJECT_EVENTS_UNAVAILABLE", 503);
  }
}
