import type { SidebarChatFlags } from "../sidebarChat.types";
import { DISABLED_CHAT_FLAGS } from "../utils/sidebarChatFlags.util";

// Use a project/environment-scoped frontend token; credentials stay on the server.
export async function getSidebarChatFlags(
  userId: string,
  environment: Record<string, string | undefined> = process.env,
  fetchFlags: typeof fetch = fetch,
): Promise<SidebarChatFlags> {
  const url = environment.UNLEASH_FRONTEND_API_URL;
  const token = environment.UNLEASH_FRONTEND_API_TOKEN;
  if (!url && !token) return DISABLED_CHAT_FLAGS;
  if (!url || !token) throw new Error("Unleash configuration is incomplete.");
  const endpoint = new URL(url);
  endpoint.searchParams.set("userId", userId);
  endpoint.searchParams.set("appName", "theoryfoundry-cad");
  const response = await fetchFlags(endpoint, {
    headers: { Authorization: token },
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error("Unleash evaluation is unavailable.");
  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("toggles" in payload) ||
    !Array.isArray(payload.toggles)
  )
    throw new Error("Invalid Unleash response.");
  const enabled = new Set<string>();
  for (const toggle of payload.toggles) {
    if (
      !toggle ||
      typeof toggle !== "object" ||
      typeof toggle.name !== "string" ||
      typeof toggle.enabled !== "boolean"
    )
      throw new Error("Invalid Unleash toggle.");
    if (toggle.enabled) enabled.add(toggle.name);
  }
  return {
    isSidebarChatEnabled: enabled.has("sidebar-chat-enabled"),
    isRealAiEnabled: enabled.has("sidebar-chat-real-ai"),
  };
}
