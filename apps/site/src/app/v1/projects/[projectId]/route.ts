import { projectIdSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success) return Response.json({ error: { code: "INVALID_REQUEST", message: "The project ID is invalid." } }, { status: 400, headers });
  const configured = await getConfiguredCadRuntime().catch(() => undefined);
  if (!configured) return Response.json({ error: { code: "RUNTIME_UNAVAILABLE", message: "The local CAD runtime is unavailable." } }, { status: 503, headers });
  try {
    const [state, revisions] = await Promise.all([
      configured.repository.getProjectState(parsed.data),
      configured.repository.listRevisions(parsed.data),
    ]);
    return Response.json({ state, revisions }, { headers });
  } catch {
    return Response.json({ error: { code: "PROJECT_READ_FAILED", message: "Project history could not be read safely." } }, { status: 500, headers });
  }
}
