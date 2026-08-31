import { createLocalJWKSet, jwtVerify, errors, type JSONWebKeySet } from "jose";
import type { Pool } from "pg";
import { getAuth } from "./auth.js";
import { currentOAuthGrant } from "./oauth-authorization.js";
import { getProjectDatabase } from "./infrastructure.js";
import { REMOTE_MCP_SCOPE, remoteMcpIdentity } from "./remote-mcp-policy.js";

export class McpAuthenticationError extends Error {
  constructor(public readonly status: 401 | 403, public readonly code: string) { super(code); }
}

export async function verifyRemoteMcpToken(token: string, dependencies: {
  pool: Pool; jwks: JSONWebKeySet; issuer: string; resource: string;
}): Promise<string> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, createLocalJWKSet(dependencies.jwks), {
      issuer: dependencies.issuer, audience: dependencies.resource, requiredClaims: ["sub", "exp", "iat", "client_id", "cad_grant"],
    }));
  } catch (error) {
    if (error instanceof errors.JOSEError) throw new McpAuthenticationError(401, "invalid_token");
    throw error;
  }
  if (payload.cnf) throw new McpAuthenticationError(401, "invalid_token");
  if (typeof payload.scope !== "string" || !payload.scope.split(" ").includes(REMOTE_MCP_SCOPE)) throw new McpAuthenticationError(403, "insufficient_scope");
  if (typeof payload.sub !== "string" || typeof payload.client_id !== "string" || typeof payload.cad_grant !== "string") throw new McpAuthenticationError(401, "invalid_token");
  const grant = await currentOAuthGrant(dependencies.pool, payload.sub, payload.client_id, dependencies.resource);
  if (!grant || grant !== payload.cad_grant) throw new McpAuthenticationError(401, "invalid_token");
  return payload.sub;
}

export async function authenticateRemoteMcp(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) throw new McpAuthenticationError(401, "invalid_token");
  const { issuer, resource } = remoteMcpIdentity();
  const jwks = await getAuth().api.getJwks();
  return verifyRemoteMcpToken(authorization.slice(7), { pool: getProjectDatabase().pool, jwks, issuer, resource });
}

export function mcpAuthChallenge(error: McpAuthenticationError): Response {
  const { metadata } = remoteMcpIdentity();
  return Response.json({ error: error.code }, { status: error.status, headers: {
    "cache-control": "no-store",
    "www-authenticate": `Bearer resource_metadata="${metadata}", error="${error.code}", scope="${REMOTE_MCP_SCOPE}"`,
  } });
}
