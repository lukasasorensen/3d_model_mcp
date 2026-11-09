import {
  createCadProvider,
  createChatRouteHandler,
} from "@theoryfoundry/gateway";
import {
  resolveChatProvider,
  withConfiguredCadRuntime,
} from "@theoryfoundry/runtime";

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
  runRealChat: (request, ownerId) =>
    withConfiguredCadRuntime(ownerId, async (runtime) =>
      createChatRouteHandler({
        allowedOrigin:
          process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000",
        getOrchestrator: async (chat) => ({
          ...runtime,
          provider: await resolveChatProvider(ownerId, chat, request.signal),
        }),
      })(request),
    ),
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
