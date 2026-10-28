export const REMOTE_MCP_SCOPE = "cad:tools";
export const REMOTE_MCP_TIMEOUT_MS = 90_000;

export function remoteMcpEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.THEORYFOUNDRY_REMOTE_MCP_ENABLED === "1";
}

export function remoteMcpIdentity(
  environment: NodeJS.ProcessEnv = process.env,
): { origin: string; issuer: string; resource: string; metadata: string } {
  const origin =
    environment.BETTER_AUTH_URL ??
    environment.THEORYFOUNDRY_ALLOWED_ORIGIN ??
    "http://localhost:3000";
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    parsed.username ||
    parsed.password ||
    (parsed.protocol !== "https:" &&
      !(
        environment.NODE_ENV !== "production" &&
        parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
      ))
  ) {
    throw new Error(
      "The MCP origin must be a canonical HTTPS origin (loopback HTTP is allowed in development).",
    );
  }
  if (
    environment.THEORYFOUNDRY_ALLOWED_ORIGIN &&
    environment.THEORYFOUNDRY_ALLOWED_ORIGIN !== origin
  )
    throw new Error("MCP and browser origins must match.");
  return {
    origin,
    issuer: `${origin}/api/auth`,
    resource: `${origin}/mcp`,
    metadata: `${origin}/.well-known/oauth-protected-resource/mcp`,
  };
}

export function validateOAuthCallback(value: string): string {
  const uri = new URL(value);
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//.test(value) ||
    uri.protocol !== "http:" ||
    uri.username ||
    uri.password ||
    uri.search ||
    uri.hash ||
    value.includes("*") ||
    /%2a/i.test(value) ||
    uri.pathname === "/"
  ) {
    throw new Error(
      "Provide the exact HTTP loopback callback URL reported by Codex, without queries, fragments, or wildcards.",
    );
  }
  return value;
}
