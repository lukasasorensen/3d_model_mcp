import { createChatRouteHandler } from "@rjls/gateway";
import { withConfiguredCadRuntime } from "@rjls/runtime";
import { authenticateRequest, isPolicyResponse } from "@/lib/route-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  return withConfiguredCadRuntime(user.id, async (runtime) => createChatRouteHandler({
      allowedOrigin: process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000",
      getOrchestrator: async () => runtime,
    })(request));
}
