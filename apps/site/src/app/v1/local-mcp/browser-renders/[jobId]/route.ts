import { getConfiguredCadRuntime } from "@rjls/runtime";
import { createCompleteLocalMcpRenderHandler } from "@/lib/local-mcp-browser-routes";
import { authenticatedUser, isAuthResponse } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  return createCompleteLocalMcpRenderHandler(async () => getConfiguredCadRuntime(user.id))(request, context);
}
