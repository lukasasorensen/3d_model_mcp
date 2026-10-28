import { authenticateRequest } from "@/authentication.composition";
import {
  isPolicyResponse,
  jsonError,
  NO_STORE_HEADERS,
} from "../../../../features/authentication/index";
import { getSidebarChatFlags } from "../../../../features/chat/index";

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
