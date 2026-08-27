import { withConfiguredCadRuntime } from "@rjls/runtime";
import { createCompleteLocalMcpRenderHandler } from "@/lib/local-mcp-browser-routes";
import { authenticateRequest, isPolicyResponse } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  return withConfiguredCadRuntime(user.id, async (runtime) => createCompleteLocalMcpRenderHandler(async () => runtime)(request, context));
}
