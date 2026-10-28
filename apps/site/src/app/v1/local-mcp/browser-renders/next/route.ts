import { authenticateRequest } from "@/authentication.composition";
import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";
import { isPolicyResponse } from "../../../../../features/authentication/index";
import { createClaimLocalMcpRenderHandler } from "../../../../../features/browser-rendering/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  return withConfiguredCadRuntime(user.id, async (runtime) =>
    createClaimLocalMcpRenderHandler(async () => runtime)(request),
  );
}
