import type {
  ClientDiscovery,
  SchemaClient,
} from "@better-auth/oauth-provider";
import type { Pool } from "pg";
import {
  claudeDirectoryClient,
  registerClaudeDirectoryClient,
  verifyClaudeClientMetadata,
} from "./features/authentication/index.js";

export function createClaudeDirectoryOAuth(pool: Pool): ClientDiscovery {
  return {
    id: "theoryfoundry-claude-directory",
    discoveryMetadata: { client_id_metadata_document_supported: true },
    matches: (clientId) => Boolean(claudeDirectoryClient(clientId)),
    async resolve(
      context,
      clientId,
      existing,
    ): Promise<SchemaClient<string[]> | null> {
      if (existing) return existing;

      const client = claudeDirectoryClient(clientId);
      if (!client || !(await verifyClaudeClientMetadata(client))) return null;
      await registerClaudeDirectoryClient(pool, client);
      return context.context.adapter.findOne<SchemaClient<string[]>>({
        model: "oauthClient",
        where: [{ field: "clientId", value: clientId }],
      });
    },
  };
}
