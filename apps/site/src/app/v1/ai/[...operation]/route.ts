import { handleAiApiRequest } from "@theoryfoundry/runtime";
import { getSidebarChatFlags } from "../../../../features/chat/index";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = (request: Request): Promise<Response> =>
  handleAiApiRequest(request, async (owner) => {
    const flags = await getSidebarChatFlags(owner);
    return flags.isSidebarChatEnabled && flags.isRealAiEnabled;
  });
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
