import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  WORKER_OAUTH_CLIENT_ID,
  WORKER_OAUTH_CALLBACK,
  WORKER_OAUTH_SCOPE,
} from "@theoryfoundry/contracts";
import { remoteMcpIdentity } from "../../../shared/utils/remoteMcpPolicy.util.js";
/** Operator-only provisioning; deliberately shares the CAD MCP resource with worker APIs. */
export async function provisionWorkerClient(pool: Pool): Promise<string> {
  const { resource } = remoteMcpIdentity();
  const clientId = WORKER_OAUTH_CLIENT_ID;
  const scopes = WORKER_OAUTH_SCOPE.split(" ");
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      `INSERT INTO oauth_client (id, client_id, name, redirect_uris, token_endpoint_auth_method,
       application_type, grant_types, response_types, scopes, require_pkce, skip_consent, disabled, metadata, created_at, updated_at)
       VALUES ($1,$2,'TheoryFoundry Local Worker',$3,'none','native',$4,$5,$6,true,false,false,$7,now(),now())
       ON CONFLICT (client_id) DO UPDATE SET redirect_uris = EXCLUDED.redirect_uris,
         token_endpoint_auth_method = 'none', client_secret = NULL, application_type = 'native',
         grant_types = EXCLUDED.grant_types, response_types = EXCLUDED.response_types,
         scopes = EXCLUDED.scopes, require_pkce = true, skip_consent = false,
         metadata = EXCLUDED.metadata, updated_at = now()`,
      [
        randomUUID(),
        clientId,
        [WORKER_OAUTH_CALLBACK],
        ["authorization_code", "refresh_token"],
        ["code"],
        scopes,
        JSON.stringify({ cadClientId: clientId }),
      ],
    );
    await connection.query(
      `INSERT INTO oauth_resource (id, identifier, name, allowed_scopes, created_at, updated_at)
       VALUES ($1,$2,'CAD MCP',$3,now(),now()) ON CONFLICT (identifier) DO NOTHING`,
      [randomUUID(), resource, scopes],
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
