import type { AuthenticatedUser } from "@theoryfoundry/runtime";
import { isPolicyResponse, jsonError } from "./route-policy";
import type { SidebarChatFlags } from "./sidebar-chat-flags";

export function createSidebarChatHandler(dependencies: {
  authenticate(request: Request): Promise<AuthenticatedUser | Response>;
  getFlags(userId: string): Promise<SidebarChatFlags>;
  runMockChat(request: Request, userId: string): Promise<Response>;
}) {
  return async (request: Request): Promise<Response> => {
    const user = await dependencies.authenticate(request);
    if (isPolicyResponse(user)) return user;
    let flags;
    try { flags = await dependencies.getFlags(user.id); }
    catch { return jsonError("FEATURE_FLAGS_UNAVAILABLE", 503, "Feature flags are temporarily unavailable."); }
    if (!flags.isSidebarChatEnabled) return jsonError("CHAT_DISABLED", 404, "Sidebar chat is disabled.");
    // Never silently run mock in real mode before an explicit adapter exists.
    if (flags.isRealAiEnabled) return jsonError("CHAT_PROVIDER_UNAVAILABLE", 503, "Real AI chat is not configured.");
    return dependencies.runMockChat(request, user.id);
  };
}
