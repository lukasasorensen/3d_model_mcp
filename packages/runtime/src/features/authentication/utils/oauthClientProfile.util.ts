import { validateOAuthCallback } from "../../../shared/utils/remoteMcpPolicy.util.js";

export type OAuthClientProfile = "codex" | "openai-plugin" | "claude-code";

export function oauthClientProfile(profile: OAuthClientProfile): {
  clientId: string;
  name: string;
} {
  switch (profile) {
    case "codex":
      return { clientId: "theoryfoundry-codex", name: "Codex" };
    case "openai-plugin":
      return {
        clientId: "theoryfoundry-openai-plugin",
        name: "TheoryFoundry for Codex",
      };
    case "claude-code":
      return {
        clientId: "theoryfoundry-claude-code",
        name: "TheoryFoundry for Claude Code",
      };
    default:
      throw new Error("Unknown OAuth client profile.");
  }
}

export function validateClientCallback(
  profile: OAuthClientProfile,
  value: string,
): string {
  oauthClientProfile(profile);
  if (value.startsWith("http:")) return validateOAuthCallback(value);
  const url = new URL(value);
  if (
    profile === "codex" ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname === "/" ||
    value.includes("*") ||
    /%2a/i.test(value) ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.href !== value
  )
    throw new Error(
      "Provide the exact HTTPS directory callback or HTTP loopback callback; wildcards are not allowed.",
    );
  return value;
}
