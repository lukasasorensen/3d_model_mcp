import { projectIdSchema } from "@rjls/contracts";
import { withConfiguredCadRuntime } from "@rjls/runtime";
import { isCadDomainError } from "@/lib/cad-errors";
import { NO_STORE_HEADERS, authenticateRequest, isPolicyResponse, jsonError } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) return jsonError("INVALID_REQUEST", 400, "The project ID is invalid.");
  try {
    const result = await withConfiguredCadRuntime(user.id, async (runtime) => {
      const [state, revisions] = await Promise.all([
        runtime.repository.getProjectState(parsed.data),
        runtime.repository.listRevisions(parsed.data),
      ]);
      return { state, revisions };
    });
    return Response.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND")) return jsonError("PROJECT_NOT_FOUND", 404);
    return jsonError("PROJECT_READ_FAILED", 500, "Project history could not be read safely.");
  }
}
