import {
  createCadProvider,
  createChatRouteHandler,
} from "@theoryfoundry/gateway";
import { withConfiguredCadRuntime } from "@theoryfoundry/runtime";

import { authenticateRequest } from "@/authentication.composition";
import {
  createSidebarChatHandler,
  getSidebarChatFlags,
} from "../../../features/chat/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createSidebarChatHandler({
  authenticate: authenticateRequest,
  getFlags: getSidebarChatFlags,
  runMockChat: (request, ownerId) =>
    withConfiguredCadRuntime(ownerId, async (runtime) =>
      createChatRouteHandler({
        allowedOrigin:
          process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000",
        getOrchestrator: async () => ({
          ...runtime,
          provider: createCadProvider("mock"),
        }),
      })(request),
    ),
});
