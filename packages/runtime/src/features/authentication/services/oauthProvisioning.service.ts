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
  return persistPublicClient(pool, {
    ...oauthClientProfile(profile),
    callbacks: [callback],
    applicationType: "native",
    existingClient: options.replaceCallbacks ? "replace" : "append",
  });
}

export async function registerClaudeDirectoryClient(
  pool: Pool,
  client: {
    clientId: string;
    name: string;
    callbacks: readonly string[];
    applicationType: "native" | "web";
  },
): Promise<void> {
  await persistPublicClient(pool, { ...client, existingClient: "preserve" });
}

async function persistPublicClient(
  pool: Pool,
  client: {
    clientId: string;
    name: string;
    callbacks: readonly string[];
    applicationType: "native" | "web";
    existingClient: "append" | "replace" | "preserve";
  },
): Promise<string> {
  const { clientId, name, callbacks, applicationType, existingClient } = client;
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const callbackUpdate =
      existingClient === "append"
        ? "ARRAY(SELECT DISTINCT unnest(oauth_client.redirect_uris || EXCLUDED.redirect_uris))"
        : "EXCLUDED.redirect_uris";
    const conflictAction =
      existingClient === "preserve"
        ? "DO NOTHING"
        : `DO UPDATE SET redirect_uris = ${callbackUpdate}, token_endpoint_auth_method = 'none',
       client_secret = NULL, application_type = EXCLUDED.application_type, grant_types = EXCLUDED.grant_types,
       response_types = EXCLUDED.response_types, scopes = EXCLUDED.scopes, require_pkce = true,
       skip_consent = false, metadata = EXCLUDED.metadata, name = EXCLUDED.name, updated_at = now()`;
    const result = await connection.query(
      `INSERT INTO oauth_client (id, client_id, name, redirect_uris, token_endpoint_auth_method,
       application_type, grant_types, response_types, scopes, require_pkce, skip_consent, disabled, metadata, created_at, updated_at)
     VALUES ($1,$2,$8,$3,'none',$9,$4,$5,$6,true,false,false,$7,now(),now())
     ON CONFLICT (client_id) ${conflictAction}`,
      [
        randomUUID(),
        clientId,
        callbacks,
        ["authorization_code", "refresh_token"],
        ["code"],
        [REMOTE_MCP_SCOPE, "offline_access"],
        JSON.stringify({ cadClientId: clientId }),
        name,
        applicationType,
      ],
    );
    if (result.rowCount === 0) {
      await connection.query("COMMIT");
      return clientId;
    }
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
    return clientId;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

export { provisionOAuthClient as provisionCodexClient };
