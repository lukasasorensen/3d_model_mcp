import { projectListSchema, projectSummarySchema } from "@rjls/contracts";
import { withConfiguredCadRuntime } from "@rjls/runtime";
import { NO_STORE_HEADERS, authenticateRequest, isPolicyResponse, jsonError, requireSameOrigin } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  try {
    const response = await withConfiguredCadRuntime(user.id, async (runtime) => projectListSchema.parse({ projects: await runtime.repository.listProjects() }));
    return Response.json(response, { headers: NO_STORE_HEADERS });
  } catch {
    return jsonError("PROJECT_LIST_FAILED", 500, "Projects could not be listed safely.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  try {
    const project = await withConfiguredCadRuntime(user.id, async (runtime) => projectSummarySchema.parse(await runtime.repository.createProject()));
    return Response.json({ project }, { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return jsonError("PROJECT_CREATE_FAILED", 500, "The project could not be created safely.");
  }
}
