import { createProjectInputSchema, projectListSchema, projectSummarySchema } from "@rjls/contracts";
import { withConfiguredCadRuntime } from "@rjls/runtime";
import { ProjectCreateBodyTooLargeError, readProjectCreateBody } from "@/lib/project-create-request";
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
  let body: unknown;
  try { body = await readProjectCreateBody(request); }
  catch (error) {
    return error instanceof ProjectCreateBodyTooLargeError
      ? jsonError("REQUEST_TOO_LARGE", 413, "The project request is too large.")
      : jsonError("INVALID_REQUEST", 400, "Provide a title and description.");
  }
  const input = createProjectInputSchema.safeParse(body);
  if (!input.success) return jsonError("INVALID_REQUEST", 400, "Provide a title and description.");
  try {
    const project = await withConfiguredCadRuntime(user.id, async (runtime) => projectSummarySchema.parse(await runtime.repository.createProject(input.data)));
    return Response.json({ project }, { status: 201, headers: NO_STORE_HEADERS });
  } catch {
    return jsonError("PROJECT_CREATE_FAILED", 500, "The project could not be created safely.");
  }
}
