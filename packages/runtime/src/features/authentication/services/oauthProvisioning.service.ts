import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  REMOTE_MCP_SCOPE,
  remoteMcpIdentity,
} from "../../../shared/utils/remoteMcpPolicy.util.js";
import {
  oauthClientProfile,
  validateClientCallback,
  type OAuthClientProfile,
} from "../utils/oauthClientProfile.util.js";
/** Operator-only provisioning; no corresponding public registration route exists. */
export async function provisionOAuthClient(
  pool: Pool,
  callback: string,
  options: { replaceCallbacks?: boolean; profile?: OAuthClientProfile } = {},
): Promise<string> {
  const profile = options.profile ?? "codex";
  validateClientCallback(profile, callback);
  const { clientId, name } = oauthClientProfile(profile);
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const callbackUpdate = options.replaceCallbacks
      ? "EXCLUDED.redirect_uris"
      : "ARRAY(SELECT DISTINCT unnest(oauth_client.redirect_uris || EXCLUDED.redirect_uris))";
    const result = await connection.query<{ client_id: string }>(
      `INSERT INTO oauth_client (id, client_id, name, redirect_uris, token_endpoint_auth_method,
       application_type, grant_types, response_types, scopes, require_pkce, skip_consent, disabled, metadata, created_at, updated_at)
     VALUES ($1,$2,$8,$3,'none','native',$4,$5,$6,true,false,false,$7,now(),now())
     ON CONFLICT (client_id) DO UPDATE SET
       redirect_uris = ${callbackUpdate}, token_endpoint_auth_method = 'none', client_secret = NULL,
       application_type = 'native', grant_types = EXCLUDED.grant_types, response_types = EXCLUDED.response_types,
       scopes = EXCLUDED.scopes, require_pkce = true, skip_consent = false,
       metadata = EXCLUDED.metadata, name = EXCLUDED.name, updated_at = now()
     RETURNING client_id`,
      [
        randomUUID(),
        clientId,
        [callback],
        ["authorization_code", "refresh_token"],
        ["code"],
        [REMOTE_MCP_SCOPE, "offline_access"],
        JSON.stringify({ cadClientId: clientId }),
        name,
      ],
    );
    const { resource } = remoteMcpIdentity();
    await connection.query(
      `INSERT INTO oauth_resource (id, identifier, name, allowed_scopes, created_at, updated_at)
    VALUES ($1,$2,'CAD MCP',$3,now(),now()) ON CONFLICT (identifier) DO NOTHING`,
      [randomUUID(), resource, [REMOTE_MCP_SCOPE, "offline_access"]],
    );
    await connection.query(
      "DELETE FROM oauth_client_resource WHERE client_id = $1 AND resource_id <> $2",
      [clientId, resource],
    );
    await connection.query(
      `INSERT INTO oauth_client_resource (id, client_id, resource_id, created_at)
    VALUES ($1,$2,$3,now()) ON CONFLICT (client_id, resource_id) DO NOTHING`,
      [randomUUID(), clientId, resource],
    );
    await connection.query("COMMIT");
    return result.rows[0]!.client_id;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

export { provisionOAuthClient as provisionCodexClient };
