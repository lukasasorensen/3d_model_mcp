import { getConfiguredCadRuntime } from "@rjls/runtime";
import { createClaimLocalMcpRenderHandler } from "@/lib/local-mcp-browser-routes";
import { authenticatedUser, isAuthResponse } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  return createClaimLocalMcpRenderHandler(async () => getConfiguredCadRuntime(user.id))(request);
}
