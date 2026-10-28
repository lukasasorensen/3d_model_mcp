import {
  REMOTE_MCP_SCOPE,
  remoteMcpEnabled,
  remoteMcpIdentity,
} from "../../../shared/utils/remoteMcpPolicy.util.js";
export function mcpResourceMetadata(): Response {
  if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
  const { resource, issuer } = remoteMcpIdentity();
  return Response.json(
    {
      resource,
      authorization_servers: [issuer],
      scopes_supported: [REMOTE_MCP_SCOPE, "offline_access"],
      bearer_methods_supported: ["header"],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
