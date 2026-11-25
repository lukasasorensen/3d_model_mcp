import type {
  ClientDiscovery,
  SchemaClient,
} from "@better-auth/oauth-provider";
import type { Pool } from "pg";
import {
  CLAUDE_DIRECTORY_DISCOVERY_ID,
  claudeDirectoryClient,
  upsertClaudeDirectoryClient,
  verifyClaudeClientMetadata,
} from "./features/authentication/index.js";

export function createClaudeDirectoryOAuth(pool: Pool): ClientDiscovery {
  return {
    id: CLAUDE_DIRECTORY_DISCOVERY_ID,
    discoveryMetadata: { client_id_metadata_document_supported: true },
    matches: (clientId) => Boolean(claudeDirectoryClient(clientId)),
    async resolve(
      context,
      clientId,
      existing,
    ): Promise<SchemaClient<string[]> | null> {
      const client = claudeDirectoryClient(clientId);
      if (!client) return null;
      const registeredUris = existing?.redirectUris;
      if (
        existing &&
        existing.applicationType === client.applicationType &&
        registeredUris?.length === client.callbacks.length &&
        client.callbacks.every((uri) => registeredUris.includes(uri))
      )
        return existing;

      if (!(await verifyClaudeClientMetadata(client))) return null;
      await upsertClaudeDirectoryClient(pool, client);
      const registered = await context.context.adapter.findOne<
        SchemaClient<string[]>
      >({
        model: "oauthClient",
        where: [{ field: "clientId", value: clientId }],
      });
      return registered?.clientDiscoveryId === CLAUDE_DIRECTORY_DISCOVERY_ID
        ? registered
        : null;
    },
  };
}
