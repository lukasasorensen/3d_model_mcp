import { projectListSchema, projectSummarySchema } from "@rjls/contracts";
import { getConfiguredCadRuntime } from "@rjls/runtime";
import { authenticatedUser, isAuthResponse } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  const configured = await getConfiguredCadRuntime(user.id).catch(() => undefined);
  if (!configured) return Response.json({ error: { code: "RUNTIME_UNAVAILABLE", message: "The local CAD runtime is unavailable." } }, { status: 503, headers });
  try {
    const response = projectListSchema.parse({ projects: await configured.repository.listProjects() });
    return Response.json(response, { headers });
  } catch {
    return Response.json({ error: { code: "PROJECT_LIST_FAILED", message: "Projects could not be listed safely." } }, { status: 500, headers });
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  const allowedOrigin = process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000";
  if (request.headers.get("origin") !== allowedOrigin) return Response.json({ error: { code: "ORIGIN_DENIED" } }, { status: 403, headers });
  try {
    const configured = await getConfiguredCadRuntime(user.id);
    const project = projectSummarySchema.parse(await configured.repository.createProject());
    return Response.json({ project }, { status: 201, headers });
  } catch {
    return Response.json({ error: { code: "PROJECT_CREATE_FAILED", message: "The project could not be created safely." } }, { status: 500, headers });
  }
}
