import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "./auth.js";
import { remoteMcpEnabled, remoteMcpIdentity, REMOTE_MCP_SCOPE } from "./remote-mcp-policy.js";

export function oauthServerMetadata(request: Request): Promise<Response> | Response {
  if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
  return oauthProviderAuthServerMetadata(getAuth())(request);
}

export function mcpResourceMetadata(): Response {
  if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
  const { resource, issuer } = remoteMcpIdentity();
  return Response.json({ resource, authorization_servers: [issuer], scopes_supported: [REMOTE_MCP_SCOPE, "offline_access"], bearer_methods_supported: ["header"] }, { headers: { "cache-control": "no-store" } });
}
