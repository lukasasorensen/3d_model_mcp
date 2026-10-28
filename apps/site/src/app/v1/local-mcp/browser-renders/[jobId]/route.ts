import { authenticateRequest } from "@/authentication.composition";
import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import { isPolicyResponse } from "../../../../../features/authentication/index";
import { createCompleteLocalMcpRenderHandler } from "../../../../../features/browser-rendering/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  return withConfiguredCadRuntime(user.id, async (runtime) =>
    createCompleteLocalMcpRenderHandler(async () => runtime)(request, context),
  );
}
