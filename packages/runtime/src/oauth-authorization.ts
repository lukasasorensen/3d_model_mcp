import { REMOTE_MCP_SCOPE } from "./remote-mcp-policy.js";
import type { Pool } from "pg";

/** Consent IDs bind tokens to one authorization, so re-consent cannot revive revoked tokens. */
export async function currentOAuthGrant(pool: Pool, ownerId: string, clientId: string, resource: string): Promise<string | undefined> {
  const result = await pool.query<{ id: string }>(
    `SELECT consent.id FROM oauth_consent consent
     JOIN oauth_client client ON client.client_id = consent.client_id
     JOIN "user" owner ON owner.id = consent.user_id
     WHERE consent.user_id = $1 AND consent.client_id = $2 AND client.disabled IS NOT TRUE
       AND $3 = ANY(consent.resources) AND $4 = ANY(consent.scopes)
     ORDER BY consent.created_at DESC LIMIT 1`, [ownerId, clientId, resource, REMOTE_MCP_SCOPE]);
  return result.rows[0]?.id;
}

export async function revokeOAuthGrant(pool: Pool, ownerId: string, consentId: string): Promise<boolean> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const result = await connection.query<{ client_id: string }>("SELECT client_id FROM oauth_consent WHERE id = $1 AND user_id = $2 FOR UPDATE", [consentId, ownerId]);
    const grant = result.rows[0];
    if (!grant) { await connection.query("ROLLBACK"); return false; }
    await connection.query("DELETE FROM oauth_access_token WHERE client_id = $1 AND user_id = $2", [grant.client_id, ownerId]);
    await connection.query("DELETE FROM oauth_refresh_token WHERE client_id = $1 AND user_id = $2", [grant.client_id, ownerId]);
    await connection.query("DELETE FROM oauth_consent WHERE client_id = $1 AND user_id = $2", [grant.client_id, ownerId]);
    await connection.query("COMMIT");
    return true;
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}

export async function listOAuthGrants(pool: Pool, ownerId: string): Promise<{ id: string; name: string }[]> {
  const result = await pool.query<{ id: string; name: string }>(
    `SELECT consent.id, COALESCE(client.name, 'CAD client') AS name FROM oauth_consent consent
     JOIN oauth_client client ON client.client_id = consent.client_id WHERE consent.user_id = $1 ORDER BY consent.created_at DESC`, [ownerId]);
  return result.rows;
}
