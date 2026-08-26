import { projectListSchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(): Promise<Response> {
  const configured = await getConfiguredCadRuntime().catch(() => undefined);
  if (!configured) return Response.json({ error: { code: "RUNTIME_UNAVAILABLE", message: "The local CAD runtime is unavailable." } }, { status: 503, headers });
  try {
    const response = projectListSchema.parse({ projects: await configured.repository.listProjects() });
    return Response.json(response, { headers });
  } catch {
    return Response.json({ error: { code: "PROJECT_LIST_FAILED", message: "Projects could not be listed safely." } }, { status: 500, headers });
  }
}
