import { withConfiguredCadRuntime } from "@rjls/runtime";
import { createClaimLocalMcpRenderHandler } from "@/lib/local-mcp-browser-routes";
import { authenticateRequest, isPolicyResponse } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  return withConfiguredCadRuntime(user.id, async (runtime) => createClaimLocalMcpRenderHandler(async () => runtime)(request));
}
