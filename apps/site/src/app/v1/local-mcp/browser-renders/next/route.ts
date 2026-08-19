import { getConfiguredCadRuntime } from "@rjls/runtime";
import { createClaimLocalMcpRenderHandler } from "@/lib/local-mcp-browser-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createClaimLocalMcpRenderHandler(async () => getConfiguredCadRuntime());
