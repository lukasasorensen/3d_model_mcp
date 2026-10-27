import {
  isPolicyResponse,
  jsonError,
  NO_STORE_HEADERS,
} from "@/lib/route-policy";
import { authenticateRequest } from "@/authentication.composition";
import { getSidebarChatFlags } from "@/lib/sidebar-chat-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await authenticateRequest(request);
  if (isPolicyResponse(user)) return user;
  try {
    const flags = await getSidebarChatFlags(user.id);
    return Response.json(
      { isSidebarChatEnabled: flags.isSidebarChatEnabled },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return jsonError(
      "FEATURE_FLAGS_UNAVAILABLE",
      503,
      "Feature flags are temporarily unavailable.",
    );
  }
}
