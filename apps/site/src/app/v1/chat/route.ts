import { createChatRouteHandler } from "@rjls/gateway";
import { getConfiguredCadRuntime } from "@rjls/runtime";
import { authenticatedUser, isAuthResponse } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (isAuthResponse(user)) return user;
  return createChatRouteHandler({
    allowedOrigin: process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000",
    getOrchestrator: async () => getConfiguredCadRuntime(user.id),
  })(request);
}
