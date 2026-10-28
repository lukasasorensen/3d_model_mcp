import { REMOTE_MCP_SCOPE, remoteMcpIdentity } from "./remoteMcpPolicy.util.js";
export class McpAuthenticationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
  ) {
    super(code);
  }
}

export function mcpAuthChallenge(error: McpAuthenticationError): Response {
  const { metadata } = remoteMcpIdentity();
  return Response.json(
    { error: error.code },
    {
      status: error.status,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": `Bearer resource_metadata="${metadata}", error="${error.code}", scope="${REMOTE_MCP_SCOPE}"`,
      },
    },
  );
}
