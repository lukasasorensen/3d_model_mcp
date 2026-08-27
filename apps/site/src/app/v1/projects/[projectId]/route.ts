import { projectIdSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";
import { authenticatedUser, isAuthResponse, isCadDomainError } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) return Response.json({ error: { code: "INVALID_REQUEST", message: "The project ID is invalid." } }, { status: 400, headers });
  const configured = await getConfiguredCadRuntime(user.id).catch(() => undefined);
  if (!configured) return Response.json({ error: { code: "RUNTIME_UNAVAILABLE", message: "The local CAD runtime is unavailable." } }, { status: 503, headers });
  try {
    const [state, revisions] = await Promise.all([
      configured.repository.getProjectState(parsed.data),
      configured.repository.listRevisions(parsed.data),
    ]);
    return Response.json({ state, revisions }, { headers });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND")) return Response.json({ error: { code: "PROJECT_NOT_FOUND" } }, { status: 404, headers });
    return Response.json({ error: { code: "PROJECT_READ_FAILED", message: "Project history could not be read safely." } }, { status: 500, headers });
  }
}
