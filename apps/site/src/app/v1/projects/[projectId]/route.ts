import { authenticateRequest } from "../../../../authentication.composition";
import { isCadDomainError } from "../../../../shared/errors/cadErrors.util";
import {
  ProjectBodyTooLargeError,
  readProjectRequestBody,
} from "../../../../features/workspace/index";
import { projectIdSchema } from "@theoryfoundry/contracts";
import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import {
  NO_STORE_HEADERS,
  isPolicyResponse,
  jsonError,
  requireSameOrigin,
} from "../../../../features/authentication/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success)
    return jsonError("INVALID_REQUEST", 400, "The project ID is invalid.");
  try {
    const result = await withConfiguredCadRuntime(user.id, async (runtime) => {
      return runtime.repository.getProjectSnapshot(parsed.data);
    });
    return Response.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND"))
      return jsonError("PROJECT_NOT_FOUND", 404);
    return jsonError(
      "PROJECT_READ_FAILED",
      500,
      "Project history could not be read safely.",
    );
  }
}

type ProjectContext = { params: Promise<{ projectId: string }> };

async function changeProject(
  request: Request,
  context: ProjectContext,
  action: "archive" | "delete",
): Promise<Response> {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const parsed = projectIdSchema.safeParse((await context.params).projectId);
  if (!parsed.success)
    return jsonError("INVALID_REQUEST", 400, "The project ID is invalid.");

  try {
    if (action === "archive") {
      let body: unknown;
      try {
        body = await readProjectRequestBody(request);
      } catch (error) {
        if (error instanceof ProjectBodyTooLargeError)
          return jsonError("REQUEST_TOO_LARGE", 413);
        return jsonError("INVALID_REQUEST", 400);
      }
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).length !== 1 ||
        !("isArchived" in body) ||
        typeof body.isArchived !== "boolean"
      )
        return jsonError(
          "INVALID_REQUEST",
          400,
          "Provide a boolean isArchived flag.",
        );
      const { isArchived } = body;
      await withConfiguredCadRuntime(user.id, (runtime) =>
        runtime.repository.setProjectArchived(parsed.data, isArchived),
      );
    } else {
      await withConfiguredCadRuntime(user.id, (runtime) =>
        runtime.repository.deleteProject(parsed.data),
      );
    }
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isCadDomainError(error, "PROJECT_NOT_FOUND"))
      return jsonError("PROJECT_NOT_FOUND", 404);
    return jsonError("PROJECT_UPDATE_FAILED", 500);
  }
}

export function PATCH(
  request: Request,
  context: ProjectContext,
): Promise<Response> {
  return changeProject(request, context, "archive");
}

export function DELETE(
  request: Request,
  context: ProjectContext,
): Promise<Response> {
  return changeProject(request, context, "delete");
}
