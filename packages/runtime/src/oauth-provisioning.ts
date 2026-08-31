import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { REMOTE_MCP_SCOPE, remoteMcpIdentity, validateOAuthCallback } from "./remote-mcp-policy.js";

/** Operator-only provisioning; no corresponding public registration route exists. */
export async function provisionCodexClient(
  pool: Pool,
  callback: string,
  options: { replaceCallbacks?: boolean } = {},
): Promise<string> {
  validateOAuthCallback(callback);
  const clientId = "rjls-codex";
  const callbackUpdate = options.replaceCallbacks
    ? "EXCLUDED.redirect_uris"
    : "ARRAY(SELECT DISTINCT unnest(oauth_client.redirect_uris || EXCLUDED.redirect_uris))";
  const result = await pool.query<{ client_id: string }>(
    `INSERT INTO oauth_client (id, client_id, name, redirect_uris, token_endpoint_auth_method,
       application_type, grant_types, response_types, scopes, require_pkce, skip_consent, disabled, metadata, created_at, updated_at)
     VALUES ($1,$2,'Codex',$3,'none','native',$4,$5,$6,true,false,false,$7,now(),now())
     ON CONFLICT (client_id) DO UPDATE SET
       redirect_uris = ${callbackUpdate}, updated_at = now()
     RETURNING client_id`,
    [randomUUID(), clientId, [callback], ["authorization_code", "refresh_token"], ["code"], [REMOTE_MCP_SCOPE, "offline_access"], JSON.stringify({ cadClientId: clientId })]);
  const { resource } = remoteMcpIdentity();
  await pool.query(`INSERT INTO oauth_resource (id, identifier, name, allowed_scopes, created_at, updated_at)
    VALUES ($1,$2,'CAD MCP',$3,now(),now()) ON CONFLICT (identifier) DO NOTHING`,
    [randomUUID(), resource, [REMOTE_MCP_SCOPE, "offline_access"]]);
  await pool.query(`INSERT INTO oauth_client_resource (id, client_id, resource_id, created_at)
    VALUES ($1,$2,$3,now()) ON CONFLICT (client_id, resource_id) DO NOTHING`, [randomUUID(), clientId, resource]);
  return result.rows[0]!.client_id;
}
