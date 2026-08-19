import { getConfiguredCadRuntime } from "@rjls/runtime";
import { createCompleteLocalMcpRenderHandler } from "@/lib/local-mcp-browser-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createCompleteLocalMcpRenderHandler(async () => getConfiguredCadRuntime());
