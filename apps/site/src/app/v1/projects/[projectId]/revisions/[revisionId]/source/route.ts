import { authenticateRequest } from "../../../../../../../authentication.composition";
import { isCadDomainError } from "../../../../../../../shared/errors/cadErrors.util";
import { projectIdSchema, revisionIdSchema } from "@theoryfoundry/contracts";
import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import {
  NO_STORE_HEADERS,
  isPolicyResponse,
  jsonError,
} from "../../../../../../../features/authentication/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; revisionId: string }> },
): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  const params = await context.params;
  const projectId = projectIdSchema.safeParse(params.projectId);
  const revisionId = revisionIdSchema.safeParse(params.revisionId);
  if (!projectId.success || !revisionId.success)
    return jsonError("INVALID_REQUEST", 400);
  try {
    const model = await withConfiguredCadRuntime(user.id, (runtime) =>
      runtime.repository.readModelSource(projectId.data, revisionId.data),
    );
    return new Response(model.source, {
      headers: {
        ...NO_STORE_HEADERS,
        "content-type": "text/plain; charset=utf-8",
        "x-theoryfoundry-source-hash": model.sourceHash,
        "x-theoryfoundry-source-revision": model.revision,
      },
    });
  } catch (error) {
    if (
      isCadDomainError(error, "PROJECT_NOT_FOUND") ||
      isCadDomainError(error, "REVISION_NOT_FOUND")
    ) {
      return jsonError("REVISION_NOT_FOUND", 404);
    }
    return jsonError("REVISION_READ_FAILED", 500);
  }
}
