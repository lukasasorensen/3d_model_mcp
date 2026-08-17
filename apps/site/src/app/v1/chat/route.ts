import { createChatRouteHandler } from "@rjls/gateway";
import { getConfiguredCadRuntime } from "@rjls/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createChatRouteHandler({
  allowedOrigin: process.env.RJLS_ALLOWED_ORIGIN ?? "http://localhost:3000",
  getOrchestrator: async () => getConfiguredCadRuntime(),
});

export const POST = handler;

